#!/usr/bin/env node

/**
 * Refresh the legacy USDA source snapshot (`data/sources/legacy_markets.json`) against
 * the live USDA AMS Local Food Directory.
 *
 * ## Why this script exists
 *
 * The legacy snapshot was a one-off export that had no refresh path: most of
 * its 6,832 records still carried a `last_updated` from 2020-2023. The
 * assumption going in was that the USDA Local Food Portal had been
 * decommissioned and the data could never be refreshed. That turned out to be
 * wrong — see the "Upstream availability" note in the README. The portal is
 * live, and the directory page's own CSV export button calls a keyless bulk
 * endpoint:
 *
 *   https://www.usdalocalfoodportal.com/api/download_by_directory/?directory=farmersmarket
 *
 * The endpoint returns one JSON object per listing, keyed by `listing_id` —
 * which is exactly the `id` on our legacy records. 6,822 of our 6,832 records
 * (99.9%) match by id, so this is a true refresh rather than a re-import.
 *
 * ## Why the merge is conservative
 *
 * The bulk export is a *reduced* projection of the directory. It carries no
 * contact details, no season/day schedules, no product item lists, and no
 * parsed city/state/zip — all of which our snapshot does carry, because the
 * original export came from the richer per-listing API. A naive overwrite would
 * therefore destroy data.
 *
 * So the merge only touches fields the bulk export unambiguously provides, and
 * leaves everything else exactly as it is. `REFRESHED_FIELDS` below is the
 * complete list. Notably excluded, on purpose:
 *
 *   - `contact` (upstream carries none)
 *   - `operations` (no season/days/vendor_count upstream)
 *   - `products.items` (upstream carries none)
 *   - `location.city` / `state` / `zip_code` (upstream ships one flat address
 *     string; our parsed components are better than anything we could re-derive)
 *   - `organization.types` and `payment.methods` (these were mapped through a
 *     curated vocabulary whose flag alignment could not be reproduced
 *     unambiguously from the export — see the note on PRODUCTION_METHODS)
 *   - `slug` (never regenerated for an existing record: the URL is a promise)
 *
 * ## Why comparison is normalization-aware
 *
 * The original export applied its own normalization: it encoded CR as
 * `_x000d_`, rounded coordinates, inserted a comma before the ZIP, and wrote
 * "Unknown" where upstream had null. Comparing raw values would mark 6,646 of
 * 6,781 unchanged records as "changed" and produce an enormous cosmetic diff.
 * `normalizedProjection` / `normalizedCurrent` strip that layer away so a field
 * only counts as changed when it *actually* changed. This is what makes a
 * second run a genuine no-op.
 *
 * ## Why `last_updated` is mirrored, never synthesized
 *
 * `last_updated` is always copied from upstream `update_time` and is never set
 * to "now". Search and AI-citation engines detect and discount cosmetic
 * timestamp bumps, so a corrected address on a record the USDA did not re-date
 * fixes the address and leaves the date alone. Honest dates only.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SITE_URL, pingIndexNow } from './lib/indexnow.mjs';
import { refreshUrls } from './update-government-markets.mjs';

const DEFAULT_SNAPSHOT = 'data/sources/legacy_markets.json';
const DEFAULT_GOV_SNAPSHOT = 'data/sources/government_markets.json';
const DEFAULT_GEO_INDEX = 'public/data/geo_index.json';
const DEFAULT_REPORT = 'scripts/legacy-refresh-report.json';

export const UPSTREAM_URL =
  'https://www.usdalocalfoodportal.com/api/download_by_directory/?directory=farmersmarket';

const REQUEST_TIMEOUT_MS = 180_000;

/**
 * The endpoint builds the ~18 MB export on demand and intermittently answers
 * 504 from its load balancer for a stretch of consecutive requests before
 * recovering. That is transient, so retry patiently rather than failing the
 * refresh: five attempts with escalating backoff covers the outages observed.
 */
const REQUEST_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = 5_000;

/**
 * The portal sits behind an AWS load balancer that 403s unrecognised user
 * agents, so a browser UA is required to get a response at all. It is a public,
 * keyless, unauthenticated endpoint — this is not an access-control bypass,
 * just the UA the directory's own export button sends.
 *
 * `Accept-Encoding: identity` is deliberate. Node's fetch defaults to
 * `gzip, deflate`, and compressing this payload is the slow path that pushes
 * the origin past the balancer's gateway timeout; asking for it uncompressed is
 * what the browser export button effectively does and is markedly more
 * reliable.
 */
const REQUEST_HEADERS = {
  Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
  'Accept-Encoding': 'identity',
  Referer: 'https://www.usdalocalfoodportal.com/fe/fdirectory_farmersmarket/',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
};

/**
 * If the upstream export ever comes back drastically smaller than the snapshot
 * we already have, that is a broken upstream, not 3,000 closed markets. Refuse
 * to write rather than mass-flag records as unverified.
 */
const MAXIMUM_DROP_FRACTION = 0.2;

/**
 * `specialproductionmethods_1..14` are booleans; the labels below were derived
 * empirically by correlating the flags against the existing snapshot's
 * `products.production_methods` across all matched records. Every index
 * resolved to a single label with a clear majority (the weakest, index 14,
 * agreed on 11 records with no competing label), so this mapping is safe to
 * apply. The equivalent correlation for `acceptedpayment_*` did NOT resolve
 * cleanly — index 4 and 5 both mapped to "SFMNP" and index 3 split between
 * "WIC" and "SNAP/EBT" — which is why `payment.methods` is left untouched.
 */
export const PRODUCTION_METHODS = [
  'Organic (USDA Certified)',
  'Naturally Grown',
  'Chemical-free',
  'Certified Naturally Grown',
  'Integrated Pest Management',
  'Grass-fed',
  'Pasture-raised',
  'Free-range',
  'Hormone-free',
  'Antibiotic-free',
  'Certified Humane',
  'Animal Welfare Approved',
  'GMO-free',
  'Fair Trade'
];

/** Every field this refresh is allowed to write. Anything absent is preserved. */
export const REFRESHED_FIELDS = [
  'last_updated',
  'name',
  'location.address',
  'location.coordinates',
  'location.description',
  'location.site_type',
  'location.indoor_outdoor',
  'organization.description',
  'products.production_methods',
  'payment.food_assistance.snap_option'
];

/* ------------------------------------------------------------------ *
 * Value helpers
 * ------------------------------------------------------------------ */

function compact(value) {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

/**
 * Strictly numeric, and strictly not blank. `Number(null)` and `Number('')` are
 * both 0, so a naive conversion silently relocates the 29 upstream listings
 * that ship an empty coordinate to Null Island. An unparseable coordinate is
 * treated as absent, which means the merge keeps whatever the snapshot already
 * had — the right outcome, since a good old coordinate beats a broken new one.
 */
function finiteNumber(value) {
  const text = compact(value);
  if (text === undefined) return undefined;
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
}

/** `2023-04-01 09:15:00` (upstream) -> `2023-04-01T09:15:00` (snapshot). */
export function toSnapshotTimestamp(value) {
  const text = compact(value);
  if (!text) return undefined;
  return text.replace(' ', 'T');
}

/**
 * Comparison-only text normalization: decode the snapshot's `_x000d_` CR
 * escapes and collapse all whitespace, so an encoding difference does not read
 * as a content change.
 */
export function normalizeText(value) {
  const text = compact(value);
  if (!text) return undefined;
  return compact(text.replace(/_x000d_/gi, '\r').replace(/\s+/g, ' '));
}

/** Addresses differ only in punctuation between the two sources; ignore it. */
export function normalizeAddress(value) {
  const text = normalizeText(value);
  if (!text) return undefined;
  return compact(text.replace(/,/g, ' ').replace(/\s+/g, ' ').toLowerCase());
}

/** The snapshot rounded coordinates; five decimals is ~1 m and plenty. */
export function normalizeCoordinate(value) {
  const number = finiteNumber(value);
  return number === undefined ? undefined : Math.round(number * 1e5) / 1e5;
}

/** The snapshot wrote the literal "Unknown" where upstream simply has no value. */
export function normalizeIndoor(value) {
  const text = normalizeText(value);
  return !text || text === 'Unknown' ? undefined : text;
}

export function productionMethods(record) {
  return PRODUCTION_METHODS.filter((_, index) => record[`specialproductionmethods_${index + 1}`] === '1');
}

function slugify(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Best-effort US address split for records the snapshot has never seen. Only
 * ever applied to brand-new records — existing records keep their parsed
 * components, which came from the richer API and are better than this.
 */
export function parseAddress(value) {
  const text = normalizeText(value);
  if (!text) return {};
  const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return {};

  const tail = parts[parts.length - 1];
  const zipMatch = tail.match(/\b(\d{5})(?:-\d{4})?$/);
  const zip = zipMatch?.[1];
  const tailWithoutZip = compact(tail.replace(/\b\d{5}(?:-\d{4})?$/, ''));

  // "…, City, State 12345" is the common shape; the state may also share the
  // final comma group with the ZIP, or be absent entirely.
  const state = tailWithoutZip ?? (parts.length > 1 ? parts[parts.length - 1] : undefined);
  const cityIndex = tailWithoutZip ? parts.length - 2 : parts.length - 2;
  const city = cityIndex >= 1 ? parts[cityIndex] : undefined;

  return {
    address: text,
    city: compact(city),
    state: compact(state),
    zip_code: zip
  };
}

/* ------------------------------------------------------------------ *
 * Projection and comparison
 * ------------------------------------------------------------------ */

/**
 * A coordinate is only meaningful as a pair. Upstream ships listings with one
 * half present and the other blank; half a coordinate is not a location, and
 * treating it as an update would report a change the merge can never write.
 */
function coordinatePair(x, y) {
  const longitude = finiteNumber(x);
  const latitude = finiteNumber(y);
  if (longitude === undefined || latitude === undefined) return { longitude: undefined, latitude: undefined };
  return { longitude, latitude };
}

/** The upstream record reduced to the fields this refresh owns. */
export function projectUpstream(record) {
  const { longitude, latitude } = coordinatePair(record.location_x, record.location_y);
  return {
    last_updated: toSnapshotTimestamp(record.update_time),
    name: compact(record.listing_name),
    address: compact(record.location_address),
    longitude,
    latitude,
    location_description: compact(record.location_desc),
    site_type: compact(record.location_site),
    indoor_outdoor: compact(record.location_indoor),
    organization_description: compact(record.listing_desc),
    production_methods: productionMethods(record),
    snap_option: compact(record.SNAP_option)
  };
}

/** The same fields read off a snapshot record. */
export function projectCurrent(market) {
  const { longitude, latitude } = coordinatePair(
    market.location?.coordinates?.longitude,
    market.location?.coordinates?.latitude
  );
  return {
    last_updated: compact(market.last_updated),
    name: compact(market.name),
    address: compact(market.location?.address),
    longitude,
    latitude,
    location_description: compact(market.location?.description),
    site_type: compact(market.location?.site_type),
    indoor_outdoor: compact(market.location?.indoor_outdoor),
    organization_description: compact(market.organization?.description),
    production_methods: market.products?.production_methods ?? [],
    snap_option: compact(market.payment?.food_assistance?.snap_option)
  };
}

/** Strip the snapshot's normalization layer so only real changes survive. */
function normalizeProjection(projection) {
  return {
    last_updated: compact(projection.last_updated),
    name: normalizeText(projection.name),
    address: normalizeAddress(projection.address),
    longitude: normalizeCoordinate(projection.longitude),
    latitude: normalizeCoordinate(projection.latitude),
    location_description: normalizeText(projection.location_description),
    site_type: normalizeText(projection.site_type),
    indoor_outdoor: normalizeIndoor(projection.indoor_outdoor),
    organization_description: normalizeText(projection.organization_description),
    production_methods: projection.production_methods ?? [],
    snap_option: normalizeText(projection.snap_option)
  };
}

/**
 * Names of the projected fields that genuinely differ between a snapshot record
 * and its upstream counterpart. Empty array means "nothing to do".
 *
 * A field the upstream export simply does not carry (`undefined`) is never a
 * change. The bulk export omits values rather than blanking them, and the merge
 * correspondingly never clears a field — so counting an omission as a change
 * would report a difference that the merge then declines to write, and the
 * record would be "updated" on every single run without ever converging.
 * Arrays are exempt: `production_methods` is built from explicit 0/1 flags, so
 * an empty array upstream is a real value meaning "none", not an omission.
 */
export function changedFields(market, upstreamRecord) {
  const next = normalizeProjection(projectUpstream(upstreamRecord));
  const current = normalizeProjection(projectCurrent(market));
  const changed = [];
  for (const field of Object.keys(next)) {
    if (next[field] === undefined) continue;
    if (JSON.stringify(next[field]) !== JSON.stringify(current[field])) changed.push(field);
  }
  return changed;
}

/**
 * A snapshot record with the changed fields written through. Fields the
 * upstream export does not carry are left exactly as they were, and a value is
 * never replaced with nothing — an absent upstream value means "not exported",
 * not "deleted".
 */
export function mergeMarket(market, upstreamRecord, fields) {
  if (!fields.length) return market;
  const next = projectUpstream(upstreamRecord);
  const merged = { ...market };
  const apply = (field, write) => {
    if (!fields.includes(field)) return;
    if (next[field] === undefined || (Array.isArray(next[field]) && !next[field].length && field !== 'production_methods')) return;
    write(next[field]);
  };

  apply('last_updated', (value) => { merged.last_updated = value; });
  apply('name', (value) => { merged.name = value; });

  if (fields.some((field) => ['address', 'longitude', 'latitude', 'location_description', 'site_type', 'indoor_outdoor'].includes(field))) {
    merged.location = { ...(market.location ?? {}) };
    apply('address', (value) => { merged.location.address = value; });
    apply('location_description', (value) => { merged.location.description = value; });
    apply('site_type', (value) => { merged.location.site_type = value; });
    apply('indoor_outdoor', (value) => { merged.location.indoor_outdoor = value; });
    if ((fields.includes('longitude') || fields.includes('latitude')) && next.longitude !== undefined && next.latitude !== undefined) {
      merged.location.coordinates = { longitude: next.longitude, latitude: next.latitude };
    }
  }

  if (fields.includes('organization_description')) {
    merged.organization = { ...(market.organization ?? {}) };
    apply('organization_description', (value) => { merged.organization.description = value; });
  }

  if (fields.includes('production_methods')) {
    merged.products = { ...(market.products ?? {}), production_methods: next.production_methods };
  }

  if (fields.includes('snap_option') && next.snap_option !== undefined) {
    merged.payment = {
      ...(market.payment ?? {}),
      food_assistance: { ...(market.payment?.food_assistance ?? {}), snap_option: next.snap_option }
    };
  }

  // A record that is back in the directory is verified again by definition.
  delete merged.unverified;
  return merged;
}

/**
 * A snapshot record built from an upstream listing we have never seen before.
 * Only the fields the export carries are populated; the rest stay absent rather
 * than being invented.
 */
export function createMarket(upstreamRecord, takenSlugs) {
  const next = projectUpstream(upstreamRecord);
  const parsed = parseAddress(next.address);
  const base = compact([slugify(next.name), slugify(parsed.city)].filter(Boolean).join('-')) ?? `market-${upstreamRecord.listing_id}`;

  let slug = base;
  let suffix = 2;
  while (takenSlugs.has(slug)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  takenSlugs.add(slug);

  return {
    id: Number(upstreamRecord.listing_id),
    name: next.name,
    last_updated: next.last_updated,
    location: {
      address: next.address ?? null,
      city: parsed.city ?? null,
      state: parsed.state ?? null,
      zip_code: parsed.zip_code ?? null,
      coordinates:
        next.longitude !== undefined && next.latitude !== undefined
          ? { longitude: next.longitude, latitude: next.latitude }
          : null,
      description: next.location_description ?? null,
      site_type: next.site_type ?? null,
      indoor_outdoor: next.indoor_outdoor ?? null
    },
    organization: { types: [], description: next.organization_description ?? '' },
    contact: { phone_numbers: [], emails: [], websites: [], social_media: [] },
    operations: { season: null, days: [], vendor_count: null },
    products: { items: [], production_methods: next.production_methods },
    payment: {
      methods: [],
      food_assistance: { wic: false, sfmnp: false, fmnp: false, snap: false, snap_option: next.snap_option ?? null }
    },
    sales_channels: {
      online_ordering: { available: false, links: [] },
      phone_ordering: false,
      csa: { available: false, description: null },
      delivery: { available: false, methods: null }
    },
    slug
  };
}

/* ------------------------------------------------------------------ *
 * The refresh itself
 * ------------------------------------------------------------------ */

/**
 * Reconcile the snapshot against the upstream export.
 *
 * Records upstream no longer lists are NOT deleted. They are marked
 * `unverified: true`, which the market page turns into an honest "may be
 * closed" notice. A market that quietly vanishes from a self-reported federal
 * directory has not necessarily closed, and the page still holds value — so we
 * label rather than delete, and never 410 or noindex.
 */
export function reconcile(snapshot, upstreamRecords, options = {}) {
  const limit = options.limit;
  const upstreamById = new Map(upstreamRecords.map((record) => [String(record.listing_id), record]));
  const takenSlugs = new Set([...snapshot.map((market) => market.slug), ...(options.reservedSlugs ?? [])]);

  const report = {
    unchanged: 0,
    updated: [],
    added: [],
    delisted: [],
    relisted: [],
    field_changes: {}
  };

  const records = [];
  let considered = 0;

  for (const market of snapshot) {
    const upstreamRecord = upstreamById.get(String(market.id));
    if (upstreamRecord) upstreamById.delete(String(market.id));

    // `--limit` bounds every kind of work uniformly, delistings included, so
    // that a limited run is purely a testing affordance and never applies a
    // whole-dataset conclusion off a partial pass.
    if (limit !== undefined && considered >= limit) {
      records.push(market);
      continue;
    }
    considered += 1;

    if (!upstreamRecord) {
      // Absent upstream. Flag once; never re-flag or bump anything else.
      if (market.unverified === true) {
        report.unchanged += 1;
        records.push(market);
      } else {
        report.delisted.push({ id: market.id, slug: market.slug, name: market.name, last_updated: market.last_updated });
        records.push({ ...market, unverified: true });
      }
      continue;
    }

    const fields = changedFields(market, upstreamRecord);
    if (!fields.length) {
      report.unchanged += 1;
      records.push(market);
      continue;
    }

    for (const field of fields) report.field_changes[field] = (report.field_changes[field] ?? 0) + 1;
    if (market.unverified === true) {
      report.relisted.push({ id: market.id, slug: market.slug, name: market.name });
    }
    report.updated.push({ id: market.id, slug: market.slug, name: market.name, fields });
    records.push(mergeMarket(market, upstreamRecord, fields));
  }

  // Whatever is left in the map is new upstream.
  for (const upstreamRecord of upstreamById.values()) {
    if (limit !== undefined && considered >= limit) break;
    considered += 1;
    if (!compact(upstreamRecord.listing_name)) continue;
    const created = createMarket(upstreamRecord, takenSlugs);
    report.added.push({ id: created.id, slug: created.slug, name: created.name });
    records.push(created);
  }

  records.sort((left, right) => Number(left.id) - Number(right.id));
  return { records, report };
}

/**
 * Slugs whose page content actually changed, keyed by slug rather than by id.
 *
 * The government refresh keys its equivalent diff on `id`, which is right for
 * that dataset. It is not right here: the legacy snapshot contains two
 * pre-existing duplicate ids (307414 and 307415 each appear twice, and are
 * duplicated upstream too), so an id-keyed map collapses them and reports both
 * as changed on every run — including runs that changed nothing. Slugs are
 * unique across the snapshot and are what the URLs are built from anyway, so
 * they are the correct key for "which pages need recrawling".
 */
export function changedLegacySlugs(previousRecords, currentRecords) {
  const previousBySlug = new Map();
  for (const market of previousRecords ?? []) {
    if (market?.slug) previousBySlug.set(market.slug, JSON.stringify(market));
  }

  const slugs = [];
  for (const market of currentRecords ?? []) {
    if (!market?.slug) continue;
    const previous = previousBySlug.get(market.slug);
    if (previous === undefined || previous !== JSON.stringify(market)) slugs.push(market.slug);
  }
  return [...new Set(slugs)];
}

/* ------------------------------------------------------------------ *
 * IO
 * ------------------------------------------------------------------ */

async function fetchUpstream(fetchImpl) {
  let lastError;
  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(UPSTREAM_URL, {
        redirect: 'follow',
        signal: controller.signal,
        headers: REQUEST_HEADERS
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText ?? ''}`.trim());
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < REQUEST_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, attempt * RETRY_BACKOFF_MS));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

export function parseUpstream(payload) {
  const records = JSON.parse(payload);
  if (!Array.isArray(records)) throw new Error('Upstream payload is not an array');
  const usable = records.filter((record) => compact(record?.listing_id));
  if (!usable.length) throw new Error('Upstream payload contained no listings with an id');
  return usable;
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function atomicWrite(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temporaryPath, content, 'utf8');
  await fs.rename(temporaryPath, filePath);
}

export function summarize(report, { dryRun } = {}) {
  const lines = [
    `${dryRun ? 'DRY RUN — no files written' : 'Applied'}`,
    `  unchanged : ${report.unchanged}`,
    `  updated   : ${report.updated.length}`,
    `  added     : ${report.added.length}`,
    `  delisted  : ${report.delisted.length} (flagged unverified, not deleted)`,
    `  relisted  : ${report.relisted.length}`
  ];
  const fields = Object.entries(report.field_changes).sort((left, right) => right[1] - left[1]);
  if (fields.length) {
    lines.push('  field changes:');
    for (const [field, count] of fields) lines.push(`    ${field}: ${count}`);
  }
  return lines.join('\n');
}

export function parseArguments(argv) {
  const options = {
    snapshot: DEFAULT_SNAPSHOT,
    govSnapshot: DEFAULT_GOV_SNAPSHOT,
    geoIndex: DEFAULT_GEO_INDEX,
    report: DEFAULT_REPORT,
    fixture: undefined,
    limit: undefined,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--snapshot') options.snapshot = argv[++index];
    else if (argument === '--gov-snapshot') options.govSnapshot = argv[++index];
    else if (argument === '--geo-index') options.geoIndex = argv[++index];
    else if (argument === '--report') options.report = argv[++index];
    else if (argument === '--fixture') options.fixture = argv[++index];
    else if (argument === '--limit') options.limit = Number(argv[++index]);
    else if (argument === '--dry-run') options.dryRun = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }

  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error('--limit must be a positive integer');
  }
  return options;
}

export async function updateLegacyMarkets(options = {}) {
  const root = process.cwd();
  const snapshotPath = path.resolve(root, options.snapshot ?? DEFAULT_SNAPSHOT);
  const reportPath = path.resolve(root, options.report ?? DEFAULT_REPORT);
  const log = options.log ?? console.log;

  const snapshot = await readJson(snapshotPath, []);
  if (!Array.isArray(snapshot) || !snapshot.length) {
    throw new Error(`Snapshot at ${options.snapshot ?? DEFAULT_SNAPSHOT} is empty; refusing to refresh`);
  }

  const payload = options.fixture
    ? await fs.readFile(path.resolve(root, options.fixture), 'utf8')
    : await fetchUpstream(options.fetchImpl ?? globalThis.fetch);
  const upstreamRecords = parseUpstream(payload);

  // A collapsed upstream is a broken upstream, not a mass extinction event.
  if (options.limit === undefined) {
    const minimum = Math.floor(snapshot.length * (1 - MAXIMUM_DROP_FRACTION));
    if (upstreamRecords.length < minimum) {
      throw new Error(
        `Upstream returned ${upstreamRecords.length} listings against a snapshot of ${snapshot.length}; minimum is ${minimum}. Refusing to write.`
      );
    }
  }

  // Government slugs are reserved so a new legacy record can never collide with
  // a page that already exists.
  const govSnapshot = await readJson(path.resolve(root, options.govSnapshot ?? DEFAULT_GOV_SNAPSHOT), []);
  const reservedSlugs = Array.isArray(govSnapshot) ? govSnapshot.map((market) => market.slug).filter(Boolean) : [];

  const { records, report } = reconcile(snapshot, upstreamRecords, { limit: options.limit, reservedSlugs });

  const changedSlugs = changedLegacySlugs(snapshot, records);
  const fullReport = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    dry_run: Boolean(options.dryRun),
    limit: options.limit ?? null,
    upstream_url: UPSTREAM_URL,
    upstream_record_count: upstreamRecords.length,
    snapshot_record_count_before: snapshot.length,
    snapshot_record_count_after: records.length,
    refreshed_fields: REFRESHED_FIELDS,
    changed_slug_count: changedSlugs.length,
    ...report
  };

  log(summarize(report, { dryRun: options.dryRun }));

  if (options.dryRun) {
    log('dry run: snapshot and report left untouched');
    return { report: fullReport, records, changedSlugs, indexNowUrls: [] };
  }

  const contents = `${JSON.stringify(records, null, 2)}\n`;
  await atomicWrite(snapshotPath, contents);
  await atomicWrite(reportPath, `${JSON.stringify(fullReport, null, 2)}\n`);
  log(`wrote ${records.length} legacy markets to ${path.relative(root, snapshotPath)}`);
  log(`wrote report to ${path.relative(root, reportPath)}`);

  // Push changed URLs to IndexNow. Failures here are never fatal: the snapshot
  // is already safely on disk, `pingIndexNow` swallows network errors, and
  // INDEXNOW_DISABLE=1 turns it off entirely. Tests inject `options.ping`.
  let geoIndex = null;
  try {
    geoIndex = await readJson(path.resolve(root, options.geoIndex ?? DEFAULT_GEO_INDEX), null);
  } catch (error) {
    log(`indexnow: could not read the geo index: ${error instanceof Error ? error.message : error}`);
  }
  const urls = refreshUrls(changedSlugs, geoIndex, SITE_URL);
  const ping = options.ping ?? pingIndexNow;
  log(`indexnow: ${changedSlugs.length} changed market(s) → ${urls.length} URL(s)`);
  let pingResult;
  if (urls.length) {
    try {
      pingResult = await ping(urls);
    } catch (error) {
      log(`indexnow: ping failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  return { report: fullReport, records, changedSlugs, indexNowUrls: urls, indexNow: pingResult };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  await updateLegacyMarkets(options);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}

export { atomicWrite, createHash };
