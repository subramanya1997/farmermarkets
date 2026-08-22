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
  const name = clean(rawName);
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
export function marketTitle(market: MarketSeoRecord): string {
  const name = displayName(market.name);
  if (!name) return 'Farmers Market';

  const label = locationLabel(resolveLocation(market));
  const needsKeyword = !nameSaysMarket(name);

  const candidates = [
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

function isYearRound(season: string): boolean {
  return /^year[\s-]?round$/i.test(season.trim());
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Tidy the many clock formats in the data down to one readable style. */
export function formatSchedule(value: string): string {
  return clean(value)
    // "08:30:00" -> "08:30"
    .replace(/(\d{1,2}:\d{2}):\d{2}/g, '$1')
    // "11:00 AM" -> "11am", "03:30 PM" -> "3:30pm"
    .replace(/\b0?(\d{1,2}):(\d{2})\s*([AaPp])\.?[Mm]\.?/g, (_match, hour, minute, meridiem) =>
      minute === '00' ? `${hour}${meridiem.toLowerCase()}m` : `${hour}:${minute}${meridiem.toLowerCase()}m`
    )
    // "8 am" -> "8am"
    .replace(/\b(\d{1,2})\s+([ap])\.?m\.?/gi, (_match, hour, meridiem) => `${hour}${meridiem.toLowerCase()}m`)
    // "08:30" -> "8:30"
    .replace(/\b0(\d:\d{2})/g, '$1')
    // en dash between two times, but never for "Monday to Sunday"
    .replace(
      /(\d{1,2}(?::\d{2})?(?:\s?[ap]m)?)\s*(?:-|–|to|tp)\s*(\d{1,2}(?::\d{2})?(?:\s?[ap]m)?)/gi,
      '$1-$2'
    )
    .trim();
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
  const days = (market.days ?? []).map(clean).filter(Boolean);
  const season = clean(market.season);

  const weekdayNames = days.filter((day) => WEEKDAYS.has(day.toLowerCase()));
  if (weekdayNames.length === days.length && weekdayNames.length > 0) {
    const pluralized = weekdayNames
      .map((day) => `${day[0].toUpperCase()}${day.slice(1).toLowerCase()}s`)
      .slice(0, 3);
    const clause = joinWithAnd(pluralized);
    // A weekday-only list pairs well with English opening times from `season`.
    if (season && !isSeasonList(season) && !isYearRound(season)) {
      return `Open ${formatSchedule(season)}`;
    }
    return `Open ${clause}`;
  }

  if (days.length > 0) {
    // Localized feeds repeat the same slot per language (FR then NL); one is enough.
    return `Open ${formatSchedule(days[0])}`;
  }

  if (season && !isSeasonList(season) && !isYearRound(season)) {
    return `Open ${formatSchedule(season)}`;
  }

  return undefined;
}

/** "Open year-round" / "Open in spring and summer" when `season` is a season. */
function seasonClause(market: MarketSeoRecord): string | undefined {
  const season = clean(market.season);
  if (!season) return undefined;

  if (isYearRound(season)) return 'Open year-round';
  if (!isSeasonList(season)) return undefined;

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
  const street = location.street && location.street.length <= 60 ? location.street : undefined;
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
  // "Open Saturdays 8am–12pm, April–November."
  const timing = schedule && season
    ? `${schedule}, ${season.replace(/^Open (in )?/, '')}.`
    : schedule
      ? `${schedule}.`
      : season
        ? `${season}.`
        : undefined;

  const optional = [
    timing,
    paymentClause(market) ? `${paymentClause(market)}.` : undefined,
    county ? `Located in ${county}.` : undefined,
  ].filter((sentence): sentence is string => Boolean(sentence));

  let description = opening;
  for (const sentence of optional) {
    if (`${description} ${sentence}`.length > DESCRIPTION_MAX_LENGTH) continue;
    description = `${description} ${sentence}`;
  }

  // A bare "Name in City ST." snippet wastes the slot; a short, true closing
  // line about what the page offers reads better and carries the keywords.
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
 * City pages (`/farmers-markets/{state}/{city}`)
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

export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export type Weekday = (typeof WEEKDAY_NAMES)[number];

/**
 * Weekday spellings that appear in the data: English (full, plural, 3-letter)
 * plus French and Dutch, which the Brussels and French market feeds ship, and
 * German/Spanish/Italian for the smaller European sources.
 */
const WEEKDAY_ALIASES: Record<Weekday, string[]> = {
  Monday: ['monday', 'mondays', 'mon', 'lundi', 'lundis', 'maandag', 'montag', 'lunes', 'lunedi'],
  Tuesday: ['tuesday', 'tuesdays', 'tue', 'tues', 'mardi', 'mardis', 'dinsdag', 'dienstag', 'martes', 'martedi'],
  Wednesday: [
    'wednesday',
    'wednesdays',
    'wed',
    'weds',
    'mercredi',
    'mercredis',
    'woensdag',
    'mittwoch',
    'miercoles',
    'mercoledi',
  ],
  Thursday: [
    'thursday',
    'thursdays',
    'thu',
    'thur',
    'thurs',
    'jeudi',
    'jeudis',
    'donderdag',
    'donnerstag',
    'jueves',
    'giovedi',
  ],
  Friday: ['friday', 'fridays', 'fri', 'vendredi', 'vendredis', 'vrijdag', 'freitag', 'viernes', 'venerdi'],
  Saturday: [
    'saturday',
    'saturdays',
    'sat',
    'samedi',
    'samedis',
    'zaterdag',
    'samstag',
    'sonnabend',
    'sabado',
    'sabato',
  ],
  Sunday: ['sunday', 'sundays', 'sun', 'dimanche', 'dimanches', 'zondag', 'sonntag', 'domingo', 'domenica'],
};

const WEEKDAY_BY_ALIAS = new Map<string, number>();
for (const [index, day] of WEEKDAY_NAMES.entries()) {
  for (const alias of WEEKDAY_ALIASES[day]) WEEKDAY_BY_ALIAS.set(alias, index);
}

// Longest alias first so "saturdays" never matches as "sat" + leftovers.
const WEEKDAY_ALTERNATION = [...WEEKDAY_BY_ALIAS.keys()]
  .sort((left, right) => right.length - left.length)
  .join('|');
const WEEKDAY_RE = new RegExp(`\\b(${WEEKDAY_ALTERNATION})\\b`, 'g');
const WEEKDAY_RANGE_RE = new RegExp(
  `\\b(${WEEKDAY_ALTERNATION})\\b\\s*(?:-|–|—|to|through|thru|t\\/m|au)\\s*\\b(${WEEKDAY_ALTERNATION})\\b`,
  'g'
);
const EVERY_DAY_RE = /\b(daily|every ?day|7 days a week|tous les jours|elke dag)\b/;

/** Lower-case and strip accents so "Mercredi" and "mercredi" are one token. */
function foldForMatching(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Every weekday named anywhere in a free-text schedule string, in week order.
 *
 * Handles the three shapes the data uses: single names ("saturday"), inclusive
 * ranges that wrap the week ("Mon-Sat", "Friday to Sunday"), and "Daily".
 */
export function weekdaysFromText(value?: string | null): Weekday[] {
  const text = foldForMatching(clean(value));
  if (!text) return [];

  const found = new Set<number>();
  if (EVERY_DAY_RE.test(text)) {
    return [...WEEKDAY_NAMES];
  }

  for (const match of text.matchAll(WEEKDAY_RANGE_RE)) {
    const start = WEEKDAY_BY_ALIAS.get(match[1]);
    const end = WEEKDAY_BY_ALIAS.get(match[2]);
    if (start === undefined || end === undefined) continue;
    const span = (end - start + 7) % 7;
    for (let step = 0; step <= span; step += 1) found.add((start + step) % 7);
  }

  for (const match of text.matchAll(WEEKDAY_RE)) {
    const index = WEEKDAY_BY_ALIAS.get(match[1]);
    if (index !== undefined) found.add(index);
  }

  return WEEKDAY_NAMES.filter((_day, index) => found.has(index));
}

/** The weekdays a market trades on, read from `days` and from `season`. */
export function marketWeekdays(market: MarketSeoRecord): Weekday[] {
  const found = new Set<Weekday>();
  for (const source of [...(market.days ?? []), market.season]) {
    for (const day of weekdaysFromText(source)) found.add(day);
  }
  return WEEKDAY_NAMES.filter((day) => found.has(day));
}

const TIME = String.raw`\d{1,2}(?::\d{2})?(?::\d{2})?\s*(?:[ap]\.?m\.?)?`;
const TIME_RANGE_RE = new RegExp(`(${TIME})\\s*(?:-|–|—|to|until|till|tot|tp)\\s*(${TIME})`, 'i');

/** A bare "31" is a date; a clock time carries a colon or a meridiem. */
function isClockTime(value: string): boolean {
  return /:/.test(value) || /[ap]\.?m\.?/i.test(value);
}

/**
 * "8am–1pm" — the opening times, when the record states any. Returns
 * `undefined` for the ~80% of records that only say which day they open, so
 * the Hours column disappears instead of filling with dashes.
 */
export function marketHours(market: MarketSeoRecord): string | undefined {
  for (const source of [...(market.days ?? []), market.season]) {
    const text = clean(source);
    if (!text) continue;
    const match = TIME_RANGE_RE.exec(text);
    if (!match || !isClockTime(match[1]) || !isClockTime(match[2])) continue;
    return formatSchedule(`${match[1].trim()}-${match[2].trim()}`);
  }
  return undefined;
}

function capitalize(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

/**
 * "Year-round" / "Summer, Fall" / "May–Oct" — the part of `season` that is
 * genuinely about the season. A `season` that is really a weekly schedule
 * ("Saturdays 8am to 1pm") returns `undefined`, because that record's day and
 * hours are already rendered in their own columns.
 */
export function marketSeasonLabel(market: MarketSeoRecord): string | undefined {
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

  // "May-Oct" / "June 1-October 31" — an en dash reads better between months.
  return formatSchedule(season).replace(/([A-Za-z0-9])\s*-\s*([A-Za-z])/g, '$1-$2');
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
 * State hubs (`/farmers-markets/{state}`)
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
