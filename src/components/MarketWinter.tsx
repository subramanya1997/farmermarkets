import Link from 'next/link';
import { Snowflake } from 'lucide-react';
import { formatMiles } from '@/lib/marketFacts';
import type { MarketWinterAnswer } from '@/lib/marketWinter';
import type { NearbyMarket } from '@/lib/nearby';

interface MarketWinterProps {
  answer?: MarketWinterAnswer;
  /** The nearest markets that state a year-round season. */
  yearRound: NearbyMarket[];
}

/**
 * "Open in winter?": the record's own season read as a yes or no, then the
 * nearest year-round markets, which is where a reader turned away by a
 * summer schedule goes next. A year-round market skips the list (it is the
 * answer). Renders nothing when there is neither a sentence nor a list.
 */
export function MarketWinter({ answer, yearRound }: MarketWinterProps) {
  const list = answer?.status === 'year_round' ? [] : yearRound;
  if (!answer && !list.length) return null;

  return (
    <section className="mt-6 sm:mt-8" aria-labelledby="market-winter-heading">
      <h2 id="market-winter-heading" className="mb-3 flex items-center gap-2 text-lg font-semibold tracking-tight sm:text-xl">
        <Snowflake aria-hidden className="h-5 w-5 text-sky-600 dark:text-sky-400" />
        {answer ? 'Open in winter?' : 'Year-round markets nearby'}
      </h2>
      {answer && (
        <p className="max-w-[75ch] text-sm text-zinc-700 sm:text-base dark:text-zinc-300">{answer.text}</p>
      )}
      {list.length > 0 && (
        <>
          {answer && (
            <p className="mt-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Listed as open year-round near here:
            </p>
          )}
          <ul className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {list.map((market) => (
              <li key={market.slug}>
                <Link
                  href={market.href}
                  className="block h-full rounded-lg border border-zinc-200 p-3 transition-colors hover:border-sky-500 hover:bg-sky-50/50 dark:border-zinc-700 dark:hover:border-sky-600 dark:hover:bg-sky-900/10"
                >
                  <span className="block font-medium text-green-700 dark:text-green-500">{market.name}</span>
                  <span className="mt-0.5 block text-sm text-zinc-600 dark:text-zinc-400">
                    {[market.locationLine, `${formatMiles(market.distanceKm)} away`].filter(Boolean).join(' · ')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
