import assert from 'node:assert/strict';
import { test } from 'node:test';

import { filterNearMe, isOpenOn, localDay, weekendDays, type NearMeMarket } from './nearMeFilter.ts';

function market(overrides: Partial<NearMeMarket>): NearMeMarket {
  return {
    slug: 'a',
    name: 'A',
    href: '/markets/a',
    distanceMiles: 1,
    days: [],
    yearRound: false,
    ...overrides,
  };
}

// Local-time constructors, so the test reads the same in any timezone.
const WEDNESDAY = new Date(2026, 10, 11, 12); // 11 Nov 2026
const SATURDAY = new Date(2026, 10, 14, 12);
const SUNDAY = new Date(2026, 10, 15, 12);

test('localDay names the weekday and the local date', () => {
  assert.deepEqual(localDay(WEDNESDAY), { weekday: 'Wednesday', iso: '2026-11-11' });
});

test('this weekend is the coming Saturday and Sunday', () => {
  assert.deepEqual(weekendDays(WEDNESDAY).map((day) => day.iso), ['2026-11-14', '2026-11-15']);
  assert.deepEqual(weekendDays(SATURDAY).map((day) => day.iso), ['2026-11-14', '2026-11-15']);
  assert.deepEqual(weekendDays(SUNDAY).map((day) => day.iso), ['2026-11-15']);
});

test('a year-round market is open on its market days', () => {
  const yearRound = market({ days: ['Wednesday'], yearRound: true });
  assert.equal(isOpenOn(yearRound, localDay(WEDNESDAY)), true);
  assert.equal(isOpenOn(yearRound, localDay(SATURDAY)), false);
});

test('a seasonal market is open only inside its season', () => {
  const summer = market({ days: ['Saturday'], seasonFrom: '2026-05-01', seasonThrough: '2026-10-31' });
  const fall = market({ days: ['Saturday'], seasonFrom: '2026-05-01', seasonThrough: '2026-11-21' });
  assert.equal(isOpenOn(summer, localDay(SATURDAY)), false);
  assert.equal(isOpenOn(fall, localDay(SATURDAY)), true);
});

test('a market with no season or no days never claims to be open', () => {
  assert.equal(isOpenOn(market({ days: ['Saturday'] }), localDay(SATURDAY)), false);
  assert.equal(isOpenOn(market({ yearRound: true }), localDay(SATURDAY)), false);
});

test('tabs filter without reordering', () => {
  const markets = [
    market({ slug: 'near', days: ['Wednesday'], yearRound: true }),
    market({ slug: 'weekend', days: ['Sunday'], yearRound: true }),
    market({ slug: 'closed', days: ['Wednesday', 'Saturday'], seasonFrom: '2026-05-01', seasonThrough: '2026-10-31' }),
    market({ slug: 'unknown', days: [] }),
  ];
  const slugs = (tab: Parameters<typeof filterNearMe>[1]) =>
    filterNearMe(markets, tab, WEDNESDAY).map((item) => item.slug);

  assert.deepEqual(slugs('nearest'), ['near', 'weekend', 'closed', 'unknown']);
  assert.deepEqual(slugs('today'), ['near']);
  assert.deepEqual(slugs('weekend'), ['weekend']);
  assert.deepEqual(slugs('year_round'), ['near', 'weekend']);
});
