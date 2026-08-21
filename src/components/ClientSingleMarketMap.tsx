'use client';

import type { FarmerMarket } from '@/lib/api';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { trackEvent } from '@/lib/analytics';

/**
 * The pin, inlined.
 *
 * `lucide-react` and `@/components/ui/button` are only ever reached from
 * server components on a market page, so importing either one here would drag
 * them (and `class-variance-authority` / `tailwind-merge` behind the button)
 * into the page's client bundle — about 10 KB to render one icon and one
 * button. Plain markup keeps the placeholder free.
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
 * The Leaflet map itself, in its own chunk.
 *
 * `next/dynamic` only requests that chunk when this component is actually
 * rendered — which now happens on a click rather than on mount, so the
 * ~170 KB of Leaflet plus its tile CSS never reach the 9,000-odd market
 * pages whose readers only wanted the address.
 */
const SingleMarketMap = dynamic(() => import('@/components/SingleMarketMap'), {
  ssr: false,
  loading: () => (
    <MapFrame>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading map…</p>
    </MapFrame>
  ),
});

interface ClientSingleMarketMapProps {
  market: FarmerMarket;
  height?: string;
}

/**
 * The fixed-size box every state of the map lives in.
 *
 * Placeholder, loading spinner and the real map all occupy exactly the same
 * space, so swapping between them never shifts the rest of the location card.
 */
function MapFrame({ height = '300px', children }: { height?: string; children: React.ReactNode }) {
  return (
    <div
      style={{ height, width: '100%' }}
      className="flex flex-col items-center justify-center gap-3 rounded-md border border-zinc-200 bg-muted px-4 text-center dark:border-zinc-700"
    >
      {children}
    </div>
  );
}

/**
 * Click-to-load wrapper around the market's Leaflet map.
 *
 * What renders on the server — and therefore what sits in the HTML of every
 * market page — is a placeholder the size of the map: a pin, the address, a
 * button that loads the map, and a plain link to Google Maps for readers who
 * never click (or never run the JavaScript at all).
 */
export default function ClientSingleMarketMap({ market, height = '300px' }: ClientSingleMarketMapProps) {
  const [showMap, setShowMap] = useState(false);

  const latitude = market.location?.lat;
  const longitude = market.location?.lon;
  const hasCoordinates = Boolean(latitude && longitude);

  // The label under the pin, the way the real map's popup labels its marker:
  // city and state when the record carries them, and the street address —
  // which on most records already ends in the city and state — when it does
  // not. Legacy records leave `city`/`state` null far more often than not.
  const addressLine =
    [market.city, market.state]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(', ') || market.address?.trim() || '';

  if (!hasCoordinates) {
    return (
      <MapFrame height={height}>
        <MapPinIcon className="h-6 w-6 text-zinc-400" />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Location coordinates are not available for this market
        </p>
      </MapFrame>
    );
  }

  // Same URL shape the page's JSON-LD uses for `hasMap`.
  const googleMapsHref = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

  if (showMap) {
    return <SingleMarketMap market={market} height={height} />;
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
          });
          setShowMap(true);
        }}
      >
        Load interactive map
      </button>
      <a
        href={googleMapsHref}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-zinc-600 underline underline-offset-2 hover:text-green-600 dark:text-zinc-400 dark:hover:text-green-500"
      >
        View on Google Maps
      </a>
    </MapFrame>
  );
}
