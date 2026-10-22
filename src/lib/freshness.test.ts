import assert from 'node:assert/strict';
import test from 'node:test';

const mod = await import('./freshness.ts');

const { STALE_AFTER_YEARS, marketFreshness } = mod;

/** Fixed "now" so every assertion below is deterministic. */
const NOW = new Date('2026-08-20T00:00:00Z');

/* ------------------------------------------------------------------ *
 * Fresh records
 * ------------------------------------------------------------------ */

test('a recently verified record is fresh', () => {
  const result = marketFreshness({ last_updated: '2025-06-01' }, NOW);
  assert.equal(result.level, 'fresh');
  assert.equal(result.lastVerified, 'June 1, 2025');
});

test('a fresh record carries no notice for the page to print', () => {
  assert.equal(marketFreshness({ last_updated: '2025-06-01' }, NOW).notice, undefined);
});

test('a partial detail check does not make an old or dropped source listing fresh', () => {
  const result = marketFreshness(
    {
      last_updated: '2020-08-03',
      unverified: true,
      enrichment: { verified_at: '2026-08-21', verification_scope: 'partial' },
    },
    NOW
  );
  assert.equal(result.level, 'unverified');
  assert.equal(result.lastVerified, 'August 3, 2020');
});

test('a record just under the staleness threshold is still fresh', () => {
  // One day short of four years old.
  const result = marketFreshness({ last_updated: '2022-08-21' }, NOW);
  assert.equal(result.level, 'fresh');
  assert.equal(result.notice, undefined);
});

/* ------------------------------------------------------------------ *
 * Stale records
 * ------------------------------------------------------------------ */

test('a record older than the staleness threshold is stale', () => {
  const result = marketFreshness({ last_updated: '2020-08-03' }, NOW);
  assert.equal(result.level, 'stale');
  assert.equal(result.lastVerified, 'August 3, 2020');
  assert.equal(
    result.notice,
    'Listing last checked 2020.'
  );
});

test('the day the record crosses the threshold it turns stale', () => {
  assert.equal(marketFreshness({ last_updated: '2022-08-20' }, NOW).level, 'fresh');
  assert.equal(marketFreshness({ last_updated: '2022-08-19' }, NOW).level, 'stale');
  assert.equal(STALE_AFTER_YEARS, 4);
});

test('a full USDA timestamp is judged the same as a bare date', () => {
  assert.equal(marketFreshness({ last_updated: '2021-03-15T14:22:00.000Z' }, NOW).level, 'stale');
});

/* ------------------------------------------------------------------ *
 * Unverified records
 * ------------------------------------------------------------------ */

test('a record dropped from the USDA directory is unverified, whatever its date', () => {
  const result = marketFreshness({ last_updated: '2025-06-01', unverified: true }, NOW);
  assert.equal(result.level, 'unverified');
  assert.equal(
    result.notice,
    'No longer in the USDA directory and may be closed. Last checked 2025.'
  );
});

test('an unverified record with no usable date drops the date clause', () => {
  for (const last_updated of [undefined, null, '', 'not a date']) {
    const result = marketFreshness({ last_updated, unverified: true }, NOW);
    assert.equal(result.level, 'unverified');
    assert.equal(result.lastVerified, undefined);
    assert.equal(
      result.notice,
      'No longer in the USDA directory and may be closed.'
    );
  }
});

test('unverified set to false is not an unverified record', () => {
  assert.equal(marketFreshness({ last_updated: '2020-08-03', unverified: false }, NOW).level, 'stale');
});

/* ------------------------------------------------------------------ *
 * Dates we cannot reason about
 * ------------------------------------------------------------------ */

test('a missing or garbage date never invents a staleness claim', () => {
  for (const last_updated of [undefined, null, '', '   ', 'not a date', '0000-00-00']) {
    const result = marketFreshness({ last_updated }, NOW);
    assert.equal(result.level, 'fresh', String(last_updated));
    assert.equal(result.notice, undefined, String(last_updated));
    assert.equal(result.lastVerified, undefined, String(last_updated));
  }
});

test('now defaults to the current time', () => {
  // 2020 is more than four years before any plausible "now".
  assert.equal(marketFreshness({ last_updated: '2020-08-03' }).level, 'stale');
});

test('a research check within a year quiets the header line without making the listing fresh', () => {
  const result = marketFreshness(
    {
      last_updated: '2020-08-27',
      enrichment: { verified_at: '2026-08-21', verification_scope: 'partial' },
      first_party: { operations: { schedules: [{ verified_at: '2026-08-21' }] } },
    },
    NOW
  );
  assert.equal(result.level, 'stale');
  assert.equal(result.lastVerified, 'August 27, 2020');
  assert.equal(result.notice, undefined);
});

test('a research check older than a year leaves the short stale line', () => {
  const result = marketFreshness(
    { last_updated: '2020-08-27', enrichment: { verified_at: '2025-06-01' } },
    NOW
  );
  assert.equal(result.notice, 'Listing last checked 2020.');
});

test('a recent check never hides that a listing left the USDA directory', () => {
  const result = marketFreshness(
    { last_updated: '2020-08-27', unverified: true, enrichment: { verified_at: '2026-08-01' } },
    NOW
  );
  assert.equal(result.notice, 'No longer in the USDA directory and may be closed. Last checked 2020.');
});
