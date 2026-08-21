import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  PRODUCTION_METHODS,
  changedFields,
  createMarket,
  mergeMarket,
  normalizeAddress,
  normalizeCoordinate,
  normalizeIndoor,
  normalizeText,
  parseAddress,
  parseArguments,
  parseUpstream,
  productionMethods,
  projectUpstream,
  reconcile,
  summarize,
  toSnapshotTimestamp,
  updateLegacyMarkets
} from './update-legacy-markets.mjs';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

/** An upstream listing as the bulk export ships it. */
const upstream = (overrides = {}) => ({
  listing_id: '300002',
  update_time: '2020-08-03 13:44:04',
  listing_name: 'Colorado Farm and Art Market',
  location_address: '7350 Pine Creek Road, Colorado Springs, Colorado 80919',
  location_x: '-104.81468',
  location_y: '38.9377160',
  location_desc: 'Behind the patio of the Margarita at Pine Creek',
  location_site: 'Private business parking lot;',
  location_indoor: null,
  listing_desc: null,
  specialproductionmethods_1: '1',
  SNAP_option: 'Accept EBT at a central location;',
  ...overrides
});

/** The same listing as the snapshot stores it, normalization layer and all. */
const snapshotMarket = (overrides = {}) => ({
  id: 300002,
  name: 'Colorado Farm and Art Market',
  last_updated: '2020-08-03T13:44:04',
  location: {
    address: '7350 Pine Creek Road, Colorado Springs, Colorado, 80919',
    city: 'Colorado Springs',
    state: 'Colorado',
    zip_code: '80919',
    coordinates: { longitude: -104.81468, latitude: 38.937716 },
    description: 'Behind the patio of the Margarita at Pine Creek',
    site_type: 'Private business parking lot;',
    indoor_outdoor: 'Unknown'
  },
  organization: { types: [], description: '' },
  contact: { phone_numbers: ['719-555-0100'], emails: [], websites: ['https://example.org'], social_media: [] },
  operations: { season: 'May to October', days: ['saturday'], vendor_count: 30 },
  products: { items: ['Eggs'], production_methods: ['Organic (USDA Certified)'] },
  payment: {
    methods: ['Credit/Debit'],
    food_assistance: { wic: false, sfmnp: true, fmnp: false, snap: false, snap_option: 'Accept EBT at a central location;' }
  },
  sales_channels: {
    online_ordering: { available: false, links: [] },
    phone_ordering: false,
    csa: { available: false, description: null },
    delivery: { available: false, methods: null }
  },
  slug: 'colorado-farm-and-art-market-colorado-springs',
  ...overrides
});

/* ------------------------------------------------------------------ *
 * Normalization — the layer that keeps cosmetic differences quiet
 * ------------------------------------------------------------------ */

test('text normalization decodes the snapshot CR escape and collapses whitespace', () => {
  assert.equal(normalizeText('On 13th Street_x000d_\n_x000d_'), 'On 13th Street');
  assert.equal(normalizeText('a\r\n\r\nb'), 'a b');
  assert.equal(normalizeText('   '), undefined);
  assert.equal(normalizeText(null), undefined);
});

test('address normalization ignores the comma the snapshot inserted before the ZIP', () => {
  assert.equal(
    normalizeAddress('7350 Pine Creek Road, Colorado Springs, Colorado, 80919'),
    normalizeAddress('7350 Pine Creek Road, Colorado Springs, Colorado 80919')
  );
});

test('address normalization still reports a genuinely different street', () => {
  assert.notEqual(normalizeAddress('15500 County Road 6, Plymouth, MN'), normalizeAddress('15500 6, Plymouth, MN'));
});

test('coordinate normalization ignores float noise below five decimals', () => {
  assert.equal(normalizeCoordinate('-96.70341979999999'), normalizeCoordinate(-96.7034198));
  assert.equal(normalizeCoordinate('not a number'), undefined);
});

test('indoor normalization treats the snapshot placeholder as no value', () => {
  assert.equal(normalizeIndoor('Unknown'), undefined);
  assert.equal(normalizeIndoor(null), undefined);
  assert.equal(normalizeIndoor('No Indoor;'), 'No Indoor;');
});

test('upstream timestamps become snapshot timestamps', () => {
  assert.equal(toSnapshotTimestamp('2020-08-03 13:44:04'), '2020-08-03T13:44:04');
  assert.equal(toSnapshotTimestamp(''), undefined);
});

/* ------------------------------------------------------------------ *
 * Projection
 * ------------------------------------------------------------------ */

test('production method flags map to the snapshot vocabulary by index', () => {
  assert.deepEqual(productionMethods(upstream()), ['Organic (USDA Certified)']);
  assert.deepEqual(
    productionMethods({ specialproductionmethods_6: '1', specialproductionmethods_14: '1' }),
    ['Grass-fed', 'Fair Trade']
  );
  assert.equal(PRODUCTION_METHODS.length, 14);
});

test('projection reads only the fields the bulk export actually carries', () => {
  const projected = projectUpstream(upstream());
  assert.equal(projected.name, 'Colorado Farm and Art Market');
  assert.equal(projected.longitude, -104.81468);
  assert.equal(projected.last_updated, '2020-08-03T13:44:04');
});

test('address parsing splits city, state and ZIP for brand new records', () => {
  assert.deepEqual(parseAddress('7350 Pine Creek Road, Colorado Springs, Colorado 80919'), {
    address: '7350 Pine Creek Road, Colorado Springs, Colorado 80919',
    city: 'Colorado Springs',
    state: 'Colorado',
    zip_code: '80919'
  });
  assert.deepEqual(parseAddress(''), {});
});

/* ------------------------------------------------------------------ *
 * Change detection — the heart of "no cosmetic churn"
 * ------------------------------------------------------------------ */

test('a record that only differs cosmetically reports no changed fields', () => {
  assert.deepEqual(changedFields(snapshotMarket(), upstream()), []);
});

test('a real address correction is reported as a change', () => {
  const changed = changedFields(
    snapshotMarket({ location: { ...snapshotMarket().location, address: '15500 6, Plymouth, MN' } }),
    upstream({ location_address: '15500 County Road 6, Plymouth, MN' })
  );
  assert.ok(changed.includes('address'));
});

test('a newer upstream timestamp is reported as a change', () => {
  const changed = changedFields(snapshotMarket(), upstream({ update_time: '2026-04-01 09:00:00' }));
  assert.deepEqual(changed, ['last_updated']);
});

/* ------------------------------------------------------------------ *
 * Merge rules — additive, never destructive
 * ------------------------------------------------------------------ */

test('merging writes the changed field and preserves everything upstream does not carry', () => {
  const market = snapshotMarket();
  const merged = mergeMarket(market, upstream({ update_time: '2026-04-01 09:00:00' }), ['last_updated']);

  assert.equal(merged.last_updated, '2026-04-01T09:00:00');
  // Fields the bulk export has no column for must survive untouched.
  assert.deepEqual(merged.contact, market.contact);
  assert.deepEqual(merged.operations, market.operations);
  assert.deepEqual(merged.products.items, ['Eggs']);
  assert.equal(merged.location.city, 'Colorado Springs');
  assert.equal(merged.location.zip_code, '80919');
  assert.deepEqual(merged.payment.methods, ['Credit/Debit']);
});

test('merging never rewrites an existing slug', () => {
  const merged = mergeMarket(snapshotMarket(), upstream({ listing_name: 'Renamed Market' }), ['name']);
  assert.equal(merged.name, 'Renamed Market');
  assert.equal(merged.slug, 'colorado-farm-and-art-market-colorado-springs');
});

test('merging does not blank a field just because upstream omitted it', () => {
  const merged = mergeMarket(snapshotMarket(), upstream({ location_desc: null }), ['location_description']);
  assert.equal(merged.location.description, 'Behind the patio of the Margarita at Pine Creek');
});

test('a field the export omits is not reported as a change', () => {
  // Otherwise the record is "updated" forever: the change is detected but the
  // merge declines to clear it, so the run never converges.
  assert.deepEqual(changedFields(snapshotMarket(), upstream({ location_y: null })), []);
  assert.deepEqual(changedFields(snapshotMarket(), upstream({ listing_name: '' })), []);
  assert.deepEqual(changedFields(snapshotMarket(), upstream({ location_desc: '   ' })), []);
});

test('a blank or malformed coordinate is treated as absent, never as zero', () => {
  // `Number(null)` and `Number('')` are both 0; taking that at face value would
  // move the listing to Null Island. Upstream also ships values like
  // "44.452284," with a trailing comma, which must not be read as a change.
  for (const location_y of [null, '', '   ', '44.452284,']) {
    assert.deepEqual(changedFields(snapshotMarket(), upstream({ location_y })), [], `location_y=${location_y}`);
  }
  // Half a coordinate is not a location, so it is not an update either — even
  // when the snapshot has no coordinates at all to compare against.
  const uncoordinated = snapshotMarket();
  uncoordinated.location = { ...uncoordinated.location, coordinates: null };
  assert.deepEqual(changedFields(uncoordinated, upstream({ location_y: '' })), []);
  const merged = mergeMarket(snapshotMarket(), upstream({ location_y: '' }), ['latitude']);
  assert.deepEqual(merged.location.coordinates, { longitude: -104.81468, latitude: 38.937716 });
});

test('an empty production method set is a real value and does clear', () => {
  const changed = changedFields(snapshotMarket(), upstream({ specialproductionmethods_1: '0' }));
  assert.deepEqual(changed, ['production_methods']);
  const merged = mergeMarket(snapshotMarket(), upstream({ specialproductionmethods_1: '0' }), changed);
  assert.deepEqual(merged.products.production_methods, []);
});

test('a record that reappears upstream loses its unverified flag', () => {
  const merged = mergeMarket(snapshotMarket({ unverified: true }), upstream({ update_time: '2026-01-01 00:00:00' }), [
    'last_updated'
  ]);
  assert.equal(merged.unverified, undefined);
});

test('a brand new record is built with only the fields the export provides', () => {
  const created = createMarket(upstream({ listing_id: '999999', listing_name: 'New Town Market' }), new Set());
  assert.equal(created.id, 999999);
  assert.equal(created.slug, 'new-town-market-colorado-springs');
  assert.deepEqual(created.contact, { phone_numbers: [], emails: [], websites: [], social_media: [] });
  assert.deepEqual(created.operations, { season: null, days: [], vendor_count: null });
  assert.deepEqual(created.products.items, []);
});

test('a new record whose slug is taken gets a numeric suffix', () => {
  const taken = new Set(['new-town-market-colorado-springs']);
  const created = createMarket(upstream({ listing_id: '999999', listing_name: 'New Town Market' }), taken);
  assert.equal(created.slug, 'new-town-market-colorado-springs-2');
});

/* ------------------------------------------------------------------ *
 * Reconciliation and the delisting policy
 * ------------------------------------------------------------------ */

test('reconciling identical data changes nothing at all', () => {
  const snapshot = [snapshotMarket()];
  const { records, report } = reconcile(snapshot, [upstream()]);
  assert.equal(report.unchanged, 1);
  assert.equal(report.updated.length, 0);
  assert.deepEqual(records, snapshot);
});

test('a record missing upstream is flagged unverified, never deleted', () => {
  const { records, report } = reconcile([snapshotMarket()], []);
  assert.equal(records.length, 1);
  assert.equal(records[0].unverified, true);
  assert.equal(report.delisted.length, 1);
  assert.equal(report.delisted[0].slug, 'colorado-farm-and-art-market-colorado-springs');
  // Nothing else about the record moves.
  assert.equal(records[0].last_updated, '2020-08-03T13:44:04');
});

test('an already-unverified record is not re-flagged on a later run', () => {
  const { records, report } = reconcile([snapshotMarket({ unverified: true })], []);
  assert.equal(report.delisted.length, 0);
  assert.equal(report.unchanged, 1);
  assert.equal(records[0].unverified, true);
});

test('a listing with no snapshot counterpart is added', () => {
  const { records, report } = reconcile([snapshotMarket()], [
    upstream(),
    upstream({ listing_id: '400001', listing_name: 'Brand New Market' })
  ]);
  assert.equal(records.length, 2);
  assert.equal(report.added.length, 1);
  assert.equal(report.added[0].name, 'Brand New Market');
});

test('reconciling twice is a no-op the second time', () => {
  const snapshot = [snapshotMarket({ location: { ...snapshotMarket().location, address: '15500 6, Plymouth, MN' } })];
  const records = [upstream({ location_address: '15500 County Road 6, Plymouth, MN' })];

  const first = reconcile(snapshot, records);
  assert.equal(first.report.updated.length, 1);

  const second = reconcile(first.records, records);
  assert.equal(second.report.updated.length, 0);
  assert.equal(second.report.unchanged, 1);
  assert.deepEqual(second.records, first.records);
});

test('--limit caps how many upstream records are considered', () => {
  const snapshot = [snapshotMarket(), snapshotMarket({ id: 300003, slug: 'second-market' })];
  const records = [
    upstream({ update_time: '2026-01-01 00:00:00' }),
    upstream({ listing_id: '300003', update_time: '2026-01-01 00:00:00' })
  ];
  const { report } = reconcile(snapshot, records, { limit: 1 });
  assert.equal(report.updated.length, 1);
});

/* ------------------------------------------------------------------ *
 * Reporting and arguments
 * ------------------------------------------------------------------ */

test('the summary names the dry run and every bucket', () => {
  const { report } = reconcile([snapshotMarket()], []);
  const text = summarize(report, { dryRun: true });
  assert.match(text, /DRY RUN/);
  assert.match(text, /delisted\s*: 1 \(flagged unverified, not deleted\)/);
});

test('upstream payloads without listings are rejected', () => {
  assert.throws(() => parseUpstream('{}'), /not an array/);
  assert.throws(() => parseUpstream('[]'), /no listings with an id/);
  assert.equal(parseUpstream(JSON.stringify([upstream()])).length, 1);
});

test('argument parsing accepts the documented flags and rejects the rest', () => {
  const options = parseArguments(['--dry-run', '--limit', '25', '--fixture', 'f.json']);
  assert.equal(options.dryRun, true);
  assert.equal(options.limit, 25);
  assert.equal(options.fixture, 'f.json');
  assert.throws(() => parseArguments(['--nope']), /Unknown argument/);
  assert.throws(() => parseArguments(['--limit', '0']), /positive integer/);
});

/* ------------------------------------------------------------------ *
 * End to end, on a temporary snapshot, with the network stubbed out
 * ------------------------------------------------------------------ */

async function withTemporaryProject(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-refresh-'));
  const snapshotPath = path.join(directory, 'snapshot.json');
  const reportPath = path.join(directory, 'report.json');
  try {
    await run({ directory, snapshotPath, reportPath });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

/** A fetch double that answers with a canned upstream payload. */
function fakeFetch(records) {
  const calls = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, text: async () => JSON.stringify(records) };
    }
  };
}

const silent = () => {};

test('a dry run writes neither the snapshot nor the report', async () => {
  await withTemporaryProject(async ({ snapshotPath, reportPath }) => {
    const original = `${JSON.stringify([snapshotMarket()], null, 2)}\n`;
    await fs.writeFile(snapshotPath, original, 'utf8');
    const upstreamDouble = fakeFetch([upstream({ update_time: '2026-01-01 00:00:00' })]);

    const result = await updateLegacyMarkets({
      snapshot: snapshotPath,
      report: reportPath,
      govSnapshot: path.join(path.dirname(snapshotPath), 'missing.json'),
      geoIndex: path.join(path.dirname(snapshotPath), 'missing-geo.json'),
      dryRun: true,
      fetchImpl: upstreamDouble.fetch,
      log: silent
    });

    assert.equal(result.report.updated.length, 1);
    assert.equal(await fs.readFile(snapshotPath, 'utf8'), original, 'snapshot must be untouched by a dry run');
    await assert.rejects(fs.readFile(reportPath, 'utf8'), /ENOENT/);
  });
});

test('an applied run writes the snapshot, writes the report, and pings the changed URLs', async () => {
  await withTemporaryProject(async ({ snapshotPath, reportPath }) => {
    await fs.writeFile(snapshotPath, `${JSON.stringify([snapshotMarket()], null, 2)}\n`, 'utf8');
    const upstreamDouble = fakeFetch([upstream({ update_time: '2026-01-01 00:00:00' })]);
    const pinged = [];

    const result = await updateLegacyMarkets({
      snapshot: snapshotPath,
      report: reportPath,
      govSnapshot: path.join(path.dirname(snapshotPath), 'missing.json'),
      geoIndex: path.join(path.dirname(snapshotPath), 'missing-geo.json'),
      fetchImpl: upstreamDouble.fetch,
      ping: async (urls) => { pinged.push(...urls); return { ok: true }; },
      log: silent
    });

    const written = JSON.parse(await fs.readFile(snapshotPath, 'utf8'));
    assert.equal(written[0].last_updated, '2026-01-01T00:00:00');

    const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    assert.equal(report.schema_version, 1);
    assert.equal(report.dry_run, false);
    assert.equal(report.updated.length, 1);
    assert.equal(report.snapshot_record_count_before, 1);
    assert.equal(report.snapshot_record_count_after, 1);
    assert.ok(Array.isArray(report.refreshed_fields));

    assert.deepEqual(result.changedSlugs, ['colorado-farm-and-art-market-colorado-springs']);
    assert.ok(pinged.some((url) => url.endsWith('/markets/colorado-farm-and-art-market-colorado-springs')));
    assert.ok(pinged.some((url) => url.endsWith('/sitemap.xml')));
  });
});

test('a failing IndexNow ping never fails the refresh', async () => {
  await withTemporaryProject(async ({ snapshotPath, reportPath }) => {
    await fs.writeFile(snapshotPath, `${JSON.stringify([snapshotMarket()], null, 2)}\n`, 'utf8');
    const upstreamDouble = fakeFetch([upstream({ update_time: '2026-01-01 00:00:00' })]);

    const result = await updateLegacyMarkets({
      snapshot: snapshotPath,
      report: reportPath,
      govSnapshot: path.join(path.dirname(snapshotPath), 'missing.json'),
      geoIndex: path.join(path.dirname(snapshotPath), 'missing-geo.json'),
      fetchImpl: upstreamDouble.fetch,
      ping: async () => { throw new Error('engine unreachable'); },
      log: silent
    });

    assert.equal(result.report.updated.length, 1);
    const written = JSON.parse(await fs.readFile(snapshotPath, 'utf8'));
    assert.equal(written[0].last_updated, '2026-01-01T00:00:00');
  });
});

test('a collapsed upstream is refused rather than mass-flagging records', async () => {
  await withTemporaryProject(async ({ snapshotPath, reportPath }) => {
    const snapshot = Array.from({ length: 100 }, (_, index) =>
      snapshotMarket({ id: 300000 + index, slug: `market-${index}` })
    );
    await fs.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    const upstreamDouble = fakeFetch([upstream()]);

    await assert.rejects(
      updateLegacyMarkets({
        snapshot: snapshotPath,
        report: reportPath,
        fetchImpl: upstreamDouble.fetch,
        log: silent
      }),
      /Refusing to write/
    );
  });
});

test('an applied run followed by a second run is a no-op', async () => {
  await withTemporaryProject(async ({ snapshotPath, reportPath }) => {
    await fs.writeFile(snapshotPath, `${JSON.stringify([snapshotMarket()], null, 2)}\n`, 'utf8');
    const records = [upstream({ update_time: '2026-01-01 00:00:00' })];
    const common = {
      snapshot: snapshotPath,
      report: reportPath,
      govSnapshot: path.join(path.dirname(snapshotPath), 'missing.json'),
      geoIndex: path.join(path.dirname(snapshotPath), 'missing-geo.json'),
      ping: async () => ({ ok: true }),
      log: silent
    };

    await updateLegacyMarkets({ ...common, fetchImpl: fakeFetch(records).fetch });
    const afterFirst = await fs.readFile(snapshotPath, 'utf8');

    const second = await updateLegacyMarkets({ ...common, fetchImpl: fakeFetch(records).fetch });
    assert.equal(second.report.updated.length, 0);
    assert.equal(second.report.unchanged, 1);
    assert.deepEqual(second.changedSlugs, []);
    assert.equal(await fs.readFile(snapshotPath, 'utf8'), afterFirst, 'second run must not rewrite the snapshot');
  });
});
