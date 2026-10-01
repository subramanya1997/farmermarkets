import test from 'node:test';
import assert from 'node:assert/strict';
import { applySourceCorrections } from './editorial-sources.mjs';

test('an older title correction preserves new event evidence and source references', () => {
  const sources = [
    { id: 'home', url: 'https://example.org/', title: 'Old title', fields: ['operations.days', 'first_party.contact'], kind: 'first_party' },
    { id: 'event', url: 'https://example.org/events', title: 'Event', fields: ['first_party.events'] },
  ];
  const result = applySourceCorrections(sources, [{ url: 'https://example.org/', title: 'Correct title', fields: ['operations.days'] }]);
  assert.deepEqual(result[0], { ...sources[0], title: 'Correct title' });
  assert.deepEqual(result[1], sources[1]);
});
