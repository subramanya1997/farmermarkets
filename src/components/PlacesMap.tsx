'use client';

import { useEffect, useMemo, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { buildMarketPopupHtml, buildSingleMarketPopupHtml } from './leafletPopupHtml';
import { loadMapStyle, prefersDarkMap } from './mapStyle';
import {
  SOURCE,
  addMarketLayers,
  featureProps,
  slugId,
  wireClusterZoom,
  wireHover,
  type MarketPoint,
} from './mapLayers';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface MapPlace {
  slug: string;
  name: string;
  city?: string;
  lat: number;
  lon: number;
}

interface PlacesMapProps {
  places: MapPlace[];
  /** Region name for the popup's location line ("Brooklyn, New York"). */
  region: string;
  /** Slug of the place a list row is pointing at; that dot is emphasised. */
  activeSlug?: string | null;
  /**
   * False on a market's own page, where a "View market" link in the popup
   * would point at the page the reader is already on.
   */
  linkPlaces?: boolean;
  /** Draw a still picture: no pan, zoom or popups (the market page hero). */
  still?: boolean;
  className?: string;
}

/**
 * The box the map opens on.
 *
 * A handful of records carry coordinates far from the place they are filed
 * under (a New York market geocoded to the Gulf of Guinea). Fitting to every
 * point would zoom a state map out to half the planet for one bad row, so
 * once there are enough points to tell, the outer 2% on each side is left out
 * of the opening view. Those dots are still drawn; the reader can pan to them.
 */
function openingBounds(places: MapPlace[]): maplibregl.LngLatBoundsLike {
  const lats = places.map((place) => place.lat).sort((a, b) => a - b);
  const lons = places.map((place) => place.lon).sort((a, b) => a - b);
  const trim = places.length >= 25 ? Math.floor(places.length * 0.02) : 0;
  return [
    [lons[trim], lats[trim]],
    [lons[lons.length - 1 - trim], lats[lats.length - 1 - trim]],
  ];
}

/**
 * A map of a fixed set of markets: every market in one city or state, or the
 * single market on its own page.
 *
 * MapLibre vector tiles in the site's quiet style (`mapStyle.ts`), markets as
 * green dots drawn on the GPU, clustered when there are many. Scroll-wheel
 * and one-finger drags are left to the page until the reader engages the map
 * (cooperative gestures), so the map never traps a scroll.
 */
export default function PlacesMap({
  places,
  region,
  activeSlug,
  linkPlaces = true,
  still = false,
  className = '',
}: PlacesMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const previousActiveRef = useRef<number | null>(null);

  const points = useMemo<MarketPoint[]>(
    () =>
      places.map((place) => ({
        id: slugId(place.slug),
        slug: place.slug,
        name: place.name,
        place: [place.city, region].filter(Boolean).join(', '),
        lat: place.lat,
        lon: place.lon,
      })),
    [places, region]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || points.length === 0) return;
    let cancelled = false;
    let map: maplibregl.Map | undefined;

    loadMapStyle(prefersDarkMap()).then((style) => {
      if (cancelled) return;
      const single = points.length === 1;
      map = new maplibregl.Map({
        container,
        style,
        attributionControl: false,
        interactive: !still,
        cooperativeGestures: !still,
        dragRotate: false,
        pitchWithRotate: false,
        ...(single
          ? { center: [points[0].lon, points[0].lat] as [number, number], zoom: 14.5 }
          : { bounds: openingBounds(places), fitBoundsOptions: { padding: 36, maxZoom: 14 } }),
      });
      mapRef.current = map;
      map.addControl(new maplibregl.AttributionControl({ compact: true }));
      if (!still) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.touchZoomRotate.disableRotation();

      map.on('load', () => {
        if (!map) return;
        addMarketLayers(map, points, { cluster: points.length > 40 });
        readyRef.current = true;
        if (still) return;
        wireClusterZoom(map);
        wireHover(map);
        map.on('click', 'market-dots', (event) => {
          const feature = event.features?.[0];
          if (!feature || !map) return;
          const { slug, name, place } = featureProps(feature);
          const [city, ...rest] = place.split(', ');
          const popup = { name, city, state: rest.join(', ') || region };
          new maplibregl.Popup({ closeButton: false, offset: 12, className: 'market-popup', maxWidth: '260px' })
            .setLngLat((feature.geometry as { coordinates: [number, number] }).coordinates)
            .setHTML(linkPlaces ? buildMarketPopupHtml({ ...popup, slug }) : buildSingleMarketPopupHtml(popup))
            .addTo(map);
        });
      });
    });

    return () => {
      cancelled = true;
      readyRef.current = false;
      previousActiveRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
  }, [points, places, region, linkPlaces, still]);

  // The market a list row points at, or the market on its own page.
  useEffect(() => {
    const apply = () => {
      const map = mapRef.current;
      if (!map || !readyRef.current) return false;
      const previous = previousActiveRef.current;
      const next = activeSlug ? slugId(activeSlug) : null;
      if (previous !== null && previous !== next) map.setFeatureState({ source: SOURCE, id: previous }, { active: false });
      if (next !== null) map.setFeatureState({ source: SOURCE, id: next }, { active: true });
      previousActiveRef.current = next;
      return true;
    };
    if (apply()) return;
    // The map may still be loading its style; try again shortly.
    const timer = window.setInterval(() => apply() && window.clearInterval(timer), 150);
    return () => window.clearInterval(timer);
  }, [activeSlug, points]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={`Map of farmers markets in ${region}`}
      className={`isolate z-0 overflow-hidden rounded-2xl border border-zinc-200 bg-[#f6f6f2] dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
    />
  );
}
