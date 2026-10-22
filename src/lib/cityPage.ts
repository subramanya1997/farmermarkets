/**
 * View model for the city pages (`/{state}/{city}`, e.g. `/new-york/brooklyn`).
 *
 * The page component renders this and nothing else: every decision that needs
 * to look at the data (which weekdays have markets, which day is clearly the
 * busiest, which neighbouring markets and cities to point at, which guide
 * answers add something the cards do not) is made here, once, so the
 * component stays a template and the rules are reviewable in one place.
 *
 * The page is built to be scanned: the list of markets is the answer, so the
 * view model carries numbers and short facts rather than prose about them.
 * Nothing here invents a claim about a market.
 */

import 'server-only';
import { getCity, getStateByCode, type GeoCity, type GeoState } from './geoIndex';
import { statePath } from './statePage';
import { getMarketBySlug, type FarmerMarket } from './data';
import { resolveLocation } from './geo';
import { newerInstant, toIsoInstant } from './dates';
import { getMarketPoints, getNearbyMarkets, type NearbyMarket } from './nearby';
import { getCityGuide } from './cityGuide';
import { faqRepeatsTips, fillCount, type CityGuide } from './cityGuideSchema';
import {
  busiestDay,
  centroid,
  joinWithAnd,
  nearestCities,
  yearRoundSentence,
  type DayCount,
} from './cityPageView';
import {
  WEEKDAY_NAMES,
  cityDescription,
  cityTitle,
  displayName,
  marketHours,
  marketSeasonLabel,
  marketWeekdays,
  type Weekday,
} from './seo';

/** One row of the city's market table. */
export interface CityMarketRow {
  slug: string;
  name: string;
  href: string;
  /** Street line only — the city/state/zip tail is already in the H1. */
  address?: string;
  days: Weekday[];
  hours?: string;
  season?: string;
  snap: boolean;
  /** Ranking input for "the most notable market", see `scoreMarket`. */
  completeness: number;
  vendorCount?: number;
  /** The record's own coordinates, when it has them; drives the page's map. */
  lat?: number;
  lon?: number;
}

export interface CityDayGroup {
  day: Weekday;
  rows: CityMarketRow[];
}

export interface CityFaq {
  question: string;
  answer: string;
}

export interface CitySibling {
  name: string;
  slug: string;
  href: string;
  marketCount: number;
}

export interface CityPageData {
  state: GeoState;
  city: GeoCity;
  /** Root-relative canonical path for this page. */
  path: string;
  /** "NC", or the region/country name where there is no 2-letter code. */
  regionShort: string;
  /** "North Carolina" — always spelled out, for the H1 and the prose. */
  regionFull: string;
  marketCount: number;
  snapCount: number;
  rows: CityMarketRow[];
  dayGroups: CityDayGroup[];
  /** The day most markets trade on, only when it is a clear answer (3+, no tie). */
  busiest?: DayCount;
  /**
   * Only questions the page does not already answer: guide FAQs whose answer
   * is not a restatement of a guide card. Empty for most cities, and the
   * FAQPage JSON-LD is omitted with it.
   */
  faqs: CityFaq[];
  siblings: CitySibling[];
  /** The state hub (`/{state}`) this city sits under. */
  stateHubPath: string;
  title: string;
  description: string;
  /** At most one short sentence under the stat chips, or undefined. */
  summary?: string;
  /**
   * The nearest markets outside this city, closest first, for cities with at
   * most `NEARBY_CITY_LIMIT` markets of their own (see `nearbyMarkets`). Empty
   * for larger cities, and for the rare record with no coordinates.
   */
  nearby: NearbyMarket[];
  /**
   * Newest `last_updated` among the markets this page lists, as an ISO
   * instant, or undefined when not one of them carries a usable date.
   *
   * This is the same value `sitemapEntries.ts` publishes as the page's
   * `lastmod` — deliberately, so the `dateModified` in the page's JSON-LD and
   * the sitemap agree rather than offering a crawler two different dates for
   * one URL. Both derive from `city.market_slugs`, so they cannot drift.
   */
  lastModified?: string;
  /**
   * Hand-researched visitor tips for this city, every one citing its source
   * (`data/city-guides.json`). Absent for most cities, which is fine: the
   * generated page stands on its own.
   */
  guide?: CityGuide;
}

/** Canonical path for a city page. */
export function cityPath(stateSlug: string, citySlug: string): string {
  return `${statePath(stateSlug)}/${citySlug}`;
}

/**
 * How complete one record is, used to order the list and to pick the market the meta description names.
 *
 * The order the issue asks for: stated opening times beat a bare weekday,
 * which beats a vendor count, which beats a description. A market nobody can
 * find the hours for is a bad thing to headline a city with.
 */
function scoreMarket(row: Omit<CityMarketRow, 'completeness'>, market: FarmerMarket): number {
  return (
    (row.hours ? 8 : 0) +
    (row.days.length > 0 ? 4 : 0) +
    (market.vendor_count ? 2 : 0) +
    (marketBlurb(market) ? 1 : 0)
  );
}

/** The record's own prose, if it has any. */
function marketBlurb(market: FarmerMarket): string | undefined {
  const text = (market.location_description || market.organization_description || '').trim();
  return text || undefined;
}

function toRow(market: FarmerMarket): CityMarketRow {
  const days = marketWeekdays(market);
  const lat = market.location?.lat;
  const lon = market.location?.lon;
  const hasCoordinates =
    typeof lat === 'number' && typeof lon === 'number' && Boolean(lat || lon);
  const base = {
    slug: market.slug,
    name: displayName(market.name),
    href: `/markets/${market.slug}`,
    address: resolveLocation(market).street,
    days,
    hours: marketHours(market),
    season: marketSeasonLabel(market),
    snap: market.snap === true,
    vendorCount: market.vendor_count ?? undefined,
    ...(hasCoordinates ? { lat: Number(lat.toFixed(5)), lon: Number(lon.toFixed(5)) } : {}),
  };

  return { ...base, completeness: scoreMarket(base, market) };
}

/** Cities with this many markets or fewer get a "markets nearby" block. */
const NEARBY_CITY_LIMIT = 3;
/** How many neighbouring markets that block lists. */
const NEARBY_LIMIT = 6;

/**
 * The nearest markets outside a small city.
 *
 * Roughly a quarter of all city pages hold a single market whose record states
 * no schedule, season or description — a page a searcher could read in full
 * from the SERP snippet. Those pages used to be `noindex`; Search Console then
 * reported every one of them as "Excluded by noindex" because the sitemap
 * still submitted them. The honest answer to "farmers markets in Calais" when
 * Calais has one market with no hours is that market plus the ones a short
 * drive away, so that is what small cities now render, and every city page is
 * indexable.
 *
 * Distances come from the records' own coordinates (`src/lib/nearby.ts`), so
 * a market with none gets no block rather than an invented one. Markets already
 * in the city's own table are excluded — the block is about what lies beyond it.
 */
async function nearbyMarkets(
  rows: CityMarketRow[],
  markets: FarmerMarket[]
): Promise<NearbyMarket[]> {
  if (rows.length === 0 || rows.length > NEARBY_CITY_LIMIT) return [];
  // Search from the best-documented market, the one a reader is most likely
  // to be planning around.
  const origin = markets.find((market) => market.slug === rows[0].slug) ?? markets[0];
  const own = new Set(rows.map((row) => row.slug));
  // Over-fetch so that filtering out the city's own markets still leaves a
  // full block.
  const candidates = await getNearbyMarkets(origin, NEARBY_LIMIT + rows.length);
  return candidates.filter((candidate) => !own.has(candidate.slug)).slice(0, NEARBY_LIMIT);
}

/** Up to `SIBLING_LIMIT` other cities in the state with 2+ markets, nearest first. */
async function siblingCities(
  state: GeoState,
  city: GeoCity,
  rows: CityMarketRow[]
): Promise<CitySibling[]> {
  const others = state.cities.filter((sibling) => sibling.slug !== city.slug);
  const origin = centroid(
    rows.flatMap((row) =>
      row.lat !== undefined && row.lon !== undefined ? [{ lat: row.lat, lon: row.lon }] : []
    )
  );
  const points = origin ? await getMarketPoints() : undefined;
  const candidates = others.map((sibling) => ({
    name: sibling.name,
    slug: sibling.slug,
    href: cityPath(state.slug, sibling.slug),
    marketCount: sibling.market_count,
    points: points
      ? sibling.market_slugs.flatMap((slug) => {
          const point = points.get(slug);
          return point ? [point] : [];
        })
      : [],
  }));
  return nearestCities(origin, candidates).map(({ name, slug, href, marketCount }) => ({
    name,
    slug,
    href,
    marketCount,
  }));
}

/**
 * Everything one city page renders, or null when the state/city pair is not in
 * the index (→ 404) or the city's markets have all disappeared from the data.
 */
export async function getCityPageData(
  stateSlug: string,
  citySlug: string
): Promise<CityPageData | null> {
  const state = await getStateByCode(stateSlug);
  if (!state) return null;
  // Only the canonical state slug serves the page; `getStateByCode` also
  // resolves the 2-letter code, which would otherwise be a duplicate URL.
  if (state.slug !== stateSlug.trim().toLowerCase()) return null;

  const city = await getCity(stateSlug, citySlug);
  if (!city) return null;

  const markets = (
    await Promise.all(city.market_slugs.map((slug) => getMarketBySlug(slug)))
  ).filter((market): market is FarmerMarket => Boolean(market));

  if (markets.length === 0) return null;

  const rows = markets
    .map(toRow)
    .sort(
      (left, right) =>
        right.completeness - left.completeness || left.name.localeCompare(right.name, 'en')
    );

  const dayGroups: CityDayGroup[] = WEEKDAY_NAMES.map((day) => ({
    day,
    rows: rows.filter((row) => row.days.includes(day)),
  })).filter((group) => group.rows.length > 0);

  const snapRows = rows.filter((row) => row.snap);
  const notable = rows[0]?.completeness > 0 ? rows[0] : undefined;
  const [nearby, siblings] = await Promise.all([
    nearbyMarkets(rows, markets),
    siblingCities(state, city, rows),
  ]);

  let lastModified: string | undefined;
  for (const market of markets) {
    lastModified = newerInstant(lastModified, toIsoInstant(market.last_updated));
  }

  const isUnitedStates = state.country_code === 'US';
  const regionShort = state.code ?? state.name;
  const regionFull = state.name;
  const cityName = city.name;

  const notableSchedule = notable
    ? [
        notable.days.length > 0
          ? joinWithAnd(notable.days.slice(0, 2).map((day) => `${day}s`))
          : undefined,
        notable.hours,
      ]
        .filter(Boolean)
        .join(' ') || undefined
    : undefined;

  const guide = getCityGuide(state.slug, city.slug);
  // Generated questions only restated the list above them, so the FAQ is the
  // guide's, minus any answer a guide card already shows.
  const faqs: CityFaq[] = (guide?.faqs ?? [])
    .filter((faq) => !faqRepeatsTips(faq, guide?.tips ?? []))
    .map((faq) => ({ question: faq.question, answer: faq.answer }));

  return {
    state,
    city,
    path: cityPath(state.slug, city.slug),
    regionShort,
    regionFull,
    marketCount: rows.length,
    snapCount: snapRows.length,
    rows,
    dayGroups,
    busiest: busiestDay(dayGroups.map((group) => ({ day: group.day, count: group.rows.length }))),
    faqs,
    siblings,
    stateHubPath: statePath(state.slug),
    title: guide?.title
      ? fillCount(guide.title, rows.length)
      : cityTitle({
          city: cityName,
          // A US state gets its 2-letter code; everywhere else the region or
          // country name is what a searcher would recognise.
          region: isUnitedStates ? regionShort : regionFull,
          marketCount: rows.length,
        }),
    description: guide?.description
      ? fillCount(guide.description, rows.length)
      : cityDescription({
          city: cityName,
          region: isUnitedStates ? regionShort : regionFull,
          marketCount: rows.length,
          notableMarket: notable?.name,
          notableSchedule,
          snapCount: snapRows.length,
        }),
    summary: yearRoundSentence(rows),
    nearby,
    lastModified,
    guide,
  };
}
