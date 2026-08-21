import Link from 'next/link';
import type { StateSummary } from '@/lib/marketsIndex';

interface BrowseByStateProps {
  states: StateSummary[];
}

/**
 * Server-rendered directory of every state/region in the data.
 *
 * The `/markets/state/[state]` pages were orphans — nothing linked to them, so
 * they were reachable only through the sitemap. Listing all of them here gives
 * every market a two-hop path from `/markets`, which is a much shorter crawl
 * route than paging 180+ times through the index.
 */
export function BrowseByState({ states }: BrowseByStateProps) {
  if (states.length === 0) return null;

  // `NY` and `New York` are two different state pages holding two different
  // sets of records, so both need a link — but two entries both reading
  // "New York" would look like a bug. Suffix the duplicates with the spelling
  // that produced them.
  const canonicalCounts = new Map<string, number>();
  for (const state of states) {
    canonicalCounts.set(state.canonical, (canonicalCounts.get(state.canonical) ?? 0) + 1);
  }

  return (
    <section className="w-full border-t border-zinc-200 bg-zinc-50 py-12 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Browse markets by state</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {states.length.toLocaleString()} states and regions with farmers markets in the directory.
        </p>
        <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
          {states.map((state) => (
            <li key={state.slug}>
              <Link
                href={`/markets/state/${state.slug}`}
                className="flex items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white hover:underline dark:hover:bg-zinc-800"
              >
                <span className="truncate">
                  {state.name}
                  {(canonicalCounts.get(state.canonical) ?? 0) > 1 &&
                    state.slug.length <= 3 && (
                      <span className="text-zinc-500 dark:text-zinc-400">
                        {' '}
                        ({state.slug.toUpperCase()})
                      </span>
                    )}
                </span>
                <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                  {state.count.toLocaleString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
