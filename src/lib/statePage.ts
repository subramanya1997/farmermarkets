/**
 * View model for the state hubs (`/farmers-markets/{state}`).
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
import {
  displayName,
  marketHours,
  marketWeekdays,
  stateDescription,
  stateTitle,
  type Weekday,
} from './seo';

/** Canonical path for a state hub. */
export function statePath(stateSlug: string): string {
  return `/farmers-markets/${stateSlug}`;
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

export interface StatePageData {
  state: GeoState;
  /** Root-relative canonical path. */
  path: string;
  /** "Colorado" / "Ontario" / "France" — always spelled out. */
  regionFull: string;
  marketCount: number;
  cityCount: number;
  /** Markets whose city never resolved; listed as a count, never as links. */
  uncategorizedCount: number;
  snapCount: number;
  /** Every city in the state, largest first. */
  cities: StateCityLink[];
  notableMarkets: StateNotableMarket[];
  /**
   * True when the hub has no city list to offer — every one of its markets
   * failed to resolve to a city. The page stays crawlable (a market page
   * breadcrumbs through it) but does not ask to be indexed.
   */
  noindex: boolean;
  title: string;
  description: string;
  /** 40–75 words of plain factual prose, above the city list. */
  opener: string;
}

/**
 * How many markets the hub names outright.
 *
 * The city directory is the page's substance; the notable list exists to give
 * a reader (and a crawler) a direct hop to a few market pages without turning
 * the hub into a second copy of the paginated index.
 */
const NOTABLE_LIMIT = 8;

function marketBlurb(market: FarmerMarket): string | undefined {
  const text = (market.location_description || market.organization_description || '').trim();
  return text || undefined;
}

/**
 * Data completeness, matching the city page's ranking exactly: stated opening
 * times beat a bare weekday, which beats a vendor count, which beats a
 * description. A market nobody can find the hours for is a bad thing to
 * headline a state with.
 */
function scoreMarket(market: FarmerMarket, days: Weekday[], hours?: string): number {
  return (
    (hours ? 8 : 0) +
    (days.length > 0 ? 4 : 0) +
    (market.vendor_count ? 2 : 0) +
    (marketBlurb(market) ? 1 : 0)
  );
}

function pluralMarkets(count: number): string {
  return count === 1 ? '1 farmers market' : `${count} farmers markets`;
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Answer-first opener: 40–75 words assembled from clauses that are true. */
function buildOpener(input: {
  regionFull: string;
  marketCount: number;
  cities: StateCityLink[];
  snapCount: number;
  notable?: StateNotableMarket;
}): string {
  const { regionFull, marketCount, cities, snapCount, notable } = input;

  const sentences: string[] = [
    cities.length > 0
      ? `This page lists ${pluralMarkets(marketCount)} in ${regionFull}, spread across ${
          cities.length === 1 ? '1 city' : `${cities.length} cities and towns`
        }.`
      : `This page lists ${pluralMarkets(marketCount)} in ${regionFull}.`,
  ];

  const top = cities.slice(0, 3);
  if (top.length > 0) {
    sentences.push(
      `${joinWithAnd(
        top.map((city) => `${city.name} (${city.marketCount})`)
      )} ${top.length === 1 ? 'is' : 'are'} the largest by market count.`
    );
  }

  if (notable) {
    const detail = [
      notable.address ? `at ${notable.address}` : undefined,
      notable.days.length > 0
        ? `on ${joinWithAnd(notable.days.slice(0, 2).map((day) => `${day}s`))}`
        : undefined,
      notable.hours ? `from ${notable.hours}` : undefined,
    ]
      .filter(Boolean)
      .join(', ');

    sentences.push(
      detail
        ? `${notable.name} in ${notable.cityName} is the most fully documented record, ${detail}.`
        : `${notable.name} in ${notable.cityName} is the most fully documented record.`
    );
  }

  if (snapCount > 0) {
    sentences.push(
      `${snapCount} of them ${snapCount === 1 ? 'accepts' : 'accept'} SNAP/EBT benefits.`
    );
  }

  // Used only to reach the 40-word floor. The first line is only true when
  // the state actually has a city list below it.
  const closers = [
    cities.length > 0
      ? 'Each city below links to a page listing that city’s markets with addresses, days and opening times.'
      : undefined,
    'Details come from the official market datasets the directory is built from, and are refreshed with each data update.',
  ].filter((closer): closer is string => Boolean(closer));

  const paragraph: string[] = [];
  for (const sentence of sentences) {
    if (countWords([...paragraph, sentence].join(' ')) > 75 && paragraph.length > 0) break;
    paragraph.push(sentence);
  }
  for (const closer of closers) {
    if (countWords(paragraph.join(' ')) >= 40) break;
    if (countWords([...paragraph, closer].join(' ')) > 75) break;
    paragraph.push(closer);
  }

  return paragraph.join(' ');
}

function cityLink(state: GeoState, city: GeoCity): StateCityLink {
  return {
    name: city.name,
    slug: city.slug,
    href: `/farmers-markets/${state.slug}/${city.slug}`,
    marketCount: city.market_count,
  };
}

/**
 * The most data-complete markets in the state, plus the state's SNAP tally.
 *
 * Every record in the state is read: `getMarketBySlug` is an O(1) map lookup
 * over the already-memoized dataset, so the whole 60-hub prerender costs one
 * pass over the 8,807 markets in total.
 */
async function collectNotable(
  state: GeoState
): Promise<{ notable: StateNotableMarket[]; snapCount: number }> {
  const scored: { entry: StateNotableMarket; score: number }[] = [];
  let snapCount = 0;

  for (const city of state.cities) {
    for (const slug of city.market_slugs) {
      const market = await getMarketBySlug(slug);
      if (!market) continue;
      if (market.snap === true) snapCount += 1;

      const days = marketWeekdays(market);
      const hours = marketHours(market);
      scored.push({
        entry: {
          slug: market.slug,
          name: displayName(market.name),
          href: `/markets/${market.slug}`,
          cityName: city.name,
          cityHref: `/farmers-markets/${state.slug}/${city.slug}`,
          address: resolveLocation(market).street,
          days,
          hours,
          snap: market.snap === true,
        },
        score: scoreMarket(market, days, hours),
      });
    }
  }

  const seen = new Set<string>();
  const notable: StateNotableMarket[] = [];
  for (const { entry, score } of scored.sort(
    (left, right) =>
      right.score - left.score || left.entry.name.localeCompare(right.entry.name, 'en')
  )) {
    if (score === 0) break;
    // The data holds genuine duplicate names at different addresses; a list
    // showing the same name twice reads as a bug even when it is not.
    const key = `${entry.name.toLowerCase()}|${entry.cityName.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    notable.push(entry);
    if (notable.length === NOTABLE_LIMIT) break;
  }

  return { notable, snapCount };
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
  const { notable, snapCount } = await collectNotable(state);

  const regionFull = state.name;

  return {
    state,
    path: statePath(state.slug),
    regionFull,
    marketCount: state.market_count,
    cityCount: state.city_count,
    uncategorizedCount: state.uncategorized_slugs.length,
    snapCount,
    cities,
    notableMarkets: notable,
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
    opener: buildOpener({
      regionFull,
      marketCount: state.market_count,
      cities,
      snapCount,
      notable: notable[0],
    }),
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
  }));
}
