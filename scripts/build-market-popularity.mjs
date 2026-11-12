#!/usr/bin/env node
/**
 * Recent human visits per market page, for the ranking's popularity bonus.
 *
 * Asks PostHog for the last 30 days of pageviews on /markets/{slug} and
 * counts sessions, not raw hits, keeping only sessions that look human: most
 * pageviews on the site come from crawlers that run JavaScript, arrive with
 * no referrer, view one page and leave at once. A session counts when it
 * came from another site, stayed ten seconds, or clicked something.
 *
 * Writes data/market-popularity.json ({ slug: visits }), which the server
 * folds into each listing's ranking strength (`src/lib/marketRichness.ts`).
 * The daily "Refresh market popularity" workflow runs this.
 *
 *   node scripts/build-market-popularity.mjs            write the file
 *   node scripts/build-market-popularity.mjs --dry-run  print a summary only
 *   node scripts/build-market-popularity.mjs --force    write even if the tally collapsed
 *
 * Needs POSTHOG_API_KEY (a personal key with query read), POSTHOG_PROJECT_ID
 * and POSTHOG_HOST; reads them from the environment or .env.local.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'data', 'market-popularity.json');
const MARKETS = join(ROOT, 'public', 'data', 'farmers_markets.json');
export const WINDOW_DAYS = 30;

function loadEnvFile() {
  const file = join(ROOT, '.env.local');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

const HUMAN_SESSION = `(
  session.$session_duration >= 10
  OR session.$autocapture_count > 0
  OR (session.$entry_referring_domain IS NOT NULL AND session.$entry_referring_domain NOT IN ('$direct', ''))
)`;

const QUERY = `
SELECT properties.$pathname AS path, count(DISTINCT $session_id) AS visits
FROM events
WHERE event = '$pageview'
  AND timestamp >= now() - INTERVAL ${WINDOW_DAYS} DAY
  AND properties.$pathname LIKE '/markets/%'
  AND properties.$host NOT LIKE 'localhost%'
  AND properties.$host NOT LIKE '127.0.0.1%'
  AND ${HUMAN_SESSION}
GROUP BY path
ORDER BY visits DESC
LIMIT 50000`;

/** '/markets/some-slug/' → 'some-slug'; anything deeper or shallower → null. */
export function slugFromPath(path) {
  const match = /^\/markets\/([a-z0-9][a-z0-9-]*)\/?$/.exec(String(path ?? ''));
  return match ? match[1] : null;
}

/** Rows of [path, visits] → { slug: visits } for slugs the dataset knows. */
export function tallyVisits(rows, knownSlugs) {
  const visits = {};
  for (const [path, count] of rows) {
    const slug = slugFromPath(path);
    const n = Number(count);
    if (!slug || !knownSlugs.has(slug) || !Number.isFinite(n) || n <= 0) continue;
    visits[slug] = (visits[slug] ?? 0) + Math.floor(n);
  }
  return Object.fromEntries(
    Object.entries(visits).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  );
}

async function fetchRows() {
  const { POSTHOG_API_KEY: key, POSTHOG_PROJECT_ID: project } = process.env;
  const host = (process.env.POSTHOG_HOST || 'https://us.posthog.com').replace(/\/$/, '');
  if (!key || !project) throw new Error('POSTHOG_API_KEY and POSTHOG_PROJECT_ID are required');
  const response = await fetch(`${host}/api/projects/${project}/query/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: QUERY }, name: 'market popularity' }),
  });
  if (!response.ok) {
    throw new Error(`PostHog query failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
  }
  const body = await response.json();
  if (!Array.isArray(body.results)) throw new Error('PostHog query returned no results array');
  return body.results;
}

async function main() {
  loadEnvFile();
  const dryRun = process.argv.includes('--dry-run');
  const knownSlugs = new Set(JSON.parse(readFileSync(MARKETS, 'utf8')).map((market) => market.slug));
  const rows = await fetchRows();
  const markets = tallyVisits(rows, knownSlugs);
  const counts = Object.values(markets);
  const total = counts.reduce((sum, n) => sum + n, 0);
  const at = (n) => counts.filter((c) => c >= n).length;
  console.log(
    `${rows.length} paths from PostHog, ${counts.length} listed markets with visits, ${total} visits in ${WINDOW_DAYS} days`
  );
  console.log(`markets with >=2: ${at(2)}, >=5: ${at(5)}, >=10: ${at(10)}, >=25: ${at(25)}; top: ${counts.slice(0, 8).join(', ')}`);
  if (dryRun) return;
  // A tracking outage or a broken query should not wipe the signal: keep the
  // last good file when the tally collapses, unless told otherwise.
  if (existsSync(OUTPUT) && !process.argv.includes('--force')) {
    const previous = Object.keys(JSON.parse(readFileSync(OUTPUT, 'utf8')).markets ?? {}).length;
    if (previous >= 40 && counts.length < previous / 4) {
      throw new Error(
        `only ${counts.length} markets with visits, down from ${previous}; kept the existing file (pass --force to overwrite)`
      );
    }
  }
  // No timestamp in the file: an unchanged tally leaves an unchanged file, so
  // the daily job only commits (and redeploys) when the numbers moved.
  writeFileSync(OUTPUT, `${JSON.stringify({ window_days: WINDOW_DAYS, markets }, null, 2)}\n`);
  console.log(`wrote ${OUTPUT}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
