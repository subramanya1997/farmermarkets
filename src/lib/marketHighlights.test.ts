import assert from 'node:assert/strict';
import test from 'node:test';
import { compactPublishedHours, eventDateBlock, eventDisplayState, eventSpan, marketHighlights, publishedEventDate, publishedLocalHours, rosterPeriodHasEnded, rosterSubhead, safeHighlightUrl, vendorHasDetails } from './marketHighlights.ts';

test('published date-only events stay on the stated day across server time zones', () => {
  const original = process.env.TZ;
  try {
    for (const timezone of ['America/Los_Angeles', 'Pacific/Honolulu', 'Asia/Tokyo']) {
      process.env.TZ = timezone;
      assert.deepEqual(publishedEventDate('2026-11-22'), {
        dateTime: '2026-11-22', label: 'November 22, 2026',
      });
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test('datetime offsets retain the published clock and calendar date', () => {
  assert.deepEqual(publishedEventDate('2026-12-31T23:30:00-08:00'), {
    dateTime: '2026-12-31T23:30:00-08:00', label: 'December 31, 2026 at 11:30pm UTC-08:00',
  });
  assert.deepEqual(publishedEventDate('2026-11-22T12:00:00'), {
    dateTime: '2026-11-22T12:00:00', label: 'November 22, 2026 at 12:00pm',
  });
  assert.deepEqual(publishedEventDate('2026-11-22T00:15:20.25Z'), {
    dateTime: '2026-11-22T00:15:20.25Z', label: 'November 22, 2026 at 12:15:20.25am UTC',
  });
});

test('invalid dates and clocks cannot silently roll into another day or month', () => {
  for (const input of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-11-00', '2026-11-22T24:00:00', '2026-11-22T12:60', '2026-11-22T12:00:60', '2026-11-22T12:00+14:30', 'tomorrow']) {
    assert.equal(publishedEventDate(input), undefined, input);
  }
  assert.deepEqual(publishedEventDate('2028-02-29'), {
    dateTime: '2028-02-29', label: 'February 29, 2028',
  });
});

test('cards accept only absolute http and https links', () => {
  assert.equal(safeHighlightUrl('https://official.example/events'), 'https://official.example/events');
  assert.equal(safeHighlightUrl('http://official.example'), 'http://official.example/');
  for (const input of ['javascript:alert(1)', 'data:text/html,hello', '/events', 'https:official.example', 'https://user:password@example.com', 'https://']) {
    assert.equal(safeHighlightUrl(input), undefined, input);
  }
});

test('counts alone do not create vendor sections, and supported named details remain visible', () => {
  const evidence = { source_ids: ['official'], verified_at: '2026-09-30' };
  const countOnly = marketHighlights({ vendors: { count: { value: { value: 20 }, ...evidence } } });
  assert.equal(countOnly.roster.length, 0);
  assert.equal(countOnly.vendorLinks.length, 0);
  const rich = marketHighlights({
    events: [{ id: 'thanksgiving', value: { name: 'Thanksgiving Market', kind: 'special_market', start: '2026-11-22' }, ...evidence }],
    programs: [{ id: 'kids', value: { name: 'Kids club', kind: 'kids_club' }, ...evidence }],
    vendors: {
      roster: [{ id: 'farm', value: { name: 'Example Farm', categories: ['Vegetables'] }, ...evidence }],
      directory_url: { value: 'https://official.example/vendors', ...evidence },
      attendance_is_dynamic: { value: true, ...evidence },
    },
  });
  assert.equal(rich.events[0].value.start, '2026-11-22');
  assert.equal(rich.vendorLinks[0].label, 'Full vendor list');
  assert.equal(rich.programs.length, 1);
  assert.equal(rich.roster[0].value.name, 'Example Farm');
  assert.equal(rich.vendorLinks[0].href, 'https://official.example/vendors');
  assert.equal(rich.attendanceIsDynamic, true);
});

test('expired calendar events are labeled past without an inferred future recurrence', () => {
  const now = new Date('2026-09-30T12:00:00Z');
  const event = { name: 'Published festival', kind: 'festival' as const, start: '2026-09-20' };
  assert.equal(eventDisplayState(event, now), 'Past event');
  assert.equal(eventDisplayState({ ...event, start: '2026-09-30' }, now), undefined);
  assert.equal(eventDisplayState({ ...event, start: '2026-09-29' }, now), undefined, 'calendar-day grace avoids assumptions about an unstated zone');
  assert.equal(eventDisplayState({ ...event, start: '2026-11-22' }, now), undefined, 'published future date is not a guarantee');
  assert.equal(eventDisplayState({ ...event, status: 'cancelled' }, now), 'Cancelled');
  assert.equal(eventDisplayState({ ...event, status: 'postponed' }, now), 'Postponed');
  assert.equal(eventDisplayState({ ...event, start: 'not a date' }, now), undefined);
});

test('a roster gets one short subhead instead of its provenance, and an ended period is detected', () => {
  const now = new Date('2026-09-30T12:00:00Z');
  const context = { label: '2026 outdoor season', as_of: '2026-09-30', start_date: '2026-05-01', end_date: '2026-09-20', non_exhaustive: true };
  assert.equal(rosterSubhead(context, now), 'From last season');
  assert.equal(rosterSubhead({ ...context, label: '2026 season' }, now), 'From the 2026 season');
  assert.equal(rosterSubhead({ non_exhaustive: true }, now), 'Some regulars');
  assert.equal(rosterSubhead({ label: 'Wednesday producer list' }, now), undefined);
  assert.equal(rosterPeriodHasEnded(context, new Date('2026-09-30T12:00:00Z')), true);
  assert.equal(rosterPeriodHasEnded({ label: 'Unspecified edition' }, new Date('2026-09-30T12:00:00Z')), false);
  assert.equal(rosterPeriodHasEnded({ end_date: '2026-02-30' }, new Date('2026-09-30T12:00:00Z')), false);
});

test('structured local event clocks are displayed without inventing a timezone', () => {
  assert.equal(publishedLocalHours({ opens: '12:00', closes: '16:30' }), '12-4:30pm');
  assert.equal(publishedLocalHours({ opens: '10:00', closes: '14:00' }), '10am-2pm');
  assert.equal(publishedLocalHours({ opens: '25:00', closes: '26:00' }), undefined);
  assert.equal(publishedLocalHours({ opens: '16:00', closes: '12:00' }), undefined);
});

test('past events drop out; cancelled and upcoming ones stay', () => {
  const evidence = { source_ids: ['official'], verified_at: '2026-09-30' };
  const now = new Date('2026-10-21T12:00:00Z');
  const { events } = marketHighlights({
    events: [
      { id: 'past', value: { name: 'Block party', kind: 'other', start: '2026-10-14' }, ...evidence },
      { id: 'next', value: { name: 'Community night', kind: 'other', start: '2026-10-28' }, ...evidence },
      { id: 'off', value: { name: 'Pie day', kind: 'other', start: '2026-11-02', status: 'cancelled' }, ...evidence },
    ],
  }, now);
  assert.deepEqual(events.map((item) => item.id), ['next', 'off']);
});

test('an attendance note repeated across the roster is dropped from every vendor', () => {
  const evidence = { source_ids: ['official'], verified_at: '2026-09-30' };
  const note = 'Published roster: 2026 season. Attendance on a particular date is not confirmed.';
  const { roster } = marketHighlights({
    vendors: {
      roster: [
        { id: 'a', value: { name: 'Black Sheep Garlic', attendance_note: note }, ...evidence },
        { id: 'b', value: { name: 'Gresczyk Farms', attendance_note: note }, ...evidence },
        { id: 'c', value: { name: 'Twin Pines Farm', attendance_note: 'Saturdays only' }, ...evidence },
      ],
    },
  });
  assert.deepEqual(roster.map((item) => item.value.attendance_note), [undefined, undefined, 'Saturdays only']);
  assert.deepEqual(roster.map(vendorHasDetails), [false, false, true]);
  assert.equal(vendorHasDetails({ id: 'd', value: { name: 'Farm', categories: ['Eggs'] }, ...evidence }), true);
});

test('event rows get a date block, a span for multi-day events and short clocks', () => {
  assert.deepEqual(eventDateBlock('2026-10-28'), { month: 'Oct', day: '28', dateTime: '2026-10-28' });
  assert.equal(eventDateBlock('soon'), undefined);
  assert.equal(eventSpan('2026-12-05', '2026-12-06'), 'Dec 5-6');
  assert.equal(eventSpan('2026-11-30', '2026-12-02'), 'Nov 30-Dec 2');
  assert.equal(eventSpan('2026-12-05', '2026-12-05'), undefined);
  assert.equal(compactPublishedHours('4:00 PM-6:00 PM'), '4-6pm');
  assert.equal(compactPublishedHours('10:00 am-1:00 pm'), '10am-1pm');
  assert.equal(compactPublishedHours('5 PM - 8 PM'), '5-8pm');
  assert.equal(compactPublishedHours('All day'), 'All day');
  assert.equal(compactPublishedHours(''), undefined);
});
