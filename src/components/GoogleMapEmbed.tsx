import type { FarmerMarket } from '@/lib/api';

/**
 * The pin, inlined so the no-coordinates fallback doesn't pull `lucide-react`
 * into pages that otherwise render only an iframe.
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

interface GoogleMapEmbedProps {
  market: FarmerMarket;
  height?: string;
}

/**
 * Google Maps embed for one market — a server component, zero client JS.
 *
 * The map used to hide behind a "Load map" click, a precaution against map
 * pricing. The Maps Embed API is free with unlimited requests (verified
 * against Google's usage-and-billing docs and the live request the page
 * fires), so the click was pure friction and the map now just renders.
 * `loading="lazy"` keeps the browser from fetching it while it is off
 * screen, which is the part of the old behavior worth keeping.
 *
 * The embed URL is keyless when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is unset;
 * with the key it uses the official Maps Embed API, which also names the
 * market's pin. The explorer's many-marker map stays on Leaflet, where
 * per-load pricing would apply.
 */
export default function GoogleMapEmbed({ market, height = '300px' }: GoogleMapEmbedProps) {
  const latitude = market.location?.lat;
  const longitude = market.location?.lon;

  if (!latitude || !longitude) {
    return (
      <div
        style={{ height, width: '100%' }}
        className="flex flex-col items-center justify-center gap-3 rounded-lg bg-zinc-100 px-4 text-center dark:bg-zinc-800/60"
      >
        <MapPinIcon className="h-6 w-6 text-zinc-400" />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Location coordinates are not available for this market
        </p>
      </div>
    );
  }

  const embedKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const embedSrc = embedKey
    ? `https://www.google.com/maps/embed/v1/place?key=${embedKey}&q=${latitude},${longitude}&zoom=15`
    : `https://www.google.com/maps?q=${latitude},${longitude}&z=15&output=embed`;

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
