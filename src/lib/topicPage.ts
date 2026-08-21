/**
 * View models for the four topic pages under `/farmers-markets/`:
 * `snap-ebt`, `online`, `hours` and `saturday`.
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
 * Routing note: these are static segments, which Next matches ahead of the
 * sibling `[state]` dynamic segment, and none of the four slugs is a state
 * slug in the geo index — so `/farmers-markets/north-carolina` still reaches
 * the state hub and nothing is shadowed.
 */

import 'server-only';
import type { Metadata } from 'next';
import { getMarkets, type FarmerMarket } from './data';
import { getGeoIndex } from './geoIndex';
import { resolveLocation } from './geo';
import { cityPath } from './cityPage';
import { statePath } from './statePage';
import { newerInstant, toIsoInstant } from './dates';
import {
  WEEKDAY_NAMES,
  displayName,
  marketHours,
  marketSeasonLabel,
  marketWeekdays,
  type Weekday,
} from './seo';
import {
  buildParagraph,
  fitDescription,
  fitTitle,
  formatCount,
  joinWithAnd,
  pluralMarkets,
  pluralShort,
  sharePercent,
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

/** One row of a topic page's state-by-state table. */
export interface TopicStateRow {
  name: string;
  slug: string;
  href: string;
  count: number;
}

/** One market a topic page names outright. */
export interface TopicMarketRow {
  slug: string;
  name: string;
  href: string;
  /** "Durham, North Carolina" — where the market sits. */
  placeLabel?: string;
  /** The city page, when the market resolved to one. */
  placeHref?: string;
  address?: string;
  days: Weekday[];
  hours?: string;
  season?: string;
  /** Short factual tags rendered after the place ("SNAP", "Delivery"). */
  tags: string[];
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
  /** 40–75 words of plain factual prose, above the tables. */
  opener: string;
  /** How many markets the page is about. */
  marketCount: number;
  /** Every market in the directory, for the "N of M" framing. */
  totalMarkets: number;
  /** States with at least one matching market, largest first. */
  states: TopicStateRow[];
  /** Matching markets with no state in the data; a count, never links. */
  statelessCount: number;
  topMarkets: TopicMarketRow[];
  faqs: TopicFaq[];
  /** Newest `last_updated` among the matching markets, for the sitemap. */
  lastModified?: string;
}

/* ------------------------------------------------------------------ *
 * One pass over the dataset
 * ------------------------------------------------------------------ */

interface TopicEntry {
  market: FarmerMarket;
  name: string;
  href: string;
  stateName?: string;
  stateSlug?: string;
  cityName?: string;
  cityHref?: string;
  address?: string;
  days: Weekday[];
  hours?: string;
  season?: string;
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
  // table should count every market the state actually has.
  const places = new Map<
    string,
    { stateName: string; stateSlug: string; cityName?: string; cityHref?: string }
  >();
  for (const state of index.states) {
    for (const city of state.cities) {
      for (const slug of city.market_slugs) {
        if (places.has(slug)) continue;
        places.set(slug, {
          stateName: state.name,
          stateSlug: state.slug,
          cityName: city.name,
          cityHref: cityPath(state.slug, city.slug),
        });
      }
    }
    for (const slug of state.uncategorized_slugs) {
      if (places.has(slug)) continue;
      places.set(slug, { stateName: state.name, stateSlug: state.slug });
    }
  }

  return markets
    .filter((market) => Boolean(market.slug))
    .map((market) => {
      const place = places.get(market.slug);
      const days = marketWeekdays(market);
      const hours = marketHours(market);

      return {
        market,
        name: displayName(market.name),
        href: `/markets/${market.slug}`,
        stateName: place?.stateName,
        stateSlug: place?.stateSlug,
        cityName: place?.cityName,
        cityHref: place?.cityHref,
        address: resolveLocation(market).street,
        days,
        hours,
        season: marketSeasonLabel(market),
        score:
          (hours ? 8 : 0) +
          (days.length > 0 ? 4 : 0) +
          (market.vendor_count ? 2 : 0) +
          (marketBlurb(market) ? 1 : 0),
        lastModified: toIsoInstant(market.last_updated),
      };
    });
}

/** Every market with its place, weekdays and hours. Built once per process. */
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

/** How many markets a topic page names outright. */
const TOP_MARKET_LIMIT = 12;
/** How many markets each `/farmers-markets/online` segment names. */
const SEGMENT_MARKET_LIMIT = 8;

function placeLabel(entry: TopicEntry): string | undefined {
  return [entry.cityName, entry.stateName].filter(Boolean).join(', ') || undefined;
}

function toRow(entry: TopicEntry, tags: string[] = []): TopicMarketRow {
  return {
    slug: entry.market.slug,
    name: entry.name,
    href: entry.href,
    placeLabel: placeLabel(entry),
    placeHref: entry.cityHref,
    address: entry.address,
    days: entry.days,
    hours: entry.hours,
    season: entry.season,
    tags,
  };
}

/**
 * The most data-complete markets in a selection.
 *
 * The data holds genuine duplicate names at different addresses; showing the
 * same name twice in a short list reads as a bug even when it is not, so one
 * name per place wins.
 */
function topMarkets(
  entries: TopicEntry[],
  tagsFor: (entry: TopicEntry) => string[] = () => [],
  limit = TOP_MARKET_LIMIT
): TopicMarketRow[] {
  const seen = new Set<string>();
  const rows: TopicMarketRow[] = [];

  for (const entry of [...entries].sort(
    (left, right) => right.score - left.score || left.name.localeCompare(right.name, 'en')
  )) {
    if (entry.score === 0) break;
    const key = `${entry.name.toLowerCase()}|${(placeLabel(entry) ?? '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(toRow(entry, tagsFor(entry)));
    if (rows.length === limit) break;
  }

  return rows;
}

/** State rows for a selection, largest first, states with no match omitted. */
function stateRows(entries: TopicEntry[]): TopicStateRow[] {
  const counts = new Map<string, { name: string; slug: string; count: number }>();
  for (const entry of entries) {
    if (!entry.stateSlug || !entry.stateName) continue;
    const row = counts.get(entry.stateSlug) ?? {
      name: entry.stateName,
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

function lastModifiedOf(entries: TopicEntry[]): string | undefined {
  let latest: string | undefined;
  for (const entry of entries) latest = newerInstant(latest, entry.lastModified);
  return latest;
}

/** "New York (85), California (61) and Texas (44)". */
function namedStates(states: TopicStateRow[], limit = 3): string {
  return joinWithAnd(states.slice(0, limit).map((state) => `${state.name} (${state.count})`));
}

function countMatching(entries: TopicEntry[], predicate: (entry: TopicEntry) => boolean): number {
  return entries.reduce((total, entry) => total + (predicate(entry) ? 1 : 0), 0);
}

/** The opening-times string the most records in a selection state. */
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

/* ------------------------------------------------------------------ *
 * /farmers-markets/snap-ebt
 * ------------------------------------------------------------------ */

export interface SnapTopicPageData extends TopicPageData {
  /** Of the matching markets, how many also accept these programs. */
  wicCount: number;
  sfmnpCount: number;
  fmnpCount: number;
}

export async function getSnapTopicPage(): Promise<SnapTopicPageData> {
  const all = await getTopicEntries();
  const entries = all.filter((entry) => entry.market.snap === true);

  const states = stateRows(entries);
  const count = entries.length;
  const wicCount = countMatching(entries, (entry) => entry.market.wic === true);
  const sfmnpCount = countMatching(entries, (entry) => entry.market.sfmnp === true);
  const fmnpCount = countMatching(entries, (entry) => entry.market.fmnp === true);
  const withDays = entries.filter((entry) => entry.days.length > 0);
  const saturdayCount = countMatching(entries, (entry) => entry.days.includes('Saturday'));
  const share = sharePercent(count, all.length);

  const faqs: TopicFaq[] = [
    {
      question: 'How many farmers markets accept SNAP/EBT?',
      answer: `${formatCount(count)} of the ${formatCount(
        all.length
      )} markets in this directory are recorded as accepting SNAP/EBT${
        share ? `, about ${share}% of every record` : ''
      }. They are spread across ${states.length} states and regions.`,
    },
    states.length > 0
      ? {
          question: 'Which states have the most SNAP farmers markets?',
          answer: `${namedStates(states)} list the most SNAP-accepting markets. The full state-by-state count is in the table above.`,
        }
      : undefined,
    wicCount > 0 || sfmnpCount > 0
      ? {
          question: 'Do SNAP markets accept WIC and senior nutrition benefits too?',
          answer: `Often, but not always: ${formatCount(
            wicCount
          )} of these ${formatCount(count)} markets also accept WIC and ${formatCount(
            sfmnpCount
          )} accept the Senior Farmers Market Nutrition Program. Each market page lists the programs that market is recorded as taking.`,
        }
      : undefined,
    withDays.length > 0
      ? {
          question: 'Are SNAP farmers markets open on Saturdays?',
          answer: `${formatCount(withDays.length)} of the ${formatCount(
            count
          )} SNAP markets state which days they open, and ${formatCount(
            saturdayCount
          )} of those trade on a Saturday. The rest of the days are on the market hours page.`,
        }
      : undefined,
    {
      question: 'How do you pay with SNAP at a farmers market?',
      answer:
        'It depends on how the market is set up. Some markets run a single card terminal at an information booth, where you swipe your EBT card and receive tokens or scrip to spend with any participating vendor; at others, individual vendors take the card at their own stall. Ask at the information booth when you arrive.',
    },
  ].filter((faq): faq is TopicFaq => Boolean(faq));

  const title = fitTitle([
    `${formatCount(count)} Farmers Markets That Accept SNAP/EBT`,
    `${formatCount(count)} Farmers Markets Accepting SNAP/EBT`,
    'Farmers Markets That Accept SNAP/EBT',
  ]);

  return {
    slug: 'snap-ebt',
    path: topicPath('snap-ebt'),
    heading: 'Farmers Markets That Accept SNAP/EBT',
    title,
    description: fitDescription(
      `${formatCount(count)} farmers markets in this directory accept SNAP/EBT.`,
      [
        states.length > 0 ? `Browse them by state, starting with ${states[0].name} (${states[0].count}).` : undefined,
        wicCount > 0 ? `${formatCount(wicCount)} also accept WIC.` : undefined,
        'See days, hours and addresses.',
      ]
    ),
    opener: buildParagraph(
      [
        `${pluralMarkets(count)} in this directory are recorded as accepting SNAP/EBT benefits${
          states.length > 0
            ? `, across ${states.length} states and regions`
            : ''
        }.`,
        states.length > 0 ? `${namedStates(states)} list the most.` : undefined,
        wicCount > 0 || sfmnpCount > 0
          ? `${formatCount(wicCount)} of them also accept WIC and ${formatCount(
              sfmnpCount
            )} accept the Senior Farmers Market Nutrition Program.`
          : undefined,
        withDays.length > 0
          ? `${formatCount(withDays.length)} state which days they open; ${formatCount(
              saturdayCount
            )} of those open on a Saturday.`
          : undefined,
      ],
      [
        'Each state below links to a page listing that state’s markets city by city, with addresses, days and opening times.',
      ]
    ),
    marketCount: count,
    totalMarkets: all.length,
    states,
    statelessCount: countMatching(entries, (entry) => !entry.stateSlug),
    topMarkets: topMarkets(entries, (entry) =>
      [
        'SNAP',
        entry.market.wic === true ? 'WIC' : undefined,
        entry.market.sfmnp === true ? 'SFMNP' : undefined,
      ].filter((tag): tag is string => Boolean(tag))
    ),
    faqs,
    lastModified: lastModifiedOf(entries),
    wicCount,
    sfmnpCount,
    fmnpCount,
  };
}

/* ------------------------------------------------------------------ *
 * /farmers-markets/online
 * ------------------------------------------------------------------ */

/** One ordering channel, with the markets that offer it. */
export interface OrderingSegment {
  key: 'online' | 'delivery' | 'csa' | 'phone';
  heading: string;
  /** One factual sentence about what the flag means in the data. */
  intro: string;
  count: number;
  markets: TopicMarketRow[];
}

export interface OnlineTopicPageData extends TopicPageData {
  segments: OrderingSegment[];
}

const ORDERING_FLAGS = {
  online: (market: FarmerMarket) => market.online_ordering_available === true,
  delivery: (market: FarmerMarket) => market.delivery_available === true,
  csa: (market: FarmerMarket) => market.csa_available === true,
  phone: (market: FarmerMarket) => market.phone_ordering === true,
} as const;

function orderingTags(entry: TopicEntry): string[] {
  return [
    ORDERING_FLAGS.online(entry.market) ? 'Online ordering' : undefined,
    ORDERING_FLAGS.delivery(entry.market) ? 'Delivery' : undefined,
    ORDERING_FLAGS.csa(entry.market) ? 'CSA' : undefined,
    ORDERING_FLAGS.phone(entry.market) ? 'Phone orders' : undefined,
  ].filter((tag): tag is string => Boolean(tag));
}

export async function getOnlineTopicPage(): Promise<OnlineTopicPageData> {
  const all = await getTopicEntries();
  const entries = all.filter((entry) =>
    Object.values(ORDERING_FLAGS).some((flag) => flag(entry.market))
  );

  const states = stateRows(entries);
  const count = entries.length;

  const segmentEntries = {
    online: entries.filter((entry) => ORDERING_FLAGS.online(entry.market)),
    delivery: entries.filter((entry) => ORDERING_FLAGS.delivery(entry.market)),
    csa: entries.filter((entry) => ORDERING_FLAGS.csa(entry.market)),
    phone: entries.filter((entry) => ORDERING_FLAGS.phone(entry.market)),
  };

  const segmentCopy: Record<OrderingSegment['key'], { heading: string; intro: string }> = {
    online: {
      heading: 'Markets with online ordering',
      intro:
        'These markets are recorded as taking orders through a website or ordering platform of their own. Order details are set by the market, so check its own site or phone number before ordering.',
    },
    delivery: {
      heading: 'Markets that deliver',
      intro:
        'These markets are recorded as offering delivery. Delivery areas and fees are set market by market and are not part of this dataset.',
    },
    csa: {
      heading: 'Markets with CSA shares',
      intro:
        'A CSA (community supported agriculture) share is a subscription paid up front for a recurring box of produce. These markets are recorded as offering one.',
    },
    phone: {
      heading: 'Markets that take phone orders',
      intro:
        'These markets are recorded as taking orders by phone. Each market page lists the phone numbers in the source data.',
    },
  };

  const segments: OrderingSegment[] = (
    ['online', 'delivery', 'csa', 'phone'] as const
  )
    .map((key) => ({
      key,
      heading: segmentCopy[key].heading,
      intro: segmentCopy[key].intro,
      count: segmentEntries[key].length,
      markets: topMarkets(segmentEntries[key], orderingTags, SEGMENT_MARKET_LIMIT),
    }))
    .filter((segment) => segment.count > 0);

  const faqs: TopicFaq[] = [
    {
      question: 'Can you order from a farmers market online?',
      answer: `Some markets do take orders remotely: ${formatCount(
        segmentEntries.online.length
      )} of the ${formatCount(all.length)} markets in this directory are recorded as offering online ordering, and ${formatCount(
        segmentEntries.phone.length
      )} take orders by phone. The rest sell in person at the market only.`,
    },
    segmentEntries.delivery.length > 0
      ? {
          question: 'Do farmers markets deliver?',
          answer: `${formatCount(
            segmentEntries.delivery.length
          )} markets in this directory are recorded as delivering. Delivery areas, fees and cut-off times are set by each market and are not in the source data, so check with the market before ordering.`,
        }
      : undefined,
    segmentEntries.csa.length > 0
      ? {
          question: 'Which farmers markets offer CSA boxes?',
          answer: `${formatCount(
            segmentEntries.csa.length
          )} markets list a CSA share. They are named in the CSA section above, and each market page carries the description the market itself supplied.`,
        }
      : undefined,
    states.length > 0
      ? {
          question: 'Which states have the most markets with online ordering or delivery?',
          answer: `${namedStates(states)} have the most. The state-by-state count for all ${formatCount(
            count
          )} markets is in the table above.`,
        }
      : undefined,
    {
      question: 'Is there a farmers market app?',
      answer:
        'This directory is a website rather than an app: it works in any phone browser, and every market page lists the address, days, hours and contact details the market published. Ordering itself happens through the individual market, not through this site.',
    },
  ].filter((faq): faq is TopicFaq => Boolean(faq));

  const title = fitTitle([
    `${formatCount(count)} Farmers Markets With Online Ordering & Delivery`,
    `${formatCount(count)} Farmers Markets: Online Ordering & Delivery`,
    `Online Farmers Markets - ${formatCount(count)} With Ordering`,
  ]);

  return {
    slug: 'online',
    path: topicPath('online'),
    heading: 'Farmers Markets With Online Ordering, Delivery and CSA',
    title,
    description: fitDescription(
      `${formatCount(count)} farmers markets in this directory sell beyond the market stall.`,
      [
        `${formatCount(segmentEntries.online.length)} take online orders, ${formatCount(
          segmentEntries.delivery.length
        )} deliver and ${formatCount(segmentEntries.csa.length)} offer CSA shares.`,
        'Browse by state.',
      ]
    ),
    opener: buildParagraph(
      [
        `${pluralMarkets(count)} in this directory are recorded as selling beyond the market stall.`,
        `${formatCount(segmentEntries.online.length)} take orders online, ${formatCount(
          segmentEntries.delivery.length
        )} offer delivery, ${formatCount(segmentEntries.csa.length)} run a CSA share and ${formatCount(
          segmentEntries.phone.length
        )} take orders by phone; a market can appear in more than one of those groups.`,
        states.length > 0 ? `${namedStates(states)} have the most.` : undefined,
      ],
      [
        'Ordering happens through the individual market rather than through this site, so each name below links to that market’s page and its own contact details.',
      ]
    ),
    marketCount: count,
    totalMarkets: all.length,
    states,
    statelessCount: countMatching(entries, (entry) => !entry.stateSlug),
    topMarkets: topMarkets(entries, orderingTags),
    faqs,
    lastModified: lastModifiedOf(entries),
    segments,
  };
}

/* ------------------------------------------------------------------ *
 * /farmers-markets/hours
 * ------------------------------------------------------------------ */

/** One row of the day-of-week table. */
export interface TopicDayRow {
  day: Weekday;
  count: number;
  /** Percentage of the markets that state any day at all. */
  share?: number;
  /** Set for the days that have a page of their own. */
  href?: string;
}

export interface HoursTopicPageData extends TopicPageData {
  /** Markets that state at least one opening day. */
  withDayData: number;
  /** Markets that state opening times anywhere in the directory. */
  withHours: number;
  /** Markets that state both their days and their opening times. */
  withDaysAndHours: number;
  dayRows: TopicDayRow[];
  /** The opening times the most records state, e.g. "9am–1pm". */
  commonHours?: { hours: string; count: number };
  /** The biggest cities by market count, for local hours. */
  topCities: { name: string; href: string; count: number }[];
}

const TOP_CITY_LIMIT = 10;

export async function getHoursTopicPage(): Promise<HoursTopicPageData> {
  const all = await getTopicEntries();
  const index = await getGeoIndex();

  const entries = all.filter((entry) => entry.days.length > 0);
  const withHoursEntries = all.filter((entry) => Boolean(entry.hours));
  const states = stateRows(entries);

  const dayRows: TopicDayRow[] = WEEKDAY_NAMES.map((day) => {
    const count = countMatching(entries, (entry) => entry.days.includes(day));
    return {
      day,
      count,
      share: sharePercent(count, entries.length),
      href: day === 'Saturday' ? topicPath('saturday') : undefined,
    };
  }).filter((row) => row.count > 0);

  const ranked = [...dayRows].sort(
    (left, right) =>
      right.count - left.count || WEEKDAY_NAMES.indexOf(left.day) - WEEKDAY_NAMES.indexOf(right.day)
  );
  const withDaysAndHours = countMatching(entries, (entry) => Boolean(entry.hours));
  const busiest = ranked[0];
  const runnerUp = ranked[1];
  const sunday = dayRows.find((row) => row.day === 'Sunday');
  const hours = commonHours(withHoursEntries);

  const topCities = index.states
    .flatMap((state) =>
      state.cities.map((city) => ({
        name: `${city.name}, ${state.name}`,
        href: cityPath(state.slug, city.slug),
        count: city.market_count,
      }))
    )
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'en'))
    .slice(0, TOP_CITY_LIMIT);

  const faqs: TopicFaq[] = [
    busiest
      ? {
          question: 'What day are most farmers markets open?',
          answer: `${busiest.day}. ${formatCount(busiest.count)} of the ${formatCount(
            entries.length
          )} markets that state an opening day trade on a ${busiest.day}${
            busiest.share ? `, ${busiest.share}% of them` : ''
          }${runnerUp ? `, ahead of ${runnerUp.day} with ${formatCount(runnerUp.count)}` : ''}.`,
        }
      : undefined,
    hours
      ? {
          question: 'What time do farmers markets open?',
          answer: `Opening times vary market to market, but ${hours.hours} is the most commonly listed: ${formatCount(
            hours.count
          )} of the ${formatCount(
            withHoursEntries.length
          )} markets that state their times use it. Morning and late-morning starts dominate the data.`,
        }
      : undefined,
    sunday
      ? {
          question: 'Are farmers markets open on Sundays?',
          answer: `${formatCount(sunday.count)} of the ${formatCount(
            entries.length
          )} markets with day data are listed as open on Sunday${
            sunday.share ? `, ${sunday.share}% of them` : ''
          }. That is fewer than Saturday, which is the busiest market day by a wide margin.`,
        }
      : undefined,
    {
      question: 'How do I find the hours for a farmers market near me?',
      answer: `Hours are set by each market and change with the season, so the city pages are the place to check: each one lists every market in that city with its days, opening times and season. ${
        topCities.length > 0
          ? `The largest are ${joinWithAnd(topCities.slice(0, 3).map((city) => city.name))}.`
          : ''
      }`.trim(),
    },
    {
      question: 'How many markets in this directory publish their opening days?',
      answer: `${formatCount(entries.length)} of ${formatCount(
        all.length
      )} state at least one opening day, and ${formatCount(
        withHoursEntries.length
      )} state opening times. ${formatCount(
        withDaysAndHours
      )} records carry both. The rest carry an address but no schedule at all.`,
    },
  ].filter((faq): faq is TopicFaq => Boolean(faq));

  const title = fitTitle([
    `Farmers Market Hours: Opening Days for ${formatCount(entries.length)} Markets`,
    `Farmers Market Hours - ${formatCount(entries.length)} Markets by Day`,
    `Farmers Market Hours: ${formatCount(entries.length)} Markets`,
  ]);

  return {
    slug: 'hours',
    path: topicPath('hours'),
    heading: 'Farmers Market Hours: When Are They Open?',
    title,
    description: fitDescription(
      busiest
        ? `${formatCount(busiest.count)} of the ${formatCount(
            entries.length
          )} markets with day data open on ${busiest.day}.`
        : `${formatCount(entries.length)} markets in this directory state their opening days.`,
      [
        'See the full day-of-week breakdown.',
        hours ? `${hours.hours} is the most common opening time.` : undefined,
        'Check a city page for local hours.',
      ]
    ),
    opener: buildParagraph(
      [
        `${formatCount(entries.length)} of the ${formatCount(
          all.length
        )} markets in this directory state which days they open, and ${formatCount(
          withHoursEntries.length
        )} state their opening times.`,
        busiest
          ? `${busiest.day} is the busiest market day: ${formatCount(busiest.count)} markets${
              busiest.share ? `, ${busiest.share}% of those with day data` : ''
            }${runnerUp ? `, ahead of ${runnerUp.day} with ${formatCount(runnerUp.count)}` : ''}.`
          : undefined,
        hours
          ? `${hours.hours} is the most commonly listed opening window, used by ${formatCount(
              hours.count
            )} markets.`
          : undefined,
      ],
      [
        'Hours are set market by market and change with the season, so the city pages below are the place to check before you go.',
      ]
    ),
    marketCount: entries.length,
    totalMarkets: all.length,
    states,
    statelessCount: countMatching(entries, (entry) => !entry.stateSlug),
    topMarkets: topMarkets(entries),
    faqs,
    lastModified: lastModifiedOf(entries),
    withDayData: entries.length,
    withHours: withHoursEntries.length,
    withDaysAndHours,
    dayRows,
    commonHours: hours,
    topCities,
  };
}

/* ------------------------------------------------------------------ *
 * /farmers-markets/saturday
 * ------------------------------------------------------------------ */

export interface SaturdayTopicPageData extends TopicPageData {
  /** Every other weekday, with its own count, for the closing note. */
  otherDays: TopicDayRow[];
  /** Saturday markets that also open on another day. */
  alsoOtherDayCount: number;
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
  const share = sharePercent(count, withDays.length);

  const otherDays: TopicDayRow[] = WEEKDAY_NAMES.filter((day) => day !== 'Saturday')
    .map((day) => ({
      day,
      count: countMatching(withDays, (entry) => entry.days.includes(day)),
      share: sharePercent(
        countMatching(withDays, (entry) => entry.days.includes(day)),
        withDays.length
      ),
    }))
    .filter((row) => row.count > 0)
    .sort((left, right) => right.count - left.count);

  const faqs: TopicFaq[] = [
    {
      question: 'How many farmers markets are open on Saturday?',
      answer: `${formatCount(count)} markets in this directory list Saturday as an opening day, ${
        share ? `${share}% of ` : ''
      }the ${formatCount(
        withDays.length
      )} records that state any day at all. They cover ${states.length} states and regions.`,
    },
    states.length > 0
      ? {
          question: 'Which states have the most Saturday farmers markets?',
          answer: `${namedStates(states)} list the most Saturday markets. Every state with at least one is in the table above, linking to that state’s full directory.`,
        }
      : undefined,
    hours
      ? {
          question: 'What time do Saturday farmers markets open?',
          answer: `${hours.hours} is the most commonly listed window for a Saturday market, used by ${formatCount(
            hours.count
          )} of them. Times are set by each market, so check the market’s own page before you go.`,
        }
      : undefined,
    alsoOtherDayCount > 0
      ? {
          question: 'Are Saturday markets open on other days as well?',
          answer: `${formatCount(alsoOtherDayCount)} of the ${formatCount(
            count
          )} Saturday markets also list at least one other opening day. The full day-of-week breakdown is on the market hours page.`,
        }
      : undefined,
    snapCount > 0
      ? {
          question: 'Do Saturday farmers markets accept SNAP/EBT?',
          answer: `${formatCount(snapCount)} of these ${formatCount(
            count
          )} Saturday markets are recorded as accepting SNAP/EBT benefits.`,
        }
      : undefined,
  ].filter((faq): faq is TopicFaq => Boolean(faq));

  const title = fitTitle([
    `${formatCount(count)} Saturday Farmers Markets by State`,
    `Saturday Farmers Markets - ${formatCount(count)} by State`,
    'Saturday Farmers Markets by State',
  ]);

  return {
    slug: 'saturday',
    path: topicPath('saturday'),
    heading: 'Saturday Farmers Markets',
    title,
    description: fitDescription(
      `${formatCount(count)} farmers markets in this directory open on Saturdays.`,
      [
        states.length > 0
          ? `Browse them by state, starting with ${states[0].name} (${states[0].count}).`
          : undefined,
        hours ? `${hours.hours} is the most common window.` : undefined,
        'See addresses and hours.',
      ]
    ),
    opener: buildParagraph(
      [
        `${pluralMarkets(count)} in this directory list Saturday as an opening day${
          share ? `, ${share}% of the ${formatCount(withDays.length)} records that state any day` : ''
        }.`,
        states.length > 0
          ? `They cover ${states.length} states and regions, with ${namedStates(states)} listing the most.`
          : undefined,
        hours
          ? `${hours.hours} is the most commonly listed Saturday window, used by ${pluralShort(
              hours.count
            )}.`
          : undefined,
        snapCount > 0 ? `${formatCount(snapCount)} of them accept SNAP/EBT.` : undefined,
      ],
      [
        'Each state below links to that state’s full directory, city by city, with addresses and opening times.',
      ]
    ),
    marketCount: count,
    totalMarkets: all.length,
    states,
    statelessCount: countMatching(entries, (entry) => !entry.stateSlug),
    topMarkets: topMarkets(entries, (entry) =>
      entry.market.snap === true ? ['SNAP'] : []
    ),
    faqs,
    lastModified: lastModifiedOf(entries),
    otherDays,
    alsoOtherDayCount,
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
