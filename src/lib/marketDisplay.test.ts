import assert from 'node:assert/strict';
import test from 'node:test';

const { cardScheduleLine, cardSeason, cardPlace, tidyHours, notableMarketType, weekdayOf } = await import('./marketDisplay.ts');
const { extractFilterOptions, applyFilters, splitFilterOptions, PRIMARY_FILTER_IDS } = await import('./filters.ts');

type Market = Parameters<typeof applyFilters>[0][number];

const market = (fields: Partial<Market>): Market => ({ id: fields.name ?? 'x', slug: 'x', name: 'X', ...fields }) as Market;

test('tidyHours turns unambiguous 24-hour ranges into the site clock style', () => {
  assert.equal(tidyHours('11:00-19:00'), '11am-7pm');
  assert.equal(tidyHours('8:30-13:30'), '8:30am-1:30pm');
  assert.equal(tidyHours('07h30-13h30'), '7:30am-1:30pm');
  assert.equal(tidyHours('11am-5pm.'), '11am-5pm');
  assert.equal(tidyHours('4PM-6:30pm'), '4pm-6:30pm');
  // No am/pm and a closing hour before 1pm: could be either, so left alone.
  assert.equal(tidyHours('7:30-12:30'), '7:30-12:30');
  assert.equal(tidyHours(undefined), undefined);
});

test('cardSeason keeps only year-round and month spans', () => {
  assert.equal(cardSeason({ name: 'A', season: 'Year Round' }), 'Year-round');
  assert.equal(cardSeason({ name: 'A', season: 'May - October' }), 'May-Oct');
  assert.equal(cardSeason({ name: 'A', season: 'January - December' }), 'Year-round');
  assert.equal(cardSeason({ name: 'A', season: 'June 4 through October 1, 2026' }), undefined);
  // A season field that is really a weekly schedule is the days line's job.
  assert.equal(cardSeason({ name: 'A', season: 'Saturdays 8am to 1pm' }), undefined);
});

test('cardScheduleLine is one compact line built from parsed days and hours', () => {
  assert.equal(
    cardScheduleLine({ name: 'A', days: ['Saturdays 8:00 am - 12:00 pm'], season: 'May - October' }),
    'Sat 8am-12pm · May-Oct'
  );
  assert.equal(cardScheduleLine({ name: 'A', days: ['Tue & Sat'] }), 'Tue, Sat');
  assert.equal(
    cardScheduleLine({
      name: 'A',
      days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    }),
    'Daily'
  );
  // Raw text with nothing parseable never reaches the card.
  assert.equal(cardScheduleLine({ name: 'A', days: ['Call for hours'] }), undefined);
});

test('notableMarketType names only types a reader would not assume', () => {
  assert.equal(notableMarketType({ organization_types: ['Official government dataset', 'Non-profit organization'] }), undefined);
  assert.equal(notableMarketType({ organization_types: ['Hawker centre and public market'] }), 'Hawker centre and public market');
  assert.equal(notableMarketType({}), undefined);
});

test('weekdayOf reads the reader clock', () => {
  assert.equal(weekdayOf(new Date(2026, 9, 24)), 'Saturday');
  assert.equal(weekdayOf(new Date(2026, 9, 21)), 'Wednesday');
});

test('Today and This weekend filter on parsed weekdays', () => {
  const saturday = market({ name: 'Sat market', days: ['Saturday'] });
  const wednesday = market({ name: 'Wed market', days: ['Wednesday'], snap: true });
  const unknown = market({ name: 'Unknown', days: ['Call ahead'] });
  const markets = [saturday, wednesday, unknown];
  const onWednesday = extractFilterOptions(markets, new Date(2026, 9, 21));

  assert.deepEqual(
    applyFilters(markets, new Set(['today']), onWednesday).map((m) => m.name),
    ['Wed market']
  );
  assert.deepEqual(
    applyFilters(markets, new Set(['weekend']), onWednesday).map((m) => m.name),
    ['Sat market']
  );
  assert.deepEqual(
    applyFilters(markets, new Set(['today', 'snap']), onWednesday).map((m) => m.name),
    ['Wed market']
  );
});

test('the primary row leads with when and how to pay; the rest go behind More', () => {
  const markets = [
    market({ name: 'A', days: ['Saturday'], snap: true, accepts_credit_debit: true, wic: true, has_meat: true }),
    market({ name: 'B', days: ['Wednesday'] }),
  ];
  const { primary, more } = splitFilterOptions(extractFilterOptions(markets, new Date(2026, 9, 21)));
  assert.deepEqual(primary.map((option) => option.id), [...PRIMARY_FILTER_IDS]);
  const moreIds = more.flatMap((category) => category.options.map((option) => option.id));
  assert.ok(moreIds.includes('wic'));
  assert.ok(moreIds.includes('meat'));
  assert.ok(!moreIds.some((id) => (PRIMARY_FILTER_IDS as readonly string[]).includes(id)));
});

test('cardPlace uses the cleaned town and never the state as the town', () => {
  assert.deepEqual(
    cardPlace({
      city: 'California',
      address: 'Chestnut & Menlo Avenues, Menlo Park, California 94025',
      state: 'California',
      country_code: 'US',
    }),
    ['Menlo Park', 'CA']
  );
  assert.deepEqual(
    cardPlace({
      city: 'At El Camino, Palo Alto',
      address: 'California Avenue, At El Camino, Palo Alto, California, 94306',
      state: 'California',
      country_code: 'US',
    }),
    ['Palo Alto', 'CA']
  );
  // A long free-text city with nothing usable is left out, not printed.
  assert.deepEqual(
    cardPlace({ city: 'In the parking lot behind the old county courthouse', state: 'Ohio', country_code: 'US' }),
    ['OH']
  );
});

test('slim records use the precomputed weekdays and hours', () => {
  const slim = { name: 'A', days: ['See website'], weekdays: ['Saturday' as const], hours: '15:00-19:00' };
  assert.equal(cardScheduleLine(slim), 'Sat 3pm-7pm');
  const markets = [market({ name: 'Slim', days: ['See website'], weekdays: ['Saturday'] } as Partial<Market>)];
  const options = extractFilterOptions(markets, new Date(2026, 9, 24));
  assert.equal(applyFilters(markets, new Set(['today']), options).length, 1);
});
