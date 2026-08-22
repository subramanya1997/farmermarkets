'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { FarmerMarket } from '@/lib/api';
import { buildMarketPopupHtml } from './leafletPopupHtml';
import { trackEvent } from '@/lib/analytics';
import 'leaflet/dist/leaflet.css';

// Fix for Leaflet marker icon issue in Next.js
let DefaultIcon: L.Icon;
if (typeof window !== 'undefined') {
  DefaultIcon = new L.Icon({
    iconUrl: '/marker-icon.png',
    iconRetinaUrl: '/marker-icon-2x.png',
    shadowUrl: '/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });
  L.Marker.prototype.options.icon = DefaultIcon;
}

interface MarketMapProps {
  markets: FarmerMarket[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  /**
   * Called with the markets currently in view (closest to the map center
   * first, uncapped) after every render of the marker layer, so a caller can
   * mirror the map in a list.
   */
  onVisibleMarketsChange?: (visible: FarmerMarket[]) => void;
}

/**
 * Markers rendered at once. Only markets inside the current viewport are
 * added, closest to the map center first, so a worldwide dataset never puts
 * thousands of DOM markers on the map. Panning or zooming re-renders for the
 * new view.
 */
const MAX_VISIBLE_MARKERS = 250;

/** Padding around the viewport so markers exist just past the edges while panning. */
const VIEWPORT_PAD = 0.25;

/**
 * Default view: center of the US. A module constant, not a default parameter,
 * because a fresh `[lat, lon]` literal per render would re-fire the recenter
 * effect forever.
 */
const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795];

export default function MarketMap({
  markets,
  center = DEFAULT_CENTER,
  zoom = 4,
  height = '500px',
  onVisibleMarketsChange
}: MarketMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const [mapInitialized, setMapInitialized] = useState(false);
  /** True once the reader pans or zooms by hand; blocks programmatic recentering. */
  const userMovedRef = useRef(false);
  /** True while a `setView` this component issued is firing move/zoom events. */
  const programmaticMoveRef = useRef(false);
  // Kept in a ref so an inline callback prop doesn't re-run the marker effect
  // (and re-render every marker) on each parent render.
  const onVisibleMarketsChangeRef = useRef(onVisibleMarketsChange);
  useEffect(() => {
    onVisibleMarketsChangeRef.current = onVisibleMarketsChange;
  }, [onVisibleMarketsChange]);

  // Create map instance with proper error handling
  useEffect(() => {
    // Only run this on the client side
    if (typeof window === 'undefined' || !mapRef.current) return;

    let mapInstance: L.Map | null = null;

    // Add small delay to ensure container is properly rendered
    const initializeMap = () => {
      // If map is already initialized, clean it up before reinitializing
      if (leafletMapRef.current) {
        try {
          leafletMapRef.current.remove();
        } catch (e) {
          console.error('Error removing previous map instance:', e);
        }
        leafletMapRef.current = null;
      }

      if (!mapRef.current) return;

      try {
        // Initialize the map with explicit options
        mapInstance = L.map(mapRef.current, {
          zoomControl: true,
          attributionControl: true,
          fadeAnimation: true,
          zoomAnimation: true
        }).setView(center, zoom);

        // Ensure map is properly sized
        mapInstance.invalidateSize();
        leafletMapRef.current = mapInstance;
        setMapInitialized(true);

        // Add the OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(mapInstance);
      } catch (error) {
        console.error('Error initializing map:', error);
      }
    };

    // Delay initialization slightly to ensure DOM is ready
    const timer = setTimeout(() => {
      initializeMap();
    }, 100);

    // Clean up on unmount
    return () => {
      clearTimeout(timer);
      if (leafletMapRef.current) {
        try {
          leafletMapRef.current.remove();
        } catch (e) {
          console.error('Error cleaning up map on unmount:', e);
        }
        leafletMapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount to prevent re-initialization issues

  // Handle resize to fix map issues when container size changes
  useEffect(() => {
    const handleResize = () => {
      if (leafletMapRef.current) {
        try {
          leafletMapRef.current.invalidateSize();
        } catch (e) {
          console.error('Error invalidating map size:', e);
        }
      }
    };

    window.addEventListener('resize', handleResize);

    // Also invalidate size when component mounts
    if (leafletMapRef.current) {
      setTimeout(() => {
        try {
          leafletMapRef.current?.invalidateSize();
        } catch (e) {
          console.error('Error invalidating map size on mount:', e);
        }
      }, 100);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [mapInitialized]);

  // Recenter when the caller resolves a better starting point (e.g. the
  // reader's approximate location arrives after mount), but never fight a
  // reader who has already panned or zoomed by hand.
  useEffect(() => {
    if (!mapInitialized || !leafletMapRef.current || userMovedRef.current) return;
    try {
      programmaticMoveRef.current = true;
      // No animation, so the move/zoom events fire inside this call and the
      // flag reliably covers them.
      leafletMapRef.current.setView(center, zoom, { animate: false });
    } catch (error) {
      console.error('Error recentering map:', error);
    } finally {
      programmaticMoveRef.current = false;
    }
  }, [center, zoom, mapInitialized]);

  // Render only the markers inside the current viewport, closest to the map
  // center first, and refresh them whenever the reader pans or zooms.
  useEffect(() => {
    if (!mapInitialized || !leafletMapRef.current) return;

    const map = leafletMapRef.current;
    const markerLayer = L.layerGroup().addTo(map);

    const renderVisibleMarkers = () => {
      try {
        markerLayer.clearLayers();
        const viewport = map.getBounds().pad(VIEWPORT_PAD);
        const mapCenter = map.getCenter();

        const visible: Array<{ market: FarmerMarket; lat: number; lon: number; distance: number }> = [];
        for (const market of markets) {
          const lat = market.location?.lat;
          const lon = market.location?.lon;
          if (!lat || !lon || !viewport.contains([lat, lon])) continue;
          visible.push({ market, lat, lon, distance: mapCenter.distanceTo([lat, lon]) });
        }
        visible.sort((a, b) => a.distance - b.distance);
        onVisibleMarketsChangeRef.current?.(visible.map((entry) => entry.market));

        for (const { market, lat, lon } of visible.slice(0, MAX_VISIBLE_MARKERS)) {
          const marker = L.marker([lat, lon]).addTo(markerLayer);
          marker.bindPopup(
            buildMarketPopupHtml({
              name: market.name,
              city: market.city,
              state: market.state,
              slug: market.slug,
            })
          );
          marker.on('click', () => {
            trackEvent('Map Marker Selected', {
              market_id: market.id,
              market_name: market.name.slice(0, 80),
              country: market.country,
              source_id: market.provenance?.source_id
            });
          });
        }
      } catch (error) {
        console.error('Error adding markers to map:', error);
      }
    };

    const markUserMoved = () => {
      if (!programmaticMoveRef.current) {
        userMovedRef.current = true;
      }
    };

    renderVisibleMarkers();
    map.on('moveend', renderVisibleMarkers);
    map.on('zoomend', renderVisibleMarkers);
    // Only reader-initiated gestures count as "moved"; a programmatic
    // `setView` also fires moveend but must not lock the recenter effect out.
    map.on('dragstart', markUserMoved);
    map.on('zoomstart', markUserMoved);

    return () => {
      map.off('moveend', renderVisibleMarkers);
      map.off('zoomend', renderVisibleMarkers);
      map.off('dragstart', markUserMoved);
      map.off('zoomstart', markUserMoved);
      markerLayer.remove();
    };
  }, [markets, mapInitialized]);

  return (
    <div ref={mapRef} style={{ height, width: '100%' }} className="rounded-md overflow-hidden" />
  );
}
