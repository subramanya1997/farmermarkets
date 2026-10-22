'use client';

import { useEffect, useMemo, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { FarmerMarket } from '@/lib/api';
import { buildMarketPopupHtml } from './leafletPopupHtml';
import { trackEvent } from '@/lib/analytics';
import { loadMapStyle, prefersDarkMap } from './mapStyle';
import {
  addMarketLayers,
  featureProps,
  slugId,
  wireClusterZoom,
  wireHover,
  type MarketPoint,
} from './mapLayers';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MarketMapProps {
  markets: FarmerMarket[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  /**
   * Called with the markets currently in view (closest to the map center
   * first, uncapped) after every move, so a caller can mirror the map in a
   * list.
   */
  onVisibleMarketsChange?: (visible: FarmerMarket[]) => void;
}

/**
 * Default view: center of the US. A module constant, not a default parameter,
 * because a fresh `[lat, lon]` literal per render would re-fire the recenter
 * effect forever.
 */
const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795];

/** Squared distance in degrees, longitude scaled by latitude; ordering only. */
function closeness(lat: number, lon: number, centerLat: number, centerLon: number): number {
  const dLat = lat - centerLat;
  const dLon = (lon - centerLon) * Math.cos((centerLat * Math.PI) / 180);
  return dLat * dLat + dLon * dLon;
}

/**
 * The explorer map: every market in the directory at once.
 *
 * All ~9,000 points go into one clustered GeoJSON source, so the map shows
 * soft green clusters with counts when zoomed out and single dots up close,
 * without the old cap of 250 DOM markers per view. After each move the
 * markets inside the view are handed to the list, closest to the center
 * first.
 */
export default function MarketMap({
  markets,
  center = DEFAULT_CENTER,
  zoom = 4,
  height = '500px',
  onVisibleMarketsChange,
}: MarketMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  /** True once the reader pans or zooms by hand; blocks programmatic recentering. */
  const userMovedRef = useRef(false);
  // Kept in a ref so an inline callback prop doesn't rebuild the map.
  const onVisibleRef = useRef(onVisibleMarketsChange);
  useEffect(() => {
    onVisibleRef.current = onVisibleMarketsChange;
  }, [onVisibleMarketsChange]);
  const initialViewRef = useRef({ center, zoom });

  const located = useMemo(
    () =>
      markets.filter(
        (market): market is FarmerMarket & { location: { lat: number; lon: number } } =>
          Boolean(market.location?.lat && market.location?.lon)
      ),
    [markets]
  );
  const bySlug = useMemo(() => new Map(located.map((market) => [market.slug, market])), [located]);
  const points = useMemo<MarketPoint[]>(
    () =>
      located.map((market) => ({
        id: slugId(market.slug),
        slug: market.slug,
        name: market.name,
        place: [market.city, market.state].filter(Boolean).join(', '),
        lat: market.location.lat,
        lon: market.location.lon,
      })),
    [located]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let map: maplibregl.Map | undefined;

    const reportVisible = () => {
      if (!map) return;
      const bounds = map.getBounds();
      const mapCenter = map.getCenter();
      const visible = located
        .filter((market) => bounds.contains([market.location.lon, market.location.lat]))
        .sort(
          (a, b) =>
            closeness(a.location.lat, a.location.lon, mapCenter.lat, mapCenter.lng) -
            closeness(b.location.lat, b.location.lon, mapCenter.lat, mapCenter.lng)
        );
      onVisibleRef.current?.(visible);
    };

    loadMapStyle(prefersDarkMap()).then((style) => {
      if (cancelled) return;
      const { center: start, zoom: startZoom } = initialViewRef.current;
      map = new maplibregl.Map({
        container,
        style,
        center: [start[1], start[0]],
        zoom: startZoom,
        attributionControl: false,
        cooperativeGestures: true,
        dragRotate: false,
        pitchWithRotate: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.AttributionControl({ compact: true }));
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.touchZoomRotate.disableRotation();

      map.on('load', () => {
        if (!map) return;
        addMarketLayers(map, points, { cluster: true });
        wireClusterZoom(map);
        wireHover(map);
        map.on('click', 'market-dots', (event) => {
          const feature = event.features?.[0];
          if (!feature || !map) return;
          const { slug } = featureProps(feature);
          const market = bySlug.get(slug);
          if (!market) return;
          new maplibregl.Popup({ closeButton: false, offset: 12, className: 'market-popup', maxWidth: '260px' })
            .setLngLat((feature.geometry as { coordinates: [number, number] }).coordinates)
            .setHTML(buildMarketPopupHtml({ name: market.name, city: market.city, state: market.state, slug }))
            .addTo(map);
          trackEvent('Map Marker Selected', {
            market_id: market.id,
            market_name: market.name.slice(0, 80),
            country: market.country,
            source_id: market.provenance?.source_id,
          });
        });
        reportVisible();
      });
      map.on('moveend', reportVisible);
      // Only gestures carry an originalEvent; programmatic jumps do not.
      map.on('dragstart', () => (userMovedRef.current = true));
      map.on('zoomstart', (event) => {
        if ((event as { originalEvent?: Event }).originalEvent) userMovedRef.current = true;
      });
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, [points, located, bySlug]);

  // Recenter when the caller resolves a better starting point (e.g. the
  // reader's approximate location arrives after mount), but never fight a
  // reader who has already panned or zoomed by hand.
  useEffect(() => {
    initialViewRef.current = { center, zoom };
    const map = mapRef.current;
    if (!map || userMovedRef.current) return;
    map.jumpTo({ center: [center[1], center[0]], zoom });
  }, [center, zoom]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Map of farmers markets"
      style={{ height, width: '100%' }}
      className="isolate z-0 overflow-hidden rounded-2xl border border-zinc-200 bg-[#f6f6f2] dark:border-zinc-800 dark:bg-zinc-900"
    />
  );
}
