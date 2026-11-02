import assert from 'node:assert/strict';
import test from 'node:test';
import { marketOffers } from './marketOffers.ts';
import { marketWinterAnswer } from './marketWinter.ts';

const source = { url: 'https://example.org', retrieved_at: '2026-10-01' };
const sourced = <T,>(value: T) => ({ value, sources: [source] });

test('researched amenities become one row each, with the source sentence as a note', () => {
  const offers = marketOffers({
    name: 'Alden Farmers Market',
    first_party: {
      amenities: [
        sourced({ code: 'restrooms' as const, availability: 'yes' as const, note: 'Fixed restrooms at Alden Town Park' }),
        sourced({ code: 'seating' as const, availability: 'yes' as const, note: 'A covered pavilion to sit and eat' }),
        sourced({ code: 'atm' as const, availability: 'no' as const }),
      ],
    },
  } as never);

  assert.deepEqual(
    offers.map((offer) => [offer.label, offer.note, Boolean(offer.unavailable)]),
    [
      ['Restrooms', 'Fixed restrooms at Alden Town Park', false],
      ['Seating', 'A covered pavilion to sit and eat', false],
      ['ATM', undefined, true],
    ]
  );
});

test('legacy flags, payments and ordering fill their own groups without duplicates', () => {
  const offers = marketOffers({
    name: 'Test Market',
    has_parking: true,
    has_restrooms: true,
    snap: true,
    accepts_cash: true,
    csa_available: true,
    csa_description: 'Weekly boxes;Pickup at market;',
  });
  assert.deepEqual(
    offers.map((offer) => `${offer.group}: ${offer.label}`),
    ['Amenities: Parking', 'Amenities: Restrooms', 'Payment: Cash', 'Payment: SNAP/EBT', 'Ordering: CSA subscriptions']
  );
  assert.equal(offers.at(-1)?.note, 'Weekly boxes, Pickup at market');
});

test('a stated pet policy wins over the legacy pet flag', () => {
  const offers = marketOffers({
    name: 'Test Market',
    pet_friendly: true,
    first_party: { policies: [sourced({ code: 'pets' as const, rule: 'not_allowed' as const })] },
  } as never);
  assert.deepEqual(offers.map((offer) => offer.label), ['No pets']);
});

test('a record that states nothing offers nothing', () => {
  assert.deepEqual(marketOffers({ name: 'Bare Market' }), []);
});

test('winter: year-round, winter-season and summer-season records each get a plain answer', () => {
  const now = new Date('2026-11-15T12:00:00Z');
  assert.equal(
    marketWinterAnswer({ slug: 'm', name: 'Findlay Market', season: 'Year-round' }, now)?.status,
    'year_round'
  );
  const summer = marketWinterAnswer({ slug: 'm', name: 'Savage Farmers Market', season: 'May - October' }, now);
  assert.equal(summer?.status, 'summer_season');
  assert.match(summer?.text ?? '', /does not run in winter/);
  assert.doesNotMatch(summer?.text ?? '', /[–—]/);
  assert.equal(
    marketWinterAnswer({ slug: 'm', name: 'Holiday Market', season: 'November - March' }, now)?.status,
    'winter_season'
  );
});

test('winter: no season, or a closed market, gets no answer', () => {
  assert.equal(marketWinterAnswer({ slug: 'm', name: 'Unknown Market' }), undefined);
  assert.equal(
    marketWinterAnswer({
      slug: 'm',
      name: 'Closed Market',
      season: 'Year-round',
      first_party: { operations: { status: sourced({ value: 'permanently_closed' as const }) } },
    } as never),
    undefined
  );
});

test('winter: an indoor market says so', () => {
  const answer = marketWinterAnswer({ slug: 'm', name: 'Market House', season: 'Year-round', indoor_outdoor: 'Yes, the entire time the market is open indoor;' });
  assert.match(answer?.text ?? '', /held indoors/);
});
