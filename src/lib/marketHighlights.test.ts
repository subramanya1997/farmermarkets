import assert from 'node:assert/strict';
import test from 'node:test';
import { marketHighlights, publishedEventDate, safeHighlightUrl } from './marketHighlights.ts';

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
  assert.equal(rich.programs.length, 1);
  assert.equal(rich.roster[0].value.name, 'Example Farm');
  assert.equal(rich.vendorLinks[0].href, 'https://official.example/vendors');
  assert.equal(rich.attendanceIsDynamic, true);
});
