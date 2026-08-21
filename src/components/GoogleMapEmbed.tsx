'use client';

import { useState } from 'react';
import type { FarmerMarket } from '@/lib/api';
import { trackEvent } from '@/lib/analytics';

/**
 * The pin, inlined for the same bundle reason as before: `lucide-react` and
 * the ui button are only ever reached from server components on a market
 * page, and importing either here would drag them into the client bundle.
 */
function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

/**
 * Every state of the map — placeholder and iframe — occupies exactly the same
 * box, so swapping between them never shifts the page.
 */
function MapFrame({ height = '300px', children }: { height?: string; children: React.ReactNode }) {
  return (
    <div
      style={{ height, width: '100%' }}
      className="flex flex-col items-center justify-center gap-3 overflow-hidden rounded-lg bg-zinc-100 px-4 text-center dark:bg-zinc-800/60"
    >
      {children}
    </div>
  );
}

interface GoogleMapEmbedProps {
  market: FarmerMarket;
  height?: string;
}

/**
 * Click-to-load Google Maps embed for one market.
 *
 * Google replaced the Leaflet map here: readers recognize it instantly and
 * directions and Street View are one tap away, while the click-to-load
 * placeholder keeps the third-party iframe (and its cookies and weight) off
 * the 9,000-odd market pages until a reader actually asks for it. The
 * explorer's many-marker map stays on Leaflet, where per-load map pricing
 * would sting.
 *
 * The embed URL is keyless by default. Setting NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
 * upgrades it to the official Maps Embed API (free at any volume, but keyed),
 * which also renders the market's name on the pin.
 */
export default function GoogleMapEmbed({ market, height = '300px' }: GoogleMapEmbedProps) {
  const [showMap, setShowMap] = useState(false);

  const latitude = market.location?.lat;
  const longitude = market.location?.lon;
  if (!latitude || !longitude) {
    return (
      <MapFrame height={height}>
        <MapPinIcon className="h-6 w-6 text-zinc-400" />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Location coordinates are not available for this market
        </p>
      </MapFrame>
    );
  }

  const embedKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const embedSrc = embedKey
    ? `https://www.google.com/maps/embed/v1/place?key=${embedKey}&q=${latitude},${longitude}&zoom=15`
    : `https://www.google.com/maps?q=${latitude},${longitude}&z=15&output=embed`;

  // Same URL shape the page's JSON-LD uses for `hasMap`.
  const googleMapsHref = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

  const addressLine =
    [market.city, market.state]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(', ') || market.address?.trim() || '';

  if (showMap) {
    return (
      <div style={{ height, width: '100%' }} className="overflow-hidden rounded-lg">
        <iframe
          src={embedSrc}
          title={`Map of ${market.name}`}
          width="100%"
          height="100%"
          style={{ border: 0 }}
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    );
  }

  return (
    <MapFrame height={height}>
      <MapPinIcon className="h-7 w-7 text-green-600" />
      {addressLine && (
        <p className="max-w-xs text-sm text-zinc-700 dark:text-zinc-300">{addressLine}</p>
      )}
      <button
        type="button"
        className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        onClick={() => {
          trackEvent('Market Map Loaded', {
            market_id: market.id,
            market_name: market.name,
            provider: 'google-embed',
          });
          setShowMap(true);
        }}
      >
        Load map
      </button>
      <a
        href={googleMapsHref}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-zinc-600 underline underline-offset-2 hover:text-green-600 dark:text-zinc-400 dark:hover:text-green-500"
      >
        Open in Google Maps
      </a>
    </MapFrame>
  );
}
