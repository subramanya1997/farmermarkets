import Link from 'next/link';
import { CalendarDays, Clock } from 'lucide-react';
import type { TopicMarketRow as TopicMarketRowData } from '@/lib/topicPage';

/**
 * One market on a topic page: name and city on the first line, then the days,
 * hours and benefit or ordering pills as chips. No street address and no raw
 * season string: the market page carries both, and a list row only has to
 * answer "where, and when".
 *
 * Kept free of server-only imports (the view-model import is type-only) so the
 * client-side filter on `/farmers-markets/online` can render the same row.
 */

const SHORT_DAYS: Record<string, string> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun',
};

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

/** "Daily", "Mon-Fri", or "Wed, Sat". */
export function dayLabel(days: string[]): string {
  if (days.length === 7) return 'Daily';
  if (days.length === 5 && WEEKDAYS.every((day) => days.includes(day))) return 'Mon-Fri';
  return days.map((day) => SHORT_DAYS[day] ?? day).join(', ');
}

const chip =
  'inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300';

export function TopicMarketRow({ market }: { market: TopicMarketRowData }) {
  const hasDetails = market.days.length > 0 || Boolean(market.hours) || market.badges.length > 0;

  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <Link
          href={market.href}
          className="font-medium text-green-700 hover:underline dark:text-green-500"
        >
          {market.name}
        </Link>
        {market.place &&
          (market.placeHref ? (
            <Link
              href={market.placeHref}
              className="text-sm text-zinc-500 hover:underline dark:text-zinc-400"
            >
              {market.place}
            </Link>
          ) : (
            <span className="text-sm text-zinc-500 dark:text-zinc-400">{market.place}</span>
          ))}
      </div>
      {hasDetails && (
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
          {market.badges.map((badge) => (
            <span
              key={badge}
              className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-900 dark:bg-green-950/40 dark:text-green-200"
            >
              {badge}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

/** A bordered card of market rows. */
export function TopicMarketCard({ markets }: { markets: TopicMarketRowData[] }) {
  if (markets.length === 0) return null;
  return (
    <ul className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
      {markets.map((market) => (
        <TopicMarketRow key={market.slug} market={market} />
      ))}
    </ul>
  );
}
