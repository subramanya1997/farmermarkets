import assert from 'node:assert/strict';
import test from 'node:test';

const { busiestDay, splitBySchedule, yearRoundSentence, nearestCities, centroid, dayHash } =
  await import('./cityPageView.ts');

test('busiest day needs 3+ markets and no tie', () => {
  assert.deepEqual(
    busiestDay([
      { day: 'Saturday', count: 10 },
      { day: 'Sunday', count: 9 },
    ]),
    { day: 'Saturday', count: 10 }
  );
  assert.equal(busiestDay([{ day: 'Saturday', count: 2 }]), undefined);
  assert.equal(
    busiestDay([
      { day: 'Tuesday', count: 3 },
      { day: 'Saturday', count: 3 },
    ]),
    undefined
  );
  assert.equal(busiestDay([]), undefined);
});

test('markets with no schedule split off, unless nothing has one', () => {
  const rows = [
    { name: 'A', days: ['Saturday' as const], hours: undefined, season: undefined },
    { name: 'B', days: [], hours: undefined, season: 'Year-round' },
    { name: 'C', days: [], hours: undefined, season: undefined },
  ];
  const { documented, thin } = splitBySchedule(rows);
  assert.deepEqual(documented.map((row) => row.name), ['A', 'B']);
  assert.deepEqual(thin.map((row) => row.name), ['C']);

  const bare = [rows[2], { ...rows[2], name: 'D' }];
  assert.deepEqual(splitBySchedule(bare), { documented: bare, thin: [] });
});

test('year-round sentence names at most two markets and never repeats one', () => {
  assert.equal(yearRoundSentence([{ name: 'Solo', season: 'Year-round' }]), undefined);
  assert.equal(
    yearRoundSentence([
      { name: 'A', season: 'Year-round' },
      { name: 'B', season: 'May-October' },
    ]),
    'A runs year-round.'
  );
  assert.equal(
    yearRoundSentence([
      { name: 'A', season: 'Year-round' },
      { name: 'a', season: 'Year-round' },
      { name: 'B', season: 'Year-round' },
      { name: 'C', season: 'year-round' },
    ]),
    '3 markets run year-round, including A and B.'
  );
  assert.equal(yearRoundSentence([{ name: 'A' }, { name: 'B' }]), undefined);
});

test('sibling cities: nearest first, 2+ markets only, largest first without coordinates', () => {
  const origin = { lat: 41.88, lon: -87.63 };
  const candidates = [
    { slug: 'rockford', marketCount: 10, points: [{ lat: 42.27, lon: -89.09 }] },
    { slug: 'evanston', marketCount: 3, points: [{ lat: 42.04, lon: -87.69 }] },
    { slug: 'tiny', marketCount: 1, points: [{ lat: 41.9, lon: -87.64 }] },
    { slug: 'nowhere', marketCount: 4, points: [] },
  ];
  assert.deepEqual(
    nearestCities(origin, candidates).map((city) => city.slug),
    ['evanston', 'rockford', 'nowhere']
  );
  assert.deepEqual(
    nearestCities(undefined, candidates, 2).map((city) => city.slug),
    ['rockford', 'evanston']
  );
  assert.deepEqual(centroid([{ lat: 0, lon: 0 }, { lat: 2, lon: 4 }]), { lat: 1, lon: 2 });
  assert.equal(dayHash('Saturday'), 'day-saturday');
});
