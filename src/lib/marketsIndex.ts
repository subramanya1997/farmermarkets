/**
 * Server-side helpers for the crawlable `/markets` index.
 *
 * The index is paginated over *URLs* (`/markets` for page 1, `/markets/page/N`
 * for the rest) rather than client state, so every one of the 8,800+ market
 * pages is reachable from a link a crawler can follow. Everything here runs on
 * the server only: the page components below never hand the dataset to a
 * client component.
 */

import 'server-only';
import { getMarkets, type FarmerMarket } from '@/lib/data';
import { stateFullName } from '@/lib/seo';

/**
 * Markets per index page.
 *
 * 48 divides evenly into the 1/2/3-column card grid and keeps a page's HTML
 * comfortably inside 200 KB, which matters because AI fetchers reject
 * responses over 4 MB and the old single-page `/markets` was 16.6 MB.
 */
export const MARKETS_PER_PAGE = 48;

/**
 * Number of `/markets/page/N` routes prerendered at build time.
 *
 * Deeper pages still work — `dynamicParams` renders them on demand and the ISR
 * cache holds them afterwards — they just pay one cold render first.
 */
export const PRERENDERED_PAGE_COUNT = 20;

/**
 * Deterministic ordering for the whole index: market name ascending (case- and
 * locale-insensitive), with the record id as a tie-break so two markets that
 * share a name never swap places between builds. A stable order is what makes
 * "page 7" mean the same thing to a crawler tomorrow as it does today.
 */
function compareMarkets(left: FarmerMarket, right: FarmerMarket): number {
  const byName = left.name.localeCompare(right.name, 'en', { sensitivity: 'base' });
  if (byName !== 0) return byName;
  return left.id.localeCompare(right.id);
}

let sortedMarketsPromise: Promise<FarmerMarket[]> | null = null;

/** The full dataset in index order. Sorted once per server process. */
export function getSortedMarkets(): Promise<FarmerMarket[]> {
  if (!sortedMarketsPromise) {
    sortedMarketsPromise = getMarkets()
      .then((markets) => {
        if (markets.length === 0) {
          // Don't cache a failed/empty read; let the next caller retry.
          sortedMarketsPromise = null;
          return markets;
        }
        // Copy first: `getMarkets()` hands back the memoized dataset itself.
        return [...markets].sort(compareMarkets);
      })
      .catch((error) => {
        sortedMarketsPromise = null;
        throw error;
      });
  }

  return sortedMarketsPromise;
}

export interface MarketsPage {
  /** 1-based page number, clamped into range. */
  page: number;
  totalPages: number;
  total: number;
  markets: FarmerMarket[];
}

/** One page of the index, or `null` when `page` is out of range (→ 404). */
export async function getMarketsPage(page: number): Promise<MarketsPage | null> {
  const markets = await getSortedMarkets();
  const total = markets.length;
  const totalPages = Math.max(1, Math.ceil(total / MARKETS_PER_PAGE));

  if (!Number.isInteger(page) || page < 1 || page > totalPages) {
    return null;
  }

  const start = (page - 1) * MARKETS_PER_PAGE;
  return {
    page,
    totalPages,
    total,
    markets: markets.slice(start, start + MARKETS_PER_PAGE),
  };
}

/** Total number of index pages, used by `generateStaticParams` and the sitemap. */
export async function getTotalMarketPages(): Promise<number> {
  const markets = await getSortedMarkets();
  return Math.max(1, Math.ceil(markets.length / MARKETS_PER_PAGE));
}

/**
 * State slug, matching `/markets/state/[state]` exactly — that route filters on
 * `market.state?.toLowerCase().replace(/\s+/g, '-')`, so any other slugification
 * here would produce links that 404.
 */
export function toStateSlug(state: string): string {
  return state.toLowerCase().replace(/\s+/g, '-');
}

export interface StateSummary {
  /** Slug for the `/markets/state/[state]` URL. */
  slug: string;
  /** Display name — the state spelled out where we can recognise it. */
  name: string;
  /**
   * Key for grouping the same state written two ways. The source data holds
   * both `NY` and `New York` (and `CA`/`California`), and because
   * `/markets/state/[state]` filters on the raw value, those really are two
   * different pages holding two different sets of markets — so both stay in
   * the directory. This only lets callers that want *one* tile per state, like
   * the homepage, pick the larger of the pair.
   */
  canonical: string;
  count: number;
}

/**
 * Every state/region present in the data, with its market count, ordered by
 * count descending then name. One `<a>` per entry on `/markets` is what makes
 * the (previously orphaned) state pages crawlable.
 */
export async function getStateSummaries(): Promise<StateSummary[]> {
  const markets = await getSortedMarkets();
  const counts = new Map<string, number>();

  for (const market of markets) {
    const state = market.state?.trim();
    if (!state) continue;
    const slug = toStateSlug(state);
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([slug, count]) => {
      // "ny" → "New York" rather than the raw title-cased "Ny".
      const fullName = stateFullName(slug.replace(/-/g, ' '));
      const name = fullName ?? formatStateName(slug);
      return { slug, name, canonical: name.toLowerCase(), count };
    })
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

/**
 * Slugs that are in the `state` column but are not a state. 166 records say
 * "USA". The page still exists and the full directory still links it — it just
 * has no business sitting in a "browse by state" tile between Texas and
 * Florida.
 */
const NON_STATE_SLUGS = new Set(['usa', 'us', 'united-states', 'united-states-of-america']);

/**
 * One entry per state for surfaces that want a short list (the homepage
 * tiles), keeping the larger of any pair that names the same state twice.
 */
export function dedupeStates(states: StateSummary[]): StateSummary[] {
  const best = new Map<string, StateSummary>();
  for (const state of states) {
    if (NON_STATE_SLUGS.has(state.slug)) continue;
    const existing = best.get(state.canonical);
    if (!existing || state.count > existing.count) best.set(state.canonical, state);
  }
  return [...best.values()].sort(
    (left, right) => right.count - left.count || left.name.localeCompare(right.name)
  );
}

/** Same transformation `/markets/state/[state]` uses for its own headings. */
export function formatStateName(stateSlug: string): string {
  return stateSlug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * A small, deterministic set of well-documented markets for the homepage.
 *
 * The homepage used to hand 100 full records to a client component that
 * rendered `null` until it mounted, so the HTML contained no market links at
 * all. It now server-renders this handful instead — picked for records that
 * actually have coordinates, opening times and a website (so the cards are not
 * mostly empty), and spread across distinct states so the section links into
 * different parts of the directory.
 */
export async function getFeaturedMarkets(limit = 6): Promise<FarmerMarket[]> {
  const markets = await getSortedMarkets();
  const seenStates = new Set<string>();
  const featured: FarmerMarket[] = [];
  const fallback: FarmerMarket[] = [];

  for (const market of markets) {
    const state = market.state?.trim();
    const wellDocumented =
      Boolean(market.location?.lat) &&
      Boolean(market.websites?.length) &&
      Boolean(market.season || market.days?.length) &&
      Boolean(market.city && state);
    if (!wellDocumented || !state) continue;

    if (seenStates.has(state)) {
      if (fallback.length < limit) fallback.push(market);
      continue;
    }
    seenStates.add(state);
    featured.push(market);
    if (featured.length === limit) return featured;
  }

  // Only reachable if fewer than `limit` states have a qualifying record.
  return [...featured, ...fallback].slice(0, limit);
}

/** Canonical path for an index page (`/markets` for page 1). */
export function marketsPagePath(page: number): string {
  return page <= 1 ? '/markets' : `/markets/page/${page}`;
}
