import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGoogleAnalyticsQueue } from './googleAnalyticsQueue.ts';

test('a cold-entry detail event waits for config and is delivered once, in order', () => {
  const queue = createGoogleAnalyticsQueue();
  const delivered: string[] = [];
  queue.track('market_detail_viewed', { market_id: '1892' });
  queue.track('market_directions_opened', { market_id: '1892' });
  assert.equal(delivered.length, 0);
  delivered.push('config');
  queue.ready((name) => delivered.push(name));
  assert.deepEqual(delivered, ['config', 'market_detail_viewed', 'market_directions_opened']);
  queue.ready((name) => delivered.push(name));
  assert.equal(delivered.length, 3);
  queue.track('official_market_website_opened', {});
  assert.equal(delivered.at(-1), 'official_market_website_opened');
});

test('blocked analytics has bounded pending events and captures property values', () => {
  const queue = createGoogleAnalyticsQueue(2);
  const properties = { market_id: 'original' };
  queue.track('discarded', {});
  queue.track('detail', properties);
  properties.market_id = 'changed';
  queue.track('website', {});
  const delivered: unknown[] = [];
  queue.ready((name, payload) => delivered.push([name, payload]));
  assert.deepEqual(delivered, [['detail', { market_id: 'original' }], ['website', {}]]);
});
