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
