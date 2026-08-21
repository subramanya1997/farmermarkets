import Link from 'next/link';
import type { StateHubSummary } from '@/lib/statePage';
import { SITE_FRAME } from "@/lib/ui";

interface BrowseByStateProps {
  states: StateHubSummary[];
}

/**
 * Server-rendered directory of every state/region in the data.
 *
 * These link to the state hubs at `/farmers-markets/{state}`, which gives
 * every market a three-hop path from `/markets` (state → city → market) — a
 * much shorter crawl route than paging 180+ times through the index.
 *
 * The list comes from the geo index, so each state appears exactly once: the
 * old raw-value directory listed "New York" and "NY" as two separate rows
 * because they were, at the time, two separate pages.
 */
export function BrowseByState({ states }: BrowseByStateProps) {
  if (states.length === 0) return null;

  return (
    <section className="w-full border-t border-zinc-200 bg-zinc-50 py-12 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className={SITE_FRAME}>
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Browse markets by state</h2>
        <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          {states.length.toLocaleString()} states and regions with farmers markets in the directory.
        </p>
        <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
          {states.map((state) => (
            <li key={state.slug}>
              <Link
                href={state.href}
                className="flex items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white hover:underline dark:hover:bg-zinc-800"
              >
                <span className="truncate">{state.name}</span>
                <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                  {state.marketCount.toLocaleString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
