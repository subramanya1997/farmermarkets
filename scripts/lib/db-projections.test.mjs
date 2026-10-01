import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDatabaseSnapshot, projectEventTime } from './db-projections.mjs';

const source = { id: 'market-official', url: 'https://example.org/market', title: 'Market', scope: 'market', kind: 'first_party', accessed_at: '2026-09-30' };
const item = (id, value) => ({ id, value, source_ids: ['market-official'], verified_at: '2026-09-30' });
const market = (id = 'one') => ({ id, slug: `market-${id}`, name: 'Market', enrichment: { sources: [source] }, first_party: {
  events: [item('special-day', { name: 'Special day', kind: 'special_market', start: '2026-11-22', local_hours: 'noon–4 PM', venue: 'Other hall' })],
  vendors: { roster: [item('apple-farm', { name: 'Apple Farm', attendance_note: 'Not every week' })], roster_context: { as_of: '2026-09-30', non_exhaustive: true }, attendance_is_dynamic: { value: true, source_ids: ['market-official'], verified_at: '2026-09-30' } },
  programs: [item('nutrition', { name: 'Nutrition match', kind: 'nutrition', eligibility: 'SNAP shoppers' })],
} });

test('date-only, offset timestamps and unknown local times retain their precision', () => {
  assert.deepEqual(projectEventTime('2026-11-22'), { source: '2026-11-22', precision: 'date', date: '2026-11-22', timestamp: null });
  assert.deepEqual(projectEventTime('2026-11-22T12:00:00-05:00'), { source: '2026-11-22T12:00:00-05:00', precision: 'timestamp', date: null, timestamp: '2026-11-22T12:00:00-05:00' });
  assert.deepEqual(projectEventTime('2026-11-22T12:00'), { source: '2026-11-22T12:00', precision: 'local_datetime', date: '2026-11-22', timestamp: null });
  for (const value of [undefined, 'Saturday noon', '2026-02-30', '2026-13-20T12:00Z']) assert.equal(projectEventTime(value).precision, 'unknown');
});

test('stable item keys are scoped to market and rich payload/provenance stays lossless', () => {
  const snapshot = buildDatabaseSnapshot([market('one'), market('two')], []);
  assert.deepEqual(snapshot.events.map((event) => [event.market_id, event.item_id]), [['one', 'special-day'], ['two', 'special-day']]);
  assert.equal(snapshot.events[0].starts_at, null);
  assert.equal(snapshot.events[0].payload.venue, 'Other hall');
  assert.equal(snapshot.events[0].payload.local_hours, 'noon–4 PM');
  assert.deepEqual(snapshot.events[0].provenance.sources, [source]);
  assert.equal(snapshot.vendors[0].payload.attendance_note, 'Not every week');
  assert.equal(snapshot.vendors[0].provenance.roster_context.non_exhaustive, true);
  assert.equal(snapshot.vendors[0].provenance.attendance_note, 'Not every week');
  assert.equal(snapshot.vendors[0].provenance.attendance_is_dynamic.value, true);
  assert.deepEqual(snapshot.vendors[0].provenance.context_sources, [source]);
  assert.equal(snapshot.programs[0].eligibility, 'SNAP shoppers');
});

test('suppressed coordinates are null in query columns without changing canonical JSON', () => {
  const record = { ...market(), suppress_map: true, location: { coordinates: { latitude: 12, longitude: 30 } } };
  const snapshot = buildDatabaseSnapshot([record], []);
  assert.equal(snapshot.markets[0].latitude, null);
  assert.equal(snapshot.markets[0].longitude, null);
  assert.equal(snapshot.markets[0].record.location.coordinates.latitude, 12);
});

test('preflight rejects duplicate collection IDs, missing provenance, orphan research and empty snapshots', () => {
  const record = market();
  record.first_party.events.push(record.first_party.events[0]);
  assert.throws(() => buildDatabaseSnapshot([record], []), /duplicate item/);
  const missing = market();
  missing.enrichment.sources = [];
  assert.throws(() => buildDatabaseSnapshot([missing], []), /unknown source/);
  assert.throws(() => buildDatabaseSnapshot([market()], [{ file: 'research.json', records: [{ id: 'absent' }] }]), /non-canonical/);
  assert.throws(() => buildDatabaseSnapshot([], []), /must not be empty/);
});

test('generic facts preserve false/null/object values and source paths independently of rich projections', () => {
  const snapshot = buildDatabaseSnapshot([market(), market()], [{ file: 'research.json', records: [{
    id: 'one', verified_at: '2026-09-30', amenities: { pets: false, note: null }, first_party: market().first_party,
    sources: [{ ...source, fields: ['amenities.pets', 'amenities.note', 'first_party.events', 'unknown'] }],
  }] }]);
  assert.equal(snapshot.duplicateMarketIds, 1);
  assert.deepEqual(snapshot.facts.map((fact) => fact.value), [false, null, market().first_party.events]);
});
