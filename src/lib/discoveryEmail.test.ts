import assert from 'node:assert/strict';
import { test } from 'node:test';

import { discoveryEmailLines, type DiscoveryEmailInput } from './discoveryEmail.ts';

const base: DiscoveryEmailInput = {
  intent: 'A farmers market',
  helpTopics: ['Get a market or local-food place listed'],
  name: '',
  organization: 'Riverside Market',
  email: 'organizer@example.test',
  phone: '',
  contactPermission: true,
  message: 'Saturdays, 8 to noon.',
};

test('the operator form email has no country filter or result count', () => {
  const lines = discoveryEmailLines({ ...base, source: '/for-market-operators' }, '2026-11-19T00:00:00.000Z');
  assert.ok(lines.includes('Sent from: /for-market-operators'));
  assert.equal(lines.some((line) => line.startsWith('Country filter')), false);
  assert.equal(lines.some((line) => line.startsWith('Visible result count')), false);
});

test('the survey still reports its country filter and result count, including zero', () => {
  const lines = discoveryEmailLines({ ...base, country: 'United States', resultCount: 0 }, '2026-11-19T00:00:00.000Z');
  assert.ok(lines.includes('Country filter: United States'));
  assert.ok(lines.includes('Visible result count: 0'));
  assert.equal(lines.some((line) => line.startsWith('Sent from')), false);
});

test('missing optional details read as not provided', () => {
  const lines = discoveryEmailLines(base, '2026-11-19T00:00:00.000Z');
  assert.ok(lines.includes('Name: Not provided'));
  assert.ok(lines.includes('Phone: Not provided'));
  assert.equal(lines.at(-1), 'Submitted at: 2026-11-19T00:00:00.000Z');
});
