import type { FarmerMarket } from '@/lib/api';
import { LazyPlacesMap } from '@/components/LazyPlacesMap';
import { displayName } from '@/lib/seo';

/**
 * The pin, inlined so the no-coordinates fallback doesn't pull `lucide-react`
 * into pages that otherwise need no icon set.
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

interface MarketLocationMapProps {
  market: FarmerMarket;
  height?: string;
}

/**
 * The map on a market's own page: one dot, on the same OpenStreetMap tiles and
 * in the same style as the explorer, the state hubs and the city pages.
 *
 * This was a Google Maps iframe until October 2026. It moved because the
 * many-market maps cannot be Google without per-load pricing, and a site whose
 * map changes provider from one page to the next reads as two products. The
 * "Get directions" link under the map still opens Google Maps.
 */
export default function MarketLocationMap({ market, height = '300px' }: MarketLocationMapProps) {
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

  return (
    <div style={{ height, width: '100%' }}>
      <LazyPlacesMap
        places={[
          {
            slug: market.slug,
            name: displayName(market.name),
            city: market.city,
            lat: latitude,
            lon: longitude,
          },
        ]}
        region={market.state ?? ''}
        activeSlug={market.slug}
        linkPlaces={false}
        className="h-full w-full"
      />
    </div>
  );
}
