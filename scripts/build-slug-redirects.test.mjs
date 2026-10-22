import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSlugRedirects } from './build-slug-redirects.mjs';

const geo = (cities) => ({ states: [{ slug: 'washington-d-c', cities, uncategorized_slugs: [] }] });
const market = (slug, name) => ({ slug, name, location: { city: 'Washington', state: 'District of Columbia' } });

test('a re-keyed market redirects to its new slug, a dropped one to its city', () => {
  const previous = [market('adams-morgan-old', 'Adams Morgan Farmers Market'), market('gone-old', 'Gone Market'), market('kept', 'Kept')];
  const current = [market('adams-morgan-new', 'ADAMS MORGAN FARMERS MARKET'), market('kept', 'Kept')];
  const { redirects, added } = buildSlugRedirects({
    previous,
    current,
    previousGeo: geo([{ slug: 'washington', market_slugs: ['adams-morgan-old', 'gone-old', 'kept'] }]),
    currentGeo: geo([{ slug: 'washington', market_slugs: ['adams-morgan-new', 'kept'] }]),
  });
  assert.deepEqual(redirects, {
    'adams-morgan-old': '/markets/adams-morgan-new',
    'gone-old': '/washington-d-c/washington',
  });
  assert.deepEqual(added.sort(), ['adams-morgan-old', 'gone-old']);
});

test('redirects never chain and a returning slug is live again', () => {
  const { redirects } = buildSlugRedirects({
    previous: [],
    current: [market('back', 'Back')],
    previousGeo: geo([]),
    currentGeo: geo([]),
    existing: { older: '/markets/middle', middle: '/washington-d-c/washington', back: '/markets/x' },
  });
  assert.deepEqual(redirects, { middle: '/washington-d-c/washington', older: '/washington-d-c/washington' });
});
