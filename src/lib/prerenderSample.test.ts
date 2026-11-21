import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_PRODUCTION_MARKET_LIMIT,
  prerenderMarketLimit,
  sampleEvenly,
  topMarkets,
} from './prerenderSample.ts';

test('outside Vercel every market prerenders unless a limit is set', () => {
  assert.equal(prerenderMarketLimit({}), 0);
  assert.equal(prerenderMarketLimit({ PRERENDER_MARKET_LIMIT: '250' }), 250);
});

test('Vercel builds default to the production limit, which the variable overrides', () => {
  assert.equal(prerenderMarketLimit({ VERCEL: '1' }), DEFAULT_PRODUCTION_MARKET_LIMIT);
  assert.equal(prerenderMarketLimit({ VERCEL: '1', PRERENDER_MARKET_LIMIT: '3000' }), 3000);
  assert.equal(prerenderMarketLimit({ VERCEL: '1', PRERENDER_MARKET_LIMIT: 'all' }), 0);
  assert.equal(prerenderMarketLimit({ VERCEL: '1', PRERENDER_MARKET_LIMIT: ' ALL ' }), 0);
  // Nonsense falls back to the default rather than to "everything".
  assert.equal(prerenderMarketLimit({ VERCEL: '1', PRERENDER_MARKET_LIMIT: 'lots' }), DEFAULT_PRODUCTION_MARKET_LIMIT);
  assert.equal(prerenderMarketLimit({ VERCEL: '1', PRERENDER_MARKET_LIMIT: '-5' }), DEFAULT_PRODUCTION_MARKET_LIMIT);
});

test('topMarkets ranks visited markets first, then by listing strength, then input order', () => {
  const markets = [
    { slug: 'a', richness: 10 },
    { slug: 'b', richness: 90 },
    { slug: 'c', richness: 50 },
    { slug: 'd', richness: 90 },
    { slug: 'e' },
  ];
  const visits = { c: 3, e: 7 };
  assert.deepEqual(
    topMarkets(markets, visits, 4).map((m) => m.slug),
    ['e', 'c', 'b', 'd'],
  );
});

test('topMarkets returns everything for a size of 0 or one at least as long as the list', () => {
  const markets = [{ slug: 'a' }, { slug: 'b' }];
  assert.equal(topMarkets(markets, {}, 0), markets);
  assert.equal(topMarkets(markets, {}, 2), markets);
  assert.equal(topMarkets(markets, {}, 5), markets);
});

test('sampleEvenly still spreads a CI sample across the list', () => {
  assert.deepEqual(sampleEvenly([1, 2, 3, 4, 5, 6], 3), [1, 3, 5]);
});
