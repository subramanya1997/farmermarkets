/**
 * View model for the state hubs (`/{state}`, e.g. `/new-york`).
 *
 * Same contract as `src/lib/cityPage.ts`: the page component renders this and
 * nothing else, and no sentence here invents a claim — a clause whose input is
 * missing is dropped rather than filled in.
 *
 * The hub replaces the old `/markets/state/{state}` pages, which filtered on
 * the raw `state` value in the records and so split "NY" and "New York" into
 * two competing pages. This one is keyed on the geo index, where the two
 * spellings were already collapsed into a single entry.
 */

import 'server-only';
import { getGeoIndex, getStateByCode, type GeoCity, type GeoState } from './geoIndex';
import { getMarketBySlug, type FarmerMarket } from './data';
import { resolveLocation } from './geo';
import { newerInstant, toIsoInstant } from './dates';
import { isMarketAlias } from './marketAliases';
import { tidyHours } from './marketDisplay';
import {
  WEEKDAY_NAMES,
  displayName,
  marketHours,
  marketWeekdays,
  stateDescription,
  stateTitle,
  type Weekday,
} from './seo';

/**
 * Canonical path for a state hub.
 *
 * Hubs sit at the site root (`/new-york`). They lived under
 * `/farmers-markets/` until October 2026; `next.config.ts` 308s those URLs
 * here. A state slug can never shadow a real page: static routes win over the
 * `[state]` segment, and `scripts/build-geo-index.test.mjs` fails if a slug
 * ever collides with one.
 */
export function statePath(stateSlug: string): string {
  return `/${stateSlug}`;
}

/** One dot on the hub's map. */
export interface StateMapPoint {
  slug: string;
  name: string;
  /** City name, empty for a market whose city never resolved. */
  city: string;
  lat: number;
  lon: number;
}

/** One entry in the hub's city directory. */
export interface StateCityLink {
  name: string;
  slug: string;
  href: string;
  marketCount: number;
}

/** One of the handful of markets the hub names outright. */
export interface StateNotableMarket {
  slug: string;
  name: string;
  href: string;
  /** "Denver, Colorado" — where the market sits inside the state. */
  cityName: string;
  cityHref: string;
  address?: string;
  days: Weekday[];
  hours?: string;
  snap: boolean;
}

/** How many of the state's markets trade on one weekday. */
export interface StateWeekdayCount {
  day: Weekday;
  count: number;
}

export interface StatePageData {
  state: GeoState;
  /** Root-relative canonical path. */
  path: string;
  /** "Colorado" / "Ontario" / "France" — always spelled out. */
  regionFull: string;
  marketCount: number;
  cityCount: number;
  snapCount: number;
  /** Every city in the state, largest first. */
  cities: StateCityLink[];
  /** Empty unless at least `NOTABLE_MIN` markets clear the bar. */
  notableMarkets: StateNotableMarket[];
  /**
   * Markets per weekday, Monday first, from the parsed schedules. Empty when
   * no market in the state has a weekday the reader can parse.
   */
  weekdayCounts: StateWeekdayCount[];
  /** Every market in the state whose record carries coordinates. */
  mapPoints: StateMapPoint[];
  /**
   * True when the hub has no city list to offer — every one of its markets
   * failed to resolve to a city. The page stays crawlable (a market page
   * breadcrumbs through it) but does not ask to be indexed.
   */
  noindex: boolean;
  title: string;
  description: string;
  /**
   * One short sentence under the H1, or undefined when the data has nothing
   * worth saying in words (the stat chips already carry the counts).
   */
  summary?: string;
  /**
   * Newest `last_updated` among the markets this hub covers, as an ISO
   * instant, or undefined when none of them carries a usable date.
   *
   * Identical by construction to the `lastmod` `sitemapEntries.ts` publishes
   * for the same URL: both walk `state.cities[].market_slugs`, so the page's
   * JSON-LD `dateModified` and the sitemap can never disagree.
   */
  lastModified?: string;
}

/**
 * How many markets the hub names outright, and the fewest worth a section.
 *
 * The city directory is the page's substance; the notable list gives a reader
 * a direct hop to a few well-documented markets. Fewer than four good picks
 * reads as filler, so the block is left out instead.
 */
const NOTABLE_LIMIT = 8;
const NOTABLE_MIN = 4;
/** No more than this many picks from one city, so the list spans the state. */
const NOTABLE_PER_CITY = 2;
/**
 * The weekday tally needs enough parsed schedules to mean something: at least
 * this many markets, and this share of the state's markets.
 */
const WEEKDAY_MIN_MARKETS = 10;
const WEEKDAY_MIN_SHARE = 0.2;

/**
 * Names that are not farmers markets even when a feed lists them as one:
 * seasonal fairs, flea and craft markets, single-farm stands.
 */
const NOT_A_FARMERS_MARKET =
  /\b(christmas|holiday|xmas|flea|antiques?|swap meet|craft (fair|show|market)|brocante|chineurs|puces|vide[- ]greniers?|farm ?stand|roadside stand|produce stand|pick[- ]your[- ]own|u-?pick)\b/i;

const NOT_A_FARMERS_MARKET_TYPES = new Set(['community garden', 'food cooperative pickup']);

function isFarmersMarket(market: FarmerMarket): boolean {
  if (NOT_A_FARMERS_MARKET.test(market.name)) return false;
  return !(market.organization_types ?? []).some((type) =>
    NOT_A_FARMERS_MARKET_TYPES.has(type.trim().toLowerCase())
  );
}

/**
 * "Alturas Farmers Market" and "Alturas Fm" are one market to a reader: drop
 * punctuation and the generic words, keep what names the place.
 */
export function notableKey(name: string, city: string): string {
  const core = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word && !GENERIC_WORDS.has(word))
    // "Association II" and "Association IV" are one operator's sites.
    .filter((word, index, words) => index === 0 || index < words.length - 1 || !/^[ivx]+$/.test(word))
    .join(' ');
  return `${core}|${city.trim().toLowerCase()}`;
}

const GENERIC_WORDS = new Set([
  'the', 'of', 'at', 'and', 'in', 'on',
  'farmers', 'farmer', 'market', 'markets', 'fm', 'cfm', 'certified', 'inc',
]);

/**
 * Ranking by real signals: a schedule researched from the market's own site
 * outranks a feed row, a current source outranks a stale one, and SNAP plus
 * stated days and hours are what a visitor needs to go. Records the upstream
 * directory dropped sink.
 */
function scoreMarket(market: FarmerMarket, days: Weekday[], hours?: string): number {
  return (
    (market.first_party?.operations?.schedules?.length ? 8 : market.first_party ? 4 : 0) +
    (market.enrichment ? 2 : 0) +
    (market.verified ? 2 : 0) +
    (market.snap ? 2 : 0) +
    (hours ? 2 : 0) +
    (days.length > 0 ? 1 : 0) -
    (market.unverified ? 6 : 0)
  );
}

/** "Saturday is the busiest market day." from the weekday tally, or nothing. */
function buildSummary(weekdayCounts: StateWeekdayCount[]): string | undefined {
  const ranked = [...weekdayCounts].sort((left, right) => right.count - left.count);
  const [top, second] = ranked;
  if (!top || top.count === 0) return undefined;
  if (second && second.count === top.count) {
    return `${top.day} and ${second.day} are the busiest market days.`;
  }
  return `${top.day} is the busiest market day.`;
}

function cityLink(state: GeoState, city: GeoCity): StateCityLink {
  return {
    name: city.name,
    slug: city.slug,
    href: `${statePath(state.slug)}/${city.slug}`,
    marketCount: city.market_count,
  };
}

/** A market's pin, or undefined when the record has no usable coordinates. */
function mapPoint(market: FarmerMarket, city: string): StateMapPoint | undefined {
  const lat = market.location?.lat;
  const lon = market.location?.lon;
  if (typeof lat !== 'number' || typeof lon !== 'number' || (!lat && !lon)) return undefined;
  // Five decimals is about a metre, and keeps the 1,000-pin hubs' payload down.
  return {
    slug: market.slug,
    name: displayName(market.name),
    city,
    lat: Number(lat.toFixed(5)),
    lon: Number(lon.toFixed(5)),
  };
}

/**
 * The state's best-documented farmers markets, its SNAP tally and its
 * weekday tally.
 *
 * Every record in the state is read: `getMarketBySlug` is an O(1) map lookup
 * over the already-memoized dataset, so the whole 60-hub prerender costs one
 * pass over the dataset in total.
 */
async function collectNotable(
  state: GeoState
): Promise<{
  notable: StateNotableMarket[];
  snapCount: number;
  weekdayCounts: StateWeekdayCount[];
  lastModified?: string;
  mapPoints: StateMapPoint[];
}> {
  const scored: { entry: StateNotableMarket; score: number; cityRank: number }[] = [];
  let snapCount = 0;
  let lastModified: string | undefined;
  const mapPoints: StateMapPoint[] = [];
  const perDay = new Map<Weekday, number>();
  let withDays = 0;
  const tally = (days: Weekday[]) => {
    if (days.length > 0) withDays += 1;
    for (const day of days) perDay.set(day, (perDay.get(day) ?? 0) + 1);
  };

  for (const [cityRank, city] of state.cities.entries()) {
    for (const slug of city.market_slugs) {
      const market = await getMarketBySlug(slug);
      if (!market) continue;
      if (market.snap === true) snapCount += 1;
      lastModified = newerInstant(lastModified, toIsoInstant(market.last_updated));

      const point = mapPoint(market, city.name);
      if (point) mapPoints.push(point);

      const days = marketWeekdays(market);
      tally(days);

      const hours = tidyHours(marketHours(market));
      // A pick has to tell a visitor when to go, and has to be a farmers
      // market rather than a fair, a stand or a second row for one market.
      if (days.length === 0 || !hours || isMarketAlias(market.id) || !isFarmersMarket(market)) continue;
      scored.push({
        entry: {
          slug: market.slug,
          name: displayName(market.name),
          href: `/markets/${market.slug}`,
          cityName: city.name,
          cityHref: `${statePath(state.slug)}/${city.slug}`,
          address: resolveLocation(market).street,
          days,
          hours,
          snap: market.snap === true,
        },
        score: scoreMarket(market, days, hours),
        cityRank,
      });
    }
  }

  // Markets with no city still have a pin, so they still belong on the map.
  for (const slug of state.uncategorized_slugs) {
    const market = await getMarketBySlug(slug);
    if (!market) continue;
    tally(marketWeekdays(market));
    const point = mapPoint(market, '');
    if (point) mapPoints.push(point);
  }

  const seen = new Set<string>();
  const perCity = new Map<string, number>();
  const notable: StateNotableMarket[] = [];
  for (const { entry, score } of scored.sort(
    (left, right) =>
      right.score - left.score ||
      left.cityRank - right.cityRank ||
      left.entry.name.localeCompare(right.entry.name, 'en')
  )) {
    if (score <= 0) break;
    const key = notableKey(entry.name, entry.cityName);
    if (seen.has(key)) continue;
    const fromCity = perCity.get(entry.cityHref) ?? 0;
    if (fromCity >= NOTABLE_PER_CITY) continue;
    seen.add(key);
    perCity.set(entry.cityHref, fromCity + 1);
    notable.push(entry);
    if (notable.length === NOTABLE_LIMIT) break;
  }

  const marketCount = state.market_count;
  const weekdayCounts =
    withDays >= WEEKDAY_MIN_MARKETS && withDays >= marketCount * WEEKDAY_MIN_SHARE
    ? WEEKDAY_NAMES.map((day) => ({ day, count: perDay.get(day) ?? 0 }))
    : [];

  return {
    notable: notable.length >= NOTABLE_MIN ? notable : [],
    snapCount,
    weekdayCounts,
    lastModified,
    mapPoints,
  };
}

/**
 * Everything one state hub renders, or null when the slug is not a state in
 * the geo index (→ 404) or is the state's 2-letter code rather than its
 * canonical slug (→ the route redirects instead of serving a duplicate).
 */
export async function getStatePageData(stateSlug: string): Promise<StatePageData | null> {
  const state = await getStateByCode(stateSlug);
  if (!state) return null;
  // Only the canonical slug serves the page. `getStateByCode` also resolves
  // the 2-letter code, which would otherwise be a second URL for one page.
  if (state.slug !== stateSlug.trim().toLowerCase()) return null;

  const cities = state.cities.map((city) => cityLink(state, city));
  const { notable, snapCount, weekdayCounts, lastModified, mapPoints } = await collectNotable(state);

  const regionFull = state.name;

  return {
    state,
    path: statePath(state.slug),
    regionFull,
    marketCount: state.market_count,
    cityCount: state.city_count,
    snapCount,
    cities,
    notableMarkets: notable,
    weekdayCounts,
    mapPoints,
    noindex: state.city_count === 0,
    title: stateTitle({
      state: regionFull,
      marketCount: state.market_count,
      cityCount: state.city_count,
    }),
    description: stateDescription({
      state: regionFull,
      marketCount: state.market_count,
      cityCount: state.city_count,
      biggestCity: cities[0]?.name,
      biggestCityCount: cities[0]?.marketCount ?? 0,
      snapCount,
    }),
    summary: buildSummary(weekdayCounts),
    lastModified,
  };
}

/** Every state slug in the index — one per hub page. */
export async function getAllStateParams(): Promise<{ state: string }[]> {
  const index = await getGeoIndex();
  return index.states.map((state) => ({ state: state.slug }));
}

/** One row of a "browse by state" directory. */
export interface StateHubSummary {
  slug: string;
  name: string;
  href: string;
  marketCount: number;
  cityCount: number;
  /** ISO country code ("US", "CA", "FR"), for splitting US states from the rest. */
  countryCode: string;
}

/**
 * Every state/region with a hub, largest first.
 *
 * This is the geo index's own list, so — unlike the raw-value summaries the
 * retired `/markets/state` route was built on — "NY" and "New York" are one
 * row, and there is no "USA" row to filter out.
 */
export async function getStateHubSummaries(): Promise<StateHubSummary[]> {
  const index = await getGeoIndex();
  return index.states.map((state) => ({
    slug: state.slug,
    name: state.name,
    href: statePath(state.slug),
    marketCount: state.market_count,
    cityCount: state.city_count,
    countryCode: state.country_code,
  }));
}
