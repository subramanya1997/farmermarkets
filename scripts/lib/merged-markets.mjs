/**
 * Duplicate listings folded into one page.
 *
 * The sources are merged without deduplication, so one market can arrive as
 * a legacy USDA row plus one or more California WIC rows. When the operator
 * confirms two rows are the same market, `data/overrides/merged-markets.json`
 * names the row to drop (`id`) and the listing that survives (`into`). The
 * consolidation build leaves the dropped row out of the canonical file, and
 * `data/slug-redirects.json` must send its old slug to the survivor's page so
 * the URL keeps working. Facts worth keeping from the dropped row belong on
 * the survivor through a research batch or an editorial override.
 *
 * Entries are keyed by stable market ID and carry the dropped row's name as a
 * guard, so a refresh that reassigns an ID fails instead of hiding a market.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export const MERGED_MARKETS_PATH = 'data/overrides/merged-markets.json';
export const SLUG_REDIRECTS_PATH = 'data/slug-redirects.json';

async function readJsonIfPresent(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function readMarketMerges(root) {
  const file = await readJsonIfPresent(path.join(root, MERGED_MARKETS_PATH), { schema_version: 1, merges: [] });
  if (file.schema_version !== 1 || !Array.isArray(file.merges)) {
    throw new Error('merged markets file has an unsupported shape');
  }
  const redirects = await readJsonIfPresent(path.join(root, SLUG_REDIRECTS_PATH), { redirects: {} });
  return { merges: file.merges, redirects: redirects.redirects ?? {} };
}

/**
 * Drop each merged row and return the remaining markets in order.
 * Throws on a malformed entry, a name mismatch, a chained merge or a missing
 * redirect. With `skipStale` (the scheduled refresh), an entry whose row the
 * source no longer publishes is skipped with a warning instead.
 */
export function applyMarketMerges(markets, merges, redirects, { skipStale = false, warn = console.warn } = {}) {
  if (!merges.length) return markets;
  const byId = new Map();
  for (const market of markets) {
    const id = String(market.id);
    byId.set(id, byId.has(id) ? null : market);
  }
  const dropped = new Set();
  const mergedIds = new Set(merges.map((merge) => String(merge.id)));
  for (const merge of merges) {
    const label = `merged market ${merge.id}`;
    for (const key of ['id', 'name', 'into', 'reason']) {
      if (typeof merge[key] !== 'string' || !merge[key].trim()) throw new Error(`${label} needs a non-empty ${key}`);
    }
    if (merge.id === merge.into) throw new Error(`${label} cannot merge into itself`);
    if (mergedIds.has(String(merge.into))) throw new Error(`${label} merges into ${merge.into}, which is itself merged away`);
    const market = byId.get(String(merge.id));
    if (!market) {
      if (skipStale) {
        warn(`${label} skipped: the source no longer lists it`);
        continue;
      }
      throw new Error(`${label} does not name exactly one row`);
    }
    if (market.name !== merge.name) {
      throw new Error(`${label} is named ${JSON.stringify(market.name)}, expected ${JSON.stringify(merge.name)}`);
    }
    const survivor = byId.get(String(merge.into));
    if (!survivor) throw new Error(`${label} merges into ${merge.into}, which does not name exactly one row`);
    const target = `/markets/${survivor.slug}`;
    if (redirects[market.slug] !== target) {
      throw new Error(`${label}: ${SLUG_REDIRECTS_PATH} must redirect ${JSON.stringify(market.slug)} to ${JSON.stringify(target)}`);
    }
    dropped.add(market);
  }
  return markets.filter((market) => !dropped.has(market));
}
