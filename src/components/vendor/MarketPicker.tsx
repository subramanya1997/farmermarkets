'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Loader2, MapPin, Search } from 'lucide-react';
import { searchMarketsAction, type MarketSearchHit } from '@/app/(app)/dashboard/actions';
import { TextInput } from './fields';

const DEBOUNCE_MS = 250;
const MIN_QUERY = 2;

interface SearchResult {
  /** The trimmed query these results answer. */
  query: string;
  hits: MarketSearchHit[];
  failed: boolean;
}

const ROW =
  'flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-green-50 focus-visible:bg-green-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-green-700 dark:hover:bg-green-950/30 dark:focus-visible:bg-green-950/30';

/** Find a market to sell at; each result opens its application. */
export function MarketPicker({ appliedSlugs = [] }: { appliedSlugs?: string[] }) {
  const inputId = useId();
  const statusId = useId();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const latest = useRef(0);
  const applied = new Set(appliedSlugs);

  const text = query.trim();
  const active = text.length >= MIN_QUERY;

  useEffect(() => {
    const request = ++latest.current;
    if (!active) return;
    const timer = setTimeout(async () => {
      try {
        const hits = await searchMarketsAction(text);
        if (request === latest.current) setResult({ query: text, hits, failed: false });
      } catch {
        if (request === latest.current) setResult({ query: text, hits: [], failed: true });
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, active]);

  // Results only show for the query on screen, so a stale answer never flashes.
  const current = active && result?.query === text ? result : null;
  const searching = active && !current;
  const results = current?.hits ?? [];

  const status = searching
    ? 'Searching...'
    : current?.failed
      ? 'Search is not working right now. Try again in a moment.'
      : current
        ? results.length === 0
          ? 'No markets match that search. Try the city or ZIP.'
          : `${results.length} ${results.length === 1 ? 'market' : 'markets'} found`
        : '';

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
        Find a market you sell at
      </label>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
        <TextInput
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Market name, city or ZIP"
          autoComplete="off"
          enterKeyHint="search"
          aria-describedby={statusId}
          maxLength={100}
          className="pr-9 pl-9"
        />
        {searching ? <Loader2 aria-hidden="true" className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-zinc-400" /> : null}
      </div>

      <p id={statusId} role="status" className="min-h-5 text-sm text-zinc-500 dark:text-zinc-400">
        {status}
      </p>

      {results.length > 0 ? (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {results.map((market) => {
            const where = [market.city, market.state].filter(Boolean).join(', ');
            return (
              <li key={market.slug}>
                <Link href={`/vendor/markets/apply?market=${encodeURIComponent(market.slug)}`} className={ROW}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium break-words text-zinc-900 dark:text-zinc-100">{market.name}</span>
                    {where ? (
                      <span className="mt-0.5 flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
                        <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                        {where}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-green-700 dark:text-green-400">
                    {applied.has(market.slug) ? 'Open' : 'Apply'}
                    <ChevronRight aria-hidden="true" className="size-4" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
