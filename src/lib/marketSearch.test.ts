import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  distanceSortKey,
  listingSortKey,
  richnessBoost,
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

test('listing key: equal richness is plain distance, verified breaks ties, dropped records last', () => {
  const verifiedFar = listingSortKey({ distance: 5, verified: true });
  const plainNearer = listingSortKey({ distance: 2 });
  const plainNearest = listingSortKey({ distance: 0.1 });
  const verifiedTie = listingSortKey({ distance: 2, verified: true });
  const unverifiedNearest = listingSortKey({ distance: 0.1, unverified: true });
  assert.ok(plainNearest < plainNearer);
  assert.ok(plainNearer < verifiedFar);
  // Verification only breaks a tie.
  assert.ok(verifiedTie < plainNearer);
  assert.ok(listingSortKey({ distance: 2.1, verified: true }) > plainNearer);
  // Records the upstream directory dropped still go last.
  assert.ok(verifiedFar < unverifiedNearest);
});

test('listing key: a rich market nearby leads a bare one next door, within 15 miles only', () => {
  const richAcrossTown = listingSortKey({ distance: 8, richness: 90 });
  const bareNextDoor = listingSortKey({ distance: 0.5, richness: 20 });
  const richFarAway = listingSortKey({ distance: 40, richness: 100 });
  const bareInTown = listingSortKey({ distance: 10, richness: 0 });
  assert.ok(richAcrossTown < bareNextDoor);
  assert.ok(bareInTown < richFarAway);
  // Without a location the richest listing leads.
  assert.ok(listingSortKey({ richness: 80 }) < listingSortKey({ richness: 30 }));
});

test('the explicit nearest order ignores richness', () => {
  assert.ok(distanceSortKey({ distance: 1 }) < distanceSortKey({ distance: 2 }));
  assert.ok(distanceSortKey({ distance: 50 }) < distanceSortKey({ distance: 1, unverified: true }));
});

test('search: the richer of two equal matches leads, a better text match still wins', () => {
  const results = searchMarkets(
    [
      market({ id: 'bare', name: 'River Market', distance: 3, richness: 10 }),
      market({ id: 'rich', name: 'River Market', distance: 6, richness: 90 }),
      market({ id: 'exact', name: 'River', distance: 6, richness: 0 }),
    ],
    'river'
  );
  assert.deepEqual(results.map((entry) => entry.id), ['exact', 'rich', 'bare']);
  assert.equal(richnessBoost(100), 20);
  assert.equal(richnessBoost(undefined), 0);
});

test('without distances the listing orders verified, unconfirmed, unverified', () => {
  const keys = [
    listingSortKey({ verified: true }),
    listingSortKey({}),
    listingSortKey({ unverified: true }),
  ];
  assert.deepEqual([...keys].sort((a, b) => a - b), keys);
});

test('a generic query stays local: a near word match beats a far name-prefix match', () => {
  const results = searchMarkets(
    [
      market({ id: 'far', name: 'Downtown Farmers Market', distance: 300, richness: 90 }),
      market({ id: 'near', name: 'Riverside Downtown Market', distance: 4, richness: 40 }),
    ],
    'downtown'
  );
  assert.deepEqual(results.map((m) => m.id), ['near', 'far']);
});

test('searching another place is still decided by the text', () => {
  const results = searchMarkets(
    [
      market({ id: 'street', name: 'Green Market', address: '12 Portland Ave', distance: 3 }),
      market({ id: 'city', name: 'Saturday Market', city: 'Portland', distance: 600 }),
    ],
    'portland'
  );
  assert.equal(results[0].id, 'city');
});
