'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Search } from 'lucide-react';
import type { StateCityLink } from '@/lib/statePage';
import { trackEvent } from '@/lib/analytics';
import { citySearchEvent } from '@/lib/searchAnalytics';

interface CityDirectoryProps {
  cities: StateCityLink[];
  regionFull: string;
}

/** Accent-folded, lower-cased, so "Montréal" is found by typing "montreal". */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function initial(name: string): string {
  const letter = fold(name).charAt(0).toUpperCase();
  return /[A-Z]/.test(letter) ? letter : '#';
}

function byName(left: StateCityLink, right: StateCityLink): number {
  return left.name.localeCompare(right.name, 'en');
}

/** Below this many cities the list is short enough to read whole. */
const TOOLS_THRESHOLD = 24;
/** Counts this small say nothing a reader needs; the link alone is enough. */
const SHOW_COUNT_FROM = 3;

function groupByLetter(cities: StateCityLink[]): [string, StateCityLink[]][] {
  const byLetter = new Map<string, StateCityLink[]>();
  for (const city of cities) {
    const letter = initial(city.name);
    const bucket = byLetter.get(letter);
    if (bucket) bucket.push(city);
    else byLetter.set(letter, [city]);
  }
  return [...byLetter.entries()];
}

function CityList({ cities, lettered, idPrefix }: { cities: StateCityLink[]; lettered: boolean; idPrefix?: string }) {
  if (!lettered) {
    return (
      <ul className="columns-2 gap-x-6 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6">
        {cities.map((city) => (
          <CityItem key={city.slug} city={city} />
        ))}
      </ul>
    );
  }
  return (
    <div className="columns-2 gap-x-6 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6">
      {groupByLetter(cities).map(([letter, bucket]) => (
        <section
          key={letter}
          id={idPrefix ? `${idPrefix}-${letter === '#' ? 'other' : letter.toLowerCase()}` : undefined}
          aria-label={`Cities starting with ${letter}`}
          className="mb-4 scroll-mt-24"
        >
          <h3 className="mb-1 break-after-avoid text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {letter}
          </h3>
          <ul>
            {bucket.map((city) => (
              <CityItem key={city.slug} city={city} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function CityItem({ city }: { city: StateCityLink }) {
  return (
    <li className="break-inside-avoid">
      <Link
        href={city.href}
        className="flex items-baseline justify-between gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-green-50 hover:text-green-900 dark:hover:bg-green-900/20 dark:hover:text-green-300"
      >
        <span className="truncate">{city.name}</span>
        {city.marketCount >= SHOW_COUNT_FROM && (
          <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
            {city.marketCount}
          </span>
        )}
      </Link>
    </li>
  );
}

/**
 * Every city in a state, A to Z, with a box to find one by name.
 *
 * Towns with two or more markets are listed up front; the long tail of
 * single-market towns sits behind "Show N more towns". Both lists are
 * server-rendered (a closed `<details>` still ships its links), so every city
 * page stays one hop from the hub.
 */
export function CityDirectory({ cities, regionFull }: CityDirectoryProps) {
  const [query, setQuery] = useState('');
  const withTools = cities.length >= TOOLS_THRESHOLD;

  const sorted = useMemo(() => [...cities].sort(byName), [cities]);
  const needle = fold(query.trim());
  const matches = useMemo(
    () => (needle ? sorted.filter((city) => fold(city.name).includes(needle)) : []),
    [sorted, needle]
  );

  // Split only when it shortens the list meaningfully; a small state, or one
  // where every town has a single market, just lists everything.
  const multi = sorted.filter((city) => city.marketCount >= 2);
  const split = withTools && multi.length > 0 && multi.length < sorted.length;
  const rest = split ? sorted.filter((city) => city.marketCount < 2) : [];
  const lead = split ? multi : sorted;

  const lastTrackedQuery = useRef<string | null>(null);

  // Report a search once the reader stops typing, so "spr", "spri", "sprin"
  // are one event, not four.
  useEffect(() => {
    const event = citySearchEvent({ query, resultCount: matches.length, region: regionFull });
    if (!event) return;
    const timer = window.setTimeout(() => {
      if (lastTrackedQuery.current === event.query) return;
      lastTrackedQuery.current = event.query;
      trackEvent('City Search', event);
      if (event.zero_results) trackEvent('City Search No Results', event);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [query, matches.length, regionFull]);

  return (
    <div>
      {withTools && (
        <label className="relative mt-4 block w-full max-w-sm">
          <span className="sr-only">Find a town in {regionFull}</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Find a town in ${regionFull}`}
            className="w-full rounded-full border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-zinc-400 focus:border-green-700 focus:ring-2 focus:ring-green-700/20 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      )}

      {needle ? (
        <div className="mt-4" aria-live="polite">
          {matches.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">No town matches &ldquo;{query.trim()}&rdquo;.</p>
          ) : (
            <CityList cities={matches} lettered={false} />
          )}
        </div>
      ) : (
        <>
          <div className="mt-5">
            <CityList cities={lead} lettered={withTools} idPrefix="cities" />
          </div>
          {rest.length > 0 && (
            <details className="group mt-2 rounded-2xl border border-zinc-200 dark:border-zinc-800">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-zinc-800 dark:text-zinc-200 [&::-webkit-details-marker]:hidden">
                Show {rest.length.toLocaleString()} more {rest.length === 1 ? 'town' : 'towns'}
                <ChevronDown
                  aria-hidden
                  className="ml-auto h-4 w-4 text-zinc-500 transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="px-3 pb-3">
                <CityList cities={rest} lettered idPrefix="towns" />
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
