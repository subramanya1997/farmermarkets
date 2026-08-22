import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  listingSortKey,
  proximityBoost,
  searchMarkets,
  textRelevance,
  tokenizeQuery,
  verificationBoost,
} from './marketSearch.ts';
import type { FarmerMarket } from './api.ts';

function market(overrides: Partial<FarmerMarket>): FarmerMarket {
  return { id: overrides.id ?? '1', slug: 'slug', name: 'Market', ...overrides } as FarmerMarket;
}

test('tokenizeQuery lowercases and splits on punctuation', () => {
  assert.deepEqual(tokenizeQuery('  Palo Alto, CA '), ['palo', 'alto', 'ca']);
  assert.deepEqual(tokenizeQuery(''), []);
});

test('every token must match somewhere (AND semantics)', () => {
  const record = market({ name: 'Downtown Farmers Market', city: 'Palo Alto' });
  assert.ok(textRelevance(record, ['downtown', 'palo']) > 0);
  assert.equal(textRelevance(record, ['downtown', 'seattle']), 0);
});

test('name matches outrank address matches', () => {
  const byName = textRelevance(market({ name: 'Ballard Market' }), ['ballard']);
  const byAddress = textRelevance(market({ name: 'Other', address: 'Ballard Ave' }), ['ballard']);
  assert.ok(byName > byAddress);
});

test('whole-phrase name match earns a bonus over scattered token hits', () => {
  const exact = market({ id: 'a', name: 'Downtown Palo Alto Market' });
  const scattered = market({ id: 'b', name: 'Palo Verde Market', city: 'Alto', address: 'Downtown Rd' });
  const tokens = tokenizeQuery('downtown palo alto');
  assert.ok(textRelevance(exact, tokens) > textRelevance(scattered, tokens));
});

test('verification boosts rank and unverified demotes it', () => {
  assert.ok(verificationBoost({ verified: true }) > 0);
  assert.ok(verificationBoost({ unverified: true }) < 0);
  assert.equal(verificationBoost({}), 0);
});

test('proximity boost decays with distance and ignores missing values', () => {
  assert.equal(proximityBoost(undefined), 0);
  assert.equal(proximityBoost(Infinity), 0);
  assert.ok(proximityBoost(1) > proximityBoost(25));
  assert.ok(proximityBoost(25) > proximityBoost(500));
});

test('searchMarkets drops non-matches and puts the best match first', () => {
  const results = searchMarkets(
    [
      market({ id: 'far', name: 'Palo Alto Market', distance: 800 }),
      market({ id: 'near', name: 'Palo Alto Market', distance: 2 }),
      market({ id: 'other', name: 'Chicago Market' }),
    ],
    'palo alto'
  );
  assert.deepEqual(results.map((m) => m.id), ['near', 'far']);
});

test('verified record outranks an equal unconfirmed match', () => {
  const results = searchMarkets(
    [
      market({ id: 'plain', name: 'River Market' }),
      market({ id: 'verified', name: 'River Market', verified: true }),
    ],
    'river'
  );
  assert.equal(results[0].id, 'verified');
});

test('listing key prefers close verified markets and buries unverified ones', () => {
  const verifiedNear = listingSortKey({ distance: 5, verified: true });
  const plainNearer = listingSortKey({ distance: 2 });
  const unverifiedNearest = listingSortKey({ distance: 0.1, unverified: true });
  assert.ok(verifiedNear < plainNearer);
  assert.ok(plainNearer < unverifiedNearest);
});

test('without distances the listing orders verified, unconfirmed, unverified', () => {
  const keys = [
    listingSortKey({ verified: true }),
    listingSortKey({}),
    listingSortKey({ unverified: true }),
  ];
  assert.deepEqual([...keys].sort((a, b) => a - b), keys);
});
