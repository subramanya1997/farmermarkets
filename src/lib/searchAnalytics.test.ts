import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyticsSafeSearchTerm, citySearchEvent, settledMarketSearchEvent } from './searchAnalytics.ts';

const options = { query: '94301', country: '', resultCount: 0, loading: true, error: null };

test('a zero-result first page is not reported before the remaining data arrives', () => {
  assert.equal(settledMarketSearchEvent(options), null);
  assert.deepEqual(settledMarketSearchEvent({ ...options, loading: false, resultCount: 1 }), {
    query: '94301', result_count: 1, zero_results: false, search_source: 'market_explorer', country: 'All countries', data_ready: true,
    sensitive_value_redacted: false,
  });
});

test('failed partial downloads are excluded but genuine settled zeroes are retained', () => {
  assert.equal(settledMarketSearchEvent({ ...options, loading: false, error: 'Failed page 2' }), null);
  assert.equal(settledMarketSearchEvent({ ...options, loading: false })?.result_count, 0);
});

test('short searches are ignored and sensitive search values are redacted', () => {
  assert.equal(settledMarketSearchEvent({ ...options, loading: false, query: ' a ' }), null);
  for (const query of ['me@example.com', '650-555-0100']) {
    assert.equal(analyticsSafeSearchTerm(query), '[redacted]');
    assert.equal(settledMarketSearchEvent({ ...options, loading: false, query })?.sensitive_value_redacted, true);
  }
});

test('a city search with no match is flagged as zero results', () => {
  assert.deepEqual(citySearchEvent({ query: ' springfeild ', resultCount: 0, region: 'Ohio' }), {
    query: 'springfeild',
    result_count: 0,
    zero_results: true,
    search_source: 'state_city_directory',
    region: 'Ohio',
    sensitive_value_redacted: false,
  });
  assert.equal(citySearchEvent({ query: 'a', resultCount: 3, region: 'Ohio' }), null);
});
