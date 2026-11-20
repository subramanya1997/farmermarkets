/**
 * Runtime market merges (`market_redirects`) for `src/proxy.ts`, which
 * answers a merged slug with a 301 before any page renders or any cache is
 * read. The proxy runs on every page request, so the whole table (small:
 * one row per merged duplicate) is held in memory and refreshed in the
 * background once a minute; a request never waits on the database except
 * the first one in a fresh instance, and then for at most 1.5 seconds. Any
 * failure means "no runtime redirects", never a broken page.
 *
 * No `server-only` or `@/db` import: the proxy is not a React server module.
 */
import { neon } from '@neondatabase/serverless';

const TTL_MS = 60 * 1000;
const FIRST_LOAD_TIMEOUT_MS = 1500;

let cached: { at: number; map: Map<string, string> } | null = null;
let loading: Promise<Map<string, string>> | null = null;

async function load(): Promise<Map<string, string>> {
  const url = process.env.DATABASE_URL;
  if (!url) return new Map();
  const sql = neon(url);
  const rows = (await sql`select from_slug, to_slug from market_redirects`) as { from_slug: string; to_slug: string }[];
  return new Map(rows.map((row) => [row.from_slug, row.to_slug]));
}

function refresh(): Promise<Map<string, string>> {
  loading ??= load()
    .then((map) => {
      cached = { at: Date.now(), map };
      return map;
    })
    .catch((error) => {
      console.error('Runtime market redirects unavailable:', error instanceof Error ? error.message : error);
      // Keep serving what we had; try again after another TTL.
      cached = { at: Date.now(), map: cached?.map ?? new Map() };
      return cached.map;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** Where a merged market slug now lives, or undefined. */
export async function runtimeRedirectTarget(slug: string): Promise<string | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  if (cached) {
    if (Date.now() - cached.at > TTL_MS) void refresh();
    return cached.map.get(slug);
  }
  const map = await Promise.race([
    refresh(),
    new Promise<Map<string, string>>((resolve) => setTimeout(() => resolve(new Map()), FIRST_LOAD_TIMEOUT_MS)),
  ]);
  return map.get(slug);
}
