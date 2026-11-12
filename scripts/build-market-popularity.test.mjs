import assert from 'node:assert/strict';
import { test } from 'node:test';
import { slugFromPath, tallyVisits } from './build-market-popularity.mjs';

test('slugFromPath accepts only a market page path', () => {
  assert.equal(slugFromPath('/markets/ferry-plaza'), 'ferry-plaza');
  assert.equal(slugFromPath('/markets/ferry-plaza/'), 'ferry-plaza');
  assert.equal(slugFromPath('/markets/'), null);
  assert.equal(slugFromPath('/markets/near-me/today'), null);
  assert.equal(slugFromPath('/blog/ferry-plaza'), null);
  assert.equal(slugFromPath(null), null);
});

test('tallyVisits keeps listed markets, merges slash variants, sorts busiest first', () => {
  const known = new Set(['a', 'b', 'c']);
  const visits = tallyVisits(
    [['/markets/a', 2], ['/markets/b', 5], ['/markets/a/', 1], ['/markets/open-today', 40], ['/markets/c', 0]],
    known
  );
  assert.deepEqual(Object.entries(visits), [['b', 5], ['a', 3]]);
});
