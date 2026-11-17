import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMarketMerges } from './merged-markets.mjs';

const markets = [
  { id: 300568, slug: 'east-side', name: 'East Side Farmers Market' },
  { id: 'gov:ca:1', slug: 'east-side-fm', name: 'East Side Fm' },
  { id: 300600, slug: 'other', name: 'Other Market' },
];
const merge = { id: 'gov:ca:1', name: 'East Side Fm', into: '300568', reason: 'Same market, same address.' };

test('drops the merged row and keeps the rest in order', () => {
  const result = applyMarketMerges(markets, [merge], { 'east-side-fm': '/markets/east-side' });
  assert.deepEqual(result.map((market) => market.slug), ['east-side', 'other']);
});

test('requires a redirect from the dropped slug to the survivor', () => {
  assert.throws(() => applyMarketMerges(markets, [merge], {}), /must redirect "east-side-fm" to "\/markets\/east-side"/);
  assert.throws(
    () => applyMarketMerges(markets, [merge], { 'east-side-fm': '/california/petaluma' }),
    /must redirect/,
  );
});

test('guards against a reassigned ID', () => {
  assert.throws(
    () => applyMarketMerges(markets, [{ ...merge, name: 'Something Else' }], { 'east-side-fm': '/markets/east-side' }),
    /is named "East Side Fm"/,
  );
});

test('rejects chained merges and missing survivors', () => {
  const redirects = { 'east-side-fm': '/markets/east-side', 'east-side': '/markets/other' };
  assert.throws(
    () => applyMarketMerges(markets, [merge, { id: '300568', name: 'East Side Farmers Market', into: '300600', reason: 'x' }], redirects),
    /itself merged away/,
  );
  assert.throws(() => applyMarketMerges(markets, [{ ...merge, into: '999' }], redirects), /does not name exactly one row/);
});

test('a row the source dropped fails locally and warns in the refresh', () => {
  const gone = { ...merge, id: 'gov:ca:gone' };
  assert.throws(() => applyMarketMerges(markets, [gone], {}), /does not name exactly one row/);
  const warnings = [];
  const result = applyMarketMerges(markets, [gone], {}, { skipStale: true, warn: (message) => warnings.push(message) });
  assert.equal(result.length, 3);
  assert.match(warnings[0], /skipped/);
});
