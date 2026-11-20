import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseListingEdits, withoutAdminSections, type ListingEdits } from './listingEdits.ts';
import { applyListingEdits, listingEditsFromMarket, type OverlayableMarket } from './organizerOverlay.ts';
import { marketOpeningHoursSpec, marketSpecialOpeningHours } from './schema.ts';
import {
  createBody,
  diffValues,
  displayCaption,
  newMarketSlug,
  overlappingExceptionIssues,
  pastDateIssues,
  patchBody,
  patchToEdits,
  photoOrderBody,
  redirectBody,
  reorder,
  scheduleBody,
  scheduleFromEdits,
  scheduleToEdits,
  sectionsChanged,
} from './listingBotRequests.ts';

const live: ListingEdits = {
  identity: { name: 'North Berkeley Farmers Market' },
  location: { address: '1600 Shattuck Ave', zip_code: '94709', coordinates: { lat: 37.88, lon: -122.27 }, suppress_map: false },
  contact: { websites: ['https://ecologycenter.org'], phone_numbers: ['(510) 548-3333', '(510) 555-0100'], emails: [], social_profiles: [] },
  payments: { methods: ['cash'], assistance: ['snap_ebt'], incentives: [] },
  about: { description: 'Old description' },
};

const note = 'Operator email from Pat Lee on Nov 18, 2026';

test('PATCH rejects unknown fields and needs a source note', () => {
  assert.equal(patchBody.safeParse({ source_note: note, city: 'Oakland' }).success, false);
  assert.equal(patchBody.safeParse({ name: 'X Market' }).success, false);
  assert.equal(patchBody.safeParse({ source_note: 'short', name: 'X Market' }).success, false);
  assert.equal(patchBody.safeParse({ source_note: note, lat: 37.1 }).success, false, 'lat needs lng');
  assert.equal(patchBody.safeParse({ source_note: note, payments: { methods: ['cash'], bitcoin: true } }).success, false);
  assert.equal(patchBody.safeParse({ source_note: note, website: 'javascript:alert(1)' }).success, false);
  assert.equal(patchBody.safeParse({ source_note: note, name: 'North Berkeley Market', lat: 37.9, lng: -122.3 }).success, true);
});

test('PATCH fills each section from the live listing so only sent fields move', () => {
  const body = patchBody.parse({ source_note: note, phone: '(510) 548-1111', operator_name: 'Ecology Center', payments: { methods: ['cash', 'credit_card'] } });
  const { source_note: _n, operator_email: _e, ...fields } = body;
  void _n;
  void _e;
  const changes = patchToEdits(live, fields);
  const parsed = parseListingEdits(changes, { admin: true });
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.edits.contact?.phone_numbers, ['(510) 548-1111', '(510) 555-0100'], 'second number kept');
  assert.deepEqual(parsed.edits.contact?.websites, ['https://ecologycenter.org']);
  assert.deepEqual(parsed.edits.payments, { methods: ['cash', 'credit_card'], assistance: ['snap_ebt'], incentives: [] });
  assert.equal(parsed.edits.identity?.name, 'North Berkeley Farmers Market');
  assert.equal(parsed.edits.identity?.operator_name, 'Ecology Center');
  assert.equal(parsed.edits.location, undefined, 'untouched sections are not sent');

  const sections = sectionsChanged(live, parsed.edits, ['identity', 'contact', 'payments']);
  assert.deepEqual(sections, ['identity', 'contact', 'payments']);
});

test('PATCH null clears a field, and a repeat is a no-op', () => {
  const fields = { website: null, description: null };
  const parsed = parseListingEdits(patchToEdits(live, fields), { admin: true });
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.edits.contact?.websites, []);
  assert.equal(parsed.edits.about?.description, undefined);
  const same = parseListingEdits(patchToEdits(live, { name: 'North Berkeley Farmers Market' }), { admin: true });
  assert.ok(same.ok);
  assert.deepEqual(sectionsChanged(live, same.edits, ['identity']), []);
});

test('diffValues reports leaf changes with old and new values, ignoring empty-vs-missing', () => {
  assert.deepEqual(diffValues({ a: 1, b: { c: 'x', d: [] } }, { a: 1, b: { c: 'y' } }), [{ path: 'b.c', old: 'x', new: 'y' }]);
  assert.deepEqual(diffValues(undefined, []), []);
  assert.deepEqual(diffValues({ list: [1, 2] }, { list: [2, 1] }), [{ path: 'list', old: [1, 2], new: [2, 1] }]);
});

const holidaySchedule = {
  source_note: note,
  weekly: { thursday: [{ opens: '15:00', closes: '19:00' }] },
  seasonal: [
    {
      start_date: '2026-11-01',
      end_date: '2026-12-31',
      label: 'Holiday market',
      hours: { saturday: [{ opens: '10:00', closes: '15:00' }], sunday: [{ opens: '10:00', closes: '15:00' }] },
    },
  ],
  special_dates: [{ date: '2026-11-25', opens: '09:00', closes: '13:00', note: 'Thanksgiving market' }],
  closures: [{ date: '2026-11-26', note: 'Thanksgiving' }],
};

test('schedule body is strict and turns into schedules and exceptions', () => {
  assert.equal(scheduleBody.safeParse({ ...holidaySchedule, weekly: { funday: [] } }).success, false);
  assert.equal(scheduleBody.safeParse({ ...holidaySchedule, closures: [{ date: '2026-02-30' }] }).success, false, 'not a real date');
  assert.equal(scheduleBody.safeParse({ ...holidaySchedule, special_dates: [{ date: '2026-11-25', opens: '13:00', closes: '09:00' }] }).success, false);
  const body = scheduleBody.parse(holidaySchedule);
  const edits = scheduleToEdits(body);
  assert.deepEqual(edits.schedules, [
    { weekdays: ['thursday'], opens: '15:00', closes: '19:00' },
    { weekdays: ['saturday', 'sunday'], opens: '10:00', closes: '15:00', label: 'Holiday market', start_date: '2026-11-01', end_date: '2026-12-31' },
  ]);
  assert.deepEqual(edits.exceptions, [
    { status: 'special_opening', start_date: '2026-11-25', opens: '09:00', closes: '13:00', note: 'Thanksgiving market' },
    { status: 'closed', start_date: '2026-11-26', note: 'Thanksgiving' },
  ]);
  const parsed = parseListingEdits(edits, { admin: true });
  assert.ok(parsed.ok, JSON.stringify(!parsed.ok && parsed.errors));
  // Organizers never send the bot-only section.
  assert.equal(withoutAdminSections(parsed.edits).exceptions, undefined);
});

test('schedule round-trips through the published record', () => {
  const edits = parseListingEdits(scheduleToEdits(scheduleBody.parse(holidaySchedule)), { admin: true });
  assert.ok(edits.ok);
  const back = scheduleFromEdits(edits.edits);
  assert.deepEqual(back.weekly, holidaySchedule.weekly);
  assert.deepEqual(back.seasonal[0].hours, holidaySchedule.seasonal[0].hours);
  assert.deepEqual(back.special_dates, [{ date: '2026-11-25', opens: '09:00', closes: '13:00', kind: 'extra_day', note: 'Thanksgiving market' }]);
  assert.deepEqual(back.closures, holidaySchedule.closures);
});

test('past dates and overlapping dates are refused', () => {
  const body = scheduleBody.parse(holidaySchedule);
  assert.deepEqual(pastDateIssues(body, '2026-11-20'), []);
  assert.equal(pastDateIssues(body, '2026-11-27').length, 2);
  const overlap = overlappingExceptionIssues([
    { status: 'closed', start_date: '2026-12-24', end_date: '2026-12-26' },
    { status: 'special_opening', start_date: '2026-12-26', opens: '09:00', closes: '12:00' },
  ]);
  assert.equal(overlap.length, 1);
});

function record(): OverlayableMarket & { id: string; name: string; slug: string } {
  return {
    id: 'm1',
    slug: 'north-berkeley-farmers-market-berkeley',
    name: 'North Berkeley Farmers Market',
    contact: { websites: [], phone_numbers: [], emails: [], social_media: [] },
    operations: { days: ['Thursday 3pm-7pm'] },
    first_party: {
      operations: {
        exceptions: [{ id: 'research-x', value: { status: 'closed', start_date: '2026-12-25' }, source_ids: ['site'], verified_at: '2026-10-01' }],
      },
    },
  };
}

test('the overlay writes dated hours, special dates and the operator; JSON-LD follows', () => {
  const parsed = parseListingEdits(
    { ...scheduleToEdits(scheduleBody.parse(holidaySchedule)), identity: { name: 'North Berkeley Farmers Market', operator_name: 'Ecology Center' } },
    { admin: true },
  );
  assert.ok(parsed.ok);
  const next = applyListingEdits(record(), parsed.edits, { approvedAt: '2026-11-20', listingUrl: 'https://www.farmermarkets.app/markets/x' });
  const ops = next.first_party?.operations;
  assert.equal(ops?.schedules?.length, 2);
  assert.equal(ops?.schedules?.[1].value.start_date, '2026-11-01');
  assert.deepEqual(ops?.exceptions?.map((item) => item.value.start_date), ['2026-11-25', '2026-11-26'], 'research exceptions replaced');
  assert.equal(next.first_party?.identity?.operator_name?.value, 'Ecology Center');

  const schemaRecord = { slug: 'x', name: next.name, days: next.operations?.days, first_party: next.first_party };
  const hours = marketOpeningHoursSpec(schemaRecord, new Date('2026-11-20T12:00:00Z'));
  assert.deepEqual(
    hours?.map((spec) => [spec.dayOfWeek, spec.opens, spec.closes, spec.validFrom, spec.validThrough]),
    [
      [['Thursday'], '15:00', '19:00', undefined, undefined],
      [['Saturday', 'Sunday'], '10:00', '15:00', '2026-11-01', '2026-12-31'],
    ],
  );
  const special = marketSpecialOpeningHours(schemaRecord, new Date('2026-11-20T12:00:00Z'));
  assert.deepEqual(
    special?.map((spec) => [spec.validFrom, spec.opens, spec.closes]),
    [
      ['2026-11-25', '09:00', '13:00'],
      ['2026-11-26', '00:00', '00:00'],
    ],
  );

  // The editor prefill keeps the dates, so an organizer save does not drop them.
  const prefill = listingEditsFromMarket(
    { name: next.name, first_party: next.first_party },
    '2026-11-20',
  );
  assert.equal(prefill.schedules?.[1].start_date, '2026-11-01');
  assert.equal(prefill.exceptions?.length, 2);
  assert.equal(prefill.identity?.operator_name, 'Ecology Center');
});

test('photo, create and redirect bodies', () => {
  assert.equal(photoOrderBody.safeParse({ source_note: note, order: ['x'] }).success, false, 'ids are uuids');
  assert.equal(photoOrderBody.safeParse({ source_note: note }).success, false, 'order or cover');
  assert.equal(redirectBody.safeParse({ source_note: note, to_slug: 'a', force: true }).success, false);
  assert.equal(createBody.safeParse({ source_note: note, name: 'Holiday Market', city: 'Berkeley', state: 'CA' }).success, true);
  assert.equal(createBody.safeParse({ source_note: note, name: 'Holiday Market', city: 'Berkeley', state: 'CA', slug: 'x' }).success, false);
  assert.deepEqual(reorder(['a', 'b', 'c'], ['c', 'zz']), ['c', 'a', 'b']);
  assert.equal(displayCaption('Stalls on Shattuck.', 'Pat Lee'), 'Stalls on Shattuck. Photo: Pat Lee');
  assert.equal(displayCaption(undefined, undefined), null);
});

test('new market slugs follow the dataset pattern and never collide', () => {
  const taken = new Set(['berkeley-holiday-market-berkeley']);
  assert.equal(newMarketSlug('Berkeley Holiday Market', 'Berkeley', (slug) => taken.has(slug)), 'berkeley-holiday-market-berkeley-2');
  assert.equal(newMarketSlug('Winter Market at Café Rouge', 'Oakland', () => false), 'winter-market-at-cafe-rouge-oakland');
});
