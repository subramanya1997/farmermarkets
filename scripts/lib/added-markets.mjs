/**
 * Markets the government and legacy sources do not list, added by hand from
 * the market's own page or its operator's (`data/enrichment/added-markets.json`).
 *
 * The rows use the same shape as `data/sources/government_markets.json` and
 * join the consolidation as a third source, so enrichment, the geo index and
 * every page treat them like any other market. They live outside
 * `data/sources/` because the refresh rewrites that directory; their
 * provenance names the page they came from instead of a dataset.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export const ADDED_MARKETS_PATH = 'data/enrichment/added-markets.json';
export const ADDED_SOURCE_ID = 'added';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Name and city reduced to what identifies a market, for spotting a source that now lists it. */
export function addedMarketKey(market) {
  const words = (value) =>
    String(value ?? '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/['‘’]s\b/g, '')
      .split(/[^a-z0-9]+/)
      .filter((word) => word && !['the', 'farmers', 'farmer', 'market', 'markets'].includes(word));
  return `${words(market.name).join(' ')}|${words(market.location?.city).join(' ')}|${words(market.location?.state).join(' ')}`;
}

function problemsIn(market, index) {
  const at = `${ADDED_MARKETS_PATH}[${index}]`;
  const problems = [];
  const provenance = market.provenance ?? {};
  if (!SLUG.test(market.slug ?? '')) problems.push(`${at} needs a kebab-case slug`);
  if (market.id !== `${ADDED_SOURCE_ID}:${market.slug}`) problems.push(`${at} id must be "${ADDED_SOURCE_ID}:{slug}"`);
  if (!market.name?.trim()) problems.push(`${at} needs a name`);
  if (!market.country || !market.country_code) problems.push(`${at} needs country and country_code`);
  if (!market.location?.city || !market.location?.state) problems.push(`${at} needs a city and state`);
  if (provenance.official !== false || provenance.source_id !== ADDED_SOURCE_ID) {
    problems.push(`${at} provenance must be { official: false, source_id: "${ADDED_SOURCE_ID}" }`);
  }
  if (!provenance.publisher?.trim()) problems.push(`${at} provenance needs the publisher of its source page`);
  if (!/^https?:\/\/\S+\.\S+/.test(provenance.catalog_url ?? '')) problems.push(`${at} provenance needs the source page URL`);
  if (!DATE.test(String(provenance.retrieved_at ?? '').slice(0, 10))) problems.push(`${at} provenance needs retrieved_at`);
  return problems;
}

/**
 * The added rows to consolidate after `existing` (legacy + government).
 * A row that a source now lists is a duplicate: locally that fails so the
 * added row gets retired; in the refresh job (`skipStale`) the source row
 * wins and the added row is dropped with a warning.
 */
export async function readAddedMarkets(existing, { root = process.cwd(), skipStale = false } = {}) {
  let rows;
  try {
    rows = JSON.parse(await fs.readFile(path.join(root, ADDED_MARKETS_PATH), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  if (!Array.isArray(rows)) throw new Error(`${ADDED_MARKETS_PATH} must contain a top-level array`);

  const problems = rows.flatMap(problemsIn);
  const ids = new Set(existing.map((market) => String(market.id)));
  const slugs = new Set(existing.map((market) => market.slug).filter(Boolean));
  const listedKeys = new Map(existing.map((market) => [addedMarketKey(market), market]));
  const kept = [];
  for (const [index, market] of rows.entries()) {
    const listed = listedKeys.get(addedMarketKey(market));
    if (listed) {
      const message = `${ADDED_MARKETS_PATH}[${index}] ${market.name} is now in the sources as ${listed.id}; remove the added row and move its research to that id`;
      if (!skipStale) problems.push(message);
      else console.warn(`${message} (added row skipped)`);
      continue;
    }
    if (ids.has(String(market.id))) problems.push(`${ADDED_MARKETS_PATH}[${index}] duplicate id ${market.id}`);
    if (slugs.has(market.slug)) problems.push(`${ADDED_MARKETS_PATH}[${index}] duplicate slug ${market.slug}`);
    ids.add(String(market.id));
    slugs.add(market.slug);
    kept.push(market);
  }
  if (problems.length) throw new Error(problems.join('\n'));
  return kept;
}
