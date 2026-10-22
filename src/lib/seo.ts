/**
 * Title and description copy for market detail pages.
 *
 * Everything here is a pure function of one market record so it can be unit
 * tested without Next.js, the filesystem, or the data layer (`src/lib/seo.test.ts`).
 *
 * The rules these functions encode:
 *  - A title never exceeds `TITLE_MAX_LENGTH` (Google truncates around 60
 *    characters) and never ends on a dangling separator or a half word.
 *  - A description is assembled *only* from fields the record actually has, so
 *    a sparse record gets a short honest sentence instead of an empty slot
 *    ("Find fresh ." was rendering on ~99% of pages before this).
 */

import type { MarketFirstPartyFacts } from './enrichment.ts';
import {
  WEEKDAY_NAMES,
  weekdaysFromText,
  legacyScheduleWindows,
  legacyScheduleLabels,
  parseHourRange,
  hourRangeTexts,
  hasScheduleExceptions,
  hasSeasonContext,
  hasNonWeeklyRecurrence,
  hasSingleCalendarDate,
  type Weekday,
} from './schedule.ts';
export { WEEKDAY_NAMES, weekdaysFromText };
export type { Weekday };

import {
  clean,
  resolveLocation,
  stateAbbreviation,
  stateFullName,
  type GeoRecord,
  type ResolvedLocation,
} from './geo.ts';

// Re-exported so callers keep importing their location helpers from one place.
export { resolveLocation, stateAbbreviation, stateFullName };
export type { ResolvedLocation };

/** Google truncates SERP titles at roughly 60 characters. */
export const TITLE_MAX_LENGTH = 60;
/** Upper bound for descriptions; ~160 chars is where Google clips the snippet. */
export const DESCRIPTION_MAX_LENGTH = 160;
/** Below this we top the description up with a generic (but true) closing line. */
const DESCRIPTION_PAD_THRESHOLD = 110;

/**
 * The subset of a market record this module reads: the location fields
 * `src/lib/geo.ts` parses, plus the copy fields only the snippet needs.
 */
export interface MarketSeoRecord extends GeoRecord {
  first_party?: MarketFirstPartyFacts;
  suppress_map?: boolean;
  name: string;
  county?: string | null;
  season?: string | null;
  days?: string[] | null;
  snap?: boolean;
  wic?: boolean;
  fmnp?: boolean;
  sfmnp?: boolean;
}

/**
 * Words that already mark a name as a market, in the languages in the data.
 * Deliberately unanchored so compounds count too ("Greenmarket", "Biomarkt").
 */
const MARKET_WORD = /market|marché|marche|markt|mercado|mercato|mercat|marknad|piac/i;

/**
 * Whether a name already tells the reader this is a market, so a caller can
 * skip the "is a farmers market" gloss instead of writing "Durham Farmers'
 * Market is a farmers market". Exported for `src/lib/marketFacts.ts`, which
 * builds the on-page summary from the same rule as the meta description.
 */
export function nameSaysMarket(name: string): boolean {
  return MARKET_WORD.test(name);
}

/** Short words that stay lower-case when un-shouting a name. */
const NAME_STOPWORDS = new Set(['and', 'the', 'of', 'de', 'du', 'la', 'le', 'at', 'in', 'on', 'for', 'van']);

/**
 * 167 records ship an all-caps name ("MONTEVALLO FARMERS MARKET"). Shouting at
 * searchers costs clicks, so those are title-cased — but only a multi-word name
 * with a real word in it, because a single caps token is more likely an
 * acronym ("CFFMA") than shouting. Short tokens (LLC, CFM, NW) keep their case.
 *
 * Exported so the Open Graph image route can headline the same cleaned-up name
 * the title tag uses, without the " — City, ST" suffix `marketTitle` adds.
 */
export function displayName(rawName: string): string {
  const name = fixStateCodeCasing(clean(rawName));
  const isShouting = /[A-Z]/.test(name) && !/[a-z]/.test(name);
  const words = name.split(/\s+/);
  if (!isShouting || words.length < 2 || !words.some((word) => word.replace(/\W/g, '').length >= 4)) {
    return name;
  }

  return name.replace(/[A-Za-zÀ-ÿ']+/g, (word) => {
    if (NAME_STOPWORDS.has(word.toLowerCase())) return word.toLowerCase();
    if (word.length <= 3) return word;
    return word[0].toUpperCase() + word.slice(1).toLowerCase();
  });
}

/**
 * Two-letter words an upstream pass upper-cased because they look like state
 * codes: "Market IN the Park", "Ujamaa CO-op", "Marché DE LA Place",
 * "LA Grange", "MT. Pleasant". Each maps to how it reads as a word.
 */
const STATE_CODE_WORDS: Record<string, string> = {
  IN: 'in',
  DE: 'de',
  LA: 'La',
  CO: 'Co',
  MT: 'Mt',
  HI: 'Hi',
  MA: 'Ma',
  MO: 'Mo',
};

/** US place names that keep a capital "De" mid-name ("De Pere", "De Soto"). */
const CAPITAL_DE_PLACES = /^(?:Soto|Pere|Tour|Witt|Kalb|Land|Queen|Funiak|Smet|Forest|Leon|Ridder|Valls|Beque|Graff)\b/;

/** Words after a state code that show it really is the state: "Bellefonte DE Farmers Market". */
const AFTER_STATE = /^(?:Farmers?|Farmer['’]s|Farmers['’]|Community|Certified|Market|Farm|Grown|Produce)\b/i;

/**
 * Restore the ordinary word behind an upper-cased state-code lookalike,
 * keeping it as a code only where it really is the state: at the end of the
 * name ("Madison, IN"), after a comma ("City, IN Farmers Market"), or between
 * a place and "Farmers Market" ("Weston MO Farmer's Market"). Real acronyms
 * (SNAP, YMCA, CFM, FRESHFARM, NY, VA) are never touched.
 */
function fixStateCodeCasing(raw: string): string {
  // "CO-Operative", "CO-Op", "CO-op" all mean co-op.
  const name = raw.replace(/\bCO-O[Pp](?=erative\b|\b)/g, 'Co-op');
  return name.replace(/\b(IN|DE|LA|CO|MT|HI|MA|MO)\b(?![’'][a-z])/g, (code, _match, offset: number) => {
    const before = name.slice(0, offset);
    const after = name.slice(offset + code.length);
    // "CO-op", "CO-Operative", "HI-Line": a prefix, never a state.
    // "MT. Pleasant", "Fayette CO. Farmers Market": abbreviations of Mount and County.
    if (after.startsWith('-') || after.startsWith('.')) return capitalize(STATE_CODE_WORDS[code]);
    const next = after.trimStart();
    const isAtEnd = !/[A-Za-z0-9]/.test(after);
    const followsComma = /,\s*$/.test(before);
    const isStatePosition =
      isAtEnd ||
      followsComma ||
      /^[,)]/.test(after) ||
      /^\s+-\s/.test(after) ||
      (/[A-Za-z]\s+$/.test(before) && AFTER_STATE.test(next));
    if (isStatePosition) return code;
    const word = STATE_CODE_WORDS[code];
    // The start of the name, or of its second-language half ("… / DE Zuidmarkt").
    if (!before.trim() || /\/\s*$/.test(before)) return capitalize(word);
    if (code === 'DE' && CAPITAL_DE_PLACES.test(next)) return 'De';
    // "Marché DE LA Place": the article after "de" is lower-case too.
    if (code === 'LA' && /\bde\s+$/i.test(before)) return 'la';
    return word;
  });
}

/** "Durham, NC" / "Durham" / "NC" / undefined. */
function locationLabel(location: ResolvedLocation): string | undefined {
  return [location.city, location.state].filter(Boolean).join(', ') || undefined;
}

function truncateOnWordBoundary(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const hard = value.slice(0, maxLength - 1);
  const lastSpace = hard.lastIndexOf(' ');
  const body = (lastSpace > maxLength / 2 ? hard.slice(0, lastSpace) : hard).replace(/[\s,;:.\-—]+$/, '');
  return `${body}…`;
}

/**
 * SERP title for a market, at most `TITLE_MAX_LENGTH` characters.
 *
 * Preferred shape: `Name — City, ST Farmers Market`. When that does not fit we
 * degrade one clause at a time — drop the " Farmers Market" keyword suffix,
 * then drop the location — rather than truncating and leaving a dangling
 * comma or half a word behind. The suffix is also skipped whenever the name
 * already says "market" in any of the languages in the data, so nothing comes
 * out as "Durham Farmers' Market Farmers Market".
 */
/**
 * What a visitor can plan from this page, for the title suffix: only for
 * records with a source-backed weekly schedule, and only topics the page then
 * actually answers. Most specific first, so trimming drops the tail.
 */
function visitTopics(market: MarketSeoRecord): string[] {
  const firstParty = market.first_party;
  if (!firstParty?.operations?.schedules?.length) return [];
  const status = firstParty.operations.status?.value.value;
  if (status === 'permanently_closed' || status === 'temporarily_closed') return [];
  const topics = ['Hours'];
  if (firstParty.access?.parking?.availability) topics.push('Parking');
  else if (firstParty.access?.transit?.length) topics.push('Directions');
  if (firstParty.vendors?.directory_url || firstParty.vendors?.count || firstParty.vendors?.roster?.length) topics.push('Vendors');
  return topics;
}

function topicPhrase(topics: string[]): string {
  if (topics.length <= 1) return topics[0] ?? '';
  return `${topics.slice(0, -1).join(', ')} & ${topics[topics.length - 1]}`;
}

export function marketTitle(market: MarketSeoRecord): string {
  const name = displayName(market.name);
  if (!name) return 'Farmers Market';

  const label = locationLabel(resolveLocation(market));
  const needsKeyword = !nameSaysMarket(name);
  // "Findlay Market - Cincinnati, OH: Hours, Parking & Vendors": the name
  // first, then the place, then what the page lets a visitor plan, trimmed
  // from the end until it fits.
  const topics = visitTopics(market);
  const visitCandidates = label && !needsKeyword
    ? topics.map((_topic, index) => `${name} - ${label}: ${topicPhrase(topics.slice(0, topics.length - index))}`)
    : [];

  const candidates = [
    ...visitCandidates,
    label && needsKeyword ? `${name} - ${label} Farmers Market` : undefined,
    label ? `${name} - ${label}` : undefined,
    needsKeyword ? `${name} - Farmers Market` : undefined,
    name,
  ].filter((candidate): candidate is string => Boolean(candidate));

  const fitting = candidates.find((candidate) => candidate.length <= TITLE_MAX_LENGTH);
  // Only a name longer than the whole budget reaches the truncation fallback.
  return fitting ?? truncateOnWordBoundary(name, TITLE_MAX_LENGTH);
}

const SEASON_WORDS = ['spring', 'summer', 'fall', 'autumn', 'winter'] as const;

function isSeasonList(season: string): boolean {
  const tokens = season
    .toLowerCase()
    .split(/[,/]| and /)
    .map((token) => token.trim())
    .filter(Boolean);
  return (
    tokens.length > 0 &&
    tokens.every((token) => (SEASON_WORDS as readonly string[]).includes(token))
  );
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "HH:MM" (24h) as "8", "8:30" plus its half of the day. */
function clockParts(value: string): { time: string; half: 'am' | 'pm' } {
  const [hour, minute] = value.split(':').map(Number);
  const time = `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''}`;
  return { time, half: hour < 12 || hour === 24 ? 'am' : 'pm' };
}

/** "08:00"-"12:00" as "8am-12pm"; "16:00"-"18:00" as "4-6pm". */
function compactHourRange(opens: string, closes: string): string {
  const start = clockParts(opens);
  const end = clockParts(closes);
  return start.half === end.half
    ? `${start.time}-${end.time}${end.half}`
    : `${start.time}${start.half}-${end.time}${end.half}`;
}

/**
 * One time range in the house style, or undefined when it cannot be read
 * without guessing. A range with no am/pm is only read as a 24-hour clock when
 * the caller knows the source uses one, an hour is past 12 ("15:00-19:00"), or
 * it is written the French way ("07h30-13h30"); "3:30-6:30" is left alone.
 */
function normalizeHourRange(text: string, clock24: boolean): string | undefined {
  const parsed = parseHourRange(text);
  if (!parsed) return undefined;
  const hasMeridiem = /\d\s*[ap]\.?\s*m\b/i.test(text);
  const is24h = clock24 || /\d\s*h\s*\d/i.test(text) || /(?:^|\D)(?:1[3-9]|2[0-4])\s*[:h.]\s*\d{2}/.test(text);
  if (!hasMeridiem && !is24h) return undefined;
  return compactHourRange(parsed.opens, parsed.closes);
}

export interface FormatScheduleOptions {
  /** The source writes a 24-hour clock (the European feeds), so "8:00-12:30" is morning. */
  clock24?: boolean;
}

/**
 * Tidy the many clock formats in the data down to one readable style:
 * "8am until 12pm", "7AM to 1PM", "4:00 PM-6:00 PM" and "2pm-6pm" all come out
 * as "8am-12pm", "7am-1pm", "4-6pm". Anything that cannot be read safely
 * keeps its wording, with only spacing and case tidied.
 */
export function formatSchedule(value: string, options: FormatScheduleOptions = {}): string {
  const tidied = clean(value)
    // "08:30:00" -> "08:30"
    .replace(/(\d{1,2}:\d{2}):\d{2}/g, '$1')
    // "11:00 AM" -> "11am", "03:30 PM" -> "3:30pm"
    .replace(/\b0?(\d{1,2}):(\d{2})\s*([AaPp])\.?[Mm]\b\.?/g, (_match, hour, minute, meridiem) =>
      minute === '00' ? `${hour}${meridiem.toLowerCase()}m` : `${hour}:${minute}${meridiem.toLowerCase()}m`
    )
    // "8 am", "10AM", "2p.m." -> "8am", "10am", "2pm"
    .replace(/\b(\d{1,2})\s*([AaPp])\.?\s?[Mm]\b\.?/g, (_match, hour, meridiem) => `${hour}${meridiem.toLowerCase()}m`)
    // "08:30" -> "8:30"
    .replace(/\b0(\d:\d{2})/g, '$1')
    // one plain hyphen between two times, but never for "Monday to Sunday"
    .replace(
      /(\d{1,2}(?::\d{2})?(?:\s?[ap]m)?)\s*(?:-|–|to|tp|until|till|til)\s*(\d{1,2}(?::\d{2})?(?:\s?[ap]m)?)/gi,
      '$1-$2'
    )
    .trim();

  let result = tidied;
  for (const range of new Set(hourRangeTexts(tidied).map((text) => text.trim()))) {
    const normalized = normalizeHourRange(range, Boolean(options.clock24));
    if (normalized) result = result.split(range).join(normalized);
  }
  return result;
}

const WEEKDAYS = new Set([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

/**
 * "Open Saturdays 8am–12pm" style clause, or undefined when the record has no
 * usable schedule. Handles the three shapes in the data: bare weekday names
 * ("saturday"), English schedule strings in `season` ("Saturdays 8am to 1pm"),
 * and localized schedule lines ("Samedi 08:30:00 - 12:00:00").
 */
export function scheduleClause(market: MarketSeoRecord): string | undefined {
  const status = market.first_party?.operations?.status?.value.value;
  if (status === 'permanently_closed' || status === 'temporarily_closed') return undefined;
  // Rich schedules are summarized from the structured windows themselves,
  // never from their lossy legacy projection.
  if (market.first_party?.operations?.schedules?.length) return richScheduleClause(market);
  const labels = marketScheduleLabels(market);
  if (labels.length && (!marketHours(market) || (market.days ?? []).some((value) => hasScheduleExceptions(value)))) {
    return `Schedule: ${labels.map((label) => formatSchedule(label)).join(', ')}`;
  }
  const days = (market.days ?? []).map(clean).filter(Boolean);
  const season = clean(market.season);
  if ([...days, season].some(hasScheduleExceptions)) {
    const openDays = marketWeekdays(market);
    return openDays.length ? `Open ${joinWithAnd(openDays.map((day) => `${day}s`))}` : undefined;
  }

  const weekdayNames = days.filter((day) => WEEKDAYS.has(day.toLowerCase()));
  if (weekdayNames.length === days.length && weekdayNames.length > 0) {
    const pluralized = weekdayNames
      .map((day) => `${day[0].toUpperCase()}${day.slice(1).toLowerCase()}s`)
      .slice(0, 3);
    const clause = joinWithAnd(pluralized);
    // A weekday-only list pairs well with English opening times from `season`,
    // but a season that is only dates ("June through October") is the season
    // clause's job, not a replacement for the days.
    if (season && isScheduleText(season)) {
      return `Open ${formatSchedule(season)}`;
    }
    return `Open ${clause}`;
  }

  if (days.length > 0) {
    // Localized feeds repeat the same slot per language (FR then NL); one is enough.
    return `Open ${formatSchedule(days[0])}`;
  }

  if (season && isScheduleText(season)) {
    return `Open ${formatSchedule(season)}`;
  }

  return undefined;
}

/** Text that states days or clock times, as opposed to dates or a data note. */
function isScheduleText(text: string): boolean {
  return !isSeasonList(text) && !isYearRound(text) && (weekdaysFromText(text).length > 0 || hourRangeTexts(text).length > 0);
}

const SHORT_DAYS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};
const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/** "Tue-Fri", "Mon, Wed, Fri, Sat": consecutive runs of three or more collapse. */
export function shortDayList(days: string[]): string {
  const ordered = DAY_ORDER.filter((day) => days.includes(day));
  const runs: string[][] = [];
  for (const day of ordered) {
    const run = runs.at(-1);
    if (run && DAY_ORDER.indexOf(day) === DAY_ORDER.indexOf(run.at(-1)!) + 1) run.push(day);
    else runs.push([day]);
  }
  return runs
    .flatMap((run) => run.length >= 3 ? [`${SHORT_DAYS[run[0]]}-${SHORT_DAYS[run.at(-1)!]}`] : run.map((day) => SHORT_DAYS[day]))
    .join(', ');
}

export function compactClock(value: string): string | undefined {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return undefined;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}${match[2] === '00' ? '' : `:${match[2]}`}${hour < 12 ? 'am' : 'pm'}`;
}

/**
 * "Open Tue-Fri 9am-6pm, Sat 8am-6pm, Sun 10am-4pm" from weekly v2 windows.
 * A window that sits inside a wider one on the same days (a farm shed within
 * the market house's hours) is left out, as is any dated or non-weekly
 * schedule, which a one-line snippet cannot state honestly.
 */
function richScheduleClause(market: MarketSeoRecord): string | undefined {
  const schedules = market.first_party?.operations?.schedules ?? [];
  if (schedules.some((item) => item.value.recurrence.kind !== 'weekly' || item.value.recurrence.interval_weeks === 2 || item.value.start_date || item.value.end_date)) {
    return undefined;
  }
  const windows = schedules.map((item) => ({
    days: item.value.recurrence.kind === 'weekly' ? item.value.recurrence.weekdays : [],
    opens: item.value.opens,
    closes: item.value.closes,
  }));
  const kept = windows.filter((window, index) => !windows.some((other, otherIndex) =>
    otherIndex !== index &&
    other.opens <= window.opens && other.closes >= window.closes &&
    window.days.every((day) => other.days.includes(day)) &&
    !(other.opens === window.opens && other.closes === window.closes && otherIndex > index)
  ));
  const byRange = new Map<string, string[]>();
  for (const window of kept) {
    const opens = compactClock(window.opens);
    const closes = compactClock(window.closes);
    if (!opens || !closes || !window.days.length) return undefined;
    const key = `${opens}-${closes}`;
    byRange.set(key, [...(byRange.get(key) ?? []), ...window.days]);
  }
  const parts = [...byRange.entries()]
    .sort(([, left], [, right]) => DAY_ORDER.indexOf(left[0]) - DAY_ORDER.indexOf(right[0]))
    .map(([range, days]) => `${shortDayList(days)} ${range}`);
  return parts.length ? `Open ${parts.join(', ')}` : undefined;
}

/** "Open year-round" / "Open in spring and summer" when `season` is a season. */
function seasonClause(market: MarketSeoRecord): string | undefined {
  const status = market.first_party?.operations?.status?.value.value;
  if (status === 'permanently_closed' || status === 'temporarily_closed') return undefined;
  const structured = market.first_party?.operations?.season?.value;
  if (structured) {
    const label = marketSeasonLabel(market);
    return label ? structured.kind === 'year_round' ? 'Open year-round' : `Season: ${label}` : undefined;
  }
  const season = clean(market.season);
  if (!season) return undefined;

  if (isYearRound(season)) return 'Open year-round';
  if (!isSeasonList(season)) {
    // "May-October", "June 20-November 21, 2026": a plain date range only.
    const label = marketSeasonLabel(market);
    if (!label) return undefined;
    return new RegExp(`^${SEASON_DATE}-${SEASON_DATE}$`).test(label) ? `Open ${label}` : `Season: ${label}`;
  }

  const names = season
    .toLowerCase()
    .split(/[,/]| and /)
    .map((token) => token.trim())
    .filter(Boolean);
  const ordered = SEASON_WORDS.filter((word) => names.includes(word));
  return `Open in ${joinWithAnd([...ordered])}`;
}

function paymentClause(market: MarketSeoRecord): string | undefined {
  const programs = [
    market.snap ? 'SNAP' : undefined,
    market.wic ? 'WIC' : undefined,
    market.fmnp ? 'FMNP' : undefined,
    market.sfmnp ? 'SFMNP' : undefined,
  ].filter((program): program is string => Boolean(program));

  return programs.length ? `Accepts ${joinWithAnd(programs)}` : undefined;
}

/**
 * Meta description for a market, built only from fields the record has.
 *
 * Priority order (the first sentence is always the place, the rest are added
 * while they fit inside `DESCRIPTION_MAX_LENGTH`): street address + city →
 * days/hours → season → SNAP/WIC/FMNP/SFMNP acceptance → county.
 */
export function marketDescription(market: MarketSeoRecord): string {
  const name = displayName(market.name) || 'This farmers market';
  const location = resolveLocation(market);
  // "Durham NC" for US states; "Woluwe-Saint-Lambert, Brussels-Capital Region"
  // when the region is spelled out, where a comma is the only readable join.
  const isAbbreviatedState = Boolean(location.state && /^[A-Z]{2}$/.test(location.state));
  const label =
    (location.city && location.state
      ? `${location.city}${isAbbreviatedState ? ' ' : ', '}${location.state}`
      : location.city || location.state) || undefined;
  const isMarketNamed = nameSaysMarket(name);

  // A handful of records carry a paragraph in the address field. Anything that
  // long is dropped rather than allowed to eat the whole snippet.
  const street = !market.suppress_map && location.street && location.street.length <= 60 ? location.street : undefined;
  const at = isMarketNamed ? `${name} at` : `${name} is a farmers market at`;
  const inLabel = isMarketNamed ? `${name} in` : `${name} is a farmers market in`;

  const opening =
    [
      street && label ? `${at} ${street}, ${label}.` : undefined,
      street ? `${at} ${street}.` : undefined,
      label ? `${inLabel} ${label}.` : undefined,
      isMarketNamed ? `${name}.` : `${name} is a local farmers market.`,
    ].find(
      (candidate): candidate is string =>
        Boolean(candidate) && (candidate as string).length <= DESCRIPTION_MAX_LENGTH
    ) ?? truncateOnWordBoundary(name, DESCRIPTION_MAX_LENGTH - 1) + '.';

  const schedule = scheduleClause(market);
  const season = seasonClause(market);
  const county = clean(market.county);

  // The schedule and the season belong in one sentence when we have both:
  // "Open Saturdays 8am-12pm, April-November." A schedule that already names
  // its months ("Thursdays, June 4-October 1, 3-7pm") does not repeat them,
  // and when both do not fit, the schedule alone is kept.
  const scheduleText = schedule?.replace(/[\s.,;!]+$/, '');
  const seasonText = scheduleText && hasSeasonContext(scheduleText) ? undefined : season;
  const timing = [
    scheduleText && seasonText ? `${scheduleText}, ${seasonForSentence(seasonText.replace(/^(?:Open (?:in )?|Season: )/, ''))}.` : undefined,
    scheduleText ? `${scheduleText}.` : undefined,
    seasonText ? `${seasonText}.` : undefined,
  ].filter((sentence): sentence is string => Boolean(sentence));

  const optional: string[][] = [
    timing,
    paymentClause(market) ? [`${paymentClause(market)}.`] : [],
    county ? [`Located in ${county}.`] : [],
  ];

  let description = opening;
  for (const alternatives of optional) {
    const fitting = alternatives.find((sentence) => `${description} ${sentence}`.length <= DESCRIPTION_MAX_LENGTH);
    if (fitting) description = `${description} ${fitting}`;
  }

  // A bare "Name in City ST." snippet wastes the slot; a short, true closing
  // line about what the page offers reads better and carries the keywords.
  // A well-documented market says which visit details it actually has.
  const topics = visitTopics(market).filter((topic) => topic !== 'Hours').map((topic) => topic === 'Vendors' ? 'vendor' : topic.toLowerCase());
  if (topics.length) {
    const visitLine = `Plan your visit with ${topics.length > 1 ? `${topics.slice(0, -1).join(', ')} and ${topics.at(-1)}` : topics[0]} details.`;
    if (`${description} ${visitLine}`.length <= DESCRIPTION_MAX_LENGTH) description = `${description} ${visitLine}`;
  }
  const closer = 'Fresh local produce, market details and directions.';
  if (
    description.length < DESCRIPTION_PAD_THRESHOLD &&
    `${description} ${closer}`.length <= DESCRIPTION_MAX_LENGTH
  ) {
    description = `${description} ${closer}`;
  }

  return description
    .replace(/\s+/g, ' ')
    .replace(/…\./g, '…')
    .replace(/\.\.+/g, '.')
    .trim();
}

/* ------------------------------------------------------------------ *
 * City pages (`/{state}/{city}`)
 *
 * The city page renders one row per market with Days / Hours / Season as
 * separate columns, which the source data does not provide separately: the
 * schedule is smeared across `operations.days` (bare weekday names in the USDA
 * export, "Samedi 08:30:00 - 12:00:00" in the European government feeds) and
 * `operations.season` (season words, "Year Round", date ranges like
 * "May-Oct", *and* weekly schedules like "Saturdays 8am to 1pm"). The three
 * readers below split that mess into the three columns, each returning
 * `undefined`/`[]` rather than a placeholder so the page can drop a column that
 * is empty for every market in the city.
 * ------------------------------------------------------------------ */

/** The weekdays a market trades on, read from `days` and from `season`. */
export function marketWeekdays(market: MarketSeoRecord): Weekday[] {
  const status = market.first_party?.operations?.status?.value.value;
  if (status === 'permanently_closed' || status === 'temporarily_closed') return [];
  const rich = market.first_party?.operations?.schedules;
  const found = new Set<Weekday>();
  if (rich?.length) {
    for (const item of rich) {
      if (item.value.recurrence.kind !== 'weekly' || item.value.recurrence.interval_weeks === 2) continue;
      for (const day of item.value.recurrence.weekdays) {
        const label = WEEKDAY_NAMES.find((name) => name.toLowerCase() === day);
        if (label) found.add(label);
      }
    }
  } else {
    const sources = [...(market.days ?? []), market.season].map(clean);
    if (sources.some(hasNonWeeklyRecurrence)) return [];
    for (const window of legacyScheduleWindows(sources)) {
      if (window.unsafe || hasScheduleExceptions(window.text) && window.hours) continue;
      for (const day of window.days) found.add(day);
    }
  }
  return WEEKDAY_NAMES.filter((day) => found.has(day));
}

/** The European government feeds write a 24-hour clock; the US and Canadian ones do not. */
function usesTwentyFourHourClock(market: MarketSeoRecord): boolean {
  const code = market.country_code?.toUpperCase();
  return Boolean(code) && code !== 'US' && code !== 'CA';
}

/** "8am-12pm." -> "8am-12pm": a cell never ends on the source's full stop. */
function tidyHours(value: string): string {
  return value.replace(/[\s.,;:]+$/, '');
}

/** A single common time only; differing windows must retain their day context. */
export function marketHours(market: MarketSeoRecord): string | undefined {
  const status = market.first_party?.operations?.status?.value.value;
  if (status === 'permanently_closed' || status === 'temporarily_closed') return undefined;
  const rich = market.first_party?.operations?.schedules;
  if (rich?.length) {
    if (rich.some((item) => item.value.recurrence.kind !== 'weekly' || item.value.recurrence.interval_weeks === 2)) return undefined;
    const ranges = [...new Set(rich.map((item) => `${item.value.opens}-${item.value.closes}`))];
    return ranges.length === 1 && parseHourRange(ranges[0]) ? formatSchedule(ranges[0], { clock24: true }) : undefined;
  }
  const sources = [...(market.days ?? []), market.season].map(clean).filter(Boolean);
  if (sources.some((source) => hasNonWeeklyRecurrence(source) || hasSingleCalendarDate(source))) return undefined;
  const windows = legacyScheduleWindows(sources);
  const actual = new Set(windows.filter((window) => window.hours).map((window) => `${window.hours!.opens}-${window.hours!.closes}`));
  if (actual.size > 1 || windows.some((window) => window.unsafe || window.hours && (hasScheduleExceptions(window.text) || hasSeasonContext(window.text)))) return undefined;
  if (windows.some((window) => !window.hours) && actual.size) return undefined;
  const clock24 = usesTwentyFourHourClock(market);
  const common = windows.find((window) => window.hourText)?.hourText;
  if (common) return tidyHours(formatSchedule(common, { clock24 }));
  // Time-only sources still answer Hours, although they cannot supply weekdays.
  const timeOnly = sources.filter((source) => !hasScheduleExceptions(source)).flatMap(hourRangeTexts);
  const unique = new Set(timeOnly.map((text) => JSON.stringify(parseHourRange(text))));
  return unique.size === 1 ? tidyHours(formatSchedule(timeOnly[0], { clock24 })) : undefined;
}

/** Preserve precise source wording when a schedule cannot be flattened. */
export function marketScheduleLabels(market: MarketSeoRecord): string[] {
  const status = market.first_party?.operations?.status?.value.value;
  if (status === 'permanently_closed' || status === 'temporarily_closed') return [];
  return legacyScheduleLabels([...(market.days ?? []), market.season]);
}

function capitalize(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Every spelling of a month in the data, lower-cased, to its index. "may" is handled on its own. */
const MONTH_BY_ALIAS = new Map<string, number>([
  ...MONTH_NAMES.map((month, index) => [month.toLowerCase(), index] as const),
  ...(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const).map((alias, index) => [alias, index] as const),
  ['sept', 8],
]);
const MONTH_ALIAS_RE = /\b(january|february|march|april|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec|may)\b\.?/gi;
const MONTH_FULL = MONTH_NAMES.join('|');
/** "June", "June 20", "June 20, 2026". */
const SEASON_DATE = String.raw`(?:${MONTH_FULL})(?: \d{1,2})?(?:, 20\d{2})?`;

/**
 * Data-quality notes that were written into the season field: "No current
 * published operating season identified in available evidence.", "Seasonal;
 * exact operating season dates not published.", "Not stated on the official
 * market page", "(historical listing)". They describe our sources, not the
 * market, so a clause matching this is dropped.
 */
const SEASON_META = new RegExp(
  [
    String.raw`\b(?:not|no|never)\b[^;]*\b(?:published|stated|specified|listed|found|identified|given|announced|available|confirmed)\b`,
    String.raw`\bnot\s+(?:separately\s+)?publi`,
    String.raw`\bevidence\b`,
    String.raw`\bavailable\s+(?:sources?|records?|listings?|information|market)\b`,
    String.raw`\b(?:published|consulted|official|historical)\s+(?:sources?|listings?|information|market information|dates|market dates|event dates|records?|season)\b`,
    String.raw`\bhistorical\b`,
    String.raw`\blistings?\b`,
    String.raw`\b(?:official|operator['’]s|market['’]s)\s+(?:own\s+)?(?:page|pages|site|website)\b`,
    String.raw`\bfacebook page\b`,
    String.raw`\b(?:page|site|market)\s+(?:also\s+)?(?:states|says|describes|publishes|announces)\b`,
    String.raw`\b(?:end|closing|opening|start)\s+date\b`,
    String.raw`\byear not specified\b`,
    String.raw`^published\b`,
    String.raw`\bdates shown\b`,
    String.raw`\bunknown\b`,
    String.raw`^(?:n\/?a|tbd|tba|none|varies)$`,
  ].join('|'),
  'i'
);

/** What is left of a note once the meta clause is gone: "Seasonal", "2026 season". */
const SEASON_NOISE =
  /^(?:seasonal(?:ly)?(?:\s+variable)?|cold[- ]season|(?:the\s+)?(?:20\d{2}\s+)?(?:(?:farmers['’]?\s+)?market\s+)?season|20\d{2}|weekly\/ongoing|ongoing|operating season|summer hiatus|during the season|in season)$/i;

/** "Year - Round (Weather Permitting)", "Open year round.", "All Year", "January-December". */
const YEAR_ROUND_RE =
  /^(?:open\s+)?(?:year[\s-]*round(?:\s+market)?|all[\s-]+year(?:[\s-]+(?:round|long))?|throughout the year|jan(?:uary)?\s*(?:-|to|through)\s*dec(?:ember)?)(?:\s*\((?:weather permitting|jan(?:uary)?\s*-\s*dec(?:ember)?)\)|,?\s+weather permitting)?[\s.!]*$/i;

function isYearRound(season: string): boolean {
  return YEAR_ROUND_RE.test(season.trim());
}

function monthName(alias: string, text: string, offset: number): string | undefined {
  const key = alias.toLowerCase().replace(/\.$/, '');
  if (key === 'may') {
    // "may" is also a verb ("dates may vary"): only a month next to a date or range.
    const before = text.slice(0, offset);
    const after = text.slice(offset + alias.length);
    const isDate =
      alias === 'May' ||
      /^\s*(?:\d|-|through\b|thru\b|to\b|until\b|and\b|,)/i.test(after) ||
      /(?:-|\b(?:through|thru|to|mid|early|late|from|in)\s*-?\s*)$/i.test(before);
    return isDate ? 'May' : undefined;
  }
  const index = MONTH_BY_ALIAS.get(key);
  return index === undefined ? undefined : MONTH_NAMES[index];
}

/**
 * The season text with its data-quality notes removed and its dates in one
 * style: "June 20th through November 21st, 2026" becomes "June 20-November
 * 21, 2026", "May-Oct" becomes "May-October", "Spring through Fall" becomes
 * "Spring through fall". Returns undefined when nothing but notes is left.
 */
export function tidySeasonText(raw?: string | null): string | undefined {
  const text = clean(raw).replace(/[\s.!]+$/, '');
  if (!text) return undefined;
  if (isYearRound(text)) return 'Year-round';

  const clauses = text
    .split(/\s*;\s*/)
    .map((clause) =>
      clause
        // "(published dates: Aug 7-28)", "(2024 published listing)"
        .replace(/\s*\(([^)]*)\)/g, (aside, inner: string) => (SEASON_META.test(inner) || /\bpublished\b/i.test(inner) ? '' : aside))
        .replace(/[\s,.]+$/, '')
        .trim()
    )
    .filter((clause) => clause && !SEASON_META.test(clause) && !SEASON_NOISE.test(clause));
  if (!clauses.length) return undefined;

  let season = clauses.join('; ')
    // "2026 season began May 9, 2026", "Starting June 20th": a start date only.
    .replace(/^(?:20\d{2}\s+season\s+)?(?:began|begins|beginning|starting|starts|start|opening|opens|opened|launching|launches)\s+(?:on\s+|in\s+)?/i, 'From ')
    .replace(MONTH_ALIAS_RE, (alias: string, _match: string, offset: number, whole: string) => monthName(alias, whole, offset) ?? alias)
    // "June17" -> "June 17"
    .replace(new RegExp(`\\b(${MONTH_FULL})(\\d)`, 'g'), '$1 $2')
    // "June 20th" -> "June 20", but "17th season" stays.
    .replace(new RegExp(`\\b(${MONTH_FULL}) (\\d{1,2})(?:st|nd|rd|th)\\b`, 'g'), '$1 $2')
    .replace(/\bthru\b/gi, 'through');

  // "May 2, 2026-October 31, 2026" -> "May 2-October 31, 2026"
  season = season.replace(
    new RegExp(`\\b((?:${MONTH_FULL}) \\d{1,2}), (20\\d{2})\\s*(?:-|through|to|until)\\s*((?:${MONTH_FULL}) \\d{1,2}), \\2\\b`, 'g'),
    '$1-$3, $2'
  );
  // "May through October", "June - October" -> "May-October". Not after a
  // qualifier ("Mid-May through October"), where a hyphen would read as a word.
  season = season.replace(
    new RegExp(`(?<![-\\w]|(?:early|late|mid|end of|the end of)\\s)(${SEASON_DATE})\\s*(?:-|through|to|until)\\s*(${SEASON_DATE})(?![\\w-])`, 'g'),
    '$1-$2'
  );
  // "Spring through Fall" -> "Spring through fall"
  season = season.replace(
    /\b(spring|summer|fall|autumn|winter)\s*(?:-|through|to|until)\s*(spring|summer|fall|autumn|winter)\b/gi,
    (_match, from: string, to: string) => `${from.toLowerCase()} through ${to.toLowerCase()}`
  );

  // "2026 Season: April 12-November 22" -> "April 12-November 22, 2026"
  season = season.replace(
    new RegExp(`^(20\\d{2})(?:\\s+(?:farmers\\s+)?(?:market\\s+)?season)?:\\s*((?:${MONTH_FULL})(?: \\d{1,2})?-(?:${MONTH_FULL})(?: \\d{1,2})?)$`, 'i'),
    '$2, $1'
  );

  season = clean(season).replace(/[\s,;.]+$/, '');
  return season ? capitalize(season) : undefined;
}

/** "2026-05-28", "2026-10-08" as "May 28-October 8, 2026". */
function formatDatedRange(start: string, end: string): string | undefined {
  const parse = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return match ? { year: match[1], month: MONTH_NAMES[Number(match[2]) - 1], day: Number(match[3]) } : undefined;
  };
  const from = parse(start);
  const to = parse(end);
  if (!from?.month || !to?.month) return undefined;
  return from.year === to.year
    ? `${from.month} ${from.day}-${to.month} ${to.day}, ${to.year}`
    : `${from.month} ${from.day}, ${from.year}-${to.month} ${to.day}, ${to.year}`;
}

/**
 * "Year-round" / "Summer, Fall" / "May-October" — the part of `season` that is
 * genuinely about the season. A `season` that is really a weekly schedule
 * ("Saturdays 8am to 1pm") returns `undefined`, because that record's day and
 * hours are already rendered in their own columns, and so does one that only
 * says the season is not published.
 */
export function marketSeasonLabel(market: MarketSeoRecord): string | undefined {
  const status = market.first_party?.operations?.status?.value.value;
  if (status === 'permanently_closed' || status === 'temporarily_closed') return undefined;
  const structured = market.first_party?.operations?.season?.value;
  if (structured?.kind === 'year_round') return 'Year-round';
  if (structured?.kind === 'dated_range') return formatDatedRange(structured.start_date, structured.end_date);
  if (structured?.kind === 'annual_range') {
    const start = MONTH_NAMES[structured.start.month - 1];
    const end = MONTH_NAMES[structured.end.month - 1];
    return start && end ? `${start}${structured.start.day ? ` ${structured.start.day}` : ''}-${end}${structured.end.day ? ` ${structured.end.day}` : ''}` : undefined;
  }
  const season = clean(market.season);
  if (!season) return undefined;
  if (isYearRound(season)) return 'Year-round';
  if (isSeasonList(season)) {
    return season
      .toLowerCase()
      .split(/[,/]| and /)
      .map((token) => capitalize(token.trim()))
      .filter(Boolean)
      .join(', ');
  }
  if (weekdaysFromText(season).length > 0) return undefined;
  return tidySeasonText(season);
}

/**
 * A season label for use mid-sentence: "Its listed season is spring through
 * fall", "listed for May-October". Season words and a leading "From" go
 * lower-case; month names keep their capital.
 */
export function seasonForSentence(label: string): string {
  return label
    .replace(/\b(Spring|Summer|Fall|Autumn|Winter|Year-round)\b/g, (word) => word.toLowerCase())
    .replace(/^(From|Through|Typically|Mid|Early|Late|Seasonal|Weekly)\b/, (word) => word.toLowerCase());
}

/** Inputs for the city page's title tag. */
export interface CityTitleInput {
  city: string;
  /** "NC" for a US state, "Ontario"/"France" where there is no 2-letter code. */
  region?: string | null;
  marketCount: number;
}

/**
 * SERP title for a city page: `Farmers Markets in Durham, NC — 2 Local Markets`.
 *
 * The count is the click driver (every competitor that outranks us carries
 * one), so it is the last clause dropped: past `TITLE_MAX_LENGTH` we drop the
 * count, then the region, rather than truncating mid-phrase.
 */
export function cityTitle({ city, region, marketCount }: CityTitleInput): string {
  const name = clean(city);
  if (!name) return 'Farmers Markets';

  const regionLabel = clean(region);
  const place = regionLabel ? `${name}, ${regionLabel}` : name;
  const count = `${marketCount} Local Market${marketCount === 1 ? '' : 's'}`;

  const candidates = [
    `Farmers Markets in ${place} - ${count}`,
    `Farmers Markets in ${place}`,
    `Farmers Markets in ${name} - ${count}`,
    `Farmers Markets in ${name}`,
  ];

  const fitting = candidates.find((candidate) => candidate.length <= TITLE_MAX_LENGTH);
  return fitting ?? truncateOnWordBoundary(`Farmers Markets in ${name}`, TITLE_MAX_LENGTH);
}

/** Inputs for the city page's meta description. */
export interface CityDescriptionInput {
  city: string;
  region?: string | null;
  marketCount: number;
  /** The most data-complete market in the city, if any. */
  notableMarket?: string | null;
  /** "Saturdays", "Saturdays 8am–1pm" — only when the record states it. */
  notableSchedule?: string | null;
  /** How many of the city's markets accept SNAP/EBT. */
  snapCount?: number;
}

/**
 * Answer-first meta description, assembled only from clauses the city's data
 * supports: count first (the question searchers actually ask), then the
 * notable market and its schedule, then SNAP, then a closing line naming what
 * the page lists. Never exceeds `DESCRIPTION_MAX_LENGTH`.
 */
export function cityDescription({
  city,
  region,
  marketCount,
  notableMarket,
  notableSchedule,
  snapCount = 0,
}: CityDescriptionInput): string {
  const name = clean(city) || 'this city';
  const regionLabel = clean(region);
  const place = regionLabel ? `${name}, ${regionLabel}` : name;

  const opening =
    marketCount === 1
      ? `There is 1 farmers market in ${place}.`
      : `There are ${marketCount} farmers markets in ${place}.`;

  const notable = clean(notableMarket);
  const schedule = clean(notableSchedule);
  const optional = [
    notable && schedule ? `${notable} is open ${schedule}.` : undefined,
    snapCount === 1
      ? '1 accepts SNAP/EBT.'
      : snapCount > 1
        ? `${snapCount} accept SNAP/EBT.`
        : undefined,
    'See addresses, days, hours and seasons.',
  ].filter((sentence): sentence is string => Boolean(sentence));

  let description = opening;
  for (const sentence of optional) {
    if (`${description} ${sentence}`.length > DESCRIPTION_MAX_LENGTH) continue;
    description = `${description} ${sentence}`;
  }

  return description.replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ *
 * State hubs (`/{state}`)
 * ------------------------------------------------------------------ */

/** Inputs for the state hub's title tag. */
export interface StateTitleInput {
  /** "Colorado", "Ontario", "France" — always spelled out. */
  state: string;
  marketCount: number;
  cityCount: number;
}

/**
 * SERP title for a state hub: `Farmers Markets in Colorado — 144 Markets`.
 *
 * Same degradation ladder as `cityTitle`: the count is the click driver, so
 * the city clause goes first and the count is the last thing dropped. Never
 * exceeds `TITLE_MAX_LENGTH`.
 */
export function stateTitle({ state, marketCount, cityCount }: StateTitleInput): string {
  const name = clean(state);
  if (!name) return 'Farmers Markets';

  const markets = `${marketCount} Market${marketCount === 1 ? '' : 's'}`;
  const cities = `${cityCount} Cit${cityCount === 1 ? 'y' : 'ies'}`;

  const candidates = [
    // A region whose markets all failed to resolve to a city has no city
    // clause to offer; "in 0 Cities" is worse than saying nothing.
    cityCount > 0 ? `Farmers Markets in ${name} - ${markets} in ${cities}` : undefined,
    `Farmers Markets in ${name} - ${markets}`,
    `Farmers Markets in ${name}`,
  ].filter((candidate): candidate is string => Boolean(candidate));

  const fitting = candidates.find((candidate) => candidate.length <= TITLE_MAX_LENGTH);
  return fitting ?? truncateOnWordBoundary(`Farmers Markets in ${name}`, TITLE_MAX_LENGTH);
}

/** Inputs for the state hub's meta description. */
export interface StateDescriptionInput {
  state: string;
  marketCount: number;
  cityCount: number;
  /** The city in the state with the most markets, if it has any cities. */
  biggestCity?: string | null;
  biggestCityCount?: number;
  /** How many of the state's markets accept SNAP/EBT. */
  snapCount?: number;
}

/**
 * Answer-first meta description for a state hub, assembled only from clauses
 * the state's data supports and capped at `DESCRIPTION_MAX_LENGTH`.
 */
export function stateDescription({
  state,
  marketCount,
  cityCount,
  biggestCity,
  biggestCityCount = 0,
  snapCount = 0,
}: StateDescriptionInput): string {
  const name = clean(state) || 'this state';

  const opening =
    marketCount === 1
      ? `There is 1 farmers market in ${name}.`
      : cityCount > 0
        ? `There are ${marketCount} farmers markets in ${name} across ${cityCount} ${
            cityCount === 1 ? 'city' : 'cities'
          }.`
        : `There are ${marketCount} farmers markets in ${name}.`;

  const biggest = clean(biggestCity);
  const optional = [
    biggest && biggestCityCount > 0
      ? `${biggest} has the most with ${biggestCityCount}.`
      : undefined,
    snapCount === 1
      ? '1 accepts SNAP/EBT.'
      : snapCount > 1
        ? `${snapCount} accept SNAP/EBT.`
        : undefined,
    'Browse every city with addresses, days and hours.',
  ].filter((sentence): sentence is string => Boolean(sentence));

  let description = opening;
  for (const sentence of optional) {
    if (`${description} ${sentence}`.length > DESCRIPTION_MAX_LENGTH) continue;
    description = `${description} ${sentence}`;
  }

  return description.replace(/\s+/g, ' ').trim();
}

/** Human-readable "Durham, North Carolina" line for on-page display. */
export function marketLocationLine(market: MarketSeoRecord): string | undefined {
  const location = resolveLocation(market);
  const country = clean(market.country);
  const isUnitedStates = (market.country_code ?? 'US').toUpperCase() === 'US';
  const state = isUnitedStates ? stateFullName(location.state) ?? location.state : location.state;

  const parts = [location.city, state, isUnitedStates ? undefined : country].filter(
    (part, index, all): part is string =>
      Boolean(part) && all.findIndex((other) => other?.toLowerCase() === part?.toLowerCase()) === index
  );

  return parts.join(', ') || undefined;
}

/* ------------------------------------------------------------------ *
 * Display address
 * ------------------------------------------------------------------ */

export interface MarketAddressParts {
  /** Street line only — "1015 Bank St". */
  street?: string;
  /** The linkable place segment — "Ottawa, ON" or "Durham, NC". */
  cityLabel?: string;
  /** "97201" or "K1S 3W7"; only when the record states one. */
  postalCode?: string;
}

/** US "97201"/"97201-1234" or Canadian "K1S 3W7" (with or without the space). */
const POSTAL_RE = /^(\d{5}(-\d{4})?|[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d)$/;

/**
 * The one address the header shows, split so the city segment can be a link.
 *
 * Rendering the raw `address` field next to a separate city line stacked two
 * near-duplicates on most pages ("1015 Bank St, Ottawa, ON" over
 * "Ottawa, Ontario, Canada"). This composes a single line from the structured
 * fields instead: tidied street, city + short state, and the postal code the
 * raw string usually drops.
 */
export function marketAddressParts(market: MarketSeoRecord): MarketAddressParts {
  const location = resolveLocation(market);

  const cityLabel = location.city
    ? `${location.city}${location.state ? `, ${location.state}` : ''}`
    : location.state || undefined;

  const rawPostal = clean((market as { zip_code?: string | null }).zip_code).toUpperCase();
  const postalCode = POSTAL_RE.test(rawPostal)
    ? rawPostal.replace(/^([A-Z]\d[A-Z])(\d[A-Z]\d)$/, '$1 $2')
    : undefined;

  return { street: location.street, cityLabel, postalCode };
}
