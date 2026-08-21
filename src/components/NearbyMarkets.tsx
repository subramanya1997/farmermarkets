import Link from 'next/link';
import { formatMiles } from '@/lib/marketFacts';
import type { NearbyMarket } from '@/lib/nearby';

interface NearbyMarketsProps {
  markets: NearbyMarket[];
  /** The city page this market is listed on, when the geo index placed it. */
  cityHref?: string;
  cityName?: string;
}

/**
 * The nearest few markets, with the distance to each.
 *
 * Two jobs, one block. For the reader it answers the question every market
 * page raises and none of them used to answer — "what else is open near
 * here?". For the crawler it is the internal link mesh: 8,807 leaf pages that
 * previously linked only upward now link sideways to their real neighbours and
 * up to their city page, which is how the deeper pages get discovered at all.
 *
 * Distances are great-circle miles from the two records' own coordinates
 * (`src/lib/nearby.ts`), so a market with no coordinates gets no block rather
 * than a made-up one.
 */
export function NearbyMarkets({ markets, cityHref, cityName }: NearbyMarketsProps) {
  if (!markets.length && !cityHref) return null;

  return (
    <section className="mt-6 sm:mt-8" aria-labelledby="nearby-markets-heading">
      <h2
        id="nearby-markets-heading"
        className="text-xl sm:text-2xl font-bold tracking-tight mb-3 sm:mb-4"
      >
        Farmers markets nearby
      </h2>
      {markets.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {markets.map((market) => (
            <li key={market.slug}>
              <Link
                href={market.href}
                className="block h-full rounded-lg border border-zinc-200 p-3 transition-colors hover:border-green-500 hover:bg-green-50/50 dark:border-zinc-700 dark:hover:border-green-600 dark:hover:bg-green-900/10"
              >
                <span className="block font-medium text-green-700 dark:text-green-500">
                  {market.name}
                </span>
                <span className="mt-0.5 block text-sm text-zinc-600 dark:text-zinc-400">
                  {[market.locationLine, `${formatMiles(market.distanceKm)} away`]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {cityHref && cityName && (
        <p className="mt-3 text-sm sm:text-base">
          <Link href={cityHref} className="text-green-700 hover:underline dark:text-green-500">
            More farmers markets in {cityName}
          </Link>
        </p>
      )}
    </section>
  );
}
