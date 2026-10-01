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

/** Dates and the publisher's edition label qualify the roster, not attendance. */
export function rosterContextLabels(context?: RosterContext): string[] {
  if (!context) return [];
  const labels = clean(context.label) ? [clean(context.label)] : [];
  const start = publishedEventDate(context.start_date)?.label;
  const end = publishedEventDate(context.end_date)?.label;
  const asOf = publishedEventDate(context.as_of)?.label;
  if (start && end) labels.push(`Published period: ${start} - ${end}`);
  else if (start) labels.push(`Published period starts ${start}`);
  else if (end) labels.push(`Published period ends ${end}`);
  if (asOf) labels.push(`Snapshot as of ${asOf}`);
  return labels;
}

export function rosterPeriodHasEnded(context?: RosterContext, now = new Date()): boolean {
  return calendarPeriodHasEnded(context?.end_date, now);
}

export function publishedLocalHours(hours?: MarketEvent['local_hours']): string | undefined {
  if (!hours || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hours.opens) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hours.closes) || hours.closes <= hours.opens) return undefined;
  const clock = (value: string) => {
    const [hour, minute] = value.split(':').map(Number);
    return `${hour % 12 || 12}:${String(minute).padStart(2, '0')}${hour < 12 ? 'am' : 'pm'}`;
  };
  return `${clock(hours.opens)} - ${clock(hours.closes)} (local time)`;
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

/** Shared visibility rules keep detail rows and the dedicated sections in sync. */
export function marketHighlights(firstParty?: MarketFirstPartyFacts) {
  const events = (firstParty?.events ?? []).filter((item) => clean(item.value.name));
  const programs = (firstParty?.programs ?? []).filter((item) => clean(item.value.name));
  const vendors = firstParty?.vendors;
  const roster = (vendors?.roster ?? []).filter((item) => clean(item.value.name));
  const vendorLinks = [
    vendors?.directory_url ? { label: 'Vendor directory', fact: vendors.directory_url, eventName: 'Vendor Directory Opened' } : undefined,
    vendors?.weekly_roster_url ? { label: 'Weekly vendor roster', fact: vendors.weekly_roster_url, eventName: 'Vendor Roster Opened' } : undefined,
  ].flatMap((link) => {
    const href = safeHighlightUrl(link?.fact.value);
    return link && href ? [{ ...link, href }] : [];
  });
  return { events, programs, roster, vendorLinks, attendanceIsDynamic: vendors?.attendance_is_dynamic?.value === true };
}
