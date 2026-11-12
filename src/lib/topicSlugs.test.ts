import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
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
  topicRedirectSources,
} from './topicSlugs.ts';

test('topic pages live under /markets', () => {
  assert.equal(topicPath('hours'), '/markets/hours');
  assert.equal(topicPath('near-me'), '/markets/near-me');
});

test('every topic redirects from the root and from /farmers-markets', () => {
  assert.deepEqual(
    Object.fromEntries(TOPIC_SLUGS.map((slug) => [slug, topicRedirectSources(slug)])),
    {
      'near-me': ['/near-me', '/farmers-markets/near-me'],
      'year-round': ['/year-round', '/farmers-markets/year-round'],
      'snap-ebt': ['/snap-ebt', '/farmers-markets/snap-ebt'],
      online: ['/online', '/farmers-markets/online'],
      hours: ['/hours', '/farmers-markets/hours'],
      monday: ['/monday', '/farmers-markets/monday'],
      tuesday: ['/tuesday', '/farmers-markets/tuesday'],
      wednesday: ['/wednesday', '/farmers-markets/wednesday'],
      thursday: ['/thursday', '/farmers-markets/thursday'],
      friday: ['/friday', '/farmers-markets/friday'],
      saturday: ['/saturday', '/farmers-markets/saturday'],
      sunday: ['/sunday', '/farmers-markets/sunday'],
    }
  );
  for (const slug of TOPIC_SLUGS) assert.equal(topicPath(slug), `/markets/${slug}`);
});

test('the four topics that predate the /markets move', () => {
  assert.deepEqual([...LEGACY_TOPIC_SLUGS], ['snap-ebt', 'online', 'hours', 'saturday']);
});

// A root redirect for a topic must not steal a state hub (`/texas`) or a
// static route (`/about`). The state catch-all excludes these slugs for the
// same reason.
test('a topic slug is not a state, a state code, or a top-level route', () => {
  const geo = JSON.parse(readFileSync('public/data/geo_index.json', 'utf8')) as {
    states: { slug: string; code: string | null }[];
  };
  const stateSlugs = new Set(geo.states.map((state) => state.slug));
  const stateCodes = new Set(
    geo.states.flatMap((state) => (state.code ? [state.code.toLowerCase()] : []))
  );
  const staticRoutes = new Set(
    readdirSync('src/app', { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('['))
      .map((entry) => entry.name)
  );
  for (const slug of TOPIC_SLUGS) {
    assert.equal(stateSlugs.has(slug), false, `${slug} is a state slug`);
    assert.equal(stateCodes.has(slug), false, `${slug} is a state code`);
    assert.equal(staticRoutes.has(slug), false, `${slug} is a top-level route`);
  }
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
