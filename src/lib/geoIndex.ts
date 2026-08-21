/**
 * Typed, memoized reader for the committed geo index.
 *
 * `public/data/geo_index.json` is built offline by `scripts/build-geo-index.mjs`
 * (`npm run data:geo`) from the two market snapshots: every state written both
 * "NY" and "New York" collapsed into one entry, every city that could be
 * recovered from an address or from coordinates filled in, and every market
 * placed exactly once. Reading it here — rather than recomputing the grouping
 * during the build — keeps state and city page generation to a single 1.3 MB
 * parse per server process.
 *
 * Nothing is wired into a page yet; this is the interface the state and city
 * routes consume.
 */

import 'server-only';
import { promises as fs } from 'fs';
import path from 'path';

export interface GeoCity {
  /** Display name — the most common spelling in the source data. */
  name: string;
  /** Kebab-case, unique within its state. */
  slug: string;
  market_count: number;
  /** Slugs of the markets in this city, matching `FarmerMarket.slug`. */
  market_slugs: string[];
}

export interface GeoState {
  /** 2-letter US state / Canadian province code, or null for a country entry. */
  code: string | null;
  /** "New York", "Ontario", "France". */
  name: string;
  /** ISO country code the entry belongs to. */
  country_code: string;
  /** Kebab-case slug for the state URL. */
  slug: string;
  /** Markets in the state: every city plus `uncategorized_slugs`. */
  market_count: number;
  city_count: number;
  /** Ordered by market count descending, then name. */
  cities: GeoCity[];
  /** Markets whose state is known but whose city never resolved. */
  uncategorized_slugs: string[];
}

export interface GeoIndex {
  generated_at: string;
  /** Total records the index was built from, including `unresolved`. */
  market_count: number;
  /** Ordered by market count descending, then name. */
  states: GeoState[];
  /** Markets with no usable location at all. */
  unresolved: string[];
}

const GEO_INDEX_PATH = 'public/data/geo_index.json';

/**
 * Parsed once per server process, in the same shape as the market data layer:
 * a module-level promise that is dropped again on failure so the next caller
 * retries instead of being stuck with a broken index.
 */
let geoIndexPromise: Promise<GeoIndex> | null = null;

async function readGeoIndex(): Promise<GeoIndex> {
  const contents = await fs.readFile(path.join(process.cwd(), GEO_INDEX_PATH), 'utf8');
  const parsed = JSON.parse(contents) as GeoIndex;
  if (!Array.isArray(parsed?.states)) {
    throw new Error(`${GEO_INDEX_PATH} has no states array`);
  }
  return parsed;
}

/** The whole index. */
export function getGeoIndex(): Promise<GeoIndex> {
  if (!geoIndexPromise) {
    geoIndexPromise = readGeoIndex().catch((error) => {
      geoIndexPromise = null;
      throw error;
    });
  }

  return geoIndexPromise;
}

let stateLookupPromise: Promise<Map<string, GeoState>> | null = null;

/**
 * Lookup by state code *and* by slug, so a route can resolve either
 * `/markets/state/ny` or `/markets/state/new-york` to the same entry — which is
 * what stops the two spellings in the source data from becoming two pages.
 */
function getStateLookup(): Promise<Map<string, GeoState>> {
  if (!stateLookupPromise) {
    stateLookupPromise = getGeoIndex()
      .then((index) => {
        const lookup = new Map<string, GeoState>();
        for (const state of index.states) {
          if (state.code) lookup.set(state.code.toLowerCase(), state);
          if (!lookup.has(state.slug)) lookup.set(state.slug, state);
        }
        return lookup;
      })
      .catch((error) => {
        stateLookupPromise = null;
        throw error;
      });
  }

  return stateLookupPromise;
}

/** One state by its 2-letter code or its slug; null when it is not in the index. */
export async function getStateByCode(codeOrSlug: string): Promise<GeoState | null> {
  const key = codeOrSlug?.trim().toLowerCase();
  if (!key) return null;
  return (await getStateLookup()).get(key) ?? null;
}

/** One city within a state, by the state's code/slug and the city slug. */
export async function getCity(stateCode: string, citySlug: string): Promise<GeoCity | null> {
  const state = await getStateByCode(stateCode);
  if (!state) return null;
  const key = citySlug?.trim().toLowerCase();
  return state.cities.find((city) => city.slug === key) ?? null;
}
