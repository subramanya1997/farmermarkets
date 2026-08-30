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
 * State slug the way the retired `/markets/state/[state]` route built it, from
 * the raw `state` value on a record. Kept only so
 * `src/lib/legacyStateRedirects.ts` can map those old URLs onto a state hub.
 */
export function toStateSlug(state: string): string {
  return state.toLowerCase().replace(/\s+/g, '-');
}

/** Canonical path for an index page (`/markets` for page 1). */
export function marketsPagePath(page: number): string {
  return page <= 1 ? '/markets' : `/markets/page/${page}`;
}
