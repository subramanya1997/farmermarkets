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

function nameSaysMarket(name: string): boolean {
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
    label && needsKeyword ? `${name} — ${label} Farmers Market` : undefined,
    label ? `${name} — ${label}` : undefined,
    needsKeyword ? `${name} — Farmers Market` : undefined,
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
      '$1–$2'
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
