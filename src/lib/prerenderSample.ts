/**
 * Prerender a sample of a large page set instead of all of it.
 *
 * CI sets `PRERENDER_MARKET_SAMPLE` so its build renders a few hundred market
 * pages rather than all ~9,000: the template is the same for every market,
 * and prerendering them all was 60% of CI time. Pages outside the sample are
 * still served, rendered on demand, because the market route keeps
 * `dynamicParams = true`. Production and the nightly data refresh leave the
 * variable unset and prerender everything.
 *
 * The sample is spread evenly across the list (every Nth item), so it is the
 * same on every run and covers the whole alphabet of slugs rather than only
 * the first few hundred.
 */
export function sampleEvenly<T>(items: T[], size: number): T[] {
  if (!Number.isInteger(size) || size <= 0 || size >= items.length) return items;
  const step = items.length / size;
  return Array.from({ length: size }, (_, index) => items[Math.floor(index * step)]);
}

/** The sample size from an environment variable, or 0 for "everything". */
export function prerenderSampleSize(value: string | undefined): number {
  const size = Number(value);
  return Number.isInteger(size) && size > 0 ? size : 0;
}

/** How many market pages a Vercel production build prerenders by default. */
export const DEFAULT_PRODUCTION_MARKET_LIMIT = 1000;

/**
 * How many market pages to prerender, or 0 for all of them.
 *
 * Prerendering all ~9,100 market pages made the Vercel output about 4.2 GB in
 * 116,000 files, which Vercel then has to upload and process on every deploy.
 * Vercel builds therefore prerender only the top `DEFAULT_PRODUCTION_MARKET_LIMIT`
 * markets; the rest render on their first request and are then cached like
 * any other ISR page (`revalidate` on the route). `PRERENDER_MARKET_LIMIT`
 * overrides the default: a number, or `all` to prerender everything again.
 * Builds outside Vercel (local, CI, the data refresh) prerender everything
 * unless the variable is set.
 */
export function prerenderMarketLimit(env: Record<string, string | undefined>): number {
  const value = env.PRERENDER_MARKET_LIMIT?.trim().toLowerCase();
  if (value === 'all') return 0;
  const size = Number(value);
  if (value && Number.isInteger(size) && size > 0) return size;
  return env.VERCEL ? DEFAULT_PRODUCTION_MARKET_LIMIT : 0;
}

/**
 * The `size` markets most worth having prerendered: the ones people visited
 * in the last 30 days first (most visits first), then the strongest listings
 * (`richness`, the score every list on the site sorts by), which are the
 * pages most likely to be found in search. Ties keep the input order, so the
 * choice is the same on every build of the same data.
 */
export function topMarkets<T extends { slug: string; richness?: number }>(
  markets: T[],
  visits: Record<string, number>,
  size: number,
): T[] {
  if (!Number.isInteger(size) || size <= 0 || size >= markets.length) return markets;
  return markets
    .map((market, index) => ({ market, index, visits: visits[market.slug] ?? 0 }))
    .sort(
      (a, b) =>
        b.visits - a.visits ||
        (b.market.richness ?? 0) - (a.market.richness ?? 0) ||
        a.index - b.index,
    )
    .slice(0, size)
    .map(({ market }) => market);
}
