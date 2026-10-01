import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRichEnrichment } from './rich-enrichment-validation.mjs';

function validRecord() {
  return {
    schema_version: 2,
    sources: [{
      id: 'official-market-page',
      title: 'Market visitor information',
      url: 'https://example.org/market',
      fields: ['first_party.operations.schedules'],
      kind: 'first_party',
      scope: 'market',
      accessed_at: '2026-08-21',
    }],
    first_party: {
      operations: {
        timezone: {
          value: 'America/Los_Angeles',
          source_ids: ['official-market-page'],
          verified_at: '2026-08-21',
        },
        schedules: [{
          id: 'saturday-main-season',
          value: {
            recurrence: { kind: 'weekly', weekdays: ['saturday'] },
            opens: '09:00',
            closes: '13:00',
          },
          source_ids: ['official-market-page'],
          verified_at: '2026-08-21',
        }],
      },
    },
  };
}

test('accepts a minimal sourced structured schedule', () => {
  assert.doesNotThrow(() => validateRichEnrichment(validRecord(), 'record', (message) => { throw new Error(message); }));
});

test('rejects operator-scoped market facts', () => {
  const record = validRecord();
  record.sources[0].scope = 'operator';
  assert.throws(
    () => validateRichEnrichment(record, 'record', (message) => { throw new Error(message); }),
    /market scoped/
  );
});

test('rejects a schedule without timezone', () => {
  const record = validRecord();
  delete record.first_party.operations.timezone;
  assert.throws(
    () => validateRichEnrichment(record, 'record', (message) => { throw new Error(message); }),
    /timezone is required/
  );
});

function highlightRecord() {
  const record = validRecord();
  record.sources[0].fields.push('first_party.events', 'first_party.vendors');
  const evidence = { source_ids: ['official-market-page'], verified_at: '2026-08-21' };
  record.first_party.events = [{
    id: 'thanksgiving-market', ...evidence,
    value: { name: 'Thanksgiving Market', kind: 'special_market', start: '2026-11-22', published_hours: '12pm–4pm', venue: 'Published town square', url: 'https://example.org/event' },
  }];
  record.first_party.vendors = {
    roster_context: { ...evidence, value: { label: '2026 season', as_of: '2026-08-21', start_date: '2026-05-01', end_date: '2026-10-31', non_exhaustive: true } },
    roster: [{ id: 'example-farm', ...evidence, value: { name: 'Example Farm', categories: ['Vegetables'], attendance_note: 'Saturdays in the published list.', website: 'https://example.org/farm' } }],
  };
  return record;
}

function validate(record) {
  validateRichEnrichment(record, 'record', (message) => { throw new Error(message); });
}

test('accepts independently sourced dated events and qualified vendor snapshots', () => {
  assert.doesNotThrow(() => validate(highlightRecord()));
});

test('event payloads reject imaginary calendar dates, invalid kinds and unsupported fields', () => {
  for (const value of [
    { start: '2026-02-29' }, { start: '2026-11-22T24:00:00' },
    { start: '2026-11-22', end: '2026-11-21' }, { kind: 'unknown' },
    { name: '' }, { local_hours: { opens: '16:00', closes: '12:00' } },
    { venue: { inferred: 'a guessed address' } }, { invented_field: true },
    { url: 'javascript:alert(1)' },
  ]) {
    const record = highlightRecord();
    Object.assign(record.first_party.events[0].value, value);
    assert.throws(() => validate(record), /value/, JSON.stringify(value));
  }
});

test('events require declared event-field citations and stable unique IDs', () => {
  const unrelatedSource = highlightRecord();
  unrelatedSource.sources[0].fields = ['first_party.operations.schedules', 'first_party.vendors'];
  assert.throws(() => validate(unrelatedSource), /does not declare support for first_party.events/);
  const namesOnly = highlightRecord();
  namesOnly.sources[0].fields = ['first_party.operations.schedules', 'first_party.events.name', 'first_party.vendors'];
  assert.throws(() => validate(namesOnly), /does not declare support for first_party.events/, 'a name-only citation does not support event dates and hours');
  const duplicate = highlightRecord();
  duplicate.first_party.events.push(structuredClone(duplicate.first_party.events[0]));
  assert.throws(() => validate(duplicate), /duplicate item id/);
  const unknownSource = highlightRecord();
  unknownSource.first_party.events[0].source_ids = ['invented-source'];
  assert.throws(() => validate(unknownSource), /unknown source id/);
});

test('rosters reject invalid periods, unsupported values and unusable vendor links', () => {
  for (const changes of [
    { as_of: '2026-08-32' }, { as_of: '2026-09-01' },
    { start_date: '2026-10-31', end_date: '2026-05-01' },
    { non_exhaustive: 'true' }, { guessed_attendance: true },
  ]) {
    const record = highlightRecord();
    Object.assign(record.first_party.vendors.roster_context.value, changes);
    assert.throws(() => validate(record), /roster_context/, JSON.stringify(changes));
  }
  const invalidVendor = highlightRecord();
  invalidVendor.first_party.vendors.roster[0].value.website = 'https:example.org';
  assert.throws(() => validate(invalidVendor), /absolute public http/);
  const duplicate = highlightRecord();
  duplicate.first_party.vendors.roster.push(structuredClone(duplicate.first_party.vendors.roster[0]));
  assert.throws(() => validate(duplicate), /duplicate item id/);
  const missingRosterCitation = highlightRecord();
  missingRosterCitation.sources[0].fields = ['first_party.operations', 'first_party.events'];
  assert.throws(() => validate(missingRosterCitation), /does not declare support for first_party.vendors/);
});
