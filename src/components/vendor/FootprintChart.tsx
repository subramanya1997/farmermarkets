'use client';

import { useMemo, useState } from 'react';
import { useHydrated, useLocalDay } from '@/hooks/useLocalDay';
import { localDay } from '@/lib/offeringDays';
import { dailySeries, FOOTPRINT_DAYS, type HourBucket } from '@/lib/reachRules';
import { cn } from '@/lib/utils';

const LABEL = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function dayLabel(day: string): string {
  return LABEL.format(new Date(`${day}T00:00:00Z`));
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Scans per day for the last 30 days, in the vendor's own time zone. One
 * series, so no legend: the heading names it. Hover or focus a day to read
 * it; the same numbers are in a table for screen readers.
 */
export function FootprintChart({ hours, serverToday }: { hours: HourBucket[]; serverToday: string }) {
  const today = useLocalDay(serverToday);
  // On the server (and while hydrating) days are UTC; the browser then rebuckets into its own days.
  const local = useHydrated();
  const points = useMemo(
    () => dailySeries(hours, today, (iso) => (local ? localDay(new Date(iso)) : iso.slice(0, 10)), FOOTPRINT_DAYS),
    [hours, today, local],
  );
  const max = Math.max(1, ...points.map((point) => point.scans));
  const [active, setActive] = useState<number | null>(null);
  const shown = active === null ? null : points[active];
  const total = points.reduce((sum, point) => sum + point.scans, 0);

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Scans per day</span>
        <span aria-live="polite" className="min-h-5 text-sm text-zinc-600 tabular-nums dark:text-zinc-400">
          {shown
            ? `${dayLabel(shown.day)}: ${plural(shown.scans, 'scan', 'scans')}, ${plural(shown.follows, 'follow', 'follows')}`
            : `Last ${FOOTPRINT_DAYS} days: ${plural(total, 'scan', 'scans')}`}
        </span>
      </figcaption>
      <div aria-hidden="true" className="relative h-36" onMouseLeave={() => setActive(null)}>
        {/* Recessive baseline and one gridline at the max, labeled above the plot. */}
        <span className="absolute top-0 left-0 text-[11px] leading-none text-zinc-500 tabular-nums dark:text-zinc-400">{max}</span>
        <div className="absolute inset-x-0 top-4 h-px bg-zinc-100 dark:bg-zinc-800" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-zinc-300 dark:bg-zinc-700" />
        <div className="absolute inset-x-0 top-4 bottom-0 flex items-end gap-[2px]">
          {points.map((point, index) => (
            <div
              key={point.day}
              className="flex h-full min-w-0 flex-1 cursor-default items-end"
              onMouseEnter={() => setActive(index)}
              onTouchStart={() => setActive(index)}
            >
              <div
                className={cn(
                  'w-full rounded-t-[4px] transition-colors',
                  point.scans > 0 ? (active === index ? 'bg-green-800 dark:bg-green-300' : 'bg-green-600 dark:bg-green-500') : 'bg-transparent',
                )}
                style={{ height: point.scans > 0 ? `${Math.max(4, (point.scans / max) * 100)}%` : 0 }}
              />
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden="true" className="flex justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
        <span>{dayLabel(points[0].day)}</span>
        <span>Today</span>
      </div>
      <table className="sr-only">
        <caption>Scans and follows per day, last {FOOTPRINT_DAYS} days</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Scans</th>
            <th scope="col">Follows</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.day}>
              <th scope="row">{dayLabel(point.day)}</th>
              <td>{point.scans}</td>
              <td>{point.follows}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
