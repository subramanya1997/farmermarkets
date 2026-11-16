'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { adminSearchMarketsAction, type AdminMarketHit } from '@/app/admin/actions';
import { cn } from '@/lib/utils';
import { placeLabel } from './format';

const DEBOUNCE_MS = 250;

/**
 * "Edit any market": searches the whole dataset by name, city or state.
 * Results open the admin editor. Arrow keys move through them, Enter opens one.
 */
export function MarketSearch({ className, autoFocus = false }: { className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<AdminMarketHit[] | null>(null);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  function onChange(value: string) {
    setQuery(value);
    setActive(-1);
    setError(false);
    clearTimeout(timer.current);
    const text = value.trim();
    if (text.length < 2) {
      latest.current += 1;
      setHits(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      const ticket = ++latest.current;
      try {
        const result = await adminSearchMarketsAction(text);
        if (ticket !== latest.current) return;
        setHits(result);
      } catch {
        if (ticket !== latest.current) return;
        setHits([]);
        setError(true);
      }
      setLoading(false);
    }, DEBOUNCE_MS);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!hits || hits.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (index + 1) % hits.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (index <= 0 ? hits.length - 1 : index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = hits[Math.max(0, active)];
      if (hit) router.push(`/admin/markets/${hit.slug}`);
    } else if (event.key === 'Escape') {
      setActive(-1);
      setHits(null);
    }
  }

  const open = hits !== null;
  const optionId = (index: number) => `${listId}-${index}`;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={inputId} className="sr-only">
        Search markets by name, city or state
      </label>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
        <Input
          id={inputId}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          value={query}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search by market name, city or state"
          className="h-11 bg-white pr-10 pl-9 text-base md:text-sm dark:bg-zinc-950"
        />
        {loading ? (
          <Loader2 aria-hidden="true" className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-zinc-400" />
        ) : null}
      </div>

      <div aria-live="polite" className="sr-only">
        {open && !loading ? (hits.length === 1 ? '1 market found' : `${hits.length} markets found`) : ''}
      </div>

      {open ? (
        hits.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-2.5 text-sm text-zinc-500 dark:text-zinc-400">
            {error ? 'Search did not go through. Try again.' : `No markets match "${query.trim()}".`}
          </p>
        ) : (
          <ul id={listId} role="listbox" aria-label="Markets" className="max-h-80 divide-y overflow-y-auto rounded-md border bg-white dark:bg-zinc-950">
            {hits.map((hit, index) => (
              <li key={hit.slug} role="presentation">
                <Link
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === active}
                  href={`/admin/markets/${hit.slug}`}
                  onMouseEnter={() => setActive(index)}
                  className={cn(
                    'flex items-center justify-between gap-3 px-3 py-2 text-sm',
                    index === active ? 'bg-green-50 dark:bg-green-950/40' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{hit.name}</span>
                    <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{placeLabel(hit) || 'No city on file'}</span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
                    Edit
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
