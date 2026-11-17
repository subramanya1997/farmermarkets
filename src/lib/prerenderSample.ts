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
