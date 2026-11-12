/**
 * "Open today" and "open this weekend" for the near-me page.
 *
 * Worked out in the visitor's browser from each market's listed weekdays and
 * season, never at build time: the page is static, so a server-rendered
 * "today" would be wrong six days out of seven.
 *
 * The claim is deliberately "open today" (a market day, in season), not "open
 * now": almost no record carries verified hours with a timezone. A market
 * only passes when its record supports the claim. One with no listed weekdays
 * never passes, and one with no season passes only if it says year-round,
 * because in winter an unknown season usually means a closed market.
 *
 * Pure functions with no imports, so the client component and the unit test
 * share one implementation.
 */

export type NearMeTab = 'nearest' | 'today' | 'weekend' | 'year_round';

/** One market as `/api/near-me` returns it. */
export interface NearMeMarket {
  slug: string;
  name: string;
  href: string;
  /** "Austin, Texas". */
  place?: string;
  distanceMiles: number;
  /** "Saturday", "Sunday", in week order. Empty when the record lists none. */
  days: string[];
  hours?: string;
  yearRound: boolean;
  /** ISO dates of the stated season, when it is a plain date range. */
  seasonFrom?: string;
  seasonThrough?: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A calendar day in the visitor's own timezone. */
export interface LocalDay {
  /** "Saturday". */
  weekday: string;
  /** `YYYY-MM-DD`. */
  iso: string;
}

export function localDay(date: Date): LocalDay {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return { weekday: DAY_NAMES[date.getDay()], iso: `${date.getFullYear()}-${month}-${day}` };
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * The Saturday and Sunday of "this weekend": the coming two days on a weekday,
 * today and tomorrow on a Saturday, and only today on a Sunday.
 */
export function weekendDays(now: Date): LocalDay[] {
  const weekday = now.getDay();
  if (weekday === 0) return [localDay(now)];
  const saturday = addDays(now, 6 - weekday);
  return [localDay(saturday), localDay(addDays(saturday, 1))];
}

/** True when the record supports "open on this day": a market day, in season. */
export function isOpenOn(market: NearMeMarket, day: LocalDay): boolean {
  if (!market.days.includes(day.weekday)) return false;
  if (market.yearRound) return true;
  if (!market.seasonFrom || !market.seasonThrough) return false;
  return market.seasonFrom <= day.iso && day.iso <= market.seasonThrough;
}

/** The markets a tab shows, in the order they arrived (nearest first). */
export function filterNearMe(markets: NearMeMarket[], tab: NearMeTab, now: Date): NearMeMarket[] {
  if (tab === 'nearest') return markets;
  if (tab === 'year_round') return markets.filter((market) => market.yearRound);
  if (tab === 'today') {
    const today = localDay(now);
    return markets.filter((market) => isOpenOn(market, today));
  }
  const weekend = weekendDays(now);
  return markets.filter((market) => weekend.some((day) => isOpenOn(market, day)));
}
