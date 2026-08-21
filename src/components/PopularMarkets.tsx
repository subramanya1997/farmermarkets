import Link from 'next/link';
import { TrendingUp } from 'lucide-react';
import { MarketSummaryCard } from './MarketSummaryCard';
import type { FarmerMarket } from '@/lib/api';

interface PopularMarketsProps {
  markets: FarmerMarket[];
}

/**
 * Featured markets on the homepage.
 *
 * This was a client component that returned `null` until it mounted, which
 * meant the homepage's server-rendered HTML contained zero market links — a
 * crawler saw an empty section. It is now a plain server component: the cards
 * (and their `<a href="/markets/…">` links) are in the HTML.
 *
 * The geolocation-based "near you" ordering it used to do is gone with it.
 * Personalizing a statically rendered, daily-revalidated page was never going
 * to work anyway; nearby markets are what the search and map view in
 * `/markets` are for, and that view still sorts by distance.
 */
export function PopularMarkets({ markets }: PopularMarketsProps) {
  if (markets.length === 0) return null;

  return (
    <section className="w-full bg-white py-12 dark:bg-zinc-900 md:py-16 lg:py-20">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Featured Farmers Markets
              </h2>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              A few well-documented markets from around the directory.
            </p>
          </div>

          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {markets.map((market) => (
              <li key={market.id}>
                <MarketSummaryCard market={market} />
              </li>
            ))}
          </ul>

          <div className="flex justify-center pt-4">
            <Link
              href="/markets"
              className="inline-flex items-center gap-2 text-sm font-medium text-green-600 hover:text-green-700 dark:text-green-500 dark:hover:text-green-400"
            >
              View all farmers markets
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
