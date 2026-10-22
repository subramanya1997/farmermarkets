import assert from 'node:assert/strict';
import test from 'node:test';

import { newerInstant, toIsoInstant } from './dates.ts';
import {
  TITLE_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  fitDescription,
  fitTitle,
  formatCount,
  joinWithAnd,
  placesPhrase,
  pluralMarkets,
  pluralShort,
  sharePercent,
  tidyHours,
} from './topicCopy.ts';

test('joinWithAnd reads as English for one, two and three items', () => {
  assert.equal(joinWithAnd([]), '');
  assert.equal(joinWithAnd(['New York']), 'New York');
  assert.equal(joinWithAnd(['New York', 'California']), 'New York and California');
  assert.equal(
    joinWithAnd(['New York', 'California', 'Texas']),
    'New York, California and Texas'
  );
});

test('counts carry thousands separators regardless of the host locale', () => {
  assert.equal(formatCount(8807), '8,807');
  assert.equal(formatCount(661), '661');
  assert.equal(pluralMarkets(1), '1 farmers market');
  assert.equal(pluralMarkets(1899), '1,899 farmers markets');
  assert.equal(pluralShort(1), '1 market');
  assert.equal(pluralShort(813), '813 markets');
});

test('sharePercent rounds, and returns undefined rather than 0% for an empty total', () => {
  assert.equal(sharePercent(813, 1899), 43);
  assert.equal(sharePercent(1, 3), 33);
  assert.equal(sharePercent(0, 10), 0);
  assert.equal(sharePercent(5, 0), undefined);
  assert.equal(sharePercent(5, Number.NaN), undefined);
});

test('fitTitle keeps the first candidate that fits the SERP', () => {
  const title = fitTitle([
    '661 Farmers Markets That Accept SNAP/EBT',
    'Farmers Markets That Accept SNAP/EBT',
  ]);
  assert.equal(title, '661 Farmers Markets That Accept SNAP/EBT');
  assert.ok(title.length <= TITLE_MAX_LENGTH);
});

test('fitTitle falls through to a shorter candidate, and never exceeds the cap', () => {
  const long = 'A'.repeat(TITLE_MAX_LENGTH + 10);
  assert.equal(fitTitle([long, 'Saturday Farmers Markets']), 'Saturday Farmers Markets');
  assert.equal(fitTitle([long]).length, TITLE_MAX_LENGTH);
  assert.equal(fitTitle(['', '  ', 'Market Hours']), 'Market Hours');
});

test('fitDescription skips a sentence that would overflow rather than truncating it', () => {
  const description = fitDescription('There are 813 Saturday markets.', [
    'Browse them by state.',
    `${'x'.repeat(DESCRIPTION_MAX_LENGTH)}.`,
    'See addresses and hours.',
  ]);

  assert.equal(
    description,
    'There are 813 Saturday markets. Browse them by state. See addresses and hours.'
  );
  assert.ok(description.length <= DESCRIPTION_MAX_LENGTH);
});

test('fitDescription drops empty clauses', () => {
  assert.equal(fitDescription('Opening line.', [undefined, '', '  ']), 'Opening line.');
});

test('placesPhrase counts DC alongside the states, never as one', () => {
  assert.equal(placesPhrase(47, true), '47 states and DC');
  assert.equal(placesPhrase(50, false), '50 states');
  assert.equal(placesPhrase(1, false), '1 state');
  assert.equal(placesPhrase(0, true), 'DC');
});

test('tidyHours gives one spelling for the same window', () => {
  assert.equal(tidyHours('9am-1pm'), '9am-1pm');
  assert.equal(tidyHours('10AM-2PM'), '10am-2pm');
  assert.equal(tidyHours('9:00am-1:00pm'), '9am-1pm');
  assert.equal(tidyHours('8:30 AM - 1:30 PM'), '8:30am-1:30pm');
  assert.equal(tidyHours('9am\u20131pm'), '9am-1pm');
  assert.equal(tidyHours('3-7pm'), '3-7pm');
});

test('tidyHours converts only an unambiguous 24-hour range', () => {
  assert.equal(tidyHours('8:00-18:00'), '8am-6pm');
  assert.equal(tidyHours('07:30-13:00'), '7:30am-1pm');
  // Could be morning or afternoon, so it is left alone.
  assert.equal(tidyHours('9:00-12:00'), '9:00-12:00');
});

test('topic copy carries no en or em dashes', () => {
  for (const value of [tidyHours('9am \u2014 1pm'), placesPhrase(3, true)]) {
    assert.ok(!/[\u2013\u2014]/.test(value), value);
  }
});

test('toIsoInstant reads zone-less dataset timestamps as UTC', () => {
  assert.equal(toIsoInstant('2020-08-03T13:44:04'), '2020-08-03T13:44:04.000Z');
  assert.equal(toIsoInstant('2024-05-01T00:00:00Z'), '2024-05-01T00:00:00.000Z');
  assert.equal(toIsoInstant('2024-05-01T00:00:00+02:00'), '2024-04-30T22:00:00.000Z');
  assert.equal(toIsoInstant('   '), undefined);
  assert.equal(toIsoInstant(undefined), undefined);
  assert.equal(toIsoInstant('not a date'), undefined);
});

test('newerInstant ignores the missing side', () => {
  assert.equal(newerInstant(undefined, '2024-01-01T00:00:00.000Z'), '2024-01-01T00:00:00.000Z');
  assert.equal(newerInstant('2024-01-01T00:00:00.000Z', undefined), '2024-01-01T00:00:00.000Z');
  assert.equal(
    newerInstant('2024-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'),
    '2025-01-01T00:00:00.000Z'
  );
  assert.equal(newerInstant(undefined, undefined), undefined);
});
