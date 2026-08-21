/**
 * Structured data for market detail pages.
 *
 * Everything here is a pure function of one market record — no Next.js, no
 * filesystem, no data layer — so the whole graph is unit tested against the
 * real messy source formats in `src/lib/schema.test.ts`.
 *
 * The rules this module encodes, all of which the previous inline JSON-LD
 * broke on most of the 8,807 market pages:
 *
 *  - A property is emitted only when the record can actually answer it. Never
 *    an empty string, an empty array, or a node whose only member is `@type`
 *    (`"geo":{"@type":"GeoCoordinates"}` was being emitted for 356 records
 *    with no coordinates). `prune()` at the bottom enforces that for the whole
 *    graph rather than trusting every call site.
 *  - `openingHours` free text ("July 1-October 31", "Dimanche Su 06:00-14:00")
 *    is not valid schema.org and contradicted the visible page. It is replaced
 *    by `OpeningHoursSpecification` built from parsed weekdays and 24h times,
 *    and omitted entirely when nothing parses.
 *  - `paymentAccepted` comes from the record's own flags. There is no
 *    `priceRange`: we do not know the prices at 8,807 markets.
 *  - The visible FAQ block and the `FAQPage` node are generated from one list
 *    (`marketFaqs`), so the markup can never claim something the page does not
 *    say.
 */

import { clean, resolveLocation } from './geo.ts';
import {
  displayName,
  marketDescription,
  marketHours,
  marketSeasonLabel,
  marketWeekdays,
  weekdaysFromText,
  type MarketSeoRecord,
  type Weekday,
} from './seo.ts';

/** The subset of a market record the structured data reads. */
export interface MarketSchemaRecord extends MarketSeoRecord {
  slug: string;
  location?: { lat?: number | null; lon?: number | null } | null;
  phone_numbers?: string[] | null;
  emails?: string[] | null;
  websites?: string[] | null;
  social_media?: string[] | null;
  last_updated?: string | null;
  accepts_cash?: boolean;
  accepts_credit_debit?: boolean;
  accepts_checks?: boolean;
}

export interface MarketSchemaOptions {
  /** Canonical site origin, e.g. `https://www.farmermarkets.app`. */
  siteUrl: string;
  /** Absolute URL of this market's Open Graph card. */
  imageUrl: string;
  /** Injected for deterministic season-year resolution in tests. */
  now?: Date;
}

/* ------------------------------------------------------------------ *
 * Times
 * ------------------------------------------------------------------ */

/**
 * One clock time: `9`, `9:30`, `09:00:00`, `07h30`, `9am`, `6:00 a.m.`.
 * Captures hour, minutes and the meridiem letter; the seconds the European
 * feeds ship are matched but discarded.
 */
const TIME_TOKEN = String.raw`(\d{1,2})(?:\s*[:h.]\s*(\d{2}))?(?::\d{2})?\s*(?:([ap])\.?\s*m\.?)?`;
const TIME_RANGE_RE = new RegExp(
  `${TIME_TOKEN}\\s*(?:-|–|—|to|until|till|tot|tp)\\s*${TIME_TOKEN}`,
  'i'
);

interface ParsedTime {
  hour: number;
  minute: number;
  meridiem?: 'a' | 'p';
}

function readTime(hour: string, minute?: string, meridiem?: string): ParsedTime | undefined {
  const hours = Number(hour);
  const minutes = minute === undefined ? 0 : Number(minute);
  if (!Number.isFinite(hours) || hours > 24 || minutes > 59) return undefined;
  return {
    hour: hours,
    minute: minutes,
    meridiem: meridiem ? (meridiem.toLowerCase() as 'a' | 'p') : undefined,
  };
}

function toMinutes({ hour, minute, meridiem }: ParsedTime, override?: 'a' | 'p'): number {
  const mark = meridiem ?? override;
  let hours = hour;
  if (mark === 'p' && hours < 12) hours += 12;
  if (mark === 'a' && hours === 12) hours = 0;
  return hours * 60 + minute;
}

function formatClock(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export interface HourRange {
  /** 24-hour `HH:MM`. */
  opens: string;
  closes: string;
}

/**
 * The opening times stated in one free-text schedule string, as 24h `HH:MM`.
 *
 * Returns `undefined` — never a guess — when the string states no times
 * ("saturday"), when what looks like a range is really a date span
 * ("June 1-October 31"), or when the two times do not make a forward-running
 * window ("6:00 a.m. to 2:00 a.m." wraps midnight and cannot be expressed as
 * one `OpeningHoursSpecification`).
 */
export function parseHourRange(value?: string | null): HourRange | undefined {
  const text = clean(value);
  if (!text) return undefined;

  const match = TIME_RANGE_RE.exec(text);
  if (!match) return undefined;

  const start = readTime(match[1], match[2], match[3]);
  const end = readTime(match[4], match[5], match[6]);
  if (!start || !end) return undefined;

  // With no meridiem on either side, only a pair that both carry minutes is
  // safe to read as 24h ("06:00-13:30"). This is the rule that stops
  // "May 2-October 31" and "June 1-5" being read as 02:00–31:00.
  if (!start.meridiem && !end.meridiem && (match[2] === undefined || match[5] === undefined)) {
    return undefined;
  }

  // "1-5pm" and "9am-1" each state the meridiem once. Borrow it from the other
  // side, and fall back to the opposite half of the day when borrowing would
  // run the window backwards ("9-1pm" is 09:00–13:00, not 21:00–13:00).
  let opens = toMinutes(start);
  let closes = toMinutes(end);
  if (!start.meridiem && end.meridiem) {
    const borrowed = toMinutes(start, end.meridiem);
    opens = borrowed < closes ? borrowed : toMinutes(start, end.meridiem === 'p' ? 'a' : 'p');
  } else if (start.meridiem && !end.meridiem) {
    const borrowed = toMinutes(end, start.meridiem);
    closes = borrowed > opens ? borrowed : toMinutes(end, start.meridiem === 'p' ? 'a' : 'p');
  }

  if (closes <= opens || closes > 24 * 60) return undefined;
  return { opens: formatClock(opens), closes: formatClock(closes) };
}

/* ------------------------------------------------------------------ *
 * Seasons
 * ------------------------------------------------------------------ */

const MONTH_ALIASES: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

// Longest alias first so "sept" never matches as "sep" with a stray "t".
const MONTH_ALTERNATION = Object.keys(MONTH_ALIASES)
  .sort((left, right) => right.length - left.length)
  .join('|');
const MONTH_RANGE_RE = new RegExp(
  `\\b(${MONTH_ALTERNATION})\\.?\\s*(\\d{1,2})?(?:st|nd|rd|th)?\\s*(?:-|–|—|to|through|thru)\\s*(${MONTH_ALTERNATION})\\.?\\s*(\\d{1,2})?(?:st|nd|rd|th)?`,
  'i'
);

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function lastDayOfMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return DAYS_IN_MONTH[month - 1];
}

export interface SeasonRange {
  /** ISO `YYYY-MM-DD`. */
  validFrom: string;
  validThrough: string;
}

/**
 * The season a market trades in, as dates: `"May-Oct"`, `"May – November"` and
 * `"June 1-October 31"` all resolve, a bare month gets the first/last day of
 * that month, and anything unparseable ("Year Round", "summer, fall",
 * "Saturdays 8am to 1pm") returns `undefined` rather than an invented span.
 *
 * The year is the current season or, once this year's season has finished, the
 * next one — a `validThrough` in the past would tell Google the market is shut.
 * A span that runs backwards through the calendar ("November-April") crosses
 * into the following year.
 */
export function parseSeasonRange(value?: string | null, now = new Date()): SeasonRange | undefined {
  const text = clean(value);
  if (!text) return undefined;

  const match = MONTH_RANGE_RE.exec(text);
  if (!match) return undefined;

  const startMonth = MONTH_ALIASES[match[1].toLowerCase()];
  const endMonth = MONTH_ALIASES[match[3].toLowerCase()];
  if (!startMonth || !endMonth) return undefined;

  const startDay = match[2] ? Number(match[2]) : 1;
  const endDayGiven = match[4] ? Number(match[4]) : undefined;

  let year = now.getUTCFullYear();
  const today = isoDate(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const endYear = endMonth < startMonth ? year + 1 : year;
    if (startDay > lastDayOfMonth(year, startMonth)) return undefined;
    const endDay = endDayGiven ?? lastDayOfMonth(endYear, endMonth);
    if (endDay > lastDayOfMonth(endYear, endMonth)) return undefined;

    const validFrom = isoDate(year, startMonth, startDay);
    const validThrough = isoDate(endYear, endMonth, endDay);
    // A season that already ended this year belongs to next year's calendar.
    if (validThrough >= today) return { validFrom, validThrough };
    year += 1;
  }

  return undefined;
}

/** The season dates for a record, read from `season`. */
export function marketSeasonRange(
  market: MarketSchemaRecord,
  now?: Date
): SeasonRange | undefined {
  return parseSeasonRange(market.season, now);
}

/* ------------------------------------------------------------------ *
 * Opening hours
 * ------------------------------------------------------------------ */

export interface OpeningHoursSpecification {
  '@type': 'OpeningHoursSpecification';
  dayOfWeek: Weekday[];
  opens?: string;
  closes?: string;
  validFrom?: string;
  validThrough?: string;
}

/**
 * `OpeningHoursSpecification[]` for a market, or `undefined`.
 *
 * The schedule is smeared across `operations.days` (bare weekday names in the
 * USDA export, "Samedi Sa 06:00-13:30" in the Brussels feed, "Saturday 09:00 AM
 * - 01:00 PM" elsewhere) and `operations.season` (which is sometimes a weekly
 * schedule, "Saturdays 8am to 1pm"). Every entry that names both a weekday and
 * a time becomes its own spec, entries sharing a time window are merged, and a
 * record that only names its days gets `dayOfWeek` with no `opens`/`closes` —
 * which is valid, and true. A record that parses to nothing gets nothing.
 */
export function marketOpeningHoursSpec(
  market: MarketSchemaRecord,
  now?: Date
): OpeningHoursSpecification[] | undefined {
  const sources = [...(market.days ?? []), market.season]
    .map((source) => clean(source))
    .filter(Boolean);

  // Same window on several lines (a feed repeating the slot per language) is
  // one spec with several days.
  const byWindow = new Map<string, { days: Set<Weekday>; hours: HourRange }>();
  for (const source of sources) {
    const days = weekdaysFromText(source);
    const hours = parseHourRange(source);
    if (!days.length || !hours) continue;
    const key = `${hours.opens}-${hours.closes}`;
    const entry = byWindow.get(key) ?? { days: new Set<Weekday>(), hours };
    for (const day of days) entry.days.add(day);
    byWindow.set(key, entry);
  }

  const season = marketSeasonRange(market, now);
  const withSeason = (spec: OpeningHoursSpecification): OpeningHoursSpecification =>
    season ? { ...spec, validFrom: season.validFrom, validThrough: season.validThrough } : spec;

  if (byWindow.size > 0) {
    return [...byWindow.values()].map((entry) =>
      withSeason({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: [...entry.days],
        opens: entry.hours.opens,
        closes: entry.hours.closes,
      })
    );
  }

  // No single line carried both, so fall back to the record as a whole: the
  // days may be listed in one field and the times in another.
  const days = marketWeekdays(market);
  if (!days.length) return undefined;

  const hours = sources.map((source) => parseHourRange(source)).find(Boolean);
  return [
    withSeason({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: days,
      ...(hours ? { opens: hours.opens, closes: hours.closes } : {}),
    }),
  ];
}

/* ------------------------------------------------------------------ *
 * Payment, contact, address
 * ------------------------------------------------------------------ */

/**
 * What a market takes, from its own flags only — the old node claimed `Cash`
 * on all 8,807 pages. `undefined` when the record states nothing.
 */
export function marketPaymentAccepted(market: MarketSchemaRecord): string[] | undefined {
  const accepted = [
    market.accepts_cash ? 'Cash' : undefined,
    market.accepts_credit_debit ? 'Credit Card' : undefined,
    market.accepts_credit_debit ? 'Debit Card' : undefined,
    market.accepts_checks ? 'Check' : undefined,
    market.snap ? 'SNAP/EBT' : undefined,
    market.wic ? 'WIC' : undefined,
    market.sfmnp ? 'SFMNP' : undefined,
    market.fmnp ? 'FMNP' : undefined,
  ].filter((method): method is string => Boolean(method));

  return accepted.length ? accepted : undefined;
}

/** True when the record says anything at all about how it takes payment. */
function hasPaymentData(market: MarketSchemaRecord): boolean {
  return Boolean(
    market.accepts_cash ||
      market.accepts_credit_debit ||
      market.accepts_checks ||
      market.snap ||
      market.wic ||
      market.sfmnp ||
      market.fmnp
  );
}

/** Absolute http(s) URLs only: `social_media` also holds handles ("@abc"). */
function absoluteUrls(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const candidate = clean(value);
    if (!/^https?:\/\//i.test(candidate)) continue;
    try {
      seen.add(new URL(candidate).toString());
    } catch {
      // Not a URL after all; nothing to link to.
    }
  }
  return [...seen];
}

/** `sameAs` — official website and social profiles, deduped, URLs only. */
export function marketSameAs(market: MarketSchemaRecord): string[] | undefined {
  const urls = absoluteUrls([...(market.websites ?? []), ...(market.social_media ?? [])]);
  return urls.length ? urls : undefined;
}

/** ISO date from `last_updated` ("2020-08-03T13:44:04"), when it parses. */
export function marketDateModified(market: MarketSchemaRecord): string | undefined {
  const raw = clean(market.last_updated);
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

interface PostalAddress {
  '@type': 'PostalAddress';
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry?: string;
}

/**
 * `PostalAddress` with a street-only `streetAddress`. The raw `address` field
 * packs city, state and zip into the same string on the USDA rows, so the
 * split is delegated to `resolveLocation` — the same parse the visible page
 * and the geo index use. `undefined` when the record locates nothing.
 */
export function marketAddress(market: MarketSchemaRecord): PostalAddress | undefined {
  const location = resolveLocation(market);
  const postalCode = clean(market.zip_code);
  const country = clean(market.country_code) || clean(market.country);

  if (!location.street && !location.city && !location.state && !postalCode) return undefined;

  return {
    '@type': 'PostalAddress',
    ...(location.street ? { streetAddress: location.street } : {}),
    ...(location.city ? { addressLocality: location.city } : {}),
    ...(location.state ? { addressRegion: location.state } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(country ? { addressCountry: country } : {}),
  };
}

interface Coordinates {
  latitude: number;
  longitude: number;
}

function marketCoordinates(market: MarketSchemaRecord): Coordinates | undefined {
  const latitude = market.location?.lat;
  const longitude = market.location?.lon;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  return { latitude: latitude as number, longitude: longitude as number };
}

/* ------------------------------------------------------------------ *
 * FAQs
 * ------------------------------------------------------------------ */

export interface MarketFaq {
  question: string;
  answer: string;
}

/** The minimum number of answerable questions worth a FAQ section. */
export const MIN_FAQ_COUNT = 2;

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "Saturdays" / "Saturdays and Sundays" / "every day of the week". */
function weekdayPhrase(days: Weekday[]): string {
  if (days.length === 7) return 'every day of the week';
  return joinWithAnd(days.map((day) => `${day}s`));
}

/** The address as one readable line: "501 Foster St, Durham, NC 27701". */
function addressLine(market: MarketSchemaRecord): string | undefined {
  const location = resolveLocation(market);
  const postalCode = clean(market.zip_code);
  const region = [location.state, postalCode].filter(Boolean).join(' ');
  const line = [location.street, location.city, region].filter(Boolean).join(', ');
  return line || undefined;
}

/**
 * The questions this record can answer, in the order they are rendered.
 *
 * This is the single source for both the visible FAQ block and the `FAQPage`
 * node, which is the only way to guarantee the markup quotes the page. A
 * question whose answer would be a shrug is not asked at all.
 */
export function marketFaqs(market: MarketSchemaRecord): MarketFaq[] {
  const name = displayName(market.name) || 'This market';
  const days = marketWeekdays(market);
  const hours = marketHours(market);
  const seasonLabel = marketSeasonLabel(market);
  const address = addressLine(market);
  const payments = marketPaymentAccepted(market);

  const faqs: MarketFaq[] = [];

  if (days.length) {
    const season = !seasonLabel
      ? ''
      : /^year[\s-]?round$/i.test(seasonLabel)
        ? ' It is open year-round.'
        : ` The season runs ${seasonLabel}.`;
    faqs.push({
      question: `What days is ${name} open?`,
      answer: `${name} is open on ${weekdayPhrase(days)}.${season}`,
    });
  }

  if (hours) {
    faqs.push({
      question: `What are ${name}'s hours?`,
      answer: days.length
        ? `${name} is open ${hours} on ${weekdayPhrase(days)}.`
        : `${name} is open ${hours}.`,
    });
  }

  if (address) {
    faqs.push({
      question: `Where is ${name} located?`,
      answer: `${name} is located at ${address}.`,
    });
  }

  if (market.snap) {
    faqs.push({
      question: `Does ${name} accept SNAP/EBT?`,
      answer: `Yes. ${name} accepts SNAP/EBT benefits.`,
    });
  } else if (hasPaymentData(market)) {
    faqs.push({
      question: `Does ${name} accept SNAP/EBT?`,
      answer: `SNAP/EBT is not listed among the payment options reported for ${name}. Contact the market to confirm before you visit.`,
    });
  }

  if (payments) {
    faqs.push({
      question: `What payment methods does ${name} accept?`,
      answer: `${name} accepts ${joinWithAnd(payments)}.`,
    });
  }

  return faqs.length >= MIN_FAQ_COUNT ? faqs : [];
}

/* ------------------------------------------------------------------ *
 * The graph
 * ------------------------------------------------------------------ */

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * Drop every empty value from a JSON-LD tree: `undefined`, `null`, blank
 * strings, empty arrays, and objects left with nothing but their `@type`.
 *
 * Doing this once over the finished graph is what guarantees the acceptance
 * criterion ("no empty-string or empty-object schema values anywhere") holds
 * for properties nobody thought to guard at the call site.
 */
export function prune<T>(value: T): T | undefined {
  if (value === null || value === undefined) return undefined;

  if (Array.isArray(value)) {
    const items = value.map((item) => prune(item)).filter((item) => item !== undefined);
    return (items.length ? (items as unknown as T) : undefined);
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, prune(item)] as const)
      .filter(([, item]) => item !== undefined);
    const object = Object.fromEntries(entries);
    // `{"@type":"GeoCoordinates"}` says nothing; a keyword-only node is empty.
    // `{"@id": "…"}` is the exception: that is a reference to another node.
    const meaningful = entries.filter(
      ([key]) => !key.startsWith('@') || key === '@id' || key === '@graph'
    );
    return meaningful.length ? (object as unknown as T) : undefined;
  }

  if (typeof value === 'string') {
    const text = value.trim();
    return (text ? (text as unknown as T) : undefined);
  }

  return value;
}

/**
 * The `@graph` for one market page: a `GroceryStore`/`LocalBusiness`, the
 * recurring `Event` it holds when we know a day and a time, and the `FAQPage`
 * mirroring the visible FAQ block.
 *
 * The `BreadcrumbList` is deliberately not here — the `Breadcrumbs` component
 * emits it from the trail it actually renders, and two breadcrumb nodes in one
 * document is worse than one in a separate script.
 */
export function marketSchemaGraph(
  market: MarketSchemaRecord,
  { siteUrl, imageUrl, now }: MarketSchemaOptions
): Record<string, JsonValue> {
  const url = `${siteUrl}/markets/${market.slug}`;
  const businessId = `${url}#market`;
  const name = displayName(market.name);
  const coordinates = marketCoordinates(market);
  const openingHours = marketOpeningHoursSpec(market, now);
  const season = marketSeasonRange(market, now);
  const faqs = marketFaqs(market);

  const business: Record<string, unknown> = {
    '@type': ['GroceryStore', 'LocalBusiness'],
    '@id': businessId,
    name,
    url,
    image: imageUrl,
    description: marketDescription(market),
    address: marketAddress(market),
    geo: coordinates
      ? { '@type': 'GeoCoordinates', latitude: coordinates.latitude, longitude: coordinates.longitude }
      : undefined,
    hasMap: coordinates
      ? `https://www.google.com/maps/search/?api=1&query=${coordinates.latitude},${coordinates.longitude}`
      : undefined,
    telephone: clean(market.phone_numbers?.[0]) || undefined,
    email: clean(market.emails?.[0]) || undefined,
    sameAs: marketSameAs(market),
    openingHoursSpecification: openingHours,
    paymentAccepted: marketPaymentAccepted(market),
  };

  const nodes: unknown[] = [business];

  // `dateModified` belongs to CreativeWork, not to a place — the schema.org
  // validator warns UNKNOWN_FIELD when it hangs off a LocalBusiness. It is the
  // *page* whose facts were refreshed, so it goes on a WebPage node, and only
  // when the record carries a usable `last_updated`.
  const dateModified = marketDateModified(market);
  if (dateModified) {
    nodes.push({
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name,
      dateModified,
      about: { '@id': businessId },
    });
  }

  // A farmers market is a recurring event as much as it is a place, and the
  // Event node is what answers "what markets are open this Saturday". It is
  // only true when we know both the day and the time, so it is only emitted
  // then.
  const timed = openingHours?.find((spec) => spec.opens && spec.closes);
  if (timed) {
    nodes.push({
      '@type': 'Event',
      '@id': `${url}#event`,
      name: `${name} weekly market day`,
      url,
      image: imageUrl,
      description: marketDescription(market),
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      eventStatus: 'https://schema.org/EventScheduled',
      location: { '@id': businessId },
      eventSchedule: {
        '@type': 'Schedule',
        byDay: timed.dayOfWeek,
        startTime: timed.opens,
        endTime: timed.closes,
        repeatFrequency: 'P1W',
        ...(season ? { startDate: season.validFrom, endDate: season.validThrough } : {}),
      },
    });
  }

  if (faqs.length) {
    nodes.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      })),
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': prune(nodes) as JsonValue,
  } as Record<string, JsonValue>;
}
