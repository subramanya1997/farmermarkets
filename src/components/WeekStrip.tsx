import { WEEKDAY_NAMES, type Weekday } from '@/lib/schedule';

interface WeekStripProps {
  days: Weekday[];
  className?: string;
}

/**
 * A market's trading week at a glance: seven letters, Monday to Sunday, with
 * the days it opens filled in.
 *
 * It replaces a "Days" text column. A reader scanning a list of forty markets
 * for "what is open on Saturday" can read a column of filled squares far
 * faster than a column of weekday names, and the strip stays the same width
 * whether a market trades one day or six.
 *
 * The letters are decoration for sighted readers; the spoken version is the
 * plain list of day names.
 */
export function WeekStrip({ days, className = '' }: WeekStripProps) {
  if (days.length === 0) return null;
  const open = new Set(days);

  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      <span className="sr-only">Open {days.join(', ')}</span>
      {WEEKDAY_NAMES.map((day) => (
        <span
          key={day}
          aria-hidden="true"
          title={day}
          className={
            open.has(day)
              ? 'flex h-5 w-5 items-center justify-center rounded-[5px] bg-green-700 text-[10px] font-semibold text-white dark:bg-green-600'
              : 'flex h-5 w-5 items-center justify-center rounded-[5px] bg-zinc-100 text-[10px] text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600'
          }
        >
          {day[0]}
        </span>
      ))}
    </span>
  );
}
