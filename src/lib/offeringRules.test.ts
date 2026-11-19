import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_OFFERING_ITEMS,
  addDays,
  currentOffering,
  offeringDates,
  offeringIsCurrent,
  offeringIsOver,
  offeringRefusal,
  offeringsToCarry,
  parseOfferingInput,
  readOfferingItems,
  upcomingMarketDays,
  usToday,
  weekdayOf,
} from './offeringRules.ts';
import { vendorPubliclyListed } from './vendorRules.ts';

const TODAY = '2026-11-18'; // a Wednesday

function post(overrides: Record<string, unknown> = {}) {
  return { market: 'downtown-market', starts_on: '2026-11-21', items: [{ name: 'Heirloom tomatoes', note: 'last of the season' }, { name: 'Eggs' }], ...overrides };
}

test('an approved vendor may post; nobody else and no other status may', () => {
  assert.equal(offeringRefusal({ ownVendor: true, applicationStatus: 'approved' }), null);
  for (const status of ['pending', 'denied', 'withdrawn'] as const) {
    assert.ok(offeringRefusal({ ownVendor: true, applicationStatus: status }), status);
  }
  assert.match(offeringRefusal({ ownVendor: true, applicationStatus: null })!, /Apply/);
  // Another account posting for this vendor is refused even when the vendor is approved.
  assert.match(offeringRefusal({ ownVendor: false, applicationStatus: 'approved' })!, /your own business/);
});

test('a post parses to plain text with a one day default', () => {
  const result = parseOfferingInput(post({ note: '  Cash\u0007 and cards — welcome  ' }), TODAY);
  assert.ok(result.ok);
  assert.deepEqual(result.offering, {
    market: 'downtown-market',
    startsOn: '2026-11-21',
    endsOn: '2026-11-21',
    items: [{ name: 'Heirloom tomatoes', note: 'last of the season' }, { name: 'Eggs' }],
    note: 'Cash and cards - welcome',
  });
});

test('blank item rows are dropped, but at least one item is needed', () => {
  const ok = parseOfferingInput(post({ items: [{ name: 'Honey' }, { name: '  ', note: '' }] }), TODAY);
  assert.ok(ok.ok);
  assert.equal(ok.offering.items.length, 1);
  const empty = parseOfferingInput(post({ items: [{ name: '' }] }), TODAY);
  assert.ok(!empty.ok);
  assert.equal(empty.errors[0].path, 'items');
  const noteOnly = parseOfferingInput(post({ items: [{ name: '', note: 'a note without an item' }] }), TODAY);
  assert.ok(!noteOnly.ok);
});

test('posts refuse bad days, long runs, old days and too many items', () => {
  assert.ok(!parseOfferingInput(post({ starts_on: '2026-02-30' }), TODAY).ok);
  assert.ok(!parseOfferingInput(post({ ends_on: '2026-11-20' }), TODAY).ok, 'ends before it starts');
  assert.ok(!parseOfferingInput(post({ ends_on: addDays('2026-11-21', 14) }), TODAY).ok, 'more than 14 days');
  assert.ok(parseOfferingInput(post({ ends_on: addDays('2026-11-21', 13) }), TODAY).ok, 'exactly 14 days');
  assert.ok(!parseOfferingInput(post({ starts_on: '2026-11-17' }), TODAY).ok, 'yesterday');
  assert.ok(parseOfferingInput(post({ starts_on: TODAY }), TODAY).ok, 'today');
  assert.ok(!parseOfferingInput(post({ starts_on: addDays(TODAY, 61) }), TODAY).ok, 'too far ahead');
  const many = Array.from({ length: MAX_OFFERING_ITEMS + 1 }, (_, index) => ({ name: `Item ${index}` }));
  assert.ok(!parseOfferingInput(post({ items: many }), TODAY).ok);
  assert.ok(!parseOfferingInput(post({ market: '../admin' }), TODAY).ok);
  assert.ok(!parseOfferingInput({ ...post(), vendor_id: 'someone-else' }, TODAY).ok, 'unknown keys are refused');
});

const saturday = { startsOn: '2026-11-21', endsOn: '2026-11-21', updatedAt: '2026-11-18T10:00:00.000Z' };

test('a post is current on its days and hidden once over or withdrawn', () => {
  assert.ok(!offeringIsCurrent(saturday, { from: '2026-11-20', to: '2026-11-20' }), 'not yet');
  assert.ok(offeringIsCurrent(saturday, { from: '2026-11-21', to: '2026-11-21' }));
  assert.ok(!offeringIsCurrent(saturday, { from: '2026-11-22', to: '2026-11-22' }), 'expired');
  assert.ok(!offeringIsCurrent({ ...saturday, withdrawn: true }, { from: '2026-11-21', to: '2026-11-21' }), 'withdrawn');
  const weekend = { ...saturday, endsOn: '2026-11-22' };
  assert.ok(offeringIsCurrent(weekend, { from: '2026-11-22', to: '2026-11-22' }));
  assert.ok(offeringIsOver(weekend, { from: '2026-11-23', to: '2026-11-23' }));
});

test('across US time zones a Saturday post stays up until Saturday is over in Hawaii', () => {
  // 11pm Saturday in Honolulu is 4am Sunday in New York.
  const lateSaturdayInHawaii = new Date('2026-11-22T09:00:00Z');
  const range = usToday(lateSaturdayInHawaii);
  assert.deepEqual(range, { from: '2026-11-21', to: '2026-11-22' });
  assert.ok(offeringIsCurrent(saturday, range));
  // 1am Sunday in Honolulu: Saturday is over everywhere in the US.
  assert.ok(!offeringIsCurrent(saturday, usToday(new Date('2026-11-22T11:00:00Z'))));
});

test('the newest of two overlapping posts wins', () => {
  const older = { ...saturday, endsOn: '2026-11-22', id: 'older' };
  const newer = { ...saturday, updatedAt: '2026-11-19T08:00:00.000Z', id: 'newer' };
  const day = { from: '2026-11-21', to: '2026-11-21' };
  assert.equal(currentOffering([older, newer], day)?.id, 'newer');
  assert.equal(currentOffering([older, newer], { from: '2026-11-22', to: '2026-11-22' })?.id, 'older');
  assert.equal(currentOffering([{ ...newer, withdrawn: true }, older], day)?.id, 'older');
  assert.equal(currentOffering([], day), null);
});

test('cached pages carry current and upcoming posts, not old or far ones', () => {
  const today = { from: '2026-11-18', to: '2026-11-18' };
  const carried = offeringsToCarry(
    [
      { ...saturday, id: 'saturday' },
      { ...saturday, startsOn: '2026-11-10', endsOn: '2026-11-10', id: 'old' },
      { ...saturday, startsOn: '2026-12-20', endsOn: '2026-12-20', id: 'far' },
      { ...saturday, withdrawn: true, id: 'withdrawn' },
    ],
    today,
  );
  assert.deepEqual(carried.map((offering) => offering.id), ['saturday']);
});

test('only publicly listed vendors show posts', () => {
  // The public layer attaches posts only where vendorPubliclyListed holds.
  assert.ok(vendorPubliclyListed({ hasLiveProfile: true, suspended: false }, 'approved'));
  assert.ok(!vendorPubliclyListed({ hasLiveProfile: true, suspended: true }, 'approved'));
  assert.ok(!vendorPubliclyListed({ hasLiveProfile: false, suspended: false }, 'approved'));
  assert.ok(!vendorPubliclyListed({ hasLiveProfile: true, suspended: false }, 'withdrawn'));
});

test('market days follow the days the vendor attends', () => {
  assert.equal(weekdayOf('2026-11-21'), 'saturday');
  assert.deepEqual(upcomingMarketDays(TODAY, ['saturday', 'wednesday'], 3), ['2026-11-18', '2026-11-21', '2026-11-25']);
  assert.deepEqual(upcomingMarketDays(TODAY, [], 2), ['2026-11-18', '2026-11-19']);
});

test('stored items are re-read defensively and dates read plainly', () => {
  assert.deepEqual(readOfferingItems([{ name: 'Honey' }, { name: '' }, 'junk', { name: 'Jam', note: 'strawberry', extra: 1 }]), [{ name: 'Honey' }]);
  assert.deepEqual(readOfferingItems(null), []);
  assert.equal(offeringDates(saturday), 'Sat, Nov 21');
  assert.equal(offeringDates({ startsOn: '2026-11-21', endsOn: '2026-11-22' }), 'Nov 21 to Nov 22');
});
