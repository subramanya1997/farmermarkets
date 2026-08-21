/**
 * Geography primitives shared by the runtime (`src/lib/seo.ts`, page code) and
 * the offline index builder (`scripts/build-geo-index.mjs`).
 *
 * The two datasets under `public/data/` disagree with themselves about how a
 * location is written down: the legacy USDA export spells states out ("New
 * York") on some rows and abbreviates them ("NY") on others, repeats the city
 * and state inside `address`, and leaves `city`/`state` null on ~2,200 rows
 * that name the place in the address string anyway. Every rule for reading a
 * location out of that mess lives here, once, so a page and the committed
 * `public/data/geo_index.json` can never disagree about which state a market
 * is in.
 *
 * Nothing in this module imports anything: the build script loads it directly
 * through Node's type stripping (`node --experimental-strip-types`), which
 * only works for a file with no runtime dependencies and no path aliases.
 */

/** Collapse whitespace and stray ellipses; the entry point for any raw field. */
export function clean(value?: string | null): string {
  return (value ?? '')
    .replace(/\s+/g, ' ')
    // Some source names are already truncated with "..."; keep that as a single
    // ellipsis so a sentence never ends in a run of dots.
    .replace(/\.{2,}/g, '…')
    // En/em dashes read as machine-written; plain hyphens everywhere. Safe for
    // the schedule parsers downstream: every dash alternation accepts "-".
    .replace(/[–—]/g, '-')
    // Upstream strings carry their own punctuation spacing ("4pm-7pm , Sat"),
    // and a few names do too ("Agricenter International , Farmers Market").
    // Only comma and period: French typography legitimately spaces ":;!?".
    .replace(/ +([,.])/g, '$1')
    .trim();
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

/** Canadian provinces and territories; the gov feeds ship Ontario markets. */
const PROVINCE_NAME_TO_ABBREVIATION: Record<string, string> = {
  alberta: 'AB',
  'british columbia': 'BC',
  manitoba: 'MB',
  'new brunswick': 'NB',
  'newfoundland and labrador': 'NL',
  'northwest territories': 'NT',
  'nova scotia': 'NS',
  nunavut: 'NU',
  ontario: 'ON',
  'prince edward island': 'PE',
  quebec: 'QC',
  québec: 'QC',
  saskatchewan: 'SK',
  yukon: 'YT',
};

const ABBREVIATION_TO_PROVINCE_NAME: Record<string, string> = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador',
  NT: 'Northwest Territories',
  NS: 'Nova Scotia',
  NU: 'Nunavut',
  ON: 'Ontario',
  PE: 'Prince Edward Island',
  QC: 'Quebec',
  SK: 'Saskatchewan',
  YT: 'Yukon',
};

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

/** Two-letter code for a Canadian province written either way round. */
export function provinceAbbreviation(province?: string | null): string | undefined {
  const value = province?.trim();
  if (!value) return undefined;

  const byName = PROVINCE_NAME_TO_ABBREVIATION[value.toLowerCase()];
  if (byName) return byName;

  const upper = value.toUpperCase();
  return ABBREVIATION_TO_PROVINCE_NAME[upper] ? upper : undefined;
}

/** Full province name for a Canadian province written either way round. */
export function provinceFullName(province?: string | null): string | undefined {
  const abbreviation = provinceAbbreviation(province);
  return abbreviation ? ABBREVIATION_TO_PROVINCE_NAME[abbreviation] : undefined;
}

const COUNTRY_TOKENS = new Set([
  'us',
  'u.s.',
  'u.s.a.',
  'usa',
  'united states',
  'united states of america',
]);

/** True for the 166 rows whose `state` column says "USA" rather than a state. */
export function isCountryToken(value?: string | null): boolean {
  return COUNTRY_TOKENS.has(clean(value).toLowerCase());
}

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
export function normalizeStateValue(raw?: string | null): string {
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

/** The subset of a market record the location rules read. */
export interface GeoRecord {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  country?: string | null;
  country_code?: string | null;
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
export function resolveLocation(market: GeoRecord): ResolvedLocation {
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

/**
 * URL slug for a city or region name: diacritics folded, punctuation dropped,
 * words joined with hyphens ("Woluwe-Saint-Lambert" → "woluwe-saint-lambert",
 * "St. Paul" → "st-paul"). Folding is what merges the several spellings of one
 * city in the data into a single city page.
 */
export function toSlug(value: string): string {
  return clean(value)
    .normalize('NFD')
    // Strip combining marks so "Montréal" and "Montreal" land on one slug.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Rough bounding boxes, used only to catch a record whose state field cannot
 * possibly belong with its coordinates (a Singapore market filed under
 * "Ontario"). Deliberately generous — a false negative just leaves a record
 * alone, while a false positive would delete a real state.
 */
type BoundingBox = [number, number, number, number]; // [minLat, maxLat, minLon, maxLon]

const UNITED_STATES_BOXES: BoundingBox[] = [
  [24.0, 49.6, -125.1, -66.8], // contiguous 48
  [51.0, 72.0, -180.0, -129.0], // Alaska
  [51.0, 54.0, 172.0, 180.0], // Aleutians across the antimeridian
  [18.5, 22.5, -161.0, -154.5], // Hawaii
  [17.5, 18.7, -68.0, -64.4], // Puerto Rico and the US Virgin Islands
  [13.0, 21.0, 144.0, 146.3], // Guam and the Northern Mariana Islands
  [-15.0, -10.9, -171.5, -168.0], // American Samoa
];

const CANADA_BOXES: BoundingBox[] = [[41.5, 83.5, -141.5, -52.0]];

function isInside(boxes: BoundingBox[], lat: number, lon: number): boolean {
  return boxes.some(
    ([minLat, maxLat, minLon, maxLon]) => lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon
  );
}

/** Coordinates plausibly inside the United States (including territories). */
export function isWithinUnitedStates(lat: number, lon: number): boolean {
  return isInside(UNITED_STATES_BOXES, lat, lon);
}

/** Coordinates plausibly inside Canada. */
export function isWithinCanada(lat: number, lon: number): boolean {
  return isInside(CANADA_BOXES, lat, lon);
}

/**
 * True when `state` names a US state or Canadian province but the coordinates
 * are somewhere else entirely — the shape of the corrupt rows the geo index
 * has to drop rather than publish as a city page in the wrong country.
 */
export function isImpossibleStateForCoordinates(
  state: string | null | undefined,
  lat?: number | null,
  lon?: number | null
): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;

  const latitude = lat as number;
  const longitude = lon as number;
  const value = normalizeStateValue(state);
  if (!value) return false;

  if (stateAbbreviation(value)) return !isWithinUnitedStates(latitude, longitude);
  if (provinceAbbreviation(value)) return !isWithinCanada(latitude, longitude);
  return false;
}

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance in kilometres. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}
