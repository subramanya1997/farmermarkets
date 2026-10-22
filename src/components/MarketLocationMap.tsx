import type { FarmerMarket } from '@/lib/api';
import { LazyPlacesMap } from '@/components/LazyPlacesMap';
import { TrackedExternalLink } from '@/components/TrackedExternalLink';
import { displayName, marketAddressParts } from '@/lib/seo';

interface MarketLocationMapProps {
  market: FarmerMarket;
  height?: string;
}

/** Google Maps for turn-by-turn: the market's own listing when sourced, else its coordinates. */
function directionsUrl(market: FarmerMarket, lat: number, lon: number): string {
  if (market.google_maps_url) return market.google_maps_url;
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
}

/**
 * "Where it is" on a market's own page: a calm map in the site's one map
 * style with the market as a single emphasised dot, and a floating card with
 * the street address and a Directions button. One glance answers "where" and
 * one tap starts the trip; the map itself is still, so it never fights the
 * page scroll on a phone.
 */
export default function MarketLocationMap({ market, height = '300px' }: MarketLocationMapProps) {
  const latitude = market.location?.lat;
  const longitude = market.location?.lon;
  if (!latitude || !longitude) return null;

  const { street, cityLabel: locality } = marketAddressParts(market);

  return (
    <div className="relative" style={{ height, width: '100%' }}>
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
        still
        className="h-full w-full"
      />
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex">
        <div className="pointer-events-auto flex w-full items-center gap-3 rounded-xl bg-white/95 p-3 shadow-lg shadow-green-950/10 ring-1 ring-black/5 backdrop-blur dark:bg-zinc-900/95 dark:ring-white/10">
          <div className="min-w-0 flex-1">
            {street && (
              <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{street}</p>
            )}
            {locality && <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{locality}</p>}
          </div>
          <TrackedExternalLink
            href={directionsUrl(market, latitude, longitude)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-full bg-green-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-800"
            eventName="Market Directions Opened"
            eventProperties={{ market_slug: market.slug, destination: 'google-maps', placement: 'map-card' }}
          >
            Directions
          </TrackedExternalLink>
        </div>
      </div>
    </div>
  );
}
