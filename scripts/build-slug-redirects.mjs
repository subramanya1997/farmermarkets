/**
 * Keep old market URLs working after a data refresh.
 *
 * Government market slugs end in a hash of the source's record id, so when a
 * publisher re-keys its dataset (DC did in 2026) or drops a market, its old
 * `/markets/{slug}` URL would start returning 404. This compares the market
 * list before and after a refresh and records a permanent redirect for every
 * slug that disappeared:
 *
 *   1. to the same market under its new slug (same name, ignoring case, in
 *      the same city and state), or
 *   2. to the city page it was listed on, or the state hub, when the market
 *      itself is gone.
 *
 * Redirects accumulate in `data/slug-redirects.json`, which `next.config.ts`
 * serves. A redirect whose target later disappears is re-pointed, so there
 * are never chains.
 *
 *   node scripts/build-slug-redirects.mjs --previous old-markets.json --previous-geo old-geo.json
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REDIRECTS_PATH = 'data/slug-redirects.json';
const MARKETS_PATH = 'public/data/farmers_markets.json';
const GEO_PATH = 'public/data/geo_index.json';

const key = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

function locationKey(market) {
  return `${key(market.location?.city)}|${key(market.location?.state)}`;
}

/** slug -> "/{state}/{city}" (or "/{state}") from a geo index. */
function placePaths(geoIndex) {
  const paths = new Map();
  for (const state of geoIndex?.states ?? []) {
    for (const city of state.cities ?? []) {
      for (const slug of city.market_slugs ?? []) paths.set(slug, `/${state.slug}/${city.slug}`);
    }
    for (const slug of state.uncategorized_slugs ?? []) paths.set(slug, `/${state.slug}`);
  }
  return paths;
}

export function buildSlugRedirects({ previous, current, previousGeo, currentGeo, existing = {} }) {
  const currentSlugs = new Set(current.map((market) => market.slug));
  const byNameAndPlace = new Map();
  for (const market of current) {
    const id = `${key(market.name)}|${locationKey(market)}`;
    byNameAndPlace.set(id, byNameAndPlace.has(id) ? null : market.slug);
  }
  const oldPlaces = placePaths(previousGeo);
  const newPlaces = new Set(placePaths(currentGeo).values());
  for (const state of currentGeo?.states ?? []) newPlaces.add(`/${state.slug}`);

  const resolve = (market) => {
    const same = byNameAndPlace.get(`${key(market.name)}|${locationKey(market)}`);
    if (same) return `/markets/${same}`;
    const place = oldPlaces.get(market.slug);
    if (place && newPlaces.has(place)) return place;
    const state = place?.split('/')[1];
    if (state && newPlaces.has(`/${state}`)) return `/${state}`;
    return '/markets';
  };

  const redirects = { ...existing };
  const added = [];
  for (const market of previous) {
    if (currentSlugs.has(market.slug) || redirects[market.slug]) continue;
    redirects[market.slug] = resolve(market);
    added.push(market.slug);
  }

  // A slug that came back is a live page again; a target that vanished is
  // re-pointed at what replaced it, so no redirect ever chains.
  for (const [slug, target] of Object.entries(redirects)) {
    if (currentSlugs.has(slug)) {
      delete redirects[slug];
      continue;
    }
    const targetSlug = target.startsWith('/markets/') ? target.slice('/markets/'.length) : undefined;
    if (targetSlug && !currentSlugs.has(targetSlug)) {
      redirects[slug] = redirects[targetSlug] ?? '/markets';
    }
  }

  return { redirects: Object.fromEntries(Object.entries(redirects).sort(([a], [b]) => a.localeCompare(b))), added };
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (fallback !== undefined && error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function main(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--previous') options.previous = argv[++index];
    else if (argv[index] === '--previous-geo') options.previousGeo = argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!options.previous || !options.previousGeo) {
    throw new Error('Usage: build-slug-redirects.mjs --previous <markets.json> --previous-geo <geo_index.json>');
  }
  const [previous, current, previousGeo, currentGeo, file] = await Promise.all([
    readJson(options.previous),
    readJson(MARKETS_PATH),
    readJson(options.previousGeo),
    readJson(GEO_PATH),
    readJson(REDIRECTS_PATH, { schema_version: 1, redirects: {} }),
  ]);
  const { redirects, added } = buildSlugRedirects({
    previous,
    current,
    previousGeo,
    currentGeo,
    existing: file.redirects ?? {},
  });
  await fs.writeFile(
    path.resolve(REDIRECTS_PATH),
    `${JSON.stringify({ schema_version: 1, note: file.note ?? 'Old market slugs and where they now live. Written by scripts/build-slug-redirects.mjs during data refreshes; served by next.config.ts.', redirects }, null, 2)}\n`
  );
  const toMarkets = added.filter((slug) => redirects[slug]?.startsWith('/markets/')).length;
  console.log(`slug redirects: ${added.length} new (${toMarkets} to the same market, ${added.length - toMarkets} to a city or state page), ${Object.keys(redirects).length} total`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
