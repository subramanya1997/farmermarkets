'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import type { StateCityLink } from '@/lib/statePage';

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

/** Below this many cities the list is short enough to read without tools. */
const TOOLS_THRESHOLD = 24;

/**
 * Every city in a state, A to Z, with a box to find one by name.
 *
 * The hub used to print this list ordered by market count, which put the five
 * biggest cities first and then four hundred towns with one market each in no
 * findable order. The biggest cities have their own block above; this list is
 * for the reader who already knows the town they want, so it is alphabetical,
 * split by letter, and searchable.
 *
 * Server-rendered unfiltered, so every city link is in the HTML.
 */
export function CityDirectory({ cities, regionFull }: CityDirectoryProps) {
  const [query, setQuery] = useState('');
  const withTools = cities.length >= TOOLS_THRESHOLD;

  const groups = useMemo(() => {
    const needle = fold(query.trim());
    const matching = cities
      .filter((city) => !needle || fold(city.name).includes(needle))
      .sort((left, right) => left.name.localeCompare(right.name, 'en'));

    const byLetter = new Map<string, StateCityLink[]>();
    for (const city of matching) {
      const letter = initial(city.name);
      const bucket = byLetter.get(letter);
      if (bucket) bucket.push(city);
      else byLetter.set(letter, [city]);
    }
    return [...byLetter.entries()];
  }, [cities, query]);

  const matchCount = groups.reduce((total, [, bucket]) => total + bucket.length, 0);

  return (
    <div>
      {withTools && (
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
          <label className="relative block w-full max-w-sm">
            <span className="sr-only">Find a city in {regionFull}</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Find a city in ${regionFull}`}
              className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm outline-none placeholder:text-zinc-400 focus:border-green-700 focus:ring-2 focus:ring-green-700/20 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          {!query && (
            <nav aria-label="Jump to a letter" className="flex flex-wrap gap-1">
              {groups.map(([letter]) => (
                <a
                  key={letter}
                  href={`#cities-${letter === '#' ? 'other' : letter.toLowerCase()}`}
                  className="flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-sm font-medium text-zinc-700 hover:bg-green-50 hover:text-green-800 dark:text-zinc-300 dark:hover:bg-green-900/30 dark:hover:text-green-400"
                >
                  {letter}
                </a>
              ))}
            </nav>
          )}
        </div>
      )}

      {query && (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
          {matchCount === 0
            ? `No city in ${regionFull} matches "${query.trim()}".`
            : `${matchCount} ${matchCount === 1 ? 'city matches' : 'cities match'} "${query.trim()}".`}
        </p>
      )}

      <div className="mt-5 columns-2 gap-x-6 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6">
        {groups.map(([letter, bucket]) => (
          <section
            key={letter}
            id={`cities-${letter === '#' ? 'other' : letter.toLowerCase()}`}
            aria-label={`Cities starting with ${letter}`}
            className="mb-5 scroll-mt-24"
          >
            {withTools && (
              <h3 className="mb-1 break-after-avoid border-b border-zinc-200 pb-1 text-sm font-bold text-green-800 dark:border-zinc-800 dark:text-green-400">
                {letter}
              </h3>
            )}
            <ul>
              {bucket.map((city) => (
                <li key={city.slug} className="break-inside-avoid">
                  <Link
                    href={city.href}
                    className="flex items-baseline justify-between gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-green-50 hover:text-green-900 dark:hover:bg-green-900/20 dark:hover:text-green-300"
                  >
                    <span className="truncate">{city.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                      {city.marketCount}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
