/**
 * View models for the four topic pages under `/farmers-markets/`:
 * `snap-ebt`, `online`, `hours` and `saturday`.
 *
 * Each page leads with one answer sentence and a row of headline numbers,
 * then shows its data visually (a state grid, day bars, market rows with
 * chips) rather than describing it in prose. Copy is written in a reader's
 * voice ("895 farmers markets accept SNAP/EBT"), not the dataset's ("recorded
 * as accepting ... in this directory"), and carries no denominators.
 *
 * Same contract as `src/lib/cityPage.ts` and `src/lib/statePage.ts`: the page
 * components render what these builders return and nothing else, every number
 * is computed from the two market snapshots at build/ISR time rather than
 * written into the copy, and a sentence whose input is missing is dropped
 * instead of guessed at.
 *
 * The four topics share one pass over the dataset (`getTopicEntries`), which
 * is memoized per server process: each entry carries the market's weekdays,
 * hours and place, so a topic builder only filters and counts.
 *
 * Routing note: state hubs and city pages moved to the site root (`/texas`,
 * `/texas/austin`) in October 2026, so these four are now the only pages under
 * `/farmers-markets/`. The redirect that forwards the old state URLs
 * (`next.config.ts`) carves these slugs out by name; a fifth topic has to be
 * added to that list too.
 */

import 'server-only';
import type { Metadata } from 'next';
import { getMarkets, type FarmerMarket } from './data';
import { getGeoIndex, type GeoState } from './geoIndex';
import { cityPath } from './cityPage';
import { statePath } from './statePage';
import { newerInstant, toIsoInstant } from './dates';
import {
  WEEKDAY_NAMES,
  displayName,
  marketHours,
  marketWeekdays,
  type Weekday,
} from './seo';
import {
  fitDescription,
  fitTitle,
  formatCount,
  joinWithAnd,
  placesPhrase,
  pluralMarkets,
  pluralShort,
  tidyHours,
} from './topicCopy';

/* ------------------------------------------------------------------ *
 * Slugs and paths
 * ------------------------------------------------------------------ */

export const TOPIC_SLUGS = ['snap-ebt', 'online', 'hours', 'saturday'] as const;
export type TopicSlug = (typeof TOPIC_SLUGS)[number];

/** Canonical path for a topic page. */
export function topicPath(slug: TopicSlug): string {
  return `/farmers-markets/${slug}`;
}

/** Breadcrumb/footer label for each topic. */
export const TOPIC_LABELS: Record<TopicSlug, string> = {
  'snap-ebt': 'SNAP/EBT markets',
  online: 'Online ordering & delivery',
  hours: 'Market hours',
  saturday: 'Saturday markets',
};

/* ------------------------------------------------------------------ *
 * Shared view-model types
 * ------------------------------------------------------------------ */

/** One state in a topic page's state grid. */
export interface TopicStateRow {
  /** "New York"; DC reads "Washington, DC". */
  name: string;
  /** Two-letter postal code. */
  code: string;
  slug: string;
  href: string;
  count: number;
}

/** The icon a headline number is drawn with (mapped in `TopicPage.tsx`). */
export type TopicStatIcon = 'snap' | 'map' | 'wic' | 'calendar' | 'clock' | 'online' | 'delivery' | 'csa';

/** One headline number under the answer sentence. */
export interface TopicStat {
  value: string;
  label: string;
  icon: TopicStatIcon;
}

/** A short pill on a market row. */
export type TopicBadge = 'SNAP' | 'WIC' | 'Online' | 'Delivery' | 'CSA';

/** One market a topic page names outright. */
export interface TopicMarketRow {
  slug: string;
  name: string;
  href: string;
  /** "Austin, TX", "Washington, DC". */
  place?: string;
  /** The city page, when the market resolved to one. */
  placeHref?: string;
  stateName: string;
  stateHref: string;
  days: Weekday[];
  /** One house spelling, e.g. "9am-1pm". */
  hours?: string;
  badges: TopicBadge[];
}

export interface TopicFaq {
  question: string;
  answer: string;
}

/** Everything every topic page renders. */
export interface TopicPageData {
  slug: TopicSlug;
  /** Root-relative canonical path. */
  path: string;
  title: string;
  description: string;
  /** The H1. */
  heading: string;
  /** One sentence that answers the page's search query. */
  answer: string;
  /** Three or four headline numbers, drawn as tiles under the answer. */
  stats: TopicStat[];
  /** How many markets the page is about. */
  marketCount: number;
  /** States with at least one matching market, largest first. */
  states: TopicStateRow[];
  /** The markets the page names, mirrored by its ItemList JSON-LD. */
  topMarkets: TopicMarketRow[];
  /** Two or three questions the rest of the page does not already answer. */
  faqs: TopicFaq[];
  /** Newest `last_updated` among the matching markets, for the sitemap. */
  lastModified?: string;
}

/* ------------------------------------------------------------------ *
 * One pass over the dataset
 * ------------------------------------------------------------------ */

/**
 * The topic pages cover the 50 states and DC. The geo index also carries
 * Canadian provinces, other countries and US territories; a national "open on
 * Saturday" or "market hours" page listing Ontario or Singapore next to Ohio
 * read as broken, so those markets are left out of every count here.
 */
const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM',
  'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
  'WV', 'WI', 'WY',
]);

function isCoveredState(state: GeoState): state is GeoState & { code: string } {
  return state.country_code === 'US' && Boolean(state.code) && US_STATE_CODES.has(state.code!);
}

/** "Washington, D.C." in the geo index; "Washington, DC" on the page. */
function stateLabel(state: GeoState & { code: string }): string {
  return state.code === 'DC' ? 'Washington, DC' : state.name;
}

interface TopicEntry {
  market: FarmerMarket;
  name: string;
  href: string;
  stateName: string;
  stateCode: string;
  stateSlug: string;
  cityName?: string;
  cityHref?: string;
  days: Weekday[];
  hours?: string;
  /** Data completeness, ranked exactly as the city and state pages rank it. */
  score: number;
  lastModified?: string;
}

function marketBlurb(market: FarmerMarket): string | undefined {
  const text = (market.location_description || market.organization_description || '').trim();
  return text || undefined;
}

let entriesPromise: Promise<TopicEntry[]> | null = null;

async function buildEntries(): Promise<TopicEntry[]> {
  const [markets, index] = await Promise.all([getMarkets(), getGeoIndex()]);

  // Slug → place, covering both the cities and the markets whose state is
  // known but whose city never resolved (`uncategorized_slugs`). The geo
  // index's own reverse lookup only covers cities, and a topic page's state
  // grid should count every market the state actually has.
  const places = new Map<
    string,
    { stateName: string; stateCode: string; stateSlug: string; cityName?: string; cityHref?: string }
  >();
  for (const state of index.states) {
    if (!isCoveredState(state)) continue;
    const base = { stateName: stateLabel(state), stateCode: state.code, stateSlug: state.slug };
    for (const city of state.cities) {
      for (const slug of city.market_slugs) {
        if (places.has(slug)) continue;
        places.set(slug, { ...base, cityName: city.name, cityHref: cityPath(state.slug, city.slug) });
      }
    }
    for (const slug of state.uncategorized_slugs) {
      if (!places.has(slug)) places.set(slug, base);
    }
  }

  const entries: TopicEntry[] = [];
  for (const market of markets) {
    if (!market.slug) continue;
    const place = places.get(market.slug);
    if (!place) continue;
    const days = marketWeekdays(market);
    const rawHours = marketHours(market);
    const hours = rawHours ? tidyHours(rawHours) : undefined;

    entries.push({
      market,
      name: displayName(market.name),
      href: `/markets/${market.slug}`,
      ...place,
      days,
      hours,
      score:
        (hours ? 8 : 0) +
        (days.length > 0 ? 4 : 0) +
        (market.vendor_count ? 2 : 0) +
        (marketBlurb(market) ? 1 : 0),
      lastModified: toIsoInstant(market.last_updated),
    });
  }
  return entries;
}

/** Every covered market with its place, weekdays and hours. Built once per process. */
function getTopicEntries(): Promise<TopicEntry[]> {
  if (!entriesPromise) {
    entriesPromise = buildEntries().catch((error) => {
      entriesPromise = null;
      throw error;
    });
  }
  return entriesPromise;
}

/* ------------------------------------------------------------------ *
 * Selection helpers
 * ------------------------------------------------------------------ */

/** How many markets a topic page samples, one per top state. */
const SAMPLE_LIMIT = 8;

type BadgesFor = (entry: TopicEntry) => TopicBadge[];

/** SNAP and WIC: the pills most topic rows carry. */
const benefitBadges: BadgesFor = (entry) => [
  ...(entry.market.snap === true ? (['SNAP'] as const) : []),
  ...(entry.market.wic === true ? (['WIC'] as const) : []),
];

function toRow(entry: TopicEntry, badgesFor: BadgesFor): TopicMarketRow {
  return {
    slug: entry.market.slug,
    name: entry.name,
    href: entry.href,
    place: entry.cityName ? `${entry.cityName}, ${entry.stateCode}` : undefined,
    placeHref: entry.cityHref,
    stateName: entry.stateName,
    stateHref: statePath(entry.stateSlug),
    days: entry.days,
    hours: entry.hours,
    badges: badgesFor(entry),
  };
}

function compareByPlace(left: TopicEntry, right: TopicEntry): number {
  return (
    left.stateName.localeCompare(right.stateName, 'en') ||
    (left.cityName ?? '').localeCompare(right.cityName ?? '', 'en') ||
    left.name.localeCompare(right.name, 'en')
  );
}

/**
 * The best-documented market in each of the top states, in the state grid's
 * order. A national list ranked purely by completeness filled up with one
 * city's markets; one per state reads as a map of where to start.
 */
function sampleByState(
  entries: TopicEntry[],
  states: TopicStateRow[],
  badgesFor: BadgesFor = benefitBadges,
  limit = SAMPLE_LIMIT
): TopicMarketRow[] {
  const best = new Map<string, TopicEntry>();
  for (const entry of entries) {
    if (entry.score === 0) continue;
    const current = best.get(entry.stateSlug);
    if (
      !current ||
      entry.score > current.score ||
      (entry.score === current.score && entry.name.localeCompare(current.name, 'en') < 0)
    ) {
      best.set(entry.stateSlug, entry);
    }
  }

  const rows: TopicMarketRow[] = [];
  for (const state of states) {
    const entry = best.get(state.slug);
    if (entry) rows.push(toRow(entry, badgesFor));
    if (rows.length === limit) break;
  }
  return rows;
}

/** State rows for a selection, largest first, states with no match omitted. */
function stateRows(entries: TopicEntry[]): TopicStateRow[] {
  const counts = new Map<string, Omit<TopicStateRow, 'href'>>();
  for (const entry of entries) {
    const row = counts.get(entry.stateSlug) ?? {
      name: entry.stateName,
      code: entry.stateCode,
      slug: entry.stateSlug,
      count: 0,
    };
    row.count += 1;
    counts.set(entry.stateSlug, row);
  }

  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'en'))
    .map((row) => ({ ...row, href: statePath(row.slug) }));
}

/** "47 states and DC" for a state grid. */
function statesPhrase(states: TopicStateRow[]): string {
  const includesDc = states.some((state) => state.code === 'DC');
  return placesPhrase(states.length - (includesDc ? 1 : 0), includesDc);
}

/** The states tile: "47" over "States + DC". */
function statesStat(states: TopicStateRow[]): TopicStat {
  const includesDc = states.some((state) => state.code === 'DC');
  return {
    value: formatCount(states.length - (includesDc ? 1 : 0)),
    label: includesDc ? 'States, plus DC' : 'States',
    icon: 'map',
  };
}

function lastModifiedOf(entries: TopicEntry[]): string | undefined {
  let latest: string | undefined;
  for (const entry of entries) latest = newerInstant(latest, entry.lastModified);
  return latest;
}

function countMatching(entries: TopicEntry[], predicate: (entry: TopicEntry) => boolean): number {
  return entries.reduce((total, entry) => total + (predicate(entry) ? 1 : 0), 0);
}

/** The opening times the most markets in a selection list. */
function commonHours(entries: TopicEntry[]): { hours: string; count: number } | undefined {
  const frequency = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.hours) continue;
    frequency.set(entry.hours, (frequency.get(entry.hours) ?? 0) + 1);
  }

  const ranked = [...frequency.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'en')
  )[0];
  return ranked ? { hours: ranked[0], count: ranked[1] } : undefined;
}

function isDefined<T>(value: T | undefined | false): value is T {
  return Boolean(value);
}

/* ------------------------------------------------------------------ *
 * /farmers-markets/snap-ebt
 * ------------------------------------------------------------------ */

export async function getSnapTopicPage(): Promise<TopicPageData> {
  const all = await getTopicEntries();
  const entries = all.filter((entry) => entry.market.snap === true);

  const states = stateRows(entries);
  const count = entries.length;
  const wicCount = countMatching(entries, (entry) => entry.market.wic === true);
  const sfmnpCount = countMatching(entries, (entry) => entry.market.sfmnp === true);
  const saturdayCount = countMatching(entries, (entry) => entry.days.includes('Saturday'));
  const sundayCount = countMatching(entries, (entry) => entry.days.includes('Sunday'));
  const where = states.length > 0 ? ` across ${statesPhrase(states)}` : '';

  const benefitClauses = [
    wicCount > 0 ? `${formatCount(wicCount)} also take WIC` : undefined,
    sfmnpCount > 0
      ? `${formatCount(sfmnpCount)} take Senior Farmers Market Nutrition Program (SFMNP) coupons`
      : undefined,
  ].filter(isDefined);

  const faqs: TopicFaq[] = [
    benefitClauses.length > 0 && {
      question: 'Do SNAP farmers markets also take WIC or senior coupons?',
      answer: `Many do. ${joinWithAnd(benefitClauses)}.`,
    },
    saturdayCount > 0 && {
      question: 'Are SNAP farmers markets open on weekends?',
      answer: `Yes. ${formatCount(saturdayCount)} are open on Saturday${
        sundayCount > 0 ? ` and ${formatCount(sundayCount)} on Sunday` : ''
      }.`,
    },
  ].filter(isDefined);

  return {
    slug: 'snap-ebt',
    path: topicPath('snap-ebt'),
    heading: 'Farmers Markets That Accept SNAP/EBT',
    title: fitTitle([
      `${formatCount(count)} Farmers Markets That Accept SNAP/EBT`,
      `${formatCount(count)} Farmers Markets Accepting SNAP/EBT`,
      'Farmers Markets That Accept SNAP/EBT',
    ]),
    description: fitDescription(`${pluralMarkets(count)} accept SNAP/EBT${where}.`, [
      wicCount > 0 ? `${formatCount(wicCount)} also take WIC.` : undefined,
      'Find one in your state, with days and hours.',
    ]),
    answer: `${pluralMarkets(count)} accept SNAP/EBT${where}.`,
    stats: [
      { value: formatCount(count), label: 'Take SNAP/EBT', icon: 'snap' as const },
      states.length > 0 && statesStat(states),
      wicCount > 0 && { value: formatCount(wicCount), label: 'Also take WIC', icon: 'wic' as const },
      saturdayCount > 0 && {
        value: formatCount(saturdayCount),
        label: 'Open Saturdays',
        icon: 'calendar' as const,
      },
    ].filter(isDefined),
    marketCount: count,
    states,
    topMarkets: sampleByState(entries, states, (entry) =>
      entry.market.wic === true ? ['WIC'] : []
    ),
    faqs,
    lastModified: lastModifiedOf(entries),
  };
}

/* ------------------------------------------------------------------ *
 * /farmers-markets/online
 * ------------------------------------------------------------------ */

/**
 * The three ways to buy beyond the stall. Phone orders are left out: the flag
 * is set on almost every record that sets any of these, so it told a reader
 * nothing.
 */
const ORDERING_FLAGS = {
  Online: (market: FarmerMarket) => market.online_ordering_available === true,
  Delivery: (market: FarmerMarket) => market.delivery_available === true,
  CSA: (market: FarmerMarket) => market.csa_available === true,
} as const;

export type OrderingBadge = keyof typeof ORDERING_FLAGS;

const orderingBadges: BadgesFor = (entry) =>
  (Object.keys(ORDERING_FLAGS) as OrderingBadge[]).filter((key) =>
    ORDERING_FLAGS[key](entry.market)
  );

export interface OnlineTopicPageData extends TopicPageData {
  /** How many markets carry each ordering badge. */
  counts: Record<OrderingBadge, number>;
}

export async function getOnlineTopicPage(): Promise<OnlineTopicPageData> {
  const all = await getTopicEntries();
  const entries = all.filter((entry) =>
    Object.values(ORDERING_FLAGS).some((flag) => flag(entry.market))
  );

  const states = stateRows(entries);
  const count = entries.length;
  const counts: Record<OrderingBadge, number> = {
    Online: countMatching(entries, (entry) => ORDERING_FLAGS.Online(entry.market)),
    Delivery: countMatching(entries, (entry) => ORDERING_FLAGS.Delivery(entry.market)),
    CSA: countMatching(entries, (entry) => ORDERING_FLAGS.CSA(entry.market)),
  };

  // The whole set is small enough to list in full, so there is no "N more"
  // dead end: every market, grouped by state and city. The data holds a few
  // genuine duplicate names at different addresses in one city; one row per
  // name and place keeps the list from reading as a bug.
  const seen = new Set<string>();
  const markets = [...entries]
    .sort(compareByPlace)
    .filter((entry) => {
      const key = `${entry.name.toLowerCase()}|${entry.cityName ?? ''}|${entry.stateSlug}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((entry) => toRow(entry, orderingBadges));

  const faqs: TopicFaq[] = [
    counts.Online > 0 && {
      question: 'Can you order from a farmers market online?',
      answer: `Yes, ${pluralShort(counts.Online)} take online orders. You order through the market itself, not through this site.`,
    },
    counts.Delivery > 0 && {
      question: 'Do farmers markets deliver?',
      answer: `Some do: ${pluralShort(counts.Delivery)} offer delivery. Areas, fees and cut-off times vary, so check with the market before you order.`,
    },
    counts.CSA > 0 && {
      question: 'What is a CSA share?',
      answer: `A CSA (community supported agriculture) share is a subscription you pay up front for a regular box of produce. ${pluralShort(counts.CSA)} offer one.`,
    },
  ].filter(isDefined);

  return {
    slug: 'online',
    path: topicPath('online'),
    heading: 'Farmers Markets With Online Ordering, Delivery and CSA',
    title: fitTitle([
      `${formatCount(count)} Farmers Markets With Online Ordering & Delivery`,
      `${formatCount(count)} Farmers Markets: Online Ordering & Delivery`,
      'Farmers Markets With Online Ordering & Delivery',
    ]),
    description: fitDescription(
      `${pluralMarkets(count)} let you order online, get delivery or join a CSA.`,
      [
        `${formatCount(counts.Online)} take online orders, ${formatCount(
          counts.Delivery
        )} deliver and ${formatCount(counts.CSA)} offer CSA shares.`,
        'See them all by state.',
      ]
    ),
    answer: `${pluralMarkets(count)} let you order online, get delivery or join a CSA.`,
    stats: [
      { value: formatCount(counts.Online), label: 'Order online', icon: 'online' as const },
      { value: formatCount(counts.Delivery), label: 'Deliver', icon: 'delivery' as const },
      { value: formatCount(counts.CSA), label: 'Offer a CSA', icon: 'csa' as const },
      states.length > 0 && statesStat(states),
    ].filter(isDefined),
    marketCount: count,
    states,
    topMarkets: markets,
    faqs,
    lastModified: lastModifiedOf(entries),
    counts,
  };
}

/* ------------------------------------------------------------------ *
 * /farmers-markets/hours
 * ------------------------------------------------------------------ */

/** One day in a day-of-week chart. */
export interface TopicDayRow {
  day: Weekday;
  count: number;
  /** Set for the days that have a page of their own. */
  href?: string;
}

export interface HoursTopicPageData extends TopicPageData {
  dayRows: TopicDayRow[];
  /** The opening times the most markets list, e.g. "9am-1pm". */
  commonHours?: { hours: string; count: number };
  /** The biggest cities by market count, for local hours. */
  topCities: { name: string; href: string; count: number }[];
}

const TOP_CITY_LIMIT = 12;
const WEEKEND: Weekday[] = ['Saturday', 'Sunday'];

function rankDays(rows: TopicDayRow[]): TopicDayRow[] {
  return [...rows].sort(
    (left, right) =>
      right.count - left.count || WEEKDAY_NAMES.indexOf(left.day) - WEEKDAY_NAMES.indexOf(right.day)
  );
}

export async function getHoursTopicPage(): Promise<HoursTopicPageData> {
  const all = await getTopicEntries();
  const index = await getGeoIndex();

  const entries = all.filter((entry) => entry.days.length > 0);
  const states = stateRows(entries);

  const dayRows: TopicDayRow[] = WEEKDAY_NAMES.map((day) => ({
    day,
    count: countMatching(entries, (entry) => entry.days.includes(day)),
    href: day === 'Saturday' ? topicPath('saturday') : undefined,
  })).filter((row) => row.count > 0);

  const busiest = rankDays(dayRows)[0];
  const [busiestWeekday, nextWeekday] = rankDays(
    dayRows.filter((row) => !WEEKEND.includes(row.day))
  );
  const saturday = dayRows.find((row) => row.day === 'Saturday');
  const sunday = dayRows.find((row) => row.day === 'Sunday');
  const hours = commonHours(all);

  const topCities = index.states
    .filter(isCoveredState)
    .flatMap((state) =>
      state.cities.map((city) => ({
        name: `${city.name}, ${state.code}`,
        href: cityPath(state.slug, city.slug),
        count: city.market_count,
      }))
    )
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'en'))
    .slice(0, TOP_CITY_LIMIT);

  const faqs: TopicFaq[] = [
    sunday && {
      question: 'Are farmers markets open on Sundays?',
      answer: `Some are: ${pluralShort(sunday.count)} open on Sunday${
        saturday ? `, compared with ${formatCount(saturday.count)} on Saturday` : ''
      }.`,
    },
    busiestWeekday && {
      question: 'Are farmers markets open on weekdays?',
      answer: `Yes. ${busiestWeekday.day} is the busiest weekday, with ${pluralShort(
        busiestWeekday.count
      )}${nextWeekday ? `, followed by ${nextWeekday.day} with ${formatCount(nextWeekday.count)}` : ''}.`,
    },
  ].filter(isDefined);

  const answer =
    busiest && hours
      ? `${busiest.day} is the busiest farmers market day, and ${hours.hours} are the most common hours.`
      : busiest
        ? `${busiest.day} is the busiest farmers market day.`
        : `${pluralMarkets(entries.length)} list their opening days.`;

  return {
    slug: 'hours',
    path: topicPath('hours'),
    heading: 'Farmers Market Hours: When Are They Open?',
    title: fitTitle([
      `Farmers Market Hours: Opening Days for ${formatCount(entries.length)} Markets`,
      `Farmers Market Hours: ${formatCount(entries.length)} Markets by Day`,
      `Farmers Market Hours: ${formatCount(entries.length)} Markets`,
    ]),
    description: fitDescription(answer, [
      'See how many markets open each day, then check hours in your city.',
    ]),
    answer,
    stats: [
      busiest && { value: busiest.day, label: 'Busiest day', icon: 'calendar' as const },
      busiestWeekday && {
        value: busiestWeekday.day,
        label: 'Busiest weekday',
        icon: 'calendar' as const,
      },
      hours && { value: hours.hours, label: 'Most common hours', icon: 'clock' as const },
      sunday && { value: formatCount(sunday.count), label: 'Open Sundays', icon: 'calendar' as const },
    ].filter(isDefined),
    marketCount: entries.length,
    states,
    topMarkets: sampleByState(entries, states),
    faqs,
    lastModified: lastModifiedOf(entries),
    dayRows,
    commonHours: hours,
    topCities,
  };
}

/* ------------------------------------------------------------------ *
 * /farmers-markets/saturday
 * ------------------------------------------------------------------ */

export interface SaturdayTopicPageData extends TopicPageData {
  /** Every other weekday with its own count, in week order. */
  otherDays: TopicDayRow[];
  commonHours?: { hours: string; count: number };
}

export async function getSaturdayTopicPage(): Promise<SaturdayTopicPageData> {
  const all = await getTopicEntries();
  const withDays = all.filter((entry) => entry.days.length > 0);
  const entries = all.filter((entry) => entry.days.includes('Saturday'));

  const states = stateRows(entries);
  const count = entries.length;
  const hours = commonHours(entries);
  const alsoOtherDayCount = countMatching(entries, (entry) => entry.days.length > 1);
  const snapCount = countMatching(entries, (entry) => entry.market.snap === true);
  const where = states.length > 0 ? ` across ${statesPhrase(states)}` : '';

  const otherDays: TopicDayRow[] = WEEKDAY_NAMES.filter((day) => day !== 'Saturday')
    .map((day) => ({
      day,
      count: countMatching(withDays, (entry) => entry.days.includes(day)),
      href: topicPath('hours'),
    }))
    .filter((row) => row.count > 0);

  // Of the Saturday markets that also open another day, which day that most
  // often is.
  const [topOtherDay] = rankDays(
    WEEKDAY_NAMES.filter((day) => day !== 'Saturday').map((day) => ({
      day,
      count: countMatching(entries, (entry) => entry.days.includes(day)),
    }))
  ).filter((row) => row.count > 0);

  const faqs: TopicFaq[] = [
    alsoOtherDayCount > 0 && {
      question: 'Are Saturday farmers markets open on other days too?',
      answer: `${formatCount(alsoOtherDayCount)} of them are${
        topOtherDay ? `, most often on ${topOtherDay.day}` : ''
      }.`,
    },
    snapCount > 0 && {
      question: 'Do Saturday farmers markets take SNAP/EBT?',
      answer: `${formatCount(snapCount)} of them do.`,
    },
  ].filter(isDefined);

  return {
    slug: 'saturday',
    path: topicPath('saturday'),
    heading: 'Saturday Farmers Markets',
    title: fitTitle([
      `${formatCount(count)} Saturday Farmers Markets by State`,
      `Saturday Farmers Markets: ${formatCount(count)} by State`,
      'Saturday Farmers Markets by State',
    ]),
    description: fitDescription(`${pluralMarkets(count)} open on Saturday${where}.`, [
      hours ? `The most common hours are ${hours.hours}.` : undefined,
      states.length > 0
        ? `Browse by state, starting with ${states[0].name} (${formatCount(states[0].count)}).`
        : undefined,
    ]),
    answer: `${pluralMarkets(count)} open on Saturday${where}.`,
    stats: [
      { value: formatCount(count), label: 'Open Saturdays', icon: 'calendar' as const },
      states.length > 0 && statesStat(states),
      hours && { value: hours.hours, label: 'Most common hours', icon: 'clock' as const },
    ].filter(isDefined),
    marketCount: count,
    states,
    topMarkets: sampleByState(entries, states),
    faqs,
    lastModified: lastModifiedOf(entries),
    otherDays,
    commonHours: hours,
  };
}

/* ------------------------------------------------------------------ *
 * Directory listing
 * ------------------------------------------------------------------ */

/** One topic page as `/markets` and the footer advertise it. */
export interface TopicSummary {
  slug: TopicSlug;
  label: string;
  href: string;
  heading: string;
  /** How many markets the page is about. */
  count: number;
  /** The page's own meta description — one factual sentence set. */
  blurb: string;
}

/** All four topic pages with their live counts, in publication order. */
export async function getTopicSummaries(): Promise<TopicSummary[]> {
  const pages = await Promise.all([
    getSnapTopicPage(),
    getOnlineTopicPage(),
    getHoursTopicPage(),
    getSaturdayTopicPage(),
  ]);

  return pages.map((page) => ({
    slug: page.slug,
    label: TOPIC_LABELS[page.slug],
    href: page.path,
    heading: page.heading,
    count: page.marketCount,
    blurb: page.description,
  }));
}

/* ------------------------------------------------------------------ *
 * Metadata
 * ------------------------------------------------------------------ */

/**
 * The metadata block all four topic pages emit: self-canonical, with the
 * layout's "%s | Farmer Markets" suffix skipped so the count-bearing title
 * survives SERP truncation.
 */
export function topicMetadata(data: TopicPageData): Metadata {
  return {
    title: { absolute: data.title },
    description: data.description,
    alternates: { canonical: data.path },
    openGraph: {
      title: data.title,
      description: data.description,
      url: data.path,
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title: data.title, description: data.description },
  };
}

/* ------------------------------------------------------------------ *
 * Sitemap
 * ------------------------------------------------------------------ */

/**
 * The four topic URLs with the `lastmod` the sitemap publishes: the newest
 * `last_updated` among the markets the page lists, which is the same policy
 * the city pages and state hubs follow.
 */
export async function getTopicSitemapEntries(): Promise<
  { path: string; lastModified?: string }[]
> {
  const pages = await Promise.all([
    getSnapTopicPage(),
    getOnlineTopicPage(),
    getHoursTopicPage(),
    getSaturdayTopicPage(),
  ]);

  return pages.map((page) => ({ path: page.path, lastModified: page.lastModified }));
}
