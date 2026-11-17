'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Clock, LocateFixed, MapPin } from 'lucide-react';
import { useGeolocation } from '@/hooks/useGeolocation';
import { trackEvent } from '@/lib/analytics';
import { filterNearMe, localDay, type NearMeMarket, type NearMeTab } from '@/lib/nearMeFilter';
import { dayLabel } from '../_components/TopicMarketRow';

/**
 * The markets closest to the reader, with Today, This weekend and Year-round
 * tabs.
 *
 * Everything here happens in the browser, because only the browser knows
 * where the reader is and what day it is for them. The starting point is the
 * same approximate, IP-based location the homepage uses (no permission
 * prompt); "Use my exact location" swaps in the device's own position when the
 * reader asks for it. The rest of the page (states, days, FAQ) is server
 * rendered and does not depend on any of this.
 */

const TABS: { key: NearMeTab; label: string }[] = [
  { key: 'nearest', label: 'Nearest' },
  { key: 'today', label: 'Open today' },
  { key: 'weekend', label: 'This weekend' },
  { key: 'year_round', label: 'Year-round' },
];

const PAGE_SIZE = 12;

type Origin = { lat: number; lon: number; label?: string; source: 'ip_lookup' | 'device' };
/** The answer for one rounded position; a different `key` means it is stale. */
type Results = { key: string; markets: NearMeMarket[] } | { key: string; failed: true };

const chip =
  'inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300';

function emptyMessage(tab: NearMeTab, weekday: string): string {
  if (tab === 'today') {
    return `No market near you lists ${weekday} as a market day in season. Try This weekend or Year-round.`;
  }
  if (tab === 'weekend') return 'No market near you lists this weekend as in season. Try Year-round.';
  if (tab === 'year_round') return 'No market near you is listed as year-round.';
  return 'No markets are listed within 60 miles of you. Pick your state below to browse.';
}

export function NearMeMarkets() {
  const { location, loading: locating } = useGeolocation();
  const [deviceOrigin, setDeviceOrigin] = useState<Origin | null>(null);
  const [deviceState, setDeviceState] = useState<'idle' | 'asking' | 'denied'>('idle');
  const [results, setResults] = useState<Results | null>(null);
  const [tab, setTab] = useState<NearMeTab>('nearest');
  const [visible, setVisible] = useState(PAGE_SIZE);

  const origin: Origin | null = useMemo(() => {
    if (deviceOrigin) return deviceOrigin;
    if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lon)) return null;
    return {
      lat: location.lat,
      lon: location.lon,
      label: [location.city, location.state].filter(Boolean).join(', ') || undefined,
      source: 'ip_lookup',
    };
  }, [deviceOrigin, location]);

  // Two decimals is about a kilometre: enough for "within 60 miles", and it
  // keeps the reader's exact position out of the request.
  const query = origin ? `lat=${origin.lat.toFixed(2)}&lon=${origin.lon.toFixed(2)}` : null;
  const originSource = origin?.source;

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();

    fetch(`/api/near-me?${query}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`near-me request failed: ${response.status}`);
        return response.json() as Promise<{ markets: NearMeMarket[] }>;
      })
      .then((body) => {
        setResults({ key: query, markets: body.markets });
        setVisible(PAGE_SIZE);
        if (!navigator.webdriver) {
          trackEvent('Near Me Results Shown', {
            result_count: body.markets.length,
            location_source: originSource,
          });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setResults({ key: query, failed: true });
      });

    return () => controller.abort();
  }, [query, originSource]);

  const useDeviceLocation = () => {
    if (!('geolocation' in navigator)) {
      setDeviceState('denied');
      return;
    }
    setDeviceState('asking');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDeviceState('idle');
        setDeviceOrigin({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          source: 'device',
        });
      },
      () => setDeviceState('denied'),
      { maximumAge: 10 * 60 * 1000, timeout: 10000 }
    );
  };

  const current = results && results.key === query ? results : null;
  const markets = current && 'markets' in current ? current.markets : null;
  const failed = Boolean(current && 'failed' in current);
  const counts = useMemo(() => {
    if (!markets) return null;
    const now = new Date();
    return Object.fromEntries(
      TABS.map(({ key }) => [key, filterNearMe(markets, key, now).length])
    ) as Record<NearMeTab, number>;
  }, [markets]);
  const shown = useMemo(
    () => (markets ? filterNearMe(markets, tab, new Date()) : []),
    [markets, tab]
  );

  const selectTab = (next: NearMeTab) => {
    setTab(next);
    setVisible(PAGE_SIZE);
    trackEvent('Near Me Tab Selected', { tab: next, result_count: counts?.[next] });
  };

  const waiting = (locating && !deviceOrigin) || Boolean(query && !current) || deviceState === 'asking';
  const noLocation = !locating && !origin;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
          <MapPin aria-hidden className="h-4 w-4 shrink-0 text-green-700 dark:text-green-500" />
          {origin?.source === 'device'
            ? 'Showing markets near your exact location.'
            : origin?.label
              ? `Showing markets near ${origin.label}, your approximate location.`
              : origin
                ? 'Showing markets near your approximate location.'
                : waiting
                  ? 'Finding markets near you.'
                  : 'We could not work out where you are.'}
        </p>
        {origin?.source !== 'device' && (
          <button
            type="button"
            onClick={useDeviceLocation}
            disabled={deviceState === 'asking'}
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-800 transition-colors hover:border-green-300 hover:bg-green-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <LocateFixed aria-hidden className="h-4 w-4 text-green-700 dark:text-green-500" />
            Use my exact location
          </button>
        )}
      </div>

      {deviceState === 'denied' && (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Your browser did not share a location. Pick your state below to browse.
        </p>
      )}

      {markets && counts && (
        <div role="group" aria-label="Filter nearby markets" className="mt-4 flex flex-wrap gap-1.5">
          {TABS.map(({ key, label }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => selectTab(key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? 'border-green-700 bg-green-700 text-white dark:border-green-500 dark:bg-green-600'
                    : 'border-zinc-200 bg-white text-zinc-800 hover:border-green-300 hover:bg-green-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'
                }`}
              >
                {label}
                <span
                  className={`text-xs tabular-nums ${
                    active ? 'text-green-100' : 'text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  {counts[key].toLocaleString('en-US')}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-4">
        {waiting && !markets && (
          <ul aria-hidden className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {[0, 1, 2, 3].map((row) => (
              <li key={row} className="px-4 py-3 sm:px-5">
                <div className="h-4 w-2/5 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                <div className="mt-2 h-3 w-1/4 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
              </li>
            ))}
          </ul>
        )}

        {(noLocation || failed) && !markets && deviceState !== 'denied' && (
          <p className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            {failed
              ? 'The nearby list did not load. Pick your state below to browse.'
              : 'Use your exact location, or pick your state below to browse.'}
          </p>
        )}

        {markets && shown.length === 0 && (
          <p className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            {emptyMessage(tab, localDay(new Date()).weekday)}
          </p>
        )}

        {markets && shown.length > 0 && (
          <>
            <ul className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
              {shown.slice(0, visible).map((market) => (
                <li key={market.slug} className="px-4 py-3 sm:px-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <Link
                        href={market.href}
                        className="font-medium text-green-700 hover:underline dark:text-green-500"
                      >
                        {market.name}
                      </Link>
                      {market.place && (
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">{market.place}</span>
                      )}
                    </div>
                    <span className="shrink-0 text-sm text-zinc-600 tabular-nums dark:text-zinc-400">
                      {market.distanceMiles < 10
                        ? market.distanceMiles.toFixed(1)
                        : Math.round(market.distanceMiles)}{' '}
                      mi
                    </span>
                  </div>
                  {(market.days.length > 0 || market.hours || market.yearRound) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {market.days.length > 0 && (
                        <span className={chip}>
                          <CalendarDays aria-hidden className="h-3.5 w-3.5 text-green-700 dark:text-green-500" />
                          {dayLabel(market.days)}
                        </span>
                      )}
                      {market.hours && (
                        <span className={chip}>
                          <Clock aria-hidden className="h-3.5 w-3.5 text-green-700 dark:text-green-500" />
                          {market.hours}
                        </span>
                      )}
                      {market.yearRound && (
                        <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-900 dark:bg-green-950/40 dark:text-green-200">
                          Year-round
                        </span>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {shown.length > visible && (
              <button
                type="button"
                onClick={() => setVisible((count) => count + PAGE_SIZE)}
                className="mt-3 inline-flex items-center rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-800 transition-colors hover:border-green-300 hover:bg-green-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Show {Math.min(PAGE_SIZE, shown.length - visible)} more
              </button>
            )}
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              Open today means the market lists today as a market day and is in season. Hours can
              change, so check the market&apos;s page before you go.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
