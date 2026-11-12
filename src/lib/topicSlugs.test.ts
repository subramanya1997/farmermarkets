import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  DAY_TOPIC_SLUGS,
  LEGACY_TOPIC_SLUGS,
  NAV_TOPIC_SLUGS,
  RESERVED_MARKET_SLUGS,
  TOPIC_LABELS,
  TOPIC_SLUGS,
  isTopicSlug,
  topicPath,
} from './topicSlugs.ts';

test('topic pages live under /markets', () => {
  assert.equal(topicPath('hours'), '/markets/hours');
  assert.equal(topicPath('near-me'), '/markets/near-me');
});

test('every topic has a label, and the short lists only name real topics', () => {
  for (const slug of TOPIC_SLUGS) assert.ok(TOPIC_LABELS[slug], `no label for ${slug}`);
  for (const slug of [...NAV_TOPIC_SLUGS, ...LEGACY_TOPIC_SLUGS, ...DAY_TOPIC_SLUGS]) {
    assert.ok(isTopicSlug(slug), `${slug} is not a topic`);
  }
  assert.equal(DAY_TOPIC_SLUGS.length, 7);
});

// A static route segment wins over `/markets/[slug]`, so a market whose slug
// matched a topic or a listing route would have no page of its own.
test('no market slug collides with a reserved /markets segment', () => {
  const markets = JSON.parse(readFileSync('public/data/farmers_markets.json', 'utf8')) as {
    slug?: string;
  }[];
  const reserved = new Set(RESERVED_MARKET_SLUGS);
  const collisions = markets.filter((market) => market.slug && reserved.has(market.slug));
  assert.deepEqual(
    collisions.map((market) => market.slug),
    [],
    'a market slug shadows a topic page; rename the slug in the data'
  );
});
