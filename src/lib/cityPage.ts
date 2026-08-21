/**
 * View model for the city pages (`/farmers-markets/{state}/{city}`).
 *
 * The page component renders this and nothing else: every decision that needs
 * to look at the data — which table columns have any content, which weekday
 * sections exist, which questions the data can actually answer, whether the
 * page is thin enough to keep out of the index — is made here, once, so the
 * component stays a template and the rules are reviewable in one place.
 *
 * Everything is composed from fields the records really have. No sentence in
 * this file invents a claim about a market: a clause whose input is missing is
 * dropped rather than filled with a guess or with marketing copy.
 */

import 'server-only';
import { getCity, getStateByCode, type GeoCity, type GeoState } from './geoIndex';
import { getMarketBySlug, type FarmerMarket } from './data';
import { getStateSummaries } from './marketsIndex';
import { resolveLocation } from './geo';
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
}

/** Which columns any market in this city has data for. */
export interface CityTableColumns {
  address: boolean;
  days: boolean;
  hours: boolean;
  season: boolean;
  snap: boolean;
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
  columns: CityTableColumns;
  dayGroups: CityDayGroup[];
  faqs: CityFaq[];
  siblings: CitySibling[];
  /** Existing state hub (`/markets/state/...`), when one resolves. */
  stateHubPath?: string;
  title: string;
  description: string;
  /** 40–75 words of plain factual prose, above the table. */
  opener: string;
  /** True when the city is too thin to be worth indexing (see `isThin`). */
  noindex: boolean;
}

/** Canonical path for a city page. */
export function cityPath(stateSlug: string, citySlug: string): string {
  return `/farmers-markets/${stateSlug}/${citySlug}`;
}

/**
 * How complete one record is, used to pick the market the opener names.
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
  };

  return { ...base, completeness: scoreMarket(base, market) };
}

/**
 * A city is "thin" when it holds a single market that states no schedule and
 * carries no description of its own — there is nothing on such a page a
 * searcher could not read in the SERP snippet, so it is rendered (the URL
 * stays valid and internally linked) but marked `noindex`.
 *
 * Deliberately narrow: a city with two sparse markets is still a genuine
 * comparison, which is the job this page does.
 */
function isThin(rows: CityMarketRow[], markets: FarmerMarket[]): boolean {
  if (rows.length !== 1) return false;
  const [row] = rows;
  return !row.hours && row.days.length === 0 && !row.season && !marketBlurb(markets[0]);
}

function pluralMarkets(count: number): string {
  return count === 1 ? '1 farmers market' : `${count} farmers markets`;
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * A season label inside a sentence: season words read better lower-cased
 * ("its listed season is summer"), but a date range must keep its month
 * capitals ("April 26–November 22", not "april 26–november 22").
 */
function seasonInSentence(season: string): string {
  return /\d/.test(season) ? season : season.toLowerCase();
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Market names for a prose list, at most `limit` of them and never the same
 * name twice: the source data holds genuine duplicates (two separate records
 * both called "Backyard Market in Black Forest", at different addresses), and
 * a sentence naming one market twice reads as a bug even when it is not.
 */
function uniqueNames(rows: CityMarketRow[], limit: number): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const row of rows) {
    const key = row.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(row.name);
    if (names.length === limit) break;
  }
  return names;
}

/**
 * The answer-first opener: 40–75 words of plain prose, built from sentences
 * whose inputs exist. Sentences are appended while the paragraph is under the
 * upper bound, so a data-rich city gets the count, the notable market, its
 * schedule, the SNAP tally and the city's trading days, and a sparse city gets
 * the count plus whatever else is true — never a padded claim.
 */
function buildOpener(input: {
  city: string;
  regionFull: string;
  rows: CityMarketRow[];
  notable?: CityMarketRow;
  snapCount: number;
  dayGroups: CityDayGroup[];
}): string {
  const { city, regionFull, rows, notable, snapCount, dayGroups } = input;
  const place = regionFull ? `${city}, ${regionFull}` : city;

  const sentences: string[] = [
    `This page lists ${pluralMarkets(rows.length)} in ${place}.`,
  ];

  if (notable) {
    const schedule = [
      notable.days.length > 0
        ? `on ${joinWithAnd(notable.days.slice(0, 3).map((day) => `${day}s`))}`
        : undefined,
      notable.hours ? `from ${notable.hours}` : undefined,
    ]
      .filter(Boolean)
      .join(' ');

    const detail = [
      notable.address ? `at ${notable.address}` : undefined,
      schedule || undefined,
    ]
      .filter(Boolean)
      .join(', ');

    sentences.push(
      detail
        ? `${notable.name} is the most fully documented of them, ${detail}.`
        : `${notable.name} is the most fully documented of them.`
    );

    if (notable.season) {
      sentences.push(`Its listed season is ${seasonInSentence(notable.season)}.`);
    }
    if (notable.vendorCount) {
      sentences.push(`The record lists ${notable.vendorCount} vendors.`);
    }
  }

  if (snapCount > 0) {
    sentences.push(
      snapCount === rows.length && rows.length > 1
        ? 'All of them accept SNAP/EBT benefits.'
        : `${snapCount} of them ${snapCount === 1 ? 'accepts' : 'accept'} SNAP/EBT benefits.`
    );
  }

  if (dayGroups.length > 0) {
    const busiest = [...dayGroups].sort(
      (left, right) => right.rows.length - left.rows.length || WEEKDAY_NAMES.indexOf(left.day) - WEEKDAY_NAMES.indexOf(right.day)
    )[0];
    sentences.push(
      `${busiest.day} is the most common trading day listed, with ${
        busiest.rows.length === 1 ? '1 market' : `${busiest.rows.length} markets`
      }.`
    );
  }

  // Closing lines that are true of every city page, used only to reach the
  // 40-word floor on records that carry little else.
  const closers = [
    'Each entry below links to that market’s own page with its address, opening times and directions.',
    'Details come from the official market datasets the directory is built from, and are refreshed with each data update.',
  ];

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

/**
 * Only questions the city's data can answer, in the order they matter. Each
 * answer is one or two sentences read straight off the records; a question
 * with no answer in the data is not asked.
 */
function buildFaqs(input: {
  city: string;
  regionFull: string;
  rows: CityMarketRow[];
  snapRows: CityMarketRow[];
  dayGroups: CityDayGroup[];
  notable?: CityMarketRow;
}): CityFaq[] {
  const { city, rows, snapRows, dayGroups, notable } = input;
  const faqs: CityFaq[] = [];

  faqs.push({
    question: `How many farmers markets are in ${city}?`,
    answer:
      rows.length === 1
        ? `${city} has 1 farmers market in this directory: ${rows[0].name}.`
        : `${city} has ${rows.length} farmers markets in this directory, including ${joinWithAnd(
            uniqueNames(rows, 3)
          )}.`,
  });

  if (snapRows.length > 0) {
    const named = uniqueNames(snapRows, 5);
    faqs.push({
      question: `Which ${city} farmers markets accept SNAP/EBT?`,
      answer: `${joinWithAnd(named)} ${named.length === 1 ? 'accepts' : 'accept'} SNAP/EBT.${
        snapRows.length > named.length
          ? ` ${snapRows.length} of the city’s ${rows.length} markets accept it in total.`
          : ''
      }`,
    });
  }

  if (dayGroups.length > 0) {
    const busiest = [...dayGroups].sort(
      (left, right) => right.rows.length - left.rows.length || WEEKDAY_NAMES.indexOf(left.day) - WEEKDAY_NAMES.indexOf(right.day)
    )[0];
    faqs.push({
      question: `What farmers markets are open on ${busiest.day} in ${city}?`,
      answer: (() => {
        const named = uniqueNames(busiest.rows, 5);
        const remainder = busiest.rows.length - named.length;
        return `${joinWithAnd(named)} ${named.length === 1 ? 'is' : 'are'} listed as open on ${
          busiest.day
        }${remainder > 0 ? `, along with ${remainder} more` : ''}.`;
      })(),
    });
  }

  if (notable?.season) {
    const yearRound = /^year-round$/i.test(notable.season);
    faqs.push({
      question: `Is ${notable.name} open year-round?`,
      answer: yearRound
        ? `Yes. ${notable.name} is listed as open year-round.`
        : `No. ${notable.name} is listed for ${seasonInSentence(notable.season)} rather than the whole year.`,
    });
  }

  return faqs;
}

/**
 * The `/markets/state/[state]` hub for this state, if one exists.
 *
 * That route filters on the raw `state` value, so a state written only as "NC"
 * in the data has no `/markets/state/north-carolina` page. The slug is checked
 * against the states that really are in the data before it is linked, rather
 * than pointing a breadcrumb at a 404. (Issue #17 replaces these hubs.)
 */
async function resolveStateHubPath(state: GeoState): Promise<string | undefined> {
  const slugs = new Set((await getStateSummaries()).map((summary) => summary.slug));
  const candidates = [
    state.slug,
    state.code?.toLowerCase(),
    state.name.toLowerCase().replace(/\s+/g, '-'),
  ].filter((slug): slug is string => Boolean(slug));
  const match = candidates.find((slug) => slugs.has(slug));
  return match ? `/markets/state/${match}` : undefined;
}

/** Up to `limit` other cities in the same state, largest first. */
function siblingCities(state: GeoState, city: GeoCity, limit = 15): CitySibling[] {
  return state.cities
    .filter((sibling) => sibling.slug !== city.slug)
    .slice(0, limit)
    .map((sibling) => ({
      name: sibling.name,
      slug: sibling.slug,
      href: cityPath(state.slug, sibling.slug),
      marketCount: sibling.market_count,
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

  const columns: CityTableColumns = {
    address: rows.some((row) => Boolean(row.address)),
    days: rows.some((row) => row.days.length > 0),
    hours: rows.some((row) => Boolean(row.hours)),
    season: rows.some((row) => Boolean(row.season)),
    snap: rows.some((row) => row.snap),
  };

  const dayGroups: CityDayGroup[] = WEEKDAY_NAMES.map((day) => ({
    day,
    rows: rows.filter((row) => row.days.includes(day)),
  })).filter((group) => group.rows.length > 0);

  const snapRows = rows.filter((row) => row.snap);
  const notable = rows[0]?.completeness > 0 ? rows[0] : undefined;

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

  return {
    state,
    city,
    path: cityPath(state.slug, city.slug),
    regionShort,
    regionFull,
    marketCount: rows.length,
    snapCount: snapRows.length,
    rows,
    columns,
    dayGroups,
    faqs: buildFaqs({ city: cityName, regionFull, rows, snapRows, dayGroups, notable }),
    siblings: siblingCities(state, city),
    stateHubPath: await resolveStateHubPath(state),
    title: cityTitle({
      city: cityName,
      // A US state gets its 2-letter code; everywhere else the region or
      // country name is what a searcher would recognise.
      region: isUnitedStates ? regionShort : regionFull,
      marketCount: rows.length,
    }),
    description: cityDescription({
      city: cityName,
      region: isUnitedStates ? regionShort : regionFull,
      marketCount: rows.length,
      notableMarket: notable?.name,
      notableSchedule,
      snapCount: snapRows.length,
    }),
    opener: buildOpener({
      city: cityName,
      regionFull,
      rows,
      notable,
      snapCount: snapRows.length,
      dayGroups,
    }),
    noindex: isThin(rows, markets),
  };
}
