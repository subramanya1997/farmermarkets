'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import type { CityMarketRow } from '@/lib/cityPage';
import { SNAP_HASH, dayHash, splitBySchedule } from '@/lib/cityPageView';
import type { Weekday } from '@/lib/schedule';
import { LazyPlacesMap, type MapPlace } from '@/components/LazyPlacesMap';
import { MarketCardView } from '@/components/MarketCardView';

interface CityMarketsProps {
  rows: CityMarketRow[];
  cityName: string;
  regionFull: string;
  /** Weekdays at least one market here trades on, Monday first. */
  days: { day: Weekday; count: number }[];
  snapCount: number;
}

const CHIP =
  'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700';
const CHIP_OFF =
  'border-zinc-200 bg-white text-zinc-700 hover:border-green-600 hover:text-green-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-green-500 dark:hover:text-green-400';
const CHIP_ON =
  'border-green-700 bg-green-700 text-white dark:border-green-600 dark:bg-green-600';

function MarketRow({
  row,
  active,
  onPoint,
  span,
}: {
  row: CityMarketRow;
  active: boolean;
  onPoint: (slug: string | null) => void;
  /** A photo card's two-column span, where the grid has two columns. */
  span?: string;
}) {
  // Pointing at a card lights up its dot on the map.
  return (
    <li
      onMouseEnter={() => onPoint(row.slug)}
      onMouseLeave={() => onPoint(null)}
      onFocus={() => onPoint(row.slug)}
      onBlur={() => onPoint(null)}
      className={span}
    >
      <MarketCardView card={row.card} active={active} />
    </li>
  );
}

/** The URL hash is the filter, so a stat chip or a shared link can set it. */
function subscribeToHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}
const readHash = () => decodeURIComponent(window.location.hash.slice(1)).toLowerCase();
const noHash = () => '';

/** Sets the filter hash without a history entry or a scroll jump. */
function writeHash(hash: string) {
  const url = `${window.location.pathname}${window.location.search}${hash ? `#${hash}` : ''}`;
  window.history.replaceState(window.history.state, '', url);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** A market with no posted schedule: name and street, one line. */
function ThinRow({ row, onPoint }: { row: CityMarketRow; onPoint: (slug: string | null) => void }) {
  return (
    <li
      onMouseEnter={() => onPoint(row.slug)}
      onMouseLeave={() => onPoint(null)}
      className="flex items-baseline justify-between gap-3 py-2 text-sm"
    >
      <span className="min-w-0">
        <Link href={row.href} className="font-medium text-green-800 hover:underline dark:text-green-400">
          {row.name}
        </Link>
        {row.address && (
          <span className="text-zinc-500 dark:text-zinc-400"> &middot; {row.address}</span>
        )}
      </span>
      {row.snap && (
        <span className="shrink-0 text-xs font-semibold text-green-800 dark:text-green-400">SNAP/EBT</span>
      )}
    </li>
  );
}

/**
 * A city's markets as a filterable list beside a map of the same markets.
 *
 * Server-rendered with every market showing, so the HTML a crawler reads
 * holds the full list and every link; the day and SNAP filters only narrow
 * what a reader sees afterwards. Pointing at a row lights up its dot on the
 * map, which is how a reader matches a name to a place without opening it.
 *
 * Markets that state no day, hours or season get no card: they sit in a
 * compact "Also listed" disclosure under the cards, still linked and mapped.
 * The filters live in the URL hash (`#day-saturday`, `#snap`), which is what
 * the stat chips above the list link to.
 */
export function CityMarkets({ rows, cityName, regionFull, days, snapCount }: CityMarketsProps) {
  const hash = useSyncExternalStore(subscribeToHash, readHash, noHash);
  // "#day-saturday", "#snap", or both as "#day-saturday,snap".
  const tokens = hash.split(',');
  const day = days.find((entry) => tokens.includes(dayHash(entry.day)))?.day ?? null;
  const snapOnly = tokens.includes(SNAP_HASH);
  const setFilter = useCallback(
    (nextDay: Weekday | null, nextSnap: boolean) =>
      writeHash([nextDay ? dayHash(nextDay) : '', nextSnap ? SNAP_HASH : ''].filter(Boolean).join(',')),
    []
  );
  const setDay = (next: Weekday | null) => setFilter(next, snapOnly);
  const setSnapOnly = (next: boolean) => setFilter(day, next);
  const [pointed, setPointed] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      rows.filter(
        (row) => (!day || row.days.includes(day)) && (!snapOnly || row.snap)
      ),
    [rows, day, snapOnly]
  );
  const { documented, thin } = useMemo(() => splitBySchedule(visible), [visible]);

  const places = useMemo<MapPlace[]>(
    () =>
      visible.flatMap((row) =>
        row.lat !== undefined && row.lon !== undefined
          ? [{ slug: row.slug, name: row.name, city: cityName, lat: row.lat, lon: row.lon }]
          : []
      ),
    [visible, cityName]
  );
  const anyPlaces = rows.some((row) => row.lat !== undefined);

  // Filters earn their place only when they can change the list.
  const showDayChips = rows.length > 1 && days.length > 1;
  const showSnapChip = rows.length > 1 && snapCount > 0 && snapCount < rows.length;
  const filtered = day !== null || snapOnly;

  return (
    <div className="relative">
      {/* Scroll targets for the filter hashes, so a stat chip lands here. */}
      {[...days.map((entry) => dayHash(entry.day)), SNAP_HASH].map((id) => (
        <span key={id} id={id} aria-hidden="true" className="absolute top-0 scroll-mt-24" />
      ))}
      {(showDayChips || showSnapChip) && (
        <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter markets">
          {showDayChips && (
            <>
              <button
                type="button"
                aria-pressed={day === null}
                onClick={() => setDay(null)}
                className={`${CHIP} ${day === null ? CHIP_ON : CHIP_OFF}`}
              >
                Any day
              </button>
              {days.map((entry) => (
                <button
                  key={entry.day}
                  type="button"
                  aria-pressed={day === entry.day}
                  onClick={() => setDay(day === entry.day ? null : entry.day)}
                  className={`${CHIP} ${day === entry.day ? CHIP_ON : CHIP_OFF}`}
                >
                  {entry.day}
                  <span className={`ml-1.5 text-xs ${day === entry.day ? 'text-green-100' : 'text-zinc-500 dark:text-zinc-400'}`}>
                    {entry.count}
                  </span>
                </button>
              ))}
            </>
          )}
          {showSnapChip && (
            <button
              type="button"
              aria-pressed={snapOnly}
              onClick={() => setSnapOnly(!snapOnly)}
              className={`${CHIP} ${snapOnly ? CHIP_ON : CHIP_OFF} ${showDayChips ? 'sm:ml-2' : ''}`}
            >
              Accepts SNAP/EBT
            </button>
          )}
        </div>
      )}

      {filtered && (
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
          Showing {visible.length} of {rows.length} markets.
        </p>
      )}

      <div
        className={
          anyPlaces
            ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'
            : ''
        }
      >
        {anyPlaces && (
          <div className="h-64 sm:h-80 lg:sticky lg:top-20 lg:order-2 lg:h-[calc(100vh-7rem)] lg:max-h-[720px]">
            {places.length > 0 ? (
              <LazyPlacesMap
                places={places}
                region={`${cityName}, ${regionFull}`}
                activeSlug={pointed}
                className="h-full w-full"
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-zinc-300 text-sm text-zinc-500 dark:border-zinc-700">
                No markets to map for this filter.
              </div>
            )}
          </div>
        )}

        {visible.length > 0 ? (
          <div className="content-start lg:order-1">
            <ul
              className={
                anyPlaces
                  ? 'grid grid-flow-row-dense content-start gap-3 xl:grid-cols-2'
                  : 'grid max-w-screen-2xl grid-flow-row-dense content-start gap-3 md:grid-cols-2 xl:grid-cols-3'
              }
            >
              {documented.map((row) => (
                <MarketRow
                  key={row.slug}
                  row={row}
                  active={pointed === row.slug}
                  onPoint={setPointed}
                  span={row.card.cover ? (anyPlaces ? 'xl:col-span-2' : 'md:col-span-2') : undefined}
                />
              ))}
            </ul>
            {thin.length > 0 && (
              <details className="group mt-3 rounded-2xl border border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm marker:content-none [&::-webkit-details-marker]:hidden">
                  <span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      Also listed &middot; {thin.length}
                    </span>
                    <span className="ml-2 text-zinc-500 dark:text-zinc-400">No posted days or hours</span>
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  />
                </summary>
                <ul className="divide-y divide-zinc-100 border-t border-zinc-100 pb-1 dark:divide-zinc-800 dark:border-zinc-800">
                  {thin.map((row) => (
                    <ThinRow key={row.slug} row={row} onPoint={setPointed} />
                  ))}
                </ul>
              </details>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-600 lg:order-1 dark:border-zinc-700 dark:text-zinc-400">
            <p>
              No {cityName} market is listed
              {day ? ` for ${day}` : ''}
              {snapOnly ? ' that accepts SNAP/EBT' : ''}.
            </p>
            <button
              type="button"
              onClick={() => setFilter(null, false)}
              className="mt-2 font-medium text-green-700 hover:underline dark:text-green-500"
            >
              Show all {rows.length} markets
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
