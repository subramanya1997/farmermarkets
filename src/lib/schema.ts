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
  parseHourRange,
  legacyScheduleWindows,
  hasScheduleExceptions,
  hasNonWeeklyRecurrence,
  hasSeasonContext,
  type HourRange,
} from './schedule.ts';
export { parseHourRange };
export type { HourRange };
import type { MarketFirstPartyFacts, MarketWeekday } from './enrichment.ts';
import { paymentLabels, plainFact, structuredScheduleLabels } from './marketFacts.ts';
import {
  displayName,
  marketDescription,
  marketHours,
  marketSeasonLabel,
  marketScheduleLabels,
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
  google_maps_url?: string | null;
  suppress_map?: boolean;
  enrichment?: {
    verified_at?: string | null;
    verification_scope?: 'partial' | null;
  } | null;
  last_updated?: string | null;
  accepts_cash?: boolean;
  accepts_credit_debit?: boolean;
  accepts_checks?: boolean;
  payment_methods?: string[] | null;
  first_party?: MarketFirstPartyFacts;
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
  `\\b(${MONTH_ALTERNATION})\\.?\\s*(?:(\\d{1,2})(?!\\d))?(?:st|nd|rd|th)?(?:\\s*,?\\s*(20\\d{2}))?\\s*(?:-|–|—|to|through|thru)\\s*(${MONTH_ALTERNATION})\\.?\\s*(?:(\\d{1,2})(?!\\d))?(?:st|nd|rd|th)?(?:\\s*,?\\s*(20\\d{2}))?`,
  'i'
);

// A shared month is unambiguous when the source also states its year.
const SAME_MONTH_RANGE_RE = new RegExp(
  `\\b(${MONTH_ALTERNATION})\\.?\\s*(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?\\s*(?:-|–|—|to|through|thru)\\s*(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?\\s*,?\\s*(20\\d{2})\\b`,
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
 * Explicit source years are preserved, including past seasons. Undated month
 * ranges follow the current/next annual season.
 * A span that runs backwards through the calendar ("November-April") crosses
 * into the following year.
 */
export function parseSeasonRange(value?: string | null, now = new Date()): SeasonRange | undefined {
  const text = clean(value);
  if (!text || hasScheduleExceptions(text)) return undefined;
  const matches = [...text.matchAll(new RegExp(MONTH_RANGE_RE.source, 'gi'))];
  if (!matches.length) {
    const abbreviated = [...text.matchAll(new RegExp(SAME_MONTH_RANGE_RE.source, 'gi'))];
    if (abbreviated.length !== 1) return undefined;
    const shared = abbreviated[0];
    const expanded = `${text.slice(0, shared.index)}${shared[1]} ${shared[2]}-${shared[1]} ${shared[3]}, ${shared[4]}${text.slice(shared.index! + shared[0].length)}`;
    return parseSeasonRange(expanded, now);
  }
  // Several windows cannot become one season for every weekday.
  if (matches.length !== 1) return undefined;
  const match = matches[0];
  const remainder = `${text.slice(0, match.index)} ${text.slice(match.index! + match[0].length)}`;
  if (new RegExp(`\\b(?:${MONTH_ALTERNATION}|spring|summer|fall|autumn|winter)\\b`, 'i').test(remainder)) return undefined;
  const startMonth = MONTH_ALIASES[match[1].toLowerCase()];
  const endMonth = MONTH_ALIASES[match[4].toLowerCase()];
  const startDay = match[2] ? Number(match[2]) : 1;
  const endDayGiven = match[5] ? Number(match[5]) : undefined;
  const startYearGiven = match[3] ? Number(match[3]) : undefined;
  const endYearGiven = match[6] ? Number(match[6]) : undefined;
  const explicitYears = [...text.matchAll(/\b20\d{2}\b/g)].map((item) => Number(item[0]));
  const crossesYear = endMonth < startMonth;
  const makeRange = (startYear: number, endYear: number): SeasonRange | undefined => {
    const endDay = endDayGiven ?? lastDayOfMonth(endYear, endMonth);
    if (startDay < 1 || endDay < 1 || startDay > lastDayOfMonth(startYear, startMonth) || endDay > lastDayOfMonth(endYear, endMonth)) return undefined;
    const validFrom = isoDate(startYear, startMonth, startDay);
    const validThrough = isoDate(endYear, endMonth, endDay);
    return validFrom <= validThrough ? { validFrom, validThrough } : undefined;
  };
  if (explicitYears.length) {
    // An explicitly dated source stays dated even after it has ended. Never
    // infer a new season that the operator has not announced.
    if (explicitYears.some((year) => year !== startYearGiven && year !== endYearGiven)) return undefined;
    if (crossesYear && (!startYearGiven || !endYearGiven)) return undefined;
    const startYear = startYearGiven ?? endYearGiven;
    if (!startYear) return undefined;
    const endYear = endYearGiven && startYearGiven ? endYearGiven : startYear + (crossesYear ? 1 : 0);
    return makeRange(startYear, endYear);
  }
  const year = now.getUTCFullYear();
  const today = isoDate(year, now.getUTCMonth() + 1, now.getUTCDate());
  // During winter, November-April refers to the season already in progress.
  const current = makeRange(crossesYear && now.getUTCMonth() + 1 <= endMonth ? year - 1 : year,
    crossesYear && now.getUTCMonth() + 1 <= endMonth ? year : year + (crossesYear ? 1 : 0));
  if (current && current.validThrough >= today) return current;
  return makeRange(year + 1, year + 1 + (crossesYear ? 1 : 0));
}

/** The season dates for a record, read from `season`. */
export function marketSeasonRange(
  market: MarketSchemaRecord,
  now?: Date
): SeasonRange | undefined {
  const structured = market.first_party?.operations?.season?.value;
  if (structured?.kind === 'year_round') return undefined;
  if (structured?.kind === 'dated_range') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(structured.start_date) && /^\d{4}-\d{2}-\d{2}$/.test(structured.end_date)) {
      return { validFrom: structured.start_date, validThrough: structured.end_date };
    }
  }
  if (structured?.kind === 'annual_range') {
    const monthNames = [
      '', 'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const startMonth = monthNames[structured.start.month];
    const endMonth = monthNames[structured.end.month];
    if (startMonth && endMonth) {
      return parseSeasonRange(
        `${startMonth}${structured.start.day ? ` ${structured.start.day}` : ''}-${endMonth}${structured.end.day ? ` ${structured.end.day}` : ''}`,
        now
      );
    }
  }
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
  const status = market.first_party?.operations?.status?.value.value;
  if (status === 'permanently_closed' || status === 'temporarily_closed') return undefined;
  const richSchedules = market.first_party?.operations?.schedules;
  if (richSchedules?.length) {
    const dayLabels: Record<MarketWeekday, Weekday> = {
      monday: 'Monday',
      tuesday: 'Tuesday',
      wednesday: 'Wednesday',
      thursday: 'Thursday',
      friday: 'Friday',
      saturday: 'Saturday',
      sunday: 'Sunday',
    };
    const season = marketSeasonRange(market, now);
    const specs = richSchedules.flatMap((item): OpeningHoursSpecification[] => {
      const schedule = item.value;
      // OpeningHoursSpecification has no safe way to express alternating,
      // monthly, or one-off schedules. Falling back to the projected text
      // would incorrectly turn those into weekly opening hours.
      if (schedule.recurrence.kind !== 'weekly' || schedule.recurrence.interval_weeks === 2) return [];
      const hours = parseHourRange(`${schedule.opens}-${schedule.closes}`);
      if (!hours || !schedule.recurrence.weekdays.length) return [];
      return [{
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: schedule.recurrence.weekdays.map((day) => dayLabels[day]),
        opens: hours.opens,
        closes: hours.closes,
        ...(schedule.start_date || season?.validFrom ? { validFrom: schedule.start_date || season?.validFrom } : {}),
        ...(schedule.end_date || season?.validThrough ? { validThrough: schedule.end_date || season?.validThrough } : {}),
      }];
    });
    // A labelled sub-market (Findlay's Saturday Farm Shed, 8am-2pm) can sit
    // inside the place's own hours (8am-6pm). The place is open for the wider
    // window, so a spec whose every day is covered by a wider one on the same
    // dates is dropped rather than published as a second, shorter claim.
    const covers = (outer: OpeningHoursSpecification, inner: OpeningHoursSpecification) =>
      outer !== inner &&
      outer.validFrom === inner.validFrom &&
      outer.validThrough === inner.validThrough &&
      Boolean(outer.opens && outer.closes && inner.opens && inner.closes) &&
      outer.opens! <= inner.opens! &&
      outer.closes! >= inner.closes! &&
      inner.dayOfWeek.every((day) => outer.dayOfWeek.includes(day));
    const kept = specs.filter((spec, index) =>
      !specs.some((other, otherIndex) =>
        covers(other, spec) &&
        // Two identical windows: keep the first so one always survives.
        !(covers(spec, other) && otherIndex > index)
      )
    );
    return kept.length ? kept : undefined;
  }

  const sources = [...(market.days ?? []), market.season].map(clean).filter(Boolean);
  if (sources.some((source) => hasNonWeeklyRecurrence(source) || hasScheduleExceptions(source) && !weekdaysFromText(source).length)) return undefined;
  const season = marketSeasonRange(market, now);
  const seasonText = clean(market.season);
  // A global season we cannot express must not become year-round hours.
  if (hasScheduleExceptions(seasonText) || (hasSeasonContext(seasonText) && !season && !weekdaysFromText(seasonText).length)) return undefined;
  const byWindow = new Map<string, OpeningHoursSpecification>();
  for (const window of legacyScheduleWindows(sources)) {
    if (window.unsafe || hasScheduleExceptions(window.text)) continue;
    const windowSeason = parseSeasonRange(window.text, now);
    if (hasSeasonContext(window.text) && !windowSeason) continue;
    const range = windowSeason ?? season;
    const key = `${window.hours?.opens}-${window.hours?.closes}-${range?.validFrom}-${range?.validThrough}`;
    const spec = byWindow.get(key) ?? {
      '@type': 'OpeningHoursSpecification' as const,
      dayOfWeek: [],
      ...(window.hours ?? {}),
      ...(range ?? {}),
    };
    for (const day of window.days) if (!spec.dayOfWeek.includes(day)) spec.dayOfWeek.push(day);
    byWindow.set(key, spec);
  }
  return byWindow.size ? [...byWindow.values()] : undefined;
}

/**
 * Upcoming source-backed holiday closures and special hours, as
 * `specialOpeningHoursSpecification`. Schema.org marks a closed day with
 * opens = closes = 00:00. Past exceptions are dropped (the page revalidates
 * daily), and nothing is emitted for a closed or suspended market.
 */
export function marketSpecialOpeningHours(
  market: MarketSchemaRecord,
  now = new Date()
): OpeningHoursSpecification[] | undefined {
  const status = market.first_party?.operations?.status?.value.value;
  if (status === 'permanently_closed' || status === 'temporarily_closed') return undefined;
  const today = now.toISOString().slice(0, 10);
  const specs = (market.first_party?.operations?.exceptions ?? [])
    .map((item) => item.value)
    .filter((value) => (value.end_date ?? value.start_date) >= today)
    .sort((left, right) => left.start_date.localeCompare(right.start_date))
    .map((value): OpeningHoursSpecification => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: [],
      opens: value.status === 'closed' ? '00:00' : value.opens,
      closes: value.status === 'closed' ? '00:00' : value.closes,
      validFrom: value.start_date,
      validThrough: value.end_date ?? value.start_date,
    }));
  // `dayOfWeek` is implied by the dates; prune() drops the empty array.
  return specs.length ? specs : undefined;
}

/* ------------------------------------------------------------------ *
 * Payment, contact, address
 * ------------------------------------------------------------------ */

/**
 * What a market takes, from exact source strings and its own flags — never a
 * default. This intentionally shares the visible details formatter so the
 * page and JSON-LD cannot disagree about v2 methods such as contactless pay.
 */
export function marketPaymentAccepted(market: MarketSchemaRecord): string[] | undefined {
  const accepted = paymentLabels(market);
  return accepted.length ? accepted : undefined;
}

/** True when the record says anything at all about how it takes payment. */
function hasPaymentData(market: MarketSchemaRecord): boolean {
  return Boolean(marketPaymentAccepted(market)?.length);
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
  if (market.suppress_map) return undefined;
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

const FAQ_TOPIC_QUESTIONS: Record<FaqTopic, (name: string) => string> = {
  arrival: (name) => `What should I know before arriving at ${name}?`,
  weather: (name) => `What is ${name}'s weather policy?`,
  accessibility: (name) => `What accessibility information is available for ${name}?`,
  pets: (name) => `Are pets allowed at ${name}?`,
  parking: (name) => `Is parking available at ${name}?`,
  payments: (name) => `What should I know about paying at ${name}?`,
  products: (name) => `What can I buy at ${name}?`,
  updates: (name) => `How can I get updates from ${name}?`,
};

type FaqTopic = NonNullable<MarketFirstPartyFacts['faq_facts']>[number]['value']['topic'];

/**
 * What an answer must mention to answer its topic's question. Research
 * occasionally files a fact under the wrong topic (holiday hours under
 * "updates", wholesale hours under "products"); such an answer is asked under
 * a question it does answer, or not at all.
 */
const FAQ_TOPIC_EVIDENCE: Partial<Record<FaqTopic, RegExp>> = {
  weather: /rain|weather|snow|heat|storm|shine/i,
  accessibility: /wheelchair|accessib|\bada\b|stroller|ramp/i,
  pets: /\bpets?\b|\bdogs?\b|animals?/i,
  parking: /park|\blots?\b|garage/i,
  payments: /\bpay|cash|card|ebt|snap|token|credit|debit|\bwic\b|coupon/i,
  products: /\bsell|\bsold\b|produce|vegetable|fruit|meat|cheese|bread|baked|flower|seafood|\bfoods?\b|goods|crafts?/i,
  updates: /newsletter|e-?mail|sign ?up|instagram|facebook|follow|subscribe|website|text alerts?/i,
};

function faqQuestion(topic: FaqTopic, answer: string, name: string): string | undefined {
  const evidence = FAQ_TOPIC_EVIDENCE[topic];
  if (!evidence || evidence.test(answer)) return FAQ_TOPIC_QUESTIONS[topic](name);
  if (/holiday|thanksgiving|christmas|new year/i.test(answer)) return `What are ${name}'s holiday hours?`;
  if (/wholesale/i.test(answer)) return `Can the public shop ${name}'s wholesale market?`;
  return undefined;
}

function titleWords(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** The most questions a page answers; the lowest-ranked ones are dropped. */
export const MAX_FAQ_COUNT = 6;

const ASSISTANCE_PAYMENT = /^(snap|ebt|wic|fmnp|sfmnp|p-ebt)\b|nutrition program|\bsnap\b|\bebt\b|\bwic\b|bucks|match|coupon|voucher|perks|veggie|fresh/i;

/**
 * The questions this record can answer, most useful first, at most
 * `MAX_FAQ_COUNT` of them.
 *
 * This is the single source for both the visible FAQ block and the `FAQPage`
 * node, which is the only way to guarantee the markup quotes the page. A
 * question whose answer would be a shrug, or would only repeat another
 * answer, is not asked at all.
 */
export function marketFaqs(market: MarketSchemaRecord, now = new Date()): MarketFaq[] {
  const name = displayName(market.name) || 'This market';
  const days = marketWeekdays(market);
  const hours = marketHours(market);
  const richSchedule = structuredScheduleLabels(market.first_party);
  const legacySchedule = !hours ? marketScheduleLabels(market) : [];
  const richDated = Boolean(
    market.first_party?.operations?.schedules?.some((item) => item.value.start_date || item.value.end_date)
  );
  const seasonLabel = marketSeasonLabel(market);
  const address = addressLine(market);
  const payments = marketPaymentAccepted(market);
  const firstParty = market.first_party;
  const acceptsSnap = Boolean(
    market.snap ||
      firstParty?.payments?.assistance?.some((item) => item.value.code === 'snap_ebt') ||
      payments?.includes('SNAP/EBT')
  );
  const today = now.toISOString().slice(0, 10);
  const facts = (firstParty?.faq_facts ?? []).filter(
    (item) => !(item.value.expires_on && item.value.expires_on < today) && clean(item.value.answer)
  );

  const ranked: { rank: number; faq: MarketFaq }[] = [];
  const add = (rank: number, question: string, answer: string) => {
    if (ranked.some((item) => item.faq.question === question)) return;
    ranked.push({ rank, faq: { question, answer } });
  };

  const status = firstParty?.operations?.status?.value;
  if (status && status.value !== 'active') {
    const statusText = status.value === 'seasonal_break'
      ? 'closed for the season'
      : status.value === 'temporarily_closed'
        ? 'temporarily closed'
        : 'permanently closed';
    add(0, `Is ${name} currently open?`, `${name} is ${statusText}.${status.note ? ` ${clean(status.note)}` : ''}`);
  }

  // One schedule answer, not a "days" and an "hours" question saying the
  // same thing twice.
  const season = !seasonLabel
    ? ''
    : /^year[\s-]?round$/i.test(seasonLabel)
      ? ' It is open year-round.'
      : ` The season runs ${seasonLabel}.`;
  if (richSchedule.length) {
    add(1, `What are ${name}'s hours?`, `${name} is open ${richSchedule.join('; ')}.${richDated ? '' : season}`);
  } else if (legacySchedule.length) {
    add(
      1,
      `What are ${name}'s hours?`,
      `${name} is open ${legacySchedule.join('; ').replace(/\.+$/, '')}.${legacySchedule.some(hasSeasonContext) ? '' : season}`
    );
  } else if (hours) {
    add(
      1,
      `What are ${name}'s hours?`,
      days.length ? `${name} is open ${weekdayPhrase(days)}, ${hours}.${season}` : `${name} is open ${hours}.${season}`
    );
  } else if (days.length) {
    add(1, `What days is ${name} open?`, `${name} is open on ${weekdayPhrase(days)}.${season}`);
  }

  if (address) add(2, `Where is ${name} located?`, `${name} is located at ${address}.`);

  // A researched note on how to pay with benefits makes the SNAP answer
  // concrete instead of a bare yes.
  const paymentFact = facts.find(
    (item) => item.value.topic === 'payments' && /\b(snap|ebt)\b/i.test(item.value.answer)
  );
  if (acceptsSnap) {
    add(
      3,
      `Does ${name} accept SNAP/EBT?`,
      paymentFact ? `Yes. ${clean(paymentFact.value.answer)}` : `Yes. ${name} accepts SNAP/EBT.`
    );
  } else if (hasPaymentData(market)) {
    add(3, `Does ${name} accept SNAP/EBT?`, `${name} does not list SNAP/EBT among its payment options.`);
  }

  // A list of benefit programs alone would read as "no cards"; the SNAP
  // answer covers that case.
  if (payments?.some((label) => !ASSISTANCE_PAYMENT.test(label))) {
    add(4, `What payment methods does ${name} accept?`, `${name} accepts ${joinWithAnd(payments)}.`);
  }

  const parking = firstParty?.access?.parking;
  if (parking?.availability) {
    const availability = parking.availability.value;
    const head = availability === 'no'
      ? `${name} has no visitor parking.`
      : availability === 'limited'
        ? `Parking at ${name} is limited.`
        : `Yes, ${name} has parking.`;
    const cost = availability === 'no' || !parking.cost
      ? ''
      : parking.cost.value === 'free'
        ? ' It is free.'
        : parking.cost.value === 'paid'
          ? ' It is paid.'
          : ' There are free and paid options.';
    const note = parking.location_note ? ` ${plainFact(parking.location_note.value)}` : '';
    add(5, `Is parking available at ${name}?`, `${head}${cost}${note}`);
  }

  const incentives = firstParty?.payments?.incentives ?? [];
  if (incentives.length) {
    const offers = incentives.map((item) => {
      const value = item.value;
      const amounts = value.input_amount !== undefined && value.benefit_amount !== undefined
        ? `, $${value.benefit_amount} extra for every $${value.input_amount}${value.maximum_amount !== undefined ? ` up to $${value.maximum_amount} a day` : ''}`
        : '';
      const who = clean(value.eligibility) ? ` for ${clean(value.eligibility).replace(/\.$/, '')}` : '';
      return `${clean(value.name)}${who}${amounts}`;
    });
    add(7, `Does ${name} offer food benefit incentives?`, `Yes: ${offers.join('; ')}.`);
  }

  const transit = firstParty?.access?.transit ?? [];
  if (transit.length) {
    const options = transit.map((item) => {
      const value = item.value;
      const routes = value.routes?.length ? ` (${value.routes.join(', ')})` : '';
      const where = [clean(value.stop_name), plainFact(value.note)].filter(Boolean).join('. ');
      return `${titleWords(value.mode)}${routes}${where ? `: ${where.replace(/\.$/, '')}` : ''}`;
    });
    add(8, `How can I reach ${name} by public transit?`, `${options.join('. ')}.`);
  }

  const petPolicy = firstParty?.policies?.find((item) => item.value.code === 'pets')?.value;
  if (petPolicy) {
    const rule = petPolicy.rule === 'allowed'
      ? 'Pets are allowed'
      : petPolicy.rule === 'not_allowed'
        ? 'Pets are not allowed'
        : petPolicy.rule === 'service_animals_only'
          ? 'Only service animals are allowed'
          : petPolicy.rule === 'discouraged'
            ? 'Visitors are asked not to bring pets'
            : 'Pets are allowed with conditions';
    add(9, `Are pets allowed at ${name}?`, `${rule} at ${name}.${petPolicy.note ? ` ${plainFact(petPolicy.note)}` : ''}`);
  }

  for (const item of facts) {
    if (item === paymentFact && acceptsSnap) continue;
    const answer = clean(item.value.answer);
    const question = faqQuestion(item.value.topic, answer, name);
    if (question) add(item.value.topic === 'arrival' ? 6 : 10, question, answer);
  }

  const newsletter = firstParty?.contact?.newsletter?.value;
  if (newsletter) {
    add(
      11,
      `How can I get updates from ${name}?`,
      `Sign up for ${newsletter.name ? `the ${clean(newsletter.name)}` : `${name}'s newsletter`} on the market's website.`
    );
  }

  const faqs = ranked
    .sort((left, right) => left.rank - right.rank)
    .slice(0, MAX_FAQ_COUNT)
    .map((item) => item.faq);
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

/* ------------------------------------------------------------------ *
 * Event occurrence
 * ------------------------------------------------------------------ */

const WEEKDAY_INDEX: Record<Weekday, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
};

export interface EventOccurrence {
  /** Local wall clock, `YYYY-MM-DDTHH:MM`, no offset. */
  startDate: string;
  endDate: string;
}

/**
 * The next market day on or after `now`, across every timed specification.
 *
 * Google reads only a top-level `startDate` on an Event, never the dates inside
 * `eventSchedule`, so the recurring Event needs one concrete occurrence. Dates
 * are compared as UTC calendar days and emitted as local wall clocks without
 * an offset (we hold no reliable per-market timezone), which Google resolves
 * against the event location. Pages revalidate daily, so "today" at worst
 * names a market day that is already under way. A specification whose window
 * has no matching weekday left yields nothing, and so does the Event.
 */
export function nextMarketOccurrence(
  specs: OpeningHoursSpecification[],
  now = new Date()
): EventOccurrence | undefined {
  const today = isoDate(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  let best: EventOccurrence | undefined;
  for (const spec of specs) {
    if (!spec.opens || !spec.closes || !spec.dayOfWeek.length) continue;
    const from = spec.validFrom && spec.validFrom > today ? spec.validFrom : today;
    const cursor = new Date(`${from}T00:00:00Z`);
    if (Number.isNaN(cursor.getTime())) continue;
    for (let offset = 0; offset < 7; offset += 1, cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      if (!spec.dayOfWeek.some((day) => WEEKDAY_INDEX[day] === cursor.getUTCDay())) continue;
      const day = cursor.toISOString().slice(0, 10);
      if (spec.validThrough && day > spec.validThrough) break;
      const end = new Date(cursor);
      // A window that closes at or before it opens runs past midnight.
      if (spec.closes <= spec.opens) end.setUTCDate(end.getUTCDate() + 1);
      const occurrence = {
        startDate: `${day}T${spec.opens}`,
        endDate: `${end.toISOString().slice(0, 10)}T${spec.closes}`,
      };
      if (!best || occurrence.startDate < best.startDate) best = occurrence;
      break;
    }
  }
  return best;
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
  const faqs = marketFaqs(market, now);

  const business: Record<string, unknown> = {
    '@type': ['GroceryStore', 'LocalBusiness'],
    '@id': businessId,
    name,
    url,
    image: imageUrl,
    description: marketDescription(market),
    address: market.suppress_map ? undefined : marketAddress(market),
    geo: coordinates
      ? { '@type': 'GeoCoordinates', latitude: coordinates.latitude, longitude: coordinates.longitude }
      : undefined,
    hasMap: market.suppress_map
      ? undefined
      : clean(market.google_maps_url) ||
        (coordinates
          ? `https://www.google.com/maps/search/?api=1&query=${coordinates.latitude},${coordinates.longitude}`
          : undefined),
    telephone: clean(market.phone_numbers?.[0]) || undefined,
    email: clean(market.emails?.[0]) || undefined,
    sameAs: marketSameAs(market),
    openingHoursSpecification: openingHours,
    specialOpeningHoursSpecification: marketSpecialOpeningHours(market, now),
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
  // then, and only while an upcoming market day falls inside its season.
  const timed = openingHours?.filter((spec) => spec.opens && spec.closes) ?? [];
  const occurrence = nextMarketOccurrence(timed, now);
  if (occurrence) {
    const schedules = timed.map((spec) => ({
      '@type': 'Schedule',
      byDay: spec.dayOfWeek,
      startTime: spec.opens,
      endTime: spec.closes,
      repeatFrequency: 'P1W',
      ...(spec.validFrom ? { startDate: spec.validFrom } : season ? { startDate: season.validFrom } : {}),
      ...(spec.validThrough ? { endDate: spec.validThrough } : season ? { endDate: season.validThrough } : {}),
    }));
    nodes.push({
      '@type': 'Event',
      '@id': `${url}#event`,
      name: `${name} weekly market day`,
      url,
      image: imageUrl,
      description: marketDescription(market),
      startDate: occurrence.startDate,
      endDate: occurrence.endDate,
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      eventStatus: 'https://schema.org/EventScheduled',
      location: { '@id': businessId },
      organizer: { '@id': businessId },
      eventSchedule: schedules.length === 1 ? schedules[0] : schedules,
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
