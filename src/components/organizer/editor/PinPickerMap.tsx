'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { MARKET_GREEN, loadMapStyle, mapPerfOptions, prefersDarkMap } from '@/components/mapStyle';

import 'maplibre-gl/dist/maplibre-gl.css';

export interface Pin {
  lat: number;
  lon: number;
}

/** The middle of the lower 48, for a listing with no pin yet. */
const US_CENTER: [number, number] = [-98.5, 39.8];

/** Six decimals is about 10 cm, plenty for a market stall. */
const round = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * Pick a market's pin on the map: click anywhere to drop it, or drag it. The
 * map uses the site's one style, so the pin sits where visitors will see it.
 * Typing coordinates in the fields below moves the pin too.
 */
export default function PinPickerMap({ pin, onChange }: { pin: Pin | undefined; onChange: (next: Pin) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const pinRef = useRef(pin);

  useEffect(() => {
    onChangeRef.current = onChange;
    pinRef.current = pin;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let map: maplibregl.Map | undefined;

    loadMapStyle(prefersDarkMap()).then((style) => {
      if (cancelled) return;
      const start = pinRef.current;
      map = new maplibregl.Map({
        container,
        style,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        // The page scrolls with one finger or the wheel; the map needs two fingers or Ctrl.
        cooperativeGestures: true,
        ...mapPerfOptions(),
        center: start ? [start.lon, start.lat] : US_CENTER,
        zoom: start ? 16 : 3.2,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.AttributionControl({ compact: true }));
      // The compact credit opens itself at first; on a small map it would cover the pin area.
      const credit = container.querySelector('.maplibregl-ctrl-attrib');
      credit?.classList.remove('maplibregl-compact-show');
      credit?.removeAttribute('open');
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.touchZoomRotate.disableRotation();
      map.getCanvas().style.cursor = 'crosshair';

      if (start) placeMarker(map, [start.lon, start.lat]);
      map.on('click', (event) => {
        if (!map) return;
        placeMarker(map, event.lngLat);
        onChangeRef.current({ lat: round(event.lngLat.lat), lon: round(event.lngLat.lng) });
      });
    });

    function placeMarker(target: maplibregl.Map, at: maplibregl.LngLatLike) {
      const existing = markerRef.current;
      if (existing) {
        existing.setLngLat(at);
        return;
      }
      const marker = new maplibregl.Marker({ color: MARKET_GREEN, draggable: true }).setLngLat(at).addTo(target);
      marker.on('dragend', () => {
        const spot = marker.getLngLat();
        onChangeRef.current({ lat: round(spot.lat), lon: round(spot.lng) });
      });
      markerRef.current = marker;
    }

    return () => {
      cancelled = true;
      markerRef.current?.remove();
      markerRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // Coordinates typed in the fields: move the pin, and bring it into view.
  const lat = pin?.lat;
  const lon = pin?.lon;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || lat === undefined || lon === undefined) return;
    const marker = markerRef.current;
    const at = marker?.getLngLat();
    if (at && Math.abs(at.lat - lat) < 1e-7 && Math.abs(at.lng - lon) < 1e-7) return;
    if (marker) {
      marker.setLngLat([lon, lat]);
    } else {
      const created = new maplibregl.Marker({ color: MARKET_GREEN, draggable: true }).setLngLat([lon, lat]).addTo(map);
      created.on('dragend', () => {
        const spot = created.getLngLat();
        onChangeRef.current({ lat: round(spot.lat), lon: round(spot.lng) });
      });
      markerRef.current = created;
    }
    if (!map.getBounds().contains([lon, lat])) {
      map.easeTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 15) });
    }
  }, [lat, lon]);

  return <div ref={containerRef} className="h-full w-full" role="application" aria-label="Map for choosing the market's pin" />;
}
