import assert from 'node:assert/strict';
import { test } from 'node:test';

import { currentPageProperties, pageContextForPath, setPageExtras } from './pageContext.ts';

test('fixed routes get their own page type', () => {
  assert.deepEqual(pageContextForPath('/'), { page_type: 'home' });
  assert.deepEqual(pageContextForPath('/markets'), { page_type: 'markets_index' });
  assert.deepEqual(pageContextForPath('/markets/page/3'), { page_type: 'markets_index' });
  assert.deepEqual(pageContextForPath('/blog'), { page_type: 'blog_index' });
  assert.deepEqual(pageContextForPath('/for-market-operators'), { page_type: 'operators' });
  assert.deepEqual(pageContextForPath('/about-the-data'), { page_type: 'about' });
  assert.deepEqual(pageContextForPath('/privacy'), { page_type: 'legal' });
});

test('detail pages carry their slug', () => {
  assert.deepEqual(pageContextForPath('/markets/union-square-greenmarket'), {
    page_type: 'market',
    page_market: 'union-square-greenmarket',
  });
  assert.deepEqual(pageContextForPath('/blog/how-to-store-garlic'), {
    page_type: 'blog_post',
    page_blog_post: 'how-to-store-garlic',
  });
  assert.deepEqual(pageContextForPath('/farmers-markets/snap-ebt'), {
    page_type: 'topic',
    page_topic: 'snap-ebt',
  });
  assert.deepEqual(pageContextForPath('/markets/state/new-york'), {
    page_type: 'markets_index',
    page_state: 'new-york',
  });
});

test('top-level slugs are states and cities', () => {
  assert.deepEqual(pageContextForPath('/new-york'), { page_type: 'state', page_state: 'new-york' });
  assert.deepEqual(pageContextForPath('/new-york/albany'), {
    page_type: 'city',
    page_state: 'new-york',
    page_city: 'albany',
  });
  assert.deepEqual(pageContextForPath('/new-york/albany?day=sat'), {
    page_type: 'city',
    page_state: 'new-york',
    page_city: 'albany',
  });
});

test('deeper or odd paths are not mistaken for places', () => {
  assert.deepEqual(pageContextForPath('/a/b/c'), { page_type: 'other' });
  assert.deepEqual(pageContextForPath('/favicon.ico'), { page_type: 'other' });
});

test('page extras apply only to the path they were set for', () => {
  setPageExtras('/markets/x', { page_state: 'ohio', page_city: undefined });
  assert.deepEqual(currentPageProperties('/markets/x'), {
    page_type: 'market',
    page_market: 'x',
    page_state: 'ohio',
  });
  assert.deepEqual(currentPageProperties('/blog'), { page_type: 'blog_index' });
});
