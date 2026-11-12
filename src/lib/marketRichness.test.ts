import assert from 'node:assert/strict';
import { test } from 'node:test';
import { effectiveDistance, marketRichness, RICHNESS_REACH_MILES } from './marketRichness.ts';

const none = { hasHours: false, hasDays: false };
const hours = { hasHours: true, hasDays: true };

test('a bare record scores 0 and a full one 100', () => {
  assert.equal(marketRichness({}, none), 0);
  assert.equal(
    marketRichness(
      {
        websites: ['https://example.org'],
        phone_numbers: ['555-123-4567'],
        social_media: ['https://www.instagram.com/x', 'https://www.facebook.com/x'],
        season: 'May to October',
        vendor_count: 40,
        products: ['Vegetables'],
        payment_methods: ['Cash'],
        snap: true,
        address: '1 Main St',
        location_description: 'Behind the library',
        first_party: {},
        verified: true,
      },
      hours
    ),
    100
  );
});

test('each added fact raises the score, and hours beat a bare weekday', () => {
  const base = { address: '1 Main St' };
  const located = marketRichness(base, none);
  const withDay = marketRichness(base, { hasHours: false, hasDays: true });
  const withHours = marketRichness(base, hours);
  const withSite = marketRichness({ ...base, websites: ['https://example.org'] }, hours);
  const withInstagram = marketRichness(
    { ...base, websites: ['https://example.org'], social_media: ['https://www.instagram.com/x'] },
    hours
  );
  assert.ok(located < withDay && withDay < withHours && withHours < withSite && withSite < withInstagram);
});

test('a record the source dropped keeps under a third of its score', () => {
  const record = { websites: ['https://example.org'], phone_numbers: ['555-123-4567'], address: '1 Main St' };
  const live = marketRichness(record, hours);
  const dropped = marketRichness({ ...record, unverified: true }, hours);
  assert.ok(dropped > 0 && dropped <= live * 0.31);
});

test('effective distance: a full listing keeps its distance, an empty one is pushed back by the reach', () => {
  assert.equal(effectiveDistance(3, 100), 3);
  assert.equal(effectiveDistance(3, 0), 3 + RICHNESS_REACH_MILES);
  assert.equal(effectiveDistance(3, undefined), 3 + RICHNESS_REACH_MILES);
  assert.equal(effectiveDistance(3, 50), 3 + RICHNESS_REACH_MILES / 2);
  // A rich market 8 miles out leads a bare one next door, but not one 30 miles nearer.
  assert.ok(effectiveDistance(8, 90) < effectiveDistance(0.5, 20));
  assert.ok(effectiveDistance(40, 100) > effectiveDistance(10, 0));
});

test('popularity bonus grows slowly and tops out', async () => {
  const { popularityBonus, listingStrength, POPULARITY_POINTS } = await import('./marketRichness.ts');
  assert.equal(popularityBonus(undefined), 0);
  assert.equal(popularityBonus(0), 0);
  assert.ok(popularityBonus(1) > 0);
  assert.ok(popularityBonus(1) < popularityBonus(4));
  assert.ok(popularityBonus(4) < popularityBonus(16));
  assert.equal(popularityBonus(16), POPULARITY_POINTS);
  assert.equal(popularityBonus(5000), POPULARITY_POINTS);
  assert.equal(listingStrength(40, undefined), 40);
  assert.equal(listingStrength(95, 16), 100);
  assert.equal(listingStrength(10, 16, true), 10);
});
