/**
 * The one list of URLs the sitemap index and its chunks are built from.
 *
 * Two rules drive everything here:
 *
 *  1. **No fetch-time dates.** Google's trust in `lastmod` is binary — a
 *     domain caught bumping it on every crawl has the signal ignored site-wide
 *     — and the old sitemap stamped `new Date()` onto every non-market entry
 *     on every request. A market's `lastmod` is its own `last_updated`; a city
 *     or state hub's is the newest `last_updated` among the markets it lists;
 *     a page with no truthful date (the static pages, the paginated index)
 *     carries **no** `lastmod` at all. Two fetches minutes apart are therefore
 *     byte-identical.
 *  2. **Only canonical URLs.** The retired `/markets/state/{state}` URLs are
 *     308s now and are deliberately absent.
 *
 * `changefreq` and `priority` are dropped rather than rationalized: Google has
 * said for years that it ignores both, and the old file had them inverted
 * (static pages 1.0, market pages 0.8) anyway.
 */

import 'server-only';
import { getMarkets } from './data';
import { getGeoIndex, getCityForMarketSlug } from './geoIndex';
import { getTotalMarketPages, marketsPagePath } from './marketsIndex';
import { cityPath } from './cityPage';
import { statePath } from './statePage';
import { SITE_URL } from './site';

/**
 * URLs per chunk. The sitemap protocol caps a file at 50,000 URLs / 50 MB;
 * 5,000 keeps each chunk small enough to re-fetch cheaply and gives the whole
 * 13.9k-URL directory three files.
 */
export const SITEMAP_CHUNK_SIZE = 5000;

export interface SitemapEntry {
  /** Absolute URL on the canonical host. */
  url: string;
  /** ISO-8601 instant, or undefined when no truthful date exists. */
  lastModified?: string;
}

/**
 * Parse a `last_updated` value into a stable ISO instant.
 *
 * The legacy USDA export writes local-looking timestamps with no zone
 * ("2020-08-03T13:44:04"). Reading those as UTC rather than as the server's
 * local time is what keeps the output identical on a developer's machine, in
 * CI, and on the deployment host.
 */
function toIsoInstant(value?: string | null): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;

  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw) ? raw : `${raw}Z`;
  const parsed = new Date(zoned);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function newer(left: string | undefined, right: string | undefined): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return left >= right ? left : right;
}

let entriesPromise: Promise<SitemapEntry[]> | null = null;

async function buildEntries(): Promise<SitemapEntry[]> {
  const [markets, geoIndex, totalPages] = await Promise.all([
    getMarkets(),
    getGeoIndex(),
    getTotalMarketPages(),
  ]);

  // One pass over the dataset fills in both derived date sets: `lastmod` for
  // each city page and for each state hub is the newest date among the markets
  // that page lists, which is the only honest date those pages have.
  const marketDates = new Map<string, string>();
  const cityDates = new Map<string, string>();
  const stateDates = new Map<string, string>();

  for (const market of markets) {
    if (!market.slug) continue;
    const date = toIsoInstant(market.last_updated);
    if (date) marketDates.set(market.slug, date);

    const placement = await getCityForMarketSlug(market.slug);
    if (!placement || !date) continue;

    const cityKey = `${placement.state.slug}/${placement.city.slug}`;
    cityDates.set(cityKey, newer(cityDates.get(cityKey), date) as string);
    stateDates.set(placement.state.slug, newer(stateDates.get(placement.state.slug), date) as string);
  }

  const absolute = (path: string) => new URL(path, SITE_URL).toString();

  // Static pages carry no `lastmod`: nothing in the repo records when their
  // copy last changed, and inventing a date is exactly the pattern that costs
  // a domain its lastmod trust.
  const staticEntries: SitemapEntry[] = ['/', '/markets', '/about', '/privacy', '/terms'].map(
    (path) => ({ url: absolute(path) })
  );

  // `/markets` itself is already in `staticEntries`, so pages start at 2.
  const indexEntries: SitemapEntry[] = Array.from(
    { length: Math.max(0, totalPages - 1) },
    (_unused, offset) => ({ url: absolute(marketsPagePath(offset + 2)) })
  );

  const stateEntries: SitemapEntry[] = geoIndex.states.map((state) => ({
    url: absolute(statePath(state.slug)),
    lastModified: stateDates.get(state.slug),
  }));

  const cityEntries: SitemapEntry[] = geoIndex.states.flatMap((state) =>
    state.cities.map((city) => ({
      url: absolute(cityPath(state.slug, city.slug)),
      lastModified: cityDates.get(`${state.slug}/${city.slug}`),
    }))
  );

  const marketEntries: SitemapEntry[] = markets
    .filter((market) => Boolean(market.slug))
    .map((market) => ({
      url: absolute(`/markets/${market.slug}`),
      lastModified: marketDates.get(market.slug),
    }));

  // Shallowest first, so chunk 0 holds the pages that matter most if a crawler
  // only ever reads one of them.
  return [...staticEntries, ...indexEntries, ...stateEntries, ...cityEntries, ...marketEntries];
}

/** Every canonical URL on the site, in a stable order. Built once per process. */
export function getSitemapEntries(): Promise<SitemapEntry[]> {
  if (!entriesPromise) {
    entriesPromise = buildEntries().catch((error) => {
      entriesPromise = null;
      throw error;
    });
  }
  return entriesPromise;
}

/** How many chunk files the index references. */
export async function getSitemapChunkCount(): Promise<number> {
  const entries = await getSitemapEntries();
  return Math.max(1, Math.ceil(entries.length / SITEMAP_CHUNK_SIZE));
}

/** The entries in one chunk (empty for an out-of-range id). */
export async function getSitemapChunk(id: number): Promise<SitemapEntry[]> {
  const entries = await getSitemapEntries();
  if (!Number.isInteger(id) || id < 0) return [];
  return entries.slice(id * SITEMAP_CHUNK_SIZE, (id + 1) * SITEMAP_CHUNK_SIZE);
}

/** Path of one chunk, as Next's `generateSitemaps` publishes it. */
export function sitemapChunkPath(id: number): string {
  return `/sitemap/${id}.xml`;
}
