import type { MarketFirstPartyFacts } from './enrichment.ts';
import { clean } from './geo.ts';

/** Only absolute public web links are suitable for these source-backed cards. */
export function safeHighlightUrl(value?: string | null): string | undefined {
  const text = clean(value);
  if (!/^https?:\/\//i.test(text)) return undefined;
  try {
    const url = new URL(text);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export interface PublishedEventDate {
  /** Original valid ISO value for a time element; no zone conversion. */
  dateTime: string;
  label: string;
}

type MarketEvent = NonNullable<MarketFirstPartyFacts['events']>[number]['value'];
type RosterContext = NonNullable<NonNullable<MarketFirstPartyFacts['vendors']>['roster_context']>['value'];

/** Leave a calendar-day grace period when the publisher did not specify a zone. */
function calendarPeriodHasEnded(value?: string, now = new Date()): boolean {
  if (!publishedEventDate(value)) return false;
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return value!.slice(0, 10) < cutoff;
}

export function eventDisplayState(event: MarketEvent, now = new Date()): 'Cancelled' | 'Postponed' | 'Past event' | undefined {
  if (event.status === 'cancelled') return 'Cancelled';
  if (event.status === 'postponed') return 'Postponed';
  if (calendarPeriodHasEnded(event.end ?? event.start, now)) return 'Past event';
  return undefined;
}

export function rosterPeriodHasEnded(context?: RosterContext, now = new Date()): boolean {
  return calendarPeriodHasEnded(context?.end_date, now);
}

/** "4-6pm" from structured clocks; no zone suffix, the page is local. */
export function publishedLocalHours(hours?: MarketEvent['local_hours']): string | undefined {
  if (!hours || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hours.opens) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hours.closes) || hours.closes <= hours.opens) return undefined;
  return clockRange(hours.opens, hours.closes);
}

function clockRange(opens: string, closes: string): string {
  const parts = (value: string) => value.split(':').map(Number);
  const [openHour, openMinute] = parts(opens);
  const [closeHour, closeMinute] = parts(closes);
  const text = (hour: number, minute: number) => `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''}`;
  const meridiem = (hour: number) => (hour < 12 ? 'am' : 'pm');
  const sameHalf = meridiem(openHour) === meridiem(closeHour);
  return `${text(openHour, openMinute)}${sameHalf ? '' : meridiem(openHour)}-${text(closeHour, closeMinute)}${meridiem(closeHour)}`;
}

/**
 * The publisher's free-text hours in the same short form when they parse
 * ("4:00 PM-6:00 PM" becomes "4-6pm"); anything else is shown as written.
 */
export function compactPublishedHours(value?: string | null): string | undefined {
  const text = clean(value);
  if (!text) return undefined;
  const clock = '(\\d{1,2})(?::(\\d{2}))?\\s*([ap])\\.?m\\.?';
  const match = new RegExp(`^${clock}\\s*(?:-|to)\\s*${clock}$`, 'i').exec(text);
  if (!match) return text;
  const to24 = (hour: string, minute: string | undefined, half: string) => {
    const value = (Number(hour) % 12) + (half.toLowerCase() === 'p' ? 12 : 0);
    return `${String(value).padStart(2, '0')}:${minute ?? '00'}`;
  };
  const opens = to24(match[1], match[2], match[3]);
  const closes = to24(match[4], match[5], match[6]);
  return closes > opens ? clockRange(opens, closes) : text;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The calendar block on an event row: { month: "Oct", day: "28" }. */
export function eventDateBlock(value?: string | null): { month: string; day: string; dateTime: string } | undefined {
  const formatted = publishedEventDate(value);
  if (!formatted) return undefined;
  const [, month, day] = /^\d{4}-(\d{2})-(\d{2})/.exec(formatted.dateTime) ?? [];
  return month ? { month: MONTHS[Number(month) - 1], day: String(Number(day)), dateTime: formatted.dateTime.slice(0, 10) } : undefined;
}

/** "Dec 5-6" or "Nov 30-Dec 2" for a multi-day event; undefined for one day. */
export function eventSpan(start?: string | null, end?: string | null): string | undefined {
  const from = eventDateBlock(start);
  const to = eventDateBlock(end);
  if (!from || !to || to.dateTime <= from.dateTime) return undefined;
  return from.month === to.month ? `${from.month} ${from.day}-${to.day}` : `${from.month} ${from.day}-${to.month} ${to.day}`;
}

/** Format the written calendar date and clock, never the server's local zone. */
export function publishedEventDate(value?: string | null): PublishedEventDate | undefined {
  const text = clean(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(text);
  if (!match) return undefined;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction, offset] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return undefined;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  const calendar = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
  if (hourText === undefined) return { dateTime: text, label: calendar };
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = secondText === undefined ? 0 : Number(secondText);
  if (hour > 23 || minute > 59 || second > 59) return undefined;
  if (offset && offset !== 'Z') {
    const [offsetHour, offsetMinute] = offset.slice(1).split(':').map(Number);
    if (offsetHour > 14 || offsetMinute > 59 || offsetHour === 14 && offsetMinute !== 0) return undefined;
  }
  const seconds = second || fraction ? `:${secondText ?? '00'}${fraction ?? ''}` : '';
  const clock = `${hour % 12 || 12}:${minuteText}${seconds}${hour < 12 ? 'am' : 'pm'}`;
  const zone = offset === 'Z' ? ' UTC' : offset ? ` UTC${offset}` : '';
  return { dateTime: text, label: `${calendar} at ${clock}${zone}` };
}

type RosterItem = NonNullable<NonNullable<MarketFirstPartyFacts['vendors']>['roster']>[number];

/**
 * Shared visibility rules keep detail rows and the dedicated sections in
 * sync. Past events are dropped (a cancelled or postponed one stays, with its
 * state), and an attendance note repeated across the roster says something
 * about the list, not the vendor, so it is dropped from every card.
 */
export function marketHighlights(firstParty?: MarketFirstPartyFacts, now = new Date()) {
  const events = (firstParty?.events ?? []).filter(
    (item) => clean(item.value.name) && eventDisplayState(item.value, now) !== 'Past event'
  );
  const programs = (firstParty?.programs ?? []).filter((item) => clean(item.value.name));
  const vendors = firstParty?.vendors;
  const named = (vendors?.roster ?? []).filter((item) => clean(item.value.name));
  const noteCounts = new Map<string, number>();
  for (const item of named) {
    const note = clean(item.value.attendance_note);
    if (note) noteCounts.set(note, (noteCounts.get(note) ?? 0) + 1);
  }
  const roster: RosterItem[] = named.map((item) => {
    const note = clean(item.value.attendance_note);
    if (!note || (noteCounts.get(note) ?? 0) < 2) return item;
    return { ...item, value: { ...item.value, attendance_note: undefined } };
  });
  const vendorLinks = [
    vendors?.directory_url ? { label: 'Full vendor list', fact: vendors.directory_url, eventName: 'Vendor Directory Opened' } : undefined,
    vendors?.weekly_roster_url ? { label: "This week's vendors", fact: vendors.weekly_roster_url, eventName: 'Vendor Roster Opened' } : undefined,
  ].flatMap((link) => {
    const href = safeHighlightUrl(link?.fact.value);
    return link && href ? [{ ...link, href }] : [];
  });
  return { events, programs, roster, vendorLinks, attendanceIsDynamic: vendors?.attendance_is_dynamic?.value === true };
}

/** A roster entry with something besides its name earns a card; the rest are chips. */
export function vendorHasDetails(item: RosterItem): boolean {
  const vendor = item.value;
  return Boolean(
    vendor.seasonal ||
      vendor.categories?.some((category) => clean(category)) ||
      clean(vendor.attendance_note) ||
      safeHighlightUrl(vendor.website) ||
      safeHighlightUrl(vendor.social_url)
  );
}

/** The muted line over the vendor names, in place of the roster's provenance. */
export function rosterSubhead(context?: RosterContext, now = new Date()): string | undefined {
  if (rosterPeriodHasEnded(context, now)) {
    const season = /^\d{4} season$/i.exec(clean(context?.label))?.[0];
    return season ? `From the ${season.toLowerCase()}` : 'From last season';
  }
  return context?.non_exhaustive ? 'Some regulars' : undefined;
}
