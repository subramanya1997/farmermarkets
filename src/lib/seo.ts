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

/** Google truncates SERP titles at roughly 60 characters. */
export const TITLE_MAX_LENGTH = 60;
/** Upper bound for descriptions; ~160 chars is where Google clips the snippet. */
export const DESCRIPTION_MAX_LENGTH = 160;
/** Below this we top the description up with a generic (but true) closing line. */
const DESCRIPTION_PAD_THRESHOLD = 110;

/** The subset of a market record this module reads. */
export interface MarketSeoRecord {
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  country?: string | null;
  country_code?: string | null;
  county?: string | null;
  season?: string | null;
  days?: string[] | null;
  snap?: boolean;
  wic?: boolean;
  fmnp?: boolean;
  sfmnp?: boolean;
}

/** US states, DC, and the inhabited territories. Display mapping only. */
const STATE_NAME_TO_ABBREVIATION: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
  'washington dc': 'DC',
  'washington, d.c.': 'DC',
  'american samoa': 'AS',
  guam: 'GU',
  'northern mariana islands': 'MP',
  'puerto rico': 'PR',
  'u.s. virgin islands': 'VI',
  'us virgin islands': 'VI',
  'virgin islands': 'VI',
};

const ABBREVIATION_TO_STATE_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAME_TO_ABBREVIATION).map(([name, abbreviation]) => [
    abbreviation,
    name.replace(/\b[a-z]/g, (letter) => letter.toUpperCase()),
  ])
);

/**
 * Two-letter abbreviation for a US state written either way round
 * ("New York" and "NY" both yield "NY"). Returns undefined for anything that
 * is not a US state/territory, so callers can fall back to the raw value.
 */
export function stateAbbreviation(state?: string | null): string | undefined {
  const value = state?.trim();
  if (!value) return undefined;

  const byName = STATE_NAME_TO_ABBREVIATION[value.toLowerCase()];
  if (byName) return byName;

  const upper = value.toUpperCase();
  return ABBREVIATION_TO_STATE_NAME[upper] ? upper : undefined;
}

/** Full state name for a US state written either way round. */
export function stateFullName(state?: string | null): string | undefined {
  const abbreviation = stateAbbreviation(state);
  return abbreviation ? ABBREVIATION_TO_STATE_NAME[abbreviation] : undefined;
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
 */
function displayName(rawName: string): string {
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

function clean(value?: string | null): string {
  return (value ?? '')
    .replace(/\s+/g, ' ')
    // Some source names are already truncated with "..."; keep that as a single
    // ellipsis so a sentence never ends in a run of dots.
    .replace(/\.{2,}/g, '…')
    .trim();
}

const COUNTRY_TOKENS = new Set([
  'us',
  'u.s.',
  'u.s.a.',
  'usa',
  'united states',
  'united states of america',
]);

const ZIP_PATTERN = /^\d{5}(-\d{4})?$/;

const STREET_ABBREVIATIONS: Record<string, string> = {
  street: 'St',
  road: 'Rd',
  avenue: 'Ave',
  boulevard: 'Blvd',
  drive: 'Dr',
  lane: 'Ln',
  court: 'Ct',
  place: 'Pl',
  parkway: 'Pkwy',
  highway: 'Hwy',
  square: 'Sq',
  terrace: 'Ter',
  circle: 'Cir',
  trail: 'Trl',
};

/** Compass points stay upper-case when an address is un-shouted. */
const DIRECTION_TOKENS = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']);
/** Upper-case street-suffix abbreviations worth un-shouting on their own. */
const SHOUTED_SUFFIXES = new Set([
  'ST', 'RD', 'AVE', 'BLVD', 'DR', 'LN', 'CT', 'PL', 'HWY', 'PKWY', 'TER', 'CIR', 'TRL', 'WAY',
]);

function titleCaseWord(word: string): string {
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}

function titleCaseIfShouting(value: string): string {
  // Several government feeds ship addresses in all caps ("2757 TAPO CANYON RD").
  const shouting = /[A-Z]/.test(value) && !/[a-z]/.test(value);
  return value.replace(/[A-Za-zÀ-ÿ']+/g, (word) => {
    if (shouting) return DIRECTION_TOKENS.has(word) ? word : titleCaseWord(word);
    // Otherwise only un-shout a lone suffix in an otherwise normal line ("200 Wall ST").
    return SHOUTED_SUFFIXES.has(word) ? titleCaseWord(word) : word;
  });
}

/**
 * Shorten a trailing US street suffix ("501 Foster Street" -> "501 Foster St")
 * to buy characters in the snippet. Only the final word is touched, so
 * non-English addresses that open with the type word ("Avenue de Mai 2",
 * "Rue des Deux Eglises 115") are left exactly as they are.
 */
function abbreviateStreet(street: string): string {
  return street.replace(/([A-Za-z]+)$/, (word) => STREET_ABBREVIATIONS[word.toLowerCase()] ?? word);
}

/**
 * Clean up a state value written as more than the state: "OR, USA" and
 * "MN 55103" both appear in the data and both mean the state alone.
 */
function normalizeStateValue(raw?: string | null): string {
  const segments = clean(raw)
    .split(',')
    .map((segment) => clean(segment))
    .filter((segment) => segment && !COUNTRY_TOKENS.has(segment.toLowerCase()));

  const first = segments[0] ?? '';
  if (!first || ZIP_PATTERN.test(first)) return '';
  return clean(first.replace(/[\s,]+\d{5}(-\d{4})?$/, ''));
}

/**
 * Trim the city/state/zip tail that many addresses glue onto the street line
 * without a comma ("2511 Reynolds Road Ashton, IL 61006"), then normalize case
 * and shorten the street suffix.
 */
function tidyStreet(rawStreet: string, city: string, state: string): string | undefined {
  let street = clean(rawStreet);
  if (!street) return undefined;

  const tails = [
    /[\s,]+\d{5}(-\d{4})?$/,
    state ? new RegExp(`[\\s,]+${escapeForRegExp(state)}$`, 'i') : undefined,
    state && stateAbbreviation(state)
      ? new RegExp(`[\\s,]+${stateAbbreviation(state)}$`, 'i')
      : undefined,
    state && stateFullName(state)
      ? new RegExp(`[\\s,]+${escapeForRegExp(stateFullName(state) as string)}$`, 'i')
      : undefined,
    city ? new RegExp(`[\\s,]+${escapeForRegExp(city)}$`, 'i') : undefined,
  ].filter((pattern): pattern is RegExp => Boolean(pattern));

  // Two passes: the tail is usually "<city>, <ST> <zip>", stripped inside out.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const pattern of tails) {
      const trimmed = clean(street.replace(pattern, ''));
      if (trimmed) street = trimmed;
    }
  }

  street = abbreviateStreet(titleCaseIfShouting(street))
    .replace(/[\s,;]+$/, '')
    // Stripping the city can leave the preposition that introduced it
    // ("The Shoppes in") pointing at nothing.
    .replace(/[\s,]+(in|at|on|near|by|behind|across from|the|and|of)$/i, '');
  return street || undefined;
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface ResolvedLocation {
  /** Street portion of the address, with the city/state/zip tail removed. */
  street?: string;
  city?: string;
  /** State as it should be displayed: 2-letter for US, raw value otherwise. */
  state?: string;
}

/**
 * Work out street / city / state for one record.
 *
 * The `address` field is not consistent across sources: the legacy USDA export
 * repeats the city, state and zip inside it ("501 Foster Street, Durham, North
 * Carolina, 27701") while the government feeds ship a bare street line. On top
 * of that, 1,843 records have null `city`/`state` even though the address
 * string names them, so when those fields are missing we recover them from the
 * tail of the address instead of dropping the location entirely.
 */
export function resolveLocation(market: MarketSeoRecord): ResolvedLocation {
  const zip = clean(market.zip_code);
  let city = clean(market.city);
  let state = normalizeStateValue(market.state);

  let parts = clean(market.address)
    .split(',')
    .map((part) => clean(part))
    .filter(Boolean);

  const isDroppableTail = (part: string) =>
    COUNTRY_TOKENS.has(part.toLowerCase()) || ZIP_PATTERN.test(part) || (Boolean(zip) && part === zip);

  // Drop trailing country and zip parts; they never belong in a snippet.
  while (parts.length > 1 && isDroppableTail(parts[parts.length - 1])) {
    parts.pop();
  }

  // "Beaumont Texas 77707" — no commas, and city/state null on the record. The
  // trailing zip is what makes this shape safe to read as "<city> <state> <zip>";
  // without it a street ending in "…Washington" would be misread as a state.
  if (!state && parts.length === 1 && /\s\d{5}(-\d{4})?$/.test(parts[0])) {
    const withoutZip = clean(parts[0].replace(/\s+\d{5}(-\d{4})?$/, ''));
    const stateMatch = withoutZip.match(/^(.*?)[\s,]+([A-Za-z][A-Za-z. ]+)$/);
    if (stateMatch && stateAbbreviation(stateMatch[2])) {
      state = clean(stateMatch[2]);
      const remainder = clean(stateMatch[1]);
      if (!city && remainder && !/\d/.test(remainder)) {
        city = remainder;
        parts = [];
      } else {
        parts = remainder ? [remainder] : [];
      }
    }
  }

  // Two passes so an address that repeats the location twice
  // ("2042 Elgin St, Arva, ON, Arva, Ontario") is fully unwound.
  for (let pass = 0; pass < 2; pass += 1) {
    // Drop a trailing state, however it is spelled and whether or not the zip
    // is glued to it ("North Carolina", "NC", "MN 55103"). A bare 2–3 letter
    // code counts too once we already know the state, which covers the
    // non-US region codes ("ON" for Ontario) we do not map.
    if (parts.length > 1) {
      const candidate = normalizeStateValue(parts[parts.length - 1]);
      const matchesRecord = Boolean(state) && candidate.toLowerCase() === state.toLowerCase();
      const looksLikeState =
        Boolean(stateAbbreviation(candidate)) &&
        (!state || stateAbbreviation(candidate) === stateAbbreviation(state));
      const looksLikeRegionCode = Boolean(state) && /^[A-Z]{2,3}$/.test(candidate);
      if (candidate && (matchesRecord || looksLikeState || looksLikeRegionCode)) {
        if (!state) state = candidate;
        parts.pop();
      }
    }

    // Then a trailing city — only when we can name it, so an unrelated last
    // line ("behind Stafford Hospital") is never mistaken for the city.
    if (parts.length > 1) {
      const last = parts[parts.length - 1];
      if (city ? last.toLowerCase() === city.toLowerCase() : Boolean(state) && pass === 0) {
        if (!city) city = last;
        parts.pop();
      }
    }
  }

  // A single leftover part that is just the city (no street) is not a street.
  if (parts.length === 1 && city && parts[0].toLowerCase() === city.toLowerCase()) {
    parts = [];
  }

  const street = tidyStreet(parts.join(', '), city, state);

  const isUnitedStates =
    !market.country_code || market.country_code.toUpperCase() === 'US' || !market.country;
  const abbreviation = stateAbbreviation(state);
  const stateDisplay = abbreviation && (isUnitedStates || abbreviation === state.toUpperCase())
    ? abbreviation
    : state || undefined;

  // "Colorado, Colorado" and "Singapore, Singapore" read as a data glitch.
  const cityDisplay =
    city && stateDisplay && city.toLowerCase() === stateDisplay.toLowerCase() ? undefined : city || undefined;

  return {
    street: street || undefined,
    city: cityDisplay,
    state: stateDisplay,
  };
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
