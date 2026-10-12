'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { buildMarketPopupHtml } from './leafletPopupHtml';
import 'leaflet/dist/leaflet.css';

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
  /** Slug of the place a list row is pointing at; that dot is enlarged. */
  activeSlug?: string | null;
  className?: string;
}

const DOT: L.CircleMarkerOptions = {
  radius: 6,
  color: '#ffffff',
  weight: 1.5,
  fillColor: '#15803d',
  fillOpacity: 0.9,
};

const ACTIVE_DOT: L.CircleMarkerOptions = {
  radius: 10,
  color: '#ffffff',
  weight: 2.5,
  fillColor: '#14532d',
  fillOpacity: 1,
};

/**
 * The box the map opens on.
 *
 * A handful of records carry coordinates far from the place they are filed
 * under (a New York market geocoded to the Gulf of Guinea). Fitting to every
 * point would zoom a state map out to half the planet for one bad row, so
 * once there are enough points to tell, the outer 2% on each side is left out
 * of the opening view. Those dots are still drawn; the reader can pan to them.
 */
function openingBounds(places: MapPlace[]): L.LatLngBounds {
  const lats = places.map((place) => place.lat).sort((a, b) => a - b);
  const lons = places.map((place) => place.lon).sort((a, b) => a - b);
  const trim = places.length >= 25 ? Math.floor(places.length * 0.02) : 0;
  return L.latLngBounds(
    [lats[trim], lons[trim]],
    [lats[lats.length - 1 - trim], lons[lons.length - 1 - trim]]
  );
}

/**
 * A map of a fixed set of markets: every market in one city, or every market
 * in one state.
 *
 * Unlike `MarketMap` (the worldwide explorer, which re-queries its markers on
 * every pan), this draws all of its points once, as canvas dots rather than
 * DOM pins, so a 1,000-market state costs one canvas and no layout work.
 */
export default function PlacesMap({ places, region, activeSlug, className = '' }: PlacesMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const previousActiveRef = useRef<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || places.length === 0) return;

    const map = L.map(container, { preferCanvas: true, scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    map.fitBounds(openingBounds(places), { padding: [28, 28], maxZoom: 14 });
    // The page scrolls past the map; only take over the wheel once the reader
    // has clicked into it.
    map.once('focus', () => map.scrollWheelZoom.enable());

    const dots = dotsRef.current;
    for (const place of places) {
      const dot = L.circleMarker([place.lat, place.lon], DOT).addTo(map);
      dot.bindPopup(
        buildMarketPopupHtml({
          name: place.name,
          city: place.city,
          state: region,
          slug: place.slug,
        })
      );
      dots.set(place.slug, dot);
    }

    // The container's final size is not always known on the first frame (the
    // city layout's sticky column settles after hydration).
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      dots.clear();
      previousActiveRef.current = null;
      map.remove();
    };
  }, [places, region]);

  useEffect(() => {
    const dots = dotsRef.current;
    const previous = previousActiveRef.current;
    if (previous && previous !== activeSlug) {
      const dot = dots.get(previous);
      dot?.setStyle(DOT);
      dot?.setRadius(DOT.radius!);
    }
    if (activeSlug) {
      const dot = dots.get(activeSlug);
      dot?.setStyle(ACTIVE_DOT);
      dot?.setRadius(ACTIVE_DOT.radius!);
      dot?.bringToFront();
    }
    previousActiveRef.current = activeSlug ?? null;
  }, [activeSlug, places]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={`Map of farmers markets in ${region}`}
      className={`isolate z-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
    />
  );
}
