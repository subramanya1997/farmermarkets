/**
 * Calendar days for weekly offerings, and which post is current on a given
 * day. Dates are calendar days (YYYY-MM-DD) with no time zone. A market day
 * is a local day, so "today" is a range: the server asks with the span of
 * dates the United States is in right now (`usToday`), a shopper's browser
 * asks with its own local date.
 *
 * No dependencies, so the public pages' client components can use it
 * without pulling in the form schemas.
 */
/** Same codes and order as `WEEKDAYS` in src/lib/listingEdits.ts. */
const WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
type Weekday = (typeof WEEK)[number];

/** How far ahead a vendor may post. */
export const MAX_DAYS_AHEAD = 60;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day as YYYY-MM-DD, or null. */
export function isoDay(value: unknown): string | null {
  if (typeof value !== 'string' || !ISO_DAY.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The local date in a time zone, as YYYY-MM-DD. */
export function dayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** A browser's own local date as YYYY-MM-DD. */
export function localDay(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export interface DayRange {
  from: string;
  to: string;
}

/**
 * Every date some US market could be on right now: from the date in
 * Hawaii (furthest behind) to the date in Puerto Rico (furthest ahead). A
 * Saturday post stays up until Saturday is over in Honolulu.
 */
export function usToday(now: Date = new Date()): DayRange {
  return { from: dayIn('Pacific/Honolulu', now), to: dayIn('America/Puerto_Rico', now) };
}

/** The weekday code of a calendar day. */
export function weekdayOf(day: string): string {
  // getUTCDay: 0 is Sunday; WEEK starts on Monday.
  return WEEK[(new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7];
}

/**
 * Days a vendor can pick from, starting today: the next `count` days the
 * vendor attends this market, or every day when the application names none.
 */
export function upcomingMarketDays(today: string, attends: readonly string[], count = 6): string[] {
  const days: string[] = [];
  const known: string[] = attends.filter((day): day is Weekday => (WEEK as readonly string[]).includes(day));
  for (let offset = 0; offset < MAX_DAYS_AHEAD && days.length < count; offset += 1) {
    const day = addDays(today, offset);
    if (known.length === 0 || known.includes(weekdayOf(day))) days.push(day);
  }
  return days;
}

/* ------------------------------------------------------------------ *
 * Which post is current
 * ------------------------------------------------------------------ */

export interface OfferingWindow {
  startsOn: string;
  endsOn: string;
  withdrawn?: boolean;
  /** ISO timestamp; the newest post wins when two overlap. */
  updatedAt: string;
}

/** Today (any day in `today`) falls inside the post's days, and it was not taken down. */
export function offeringIsCurrent(offering: OfferingWindow, today: DayRange): boolean {
  return !offering.withdrawn && offering.startsOn <= today.to && offering.endsOn >= today.from;
}

/** The one post to show: current, and the newest when posts overlap. */
export function currentOffering<T extends OfferingWindow>(offerings: readonly T[], today: DayRange): T | null {
  let best: T | null = null;
  for (const offering of offerings) {
    if (!offeringIsCurrent(offering, today)) continue;
    if (!best || offering.updatedAt > best.updatedAt) best = offering;
  }
  return best;
}

/** Over for everyone: the last day has passed even in the latest US time zone. */
export function offeringIsOver(offering: Pick<OfferingWindow, 'endsOn'>, today: DayRange): boolean {
  return offering.endsOn < today.from;
}

/**
 * The posts a cached public page carries so it can pick the current one at
 * view time: not withdrawn, not over, starting within `lookahead` days.
 * Newest first, at most `limit`.
 */
export function offeringsToCarry<T extends OfferingWindow>(offerings: readonly T[], today: DayRange, lookahead = 8, limit = 4): T[] {
  const until = addDays(today.to, lookahead);
  return offerings
    .filter((offering) => !offering.withdrawn && !offeringIsOver(offering, today) && offering.startsOn <= until)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, limit);
}

const DAY_FORMAT = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const SHORT_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "Sat, Nov 21" for a calendar day. */
export function formatMarketDay(day: string): string {
  return DAY_FORMAT.format(new Date(`${day}T00:00:00Z`));
}

/** "Sat, Nov 21" or "Nov 21 to Nov 23". */
export function offeringDates(offering: Pick<OfferingWindow, 'startsOn' | 'endsOn'>): string {
  if (offering.startsOn === offering.endsOn) return formatMarketDay(offering.startsOn);
  const from = new Date(`${offering.startsOn}T00:00:00Z`);
  const to = new Date(`${offering.endsOn}T00:00:00Z`);
  return `${SHORT_FORMAT.format(from)} to ${SHORT_FORMAT.format(to)}`;
}
