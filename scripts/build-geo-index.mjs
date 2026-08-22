#!/usr/bin/env node
/**
 * Build `public/data/geo_index.json` — the normalized state → city → market
 * index the city and state pages are generated from.
 *
 * The geo index is a derived navigation accelerator. Market records themselves
 * live in one canonical file and are never rewritten by this script.
 *
 * What it fixes, in order of preference per record:
 *  1. `field`   — the record's own `city`/`state`, with "NY" and "New York"
 *                 mapped onto one canonical state so they cannot become two
 *                 separate city-page inventories.
 *  2. `address` — the ~2,200 rows with a null city and the ~1,800 with a null
 *                 state usually name the place inside `address`; the shared
 *                 `resolveLocation` in `src/lib/geo.ts` reads it back out.
 *  3. `coords`  — whatever is still missing is taken from the nearest record
 *                 that *does* have a city and state, within
 *                 `NEAREST_NEIGHBOUR_MAX_KM`. Offline, no geocoding API.
 *
 * On top of that, a state that cannot belong with the record's coordinates (a
 * US state or Canadian province on a market that plots in Europe or Asia) is
 * dropped rather than published, so no city page is ever filed under the wrong
 * country.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  clean,
  haversineKm,
  isCountryToken,
  isImpossibleStateForCoordinates,
  normalizeStateValue,
  provinceAbbreviation,
  provinceFullName,
  resolveLocation,
  stateAbbreviation,
  stateFullName,
  toSlug
} from '../src/lib/geo.ts';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');

export const DATA_FILES = [
  { file: 'public/data/farmers_markets.json' }
];

export const OUTPUT_FILE = 'public/data/geo_index.json';
export const REPORT_FILE = 'scripts/geo-index-report.txt';

/**
 * How far a record may sit from its nearest fully-located neighbour before we
 * refuse to borrow that neighbour's city. 40 km keeps a backfilled city inside
 * the same metro area in populated regions; beyond it, "nearest known city" is
 * a guess we would be publishing as a fact on a city page.
 */
export const NEAREST_NEIGHBOUR_MAX_KM = 40;
/**
 * A state is a much coarser claim than a city, so a lone rural record can
 * still inherit one from further away.
 */
export const NEAREST_NEIGHBOUR_STATE_MAX_KM = 150;

/** Source ranking, so a record's reported method is its weakest link. */
const METHOD_RANK = { field: 0, address: 1, coords: 2 };

/** Flatten one source file into the few fields this script reads. */
export function toGeoRecords(rawMarkets, { defaultCountry, defaultCountryCode } = {}) {
  return rawMarkets.map((market) => {
    const location = market.location ?? {};
    const coordinates = location.coordinates ?? {};
    const latitude = Number(coordinates.latitude);
    const longitude = Number(coordinates.longitude);
    const hasCoordinates =
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180 &&
      !(latitude === 0 && longitude === 0);

    return {
      slug: market.slug ?? '',
      name: market.name ?? '',
      country: market.country ?? defaultCountry ?? null,
      country_code: (market.country_code ?? defaultCountryCode ?? null)?.toUpperCase() ?? null,
      address: location.address ?? null,
      city: location.city ?? null,
      state: location.state ?? null,
      zip_code: location.zip_code ?? null,
      lat: hasCoordinates ? latitude : null,
      lon: hasCoordinates ? longitude : null
    };
  });
}

function countryNameFor(record) {
  const name = clean(record.country);
  if (name) return name;
  if (record.country_code === 'US') return 'United States';
  if (record.country_code === 'CA') return 'Canada';
  return record.country_code || 'Unknown';
}

/**
 * The state a record's own fields claim, as a canonical entry, or null.
 *
 * `US`/`USA` in the state column (166 rows) is a country, not a state, and is
 * dropped here rather than becoming a "USA" state page.
 */
function stateEntryFor(countryCode, rawState) {
  const value = normalizeStateValue(rawState);
  if (!value || isCountryToken(value)) return null;

  if (countryCode === 'US' || countryCode === null) {
    const code = stateAbbreviation(value);
    if (code) return { country_code: 'US', code, name: stateFullName(value) };
  }
  if (countryCode === 'CA' || countryCode === null) {
    const code = provinceAbbreviation(value);
    if (code) return { country_code: 'CA', code, name: provinceFullName(value) };
  }
  return null;
}

/** Unique key for a top-level entry: US/CA states, everything else a country. */
export function entryKey(entry) {
  return entry.code ? `${entry.country_code}:${entry.code}` : `country:${entry.country_code}`;
}

/**
 * Fallback entry for a record with no usable state: the country, but only for
 * countries this index does not break into states. A US or Canadian record
 * that lost its state (the corrupt rows) is left unresolved rather than filed
 * under a "United States" pseudo-state that would sit in the state directory
 * between Texas and Florida.
 */
function countryEntryFor(record) {
  if (!record.country_code) return null;
  if (record.country_code === 'US' || record.country_code === 'CA') return null;
  return { country_code: record.country_code, code: null, name: countryNameFor(record) };
}

/**
 * Words that give away a fragment of an address, or of a market's directions
 * blurb, that has been read as a city. Deliberately short: it only holds words
 * that never appear in a US or Canadian city name, so "Oak Park", "Rockville
 * Centre" and "The Dalles" all survive.
 */
const NOT_A_CITY_WORD =
  /\b(road|street|avenue|boulevard|blvd|highway|hwy|freeway|thruway|route|parking|entrance|exit|corner|campus|behind|across|located|between|opposite|building|gazebo|pavilion|fairground|fairgrounds|farmers|market|marketplace)\b/i;

/** Words that mark a line as a street or a venue rather than a town. */
const STREET_WORD =
  /\b(st|street|rd|road|ave|avenue|dr|drive|ln|lane|ct|court|pl|place|blvd|way|circle|cir|terrace|ter|trail|trl|pkwy|parkway|square|sq|plaza|hall|center|centre|park|school|church|library|lot|mall|store|farm|garden|rue|quai|cours|allée|allee|boulevard)\b/i;

/**
 * Is this string a city name, or an address fragment that only looks like one?
 *
 * The address fallback is a heuristic over inconsistent data, and its failures
 * are memorable: "NY 10509 Off of Route 22 to Doansburg Road", "at the Eagle
 * Rock City Hall. Free parking available…". A city page named after one of
 * those is worse than no city page, so anything that fails this check is
 * treated as an unknown city and left to the coordinate backfill instead.
 */
export function isPlausibleCityName(value) {
  const name = clean(value);
  if (name.length < 2 || name.length > 40) return false;
  // City names in both feeds are capitalized; a lower-case opener means the
  // fragment started mid-sentence ("just west of the freeway").
  if (!/^[\p{Lu}\p{Lo}]/u.test(name)) return false;
  if (/\d/.test(name)) return false;
  if (/[^\p{L}\p{M}\s'’.\-/]/u.test(name)) return false;
  if (name.split(/\s+/).length > 4) return false;
  if (NOT_A_CITY_WORD.test(name)) return false;
  return true;
}

/**
 * Resolve one record from its own fields and its address, without looking at
 * any other record. `state` is a canonical entry ({country_code, code, name})
 * or null; `city` is a display name or null.
 */
export function resolveFromFields(record) {
  const countryCode = record.country_code ?? null;

  let state = stateEntryFor(countryCode, record.state);
  let stateSource = state ? 'field' : null;
  let city = isPlausibleCityName(record.city) ? clean(record.city) : null;
  let citySource = city ? 'field' : null;
  let corrupt = false;

  // A US state or Canadian province that cannot possibly go with these
  // coordinates is corrupt data, not a location: drop it and keep the country.
  if (state && isImpossibleStateForCoordinates(record.state, record.lat, record.lon)) {
    state = null;
    stateSource = null;
    corrupt = true;
  }

  // Non-US/CA records never carry a US/CA state: `stateEntryFor` only maps one
  // when the record's country agrees, so this is a fall-through, not a filter.
  if (!state || !city) {
    const fromAddress = resolveLocation(record);
    if (!state && fromAddress.state) {
      const candidate = stateEntryFor(countryCode, fromAddress.state);
      const impossible =
        candidate && isImpossibleStateForCoordinates(fromAddress.state, record.lat, record.lon);
      if (candidate && !impossible) {
        state = candidate;
        stateSource = 'address';
      } else if (impossible) {
        corrupt = true;
      }
    }
    if (!city && isPlausibleCityName(fromAddress.city)) {
      city = clean(fromAddress.city);
      citySource = 'address';
    }
    // "Tekamah , Nebraska" is a whole address that is only a city: the state
    // comes off the end and the city is left behind as the "street", where
    // `resolveLocation` will not claim it because nothing follows it. Reading
    // it as the city beats letting the coordinate pass guess a town 27 km
    // away — but only for a US/CA record with no street-ish word in it, so a
    // bare French street line ("Rue Gabillot") is never taken for a city.
    if (
      !city &&
      state &&
      (record.country_code === 'US' || record.country_code === 'CA') &&
      isPlausibleCityName(fromAddress.street) &&
      !STREET_WORD.test(fromAddress.street)
    ) {
      city = clean(fromAddress.street);
      citySource = 'address';
    }
  }

  return { state, stateSource, city, citySource, corrupt };
}

/** Records that already know where they are, usable as reverse-geocode anchors. */
function buildAnchors(resolutions) {
  return resolutions.filter(
    (resolution) => resolution.state && resolution.city && resolution.record.lat !== null
  );
}

/**
 * Fill the gaps left after fields and address from the nearest anchor.
 *
 * Deliberately simple: a linear haversine scan against the anchor set, which
 * is a few seconds for 8.8k records and needs no dependency, no places
 * dataset and no network. Anchors are restricted to the record's own country —
 * and to its own state when it already has one — so a border town never
 * inherits a city from the other side.
 */
function backfillFromCoordinates(resolutions) {
  const anchors = buildAnchors(resolutions);
  const anchorsByCountry = new Map();
  const anchorsByState = new Map();

  for (const anchor of anchors) {
    const country = anchor.record.country_code ?? 'US';
    if (!anchorsByCountry.has(country)) anchorsByCountry.set(country, []);
    anchorsByCountry.get(country).push(anchor);

    const key = entryKey(anchor.state);
    if (!anchorsByState.has(key)) anchorsByState.set(key, []);
    anchorsByState.get(key).push(anchor);
  }

  for (const resolution of resolutions) {
    const { record } = resolution;
    if (resolution.state && resolution.city) continue;
    if (record.lat === null) continue;

    const candidates = resolution.state
      ? anchorsByState.get(entryKey(resolution.state)) ?? []
      : anchorsByCountry.get(record.country_code ?? 'US') ?? [];

    let nearest = null;
    let nearestKm = Infinity;
    for (const candidate of candidates) {
      if (candidate === resolution) continue;
      const distance = haversineKm(record.lat, record.lon, candidate.record.lat, candidate.record.lon);
      if (distance < nearestKm) {
        nearestKm = distance;
        nearest = candidate;
      }
    }
    if (!nearest) continue;

    if (!resolution.state && nearestKm <= NEAREST_NEIGHBOUR_STATE_MAX_KM) {
      resolution.state = nearest.state;
      resolution.stateSource = 'coords';
      resolution.nearestKm = nearestKm;
    }
    // The city is only borrowed from a genuinely close neighbour, and only
    // when the neighbour ended up in the same state we did.
    if (
      !resolution.city &&
      nearestKm <= NEAREST_NEIGHBOUR_MAX_KM &&
      resolution.state &&
      entryKey(resolution.state) === entryKey(nearest.state)
    ) {
      resolution.city = nearest.city;
      resolution.citySource = 'coords';
      resolution.nearestKm = nearestKm;
    }
  }

  return resolutions;
}

/** The weakest source used for a record, or null when nothing resolved. */
export function resolutionMethod(resolution) {
  const sources = [resolution.stateSource, resolution.citySource].filter(Boolean);
  if (sources.length === 0) return null;
  return sources.sort((left, right) => METHOD_RANK[right] - METHOD_RANK[left])[0];
}

/** Resolve every record: fields, then address, then nearest neighbour. */
export function resolveAll(records) {
  const resolutions = records.map((record) => ({ record, ...resolveFromFields(record) }));
  return backfillFromCoordinates(resolutions);
}

/**
 * Group resolved records into the committed index shape.
 *
 * Invariant the caller checks: every record lands in exactly one place — a
 * city under a state, the state's `uncategorized_slugs` when only the state is
 * known, or the top-level `unresolved` list.
 */
export function buildIndex(resolutions, { generatedAt = new Date().toISOString() } = {}) {
  const states = new Map();
  const unresolved = [];

  for (const resolution of resolutions) {
    const slug = resolution.record.slug;
    const entry = resolution.state ?? countryEntryFor(resolution.record);
    if (!entry) {
      unresolved.push(slug);
      continue;
    }

    const key = entryKey(entry);
    if (!states.has(key)) {
      states.set(key, {
        code: entry.code,
        name: entry.name,
        country_code: entry.country_code,
        slug: toSlug(entry.name),
        cities: new Map(),
        uncategorized: []
      });
    }
    const state = states.get(key);

    const cityName = resolution.city ? clean(resolution.city) : '';
    const citySlug = cityName ? toSlug(cityName) : '';
    if (!citySlug) {
      state.uncategorized.push(slug);
      continue;
    }

    if (!state.cities.has(citySlug)) {
      state.cities.set(citySlug, { slug: citySlug, names: new Map(), market_slugs: [] });
    }
    const city = state.cities.get(citySlug);
    // The same city is spelled several ways across the feeds ("St. Paul",
    // "Saint Paul"); one slug wins and the most common spelling names it.
    city.names.set(cityName, (city.names.get(cityName) ?? 0) + 1);
    city.market_slugs.push(slug);
  }

  const stateList = [...states.values()]
    .map((state) => {
      const cities = [...state.cities.values()]
        .map((city) => ({
          name: pickDisplayName(city.names),
          slug: city.slug,
          market_count: city.market_slugs.length,
          market_slugs: [...city.market_slugs].sort()
        }))
        .sort((left, right) => right.market_count - left.market_count || left.name.localeCompare(right.name));

      const marketCount =
        cities.reduce((total, city) => total + city.market_count, 0) + state.uncategorized.length;

      return {
        code: state.code,
        name: state.name,
        country_code: state.country_code,
        slug: state.slug,
        market_count: marketCount,
        city_count: cities.length,
        cities,
        // State is known, city is not — these markets belong to the state page
        // but can never get a city page.
        uncategorized_slugs: [...state.uncategorized].sort()
      };
    })
    .sort((left, right) => right.market_count - left.market_count || left.name.localeCompare(right.name));

  return {
    generated_at: generatedAt,
    market_count: resolutions.length,
    states: stateList,
    unresolved: [...unresolved].sort()
  };
}

/** Most frequent spelling of a city name; alphabetical tie-break for stability. */
function pickDisplayName(names) {
  return [...names.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
  )[0][0];
}

/** Counts for the report, computed from the resolutions rather than the index. */
export function summarize(records, resolutions, index) {
  const counts = {
    total: records.length,
    from_field: 0,
    from_address: 0,
    from_coords: 0,
    corrupt_fixed: 0,
    unresolved: index.unresolved.length,
    state_from_field: 0,
    state_from_address: 0,
    state_from_coords: 0,
    city_from_field: 0,
    city_from_address: 0,
    city_from_coords: 0,
    missing_city_before: 0,
    missing_state_before: 0,
    missing_city_after: 0,
    missing_state_after: 0,
    missing_state_international: 0,
    no_coordinates: 0
  };

  for (const resolution of resolutions) {
    const method = resolutionMethod(resolution);
    if (method === 'field') counts.from_field += 1;
    if (method === 'address') counts.from_address += 1;
    if (method === 'coords') counts.from_coords += 1;
    if (resolution.corrupt) counts.corrupt_fixed += 1;
    if (resolution.stateSource) counts[`state_from_${resolution.stateSource}`] += 1;
    if (resolution.citySource) counts[`city_from_${resolution.citySource}`] += 1;
    if (!clean(resolution.record.city)) counts.missing_city_before += 1;
    if (!stateEntryFor(resolution.record.country_code ?? null, resolution.record.state)) {
      counts.missing_state_before += 1;
    }
    if (!resolution.city) counts.missing_city_after += 1;
    if (!resolution.state) {
      counts.missing_state_after += 1;
      const country = resolution.record.country_code;
      if (country && country !== 'US' && country !== 'CA') counts.missing_state_international += 1;
    }
    if (resolution.record.lat === null) counts.no_coordinates += 1;
  }

  return counts;
}

function formatReport(counts, index, unresolvedExamples) {
  const usStates = index.states.filter((state) => state.country_code === 'US' && state.code);
  const cityCount = index.states.reduce((total, state) => total + state.cities.length, 0);
  const citiesWithThreePlus = index.states.reduce(
    (total, state) => total + state.cities.filter((city) => city.market_count >= 3).length,
    0
  );
  const indexed = index.states.reduce(
    (total, state) => total + state.market_count,
    0
  );

  const lines = [
    'Geo index build report',
    `generated_at            ${index.generated_at}`,
    '',
    'Records',
    `  total                 ${counts.total}`,
    `  indexed               ${indexed}`,
    `  unresolved            ${counts.unresolved}`,
    `  without coordinates   ${counts.no_coordinates}`,
    '',
    'Resolution method (weakest source a record needed)',
    `  from fields           ${counts.from_field}`,
    `  from address          ${counts.from_address}`,
    `  from coordinates      ${counts.from_coords}`,
    `  corrupt combos fixed  ${counts.corrupt_fixed}`,
    '',
    'State resolution',
    `  from fields           ${counts.state_from_field}`,
    `  from address          ${counts.state_from_address}`,
    `  from coordinates      ${counts.state_from_coords}`,
    `  missing before        ${counts.missing_state_before}`,
    `  missing after         ${counts.missing_state_after}`,
    `    of those, outside US/CA (grouped by country instead)  ${counts.missing_state_international}`,
    '',
    'City resolution',
    `  from fields           ${counts.city_from_field}`,
    `  from address          ${counts.city_from_address}`,
    `  from coordinates      ${counts.city_from_coords}`,
    `  missing before        ${counts.missing_city_before}`,
    `  missing after         ${counts.missing_city_after}`,
    '',
    'Index',
    `  top-level entries     ${index.states.length} (${usStates.length} US states/territories)`,
    `  cities                ${cityCount}`,
    `  cities with 3+ markets ${citiesWithThreePlus}`,
    '',
    'Top 10 entries by market count',
    ...index.states
      .slice(0, 10)
      .map(
        (state, position) =>
          `  ${String(position + 1).padStart(2)}. ${state.name.padEnd(24)} ${String(state.market_count).padStart(5)} markets  ${String(state.cities.length).padStart(4)} cities`
      ),
    '',
    'Unresolved examples',
    ...(unresolvedExamples.length
      ? unresolvedExamples.map((example) => `  ${example}`)
      : ['  (none)']),
    ''
  ];

  return lines.join('\n');
}

/** Fail the build rather than commit an index that breaks its own promises. */
export function assertIndexIsSound(index, records) {
  const seen = new Map();
  const slugs = new Set();

  for (const state of index.states) {
    const key = entryKey({ country_code: state.country_code, code: state.code });
    if (seen.has(key)) throw new Error(`duplicate state entry: ${key}`);
    seen.set(key, state);

    const stateSlug = `${state.country_code}/${state.slug}`;
    if (slugs.has(stateSlug)) throw new Error(`duplicate state slug: ${stateSlug}`);
    slugs.add(stateSlug);

    if (state.country_code !== 'US' && state.country_code !== 'CA' && state.code !== null) {
      throw new Error(`non-US/CA entry carries a state code: ${key}`);
    }

    const citySlugs = new Set();
    for (const city of state.cities) {
      if (citySlugs.has(city.slug)) throw new Error(`duplicate city slug ${city.slug} in ${key}`);
      citySlugs.add(city.slug);
      if (city.market_slugs.length !== city.market_count) {
        throw new Error(`city ${city.slug} in ${key} has a count that disagrees with its slugs`);
      }
    }
  }

  const placed = new Set();
  let placements = 0;
  for (const state of index.states) {
    for (const city of state.cities) {
      for (const slug of city.market_slugs) {
        placed.add(slug);
        placements += 1;
      }
    }
    for (const slug of state.uncategorized_slugs) {
      placed.add(slug);
      placements += 1;
    }
  }
  for (const slug of index.unresolved) {
    placed.add(slug);
    placements += 1;
  }

  if (placements !== records.length) {
    throw new Error(`index holds ${placements} placements for ${records.length} records`);
  }
  if (placed.size !== records.length) {
    throw new Error(`index holds ${placed.size} distinct slugs for ${records.length} records`);
  }
}

async function readDataFiles(root) {
  const datasets = await Promise.all(
    DATA_FILES.map(async ({ file, defaultCountry, defaultCountryCode }) => {
      const contents = await fs.readFile(path.join(root, file), 'utf8');
      const parsed = JSON.parse(contents);
      if (!Array.isArray(parsed)) throw new Error(`${file} is not an array`);
      return toGeoRecords(parsed, { defaultCountry, defaultCountryCode });
    })
  );
  return datasets.flat();
}

export async function buildGeoIndex({ root = repositoryRoot, write = true } = {}) {
  const records = await readDataFiles(root);
  const resolutions = resolveAll(records);
  const index = buildIndex(resolutions);
  assertIndexIsSound(index, records);

  const counts = summarize(records, resolutions, index);
  const unresolvedSet = new Set(index.unresolved);
  const examples = records
    .filter((record) => unresolvedSet.has(record.slug))
    .slice(0, 10)
    .map((record) => `${record.slug} — ${record.name} (${record.country_code ?? 'no country'})`);
  const report = formatReport(counts, index, examples);

  if (write) {
    await fs.writeFile(path.join(root, OUTPUT_FILE), `${JSON.stringify(index, null, 2)}\n`);
    await fs.writeFile(path.join(root, REPORT_FILE), report);
  }

  return { index, counts, report };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  buildGeoIndex()
    .then(({ report }) => {
      process.stdout.write(`${report}\n`);
      process.stdout.write(`Wrote ${OUTPUT_FILE} and ${REPORT_FILE}\n`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
