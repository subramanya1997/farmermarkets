import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GOVERNMENT_MAX_AGE_DAYS,
  LEGACY_MAX_AGE_DAYS,
  checkDataFreshness,
  freshnessReport,
  governmentProblems,
  legacyProblems
} from './check-data-freshness.mjs';

const now = new Date('2026-12-02T12:00:00.000Z');
const daysAgo = (days) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

const source = (id, overrides = {}) => ({
  id,
  status: 'unchanged',
  retrieved_at: daysAgo(1),
  last_attempted_at: daysAgo(1),
  consecutive_failures: 0,
  ...overrides
});

const governmentManifest = (overrides = {}) => ({
  schema_version: 1,
  generated_at: daysAgo(1),
  status: 'ok',
  consecutive_partial_runs: 0,
  sources: [source('ontario'), source('new_york')],
  ...overrides
});

test('a fresh government snapshot has no problems', () => {
  assert.deepEqual(governmentProblems(governmentManifest(), now), []);
});

test('a single partial run is not yet an alert', () => {
  const manifest = governmentManifest({
    status: 'partial',
    consecutive_partial_runs: 1,
    sources: [source('ontario'), source('lyon', { status: 'stale', retrieved_at: daysAgo(31), consecutive_failures: 1, error: 'fetch failed' })]
  });
  assert.deepEqual(governmentProblems(manifest, now), []);
});

test('one source failing two runs in a row is one alert that names it', () => {
  const manifest = governmentManifest({
    status: 'partial',
    consecutive_partial_runs: 2,
    sources: [source('ontario'), source('lyon', { status: 'stale', retrieved_at: daysAgo(80), consecutive_failures: 2, error: 'fetch failed' })]
  });
  const problems = governmentProblems(manifest, now);
  assert.deepEqual(problems, ['lyon failed 2 refreshes in a row; last error: fetch failed.']);
});

test('two different sources failing on back-to-back runs is not an alert', () => {
  const manifest = governmentManifest({
    status: 'partial',
    consecutive_partial_runs: 2,
    sources: [source('ontario'), source('lyon', { status: 'stale', retrieved_at: daysAgo(31), consecutive_failures: 1, error: 'fetch failed' })]
  });
  assert.deepEqual(governmentProblems(manifest, now), []);
});

test('a source that missed one monthly run is not yet stale', () => {
  const manifest = governmentManifest({
    sources: [source('ontario'), source('lyon', { status: 'stale', retrieved_at: daysAgo(61), consecutive_failures: 1, error: 'HTTP 500' })]
  });
  assert.deepEqual(governmentProblems(manifest, now), []);
});

test('an old manifest without the counters has no failure streak', () => {
  const manifest = governmentManifest({
    status: 'partial',
    consecutive_partial_runs: undefined,
    sources: [source('lyon', { status: 'stale', consecutive_failures: undefined, error: 'fetch failed' })]
  });
  assert.deepEqual(governmentProblems(manifest, now), []);
});

test('a refresh that stopped running is one alert, not one per source', () => {
  const problems = governmentProblems(governmentManifest({
    generated_at: daysAgo(GOVERNMENT_MAX_AGE_DAYS + 1),
    sources: [source('ontario', { retrieved_at: daysAgo(90) }), source('new_york', { retrieved_at: daysAgo(90) })]
  }), now);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /last completed on .* \(46 days ago\); the limit is 45 days/);
});

test('one source with an old retrieved_at is an alert even when the run is recent', () => {
  const problems = governmentProblems(governmentManifest({
    sources: [source('ontario'), source('new_york', { status: 'stale', retrieved_at: daysAgo(90), consecutive_failures: 1, error: 'HTTP 404' })]
  }), now);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /^new_york was last retrieved on .* \(90 days ago\); last error: HTTP 404\.$/);
});

test('a source that never succeeded is an alert', () => {
  const problems = governmentProblems(governmentManifest({
    sources: [source('ontario'), source('new_source', { status: 'failed', retrieved_at: null, error: 'HTTP 500' })]
  }), now);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /new_source was last retrieved on never/);
});

test('a missing government manifest is an alert', () => {
  assert.match(governmentProblems(null, now)[0], /missing/);
});

test('the USDA snapshot is fine inside the window and an alert past it', () => {
  assert.deepEqual(legacyProblems({ retrieved_at: daysAgo(LEGACY_MAX_AGE_DAYS) }, now), []);
  const problems = legacyProblems({ retrieved_at: daysAgo(LEGACY_MAX_AGE_DAYS + 20) }, now);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /USDA snapshot was last refreshed on .* \(200 days ago\); the limit is 180 days/);
});

test('a missing or undated USDA manifest is an alert', () => {
  assert.match(legacyProblems(null, now)[0], /nobody knows when/);
  assert.match(legacyProblems({ retrieved_at: null }, now)[0], /last refreshed on never/);
});

test('scope limits which snapshots are checked, and the report lists every problem', () => {
  const stale = { governmentManifest: governmentManifest({ generated_at: daysAgo(100) }), legacyManifest: { retrieved_at: daysAgo(400) }, now };
  assert.equal(checkDataFreshness({ ...stale, scope: 'all' }).length, 2);
  assert.equal(checkDataFreshness({ ...stale, scope: 'government' }).length, 1);
  assert.equal(checkDataFreshness({ ...stale, scope: 'legacy' }).length, 1);

  const report = freshnessReport(checkDataFreshness(stale), now);
  assert.match(report, /^Data freshness check on 2026-12-02 found 2 problems:/);
  assert.match(report, /docs\/data-refresh\.md/);
});
