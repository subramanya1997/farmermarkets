/**
 * Route checks for the four topic pages (`/farmers-markets/{topic}`).
 *
 * Every number the pages publish is recomputed here straight from the two
 * market snapshots — a second implementation of the same counts — so a page
 * that drifts from the data, or copy that hardcodes a stale figure, fails the
 * check instead of shipping. Run against a built server:
 *
 *   npm run build && npm start &
 *   npm run test:topic-routes
 */

import { promises as fs } from 'fs';
import path from 'path';
import { marketWeekdays, marketHours } from '../src/lib/seo.ts';

const baseUrl = process.env.MARKET_BASE_URL || 'http://localhost:3000';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readSnapshot(file) {
  const contents = await fs.readFile(path.join(process.cwd(), 'public/data', file), 'utf8');
  return JSON.parse(contents);
}

const [markets, geoIndex] = await Promise.all([
  readSnapshot('farmers_markets.json'),
  readSnapshot('geo_index.json'),
]);

const records = markets.map((market) => {
  const assistance = market.payment?.food_assistance ?? {};
  const channels = market.sales_channels ?? {};
  const record = {
    name: market.name,
    days: market.operations?.days,
    season: market.operations?.season,
    snap: assistance.snap === true,
    wic: assistance.wic === true,
    sfmnp: assistance.sfmnp === true,
    online: channels.online_ordering?.available === true,
    delivery: channels.delivery?.available === true,
    csa: channels.csa?.available === true,
    phone: channels.phone_ordering === true,
  };
  record.weekdays = marketWeekdays(record);
  record.hours = marketHours(record);
  return record;
});

const total = records.length;
const format = (value) => value.toLocaleString('en-US');

const expected = {
  snap: records.filter((record) => record.snap).length,
  online: records.filter(
    (record) => record.online || record.delivery || record.csa || record.phone
  ).length,
  onlineOnly: records.filter((record) => record.online).length,
  delivery: records.filter((record) => record.delivery).length,
  csa: records.filter((record) => record.csa).length,
  phone: records.filter((record) => record.phone).length,
  withDays: records.filter((record) => record.weekdays.length > 0).length,
  withHours: records.filter((record) => Boolean(record.hours)).length,
  saturday: records.filter((record) => record.weekdays.includes('Saturday')).length,
};

// The topic slugs must not collide with a state slug, or the static segment
// would shadow a real state hub.
const stateSlugs = new Set(geoIndex.states.map((state) => state.slug));
for (const slug of ['snap-ebt', 'online', 'hours', 'saturday']) {
  assert(!stateSlugs.has(slug), `topic slug "${slug}" collides with a state slug in the geo index`);
}

async function fetchPage(pathname, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${pathname}`);
  assert(
    response.status === expectedStatus,
    `${pathname} returned ${response.status}, expected ${expectedStatus}`
  );
  return await response.text();
}

/** Every JSON-LD block on the page, parsed. */
function structuredData(html, pathname) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert(blocks.length > 0, `${pathname} emits no JSON-LD`);
  return blocks.map((block) => {
    try {
      return JSON.parse(block[1]);
    } catch (error) {
      throw new Error(`${pathname} has JSON-LD that does not parse: ${error.message}`);
    }
  });
}

/** Visible text, with entities and tags removed, for mirror checks. */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, '’')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(value) {
  return value
    .replace(/&#x27;|&#39;|'/g, '’')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleOf(html) {
  const match = /<title>([\s\S]*?)<\/title>/.exec(html);
  return match ? normalize(match[1]) : '';
}

function headingOf(html) {
  const match = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
  return match ? normalize(match[1].replace(/<[^>]+>/g, '')) : '';
}

/** Each h2 must be followed by real content before the next h2. */
function assertNoEmptySections(html, pathname) {
  const body = html.replace(/<script[\s\S]*?<\/script>/g, ' ');
  const parts = body.split(/<h2[^>]*>/).slice(1);
  for (const part of parts) {
    const [headingHtml, ...rest] = part.split('</h2>');
    const heading = normalize(headingHtml.replace(/<[^>]+>/g, ''));
    const section = rest.join('</h2>').split(/<h2[^>]*>/)[0];
    const text = visibleText(section);
    assert(
      text.length >= 30,
      `${pathname} renders an empty section under the heading "${heading}"`
    );
  }
}

async function checkTopicPage({ pathname, title, mustContain, stateTable }) {
  const html = await fetchPage(pathname);
  const text = visibleText(html);

  assert(
    titleOf(html) === normalize(title),
    `${pathname} title is "${titleOf(html)}", expected "${title}"`
  );
  assert(title.length <= 60, `${pathname} title is ${title.length} characters, over the 60 cap`);
  assert(headingOf(html).length > 0, `${pathname} has no h1`);

  for (const needle of mustContain) {
    assert(text.includes(needle), `${pathname} does not render "${needle}"`);
  }

  const nodes = structuredData(html, pathname);
  const types = nodes.map((node) => node['@type']);
  for (const type of ['BreadcrumbList', 'CollectionPage', 'ItemList', 'FAQPage']) {
    assert(types.includes(type), `${pathname} is missing ${type} JSON-LD (has ${types.join(', ')})`);
  }

  const breadcrumb = nodes.find((node) => node['@type'] === 'BreadcrumbList');
  assert(
    breadcrumb.itemListElement.map((item) => item.name).join(' › ').startsWith('Home › Markets › '),
    `${pathname} breadcrumb trail is ${breadcrumb.itemListElement.map((item) => item.name).join(' › ')}`
  );

  const faq = nodes.find((node) => node['@type'] === 'FAQPage');
  assert(faq.mainEntity.length > 0, `${pathname} has an empty FAQPage node`);
  for (const question of faq.mainEntity) {
    assert(
      text.includes(normalize(question.name)),
      `${pathname} FAQPage asks "${question.name}", which the page does not render`
    );
    assert(
      text.includes(normalize(question.acceptedAnswer.text)),
      `${pathname} FAQPage answers "${question.name}" with text the page does not render`
    );
  }

  const itemList = nodes.find((node) => node['@type'] === 'ItemList');
  assert(itemList.itemListElement.length > 0, `${pathname} has an empty ItemList`);
  for (const item of itemList.itemListElement.slice(0, 3)) {
    const marketPath = new URL(item.url).pathname;
    assert(
      html.includes(`href="${marketPath}"`),
      `${pathname} lists ${item.url} in its ItemList but does not link it`
    );
  }

  if (stateTable) {
    for (const slug of stateTable) {
      assert(
        html.includes(`href="/farmers-markets/${slug}"`),
        `${pathname} does not link the state hub /farmers-markets/${slug}`
      );
    }
  }

  assertNoEmptySections(html, pathname);
  return { html, text };
}

/* ---------------------------------------------------------------- *
 * The four pages
 * ---------------------------------------------------------------- */

// The states with the most matching markets, recomputed from the geo index so
// the table's ordering is checked against the data rather than against itself.
function topStateSlugs(predicate, limit = 3) {
  const placement = new Map();
  for (const state of geoIndex.states) {
    for (const city of state.cities) {
      for (const slug of city.market_slugs) placement.set(slug, state.slug);
    }
    for (const slug of state.uncategorized_slugs) placement.set(slug, state.slug);
  }

  const counts = new Map();
  for (const market of markets) {
    if (!market.slug || !predicate(market)) continue;
    const stateSlug = placement.get(market.slug);
    if (!stateSlug) continue;
    counts.set(stateSlug, (counts.get(stateSlug) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([slug]) => slug);
}

await checkTopicPage({
  pathname: '/farmers-markets/snap-ebt',
  title: `${format(expected.snap)} Farmers Markets That Accept SNAP/EBT`,
  mustContain: [`${format(expected.snap)} farmers markets in this directory are recorded as accepting SNAP/EBT`],
  stateTable: topStateSlugs((market) => market.payment?.food_assistance?.snap === true),
});

await checkTopicPage({
  pathname: '/farmers-markets/online',
  title: `${format(expected.online)} Farmers Markets With Online Ordering & Delivery`,
  mustContain: [
    `${format(expected.online)} farmers markets in this directory are recorded as selling beyond the market stall`,
    `${format(expected.onlineOnly)} take orders online`,
    `${format(expected.delivery)} offer delivery`,
    `${format(expected.csa)} run a CSA share`,
    `${format(expected.phone)} take orders by phone`,
  ],
  stateTable: topStateSlugs((market) => {
    const channels = market.sales_channels ?? {};
    return (
      channels.online_ordering?.available === true ||
      channels.delivery?.available === true ||
      channels.csa?.available === true ||
      channels.phone_ordering === true
    );
  }),
});

const hoursPage = await checkTopicPage({
  pathname: '/farmers-markets/hours',
  title: `Farmers Market Hours: Opening Days for ${format(expected.withDays)} Markets`,
  mustContain: [
    `${format(expected.withDays)} of the ${format(total)} markets in this directory state which days they open`,
    `${format(expected.withHours)} state their opening times`,
    `${format(expected.saturday)} markets`,
  ],
});

// The day table must carry every weekday count, and Saturday must link out.
for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
  const count = records.filter((record) => record.weekdays.includes(day)).length;
  assert(
    hoursPage.text.includes(`${day}`) && hoursPage.text.includes(format(count)),
    `/farmers-markets/hours is missing the ${day} count (${format(count)})`
  );
}
assert(
  hoursPage.html.includes('href="/farmers-markets/saturday"'),
  '/farmers-markets/hours does not link the Saturday page from its day table'
);

await checkTopicPage({
  pathname: '/farmers-markets/saturday',
  title: `${format(expected.saturday)} Saturday Farmers Markets by State`,
  mustContain: [`${format(expected.saturday)} farmers markets in this directory list Saturday as an opening day`],
  stateTable: topStateSlugs((market) =>
    marketWeekdays({
      name: market.name,
      days: market.operations?.days,
      season: market.operations?.season,
    }).includes('Saturday')
  ),
});

/* ---------------------------------------------------------------- *
 * Routing precedence, sitemap and site-wide links
 * ---------------------------------------------------------------- */

const stateHub = await fetchPage('/farmers-markets/north-carolina');
assert(
  headingOf(stateHub).includes('Farmers Markets in North Carolina'),
  '/farmers-markets/north-carolina no longer serves the state hub'
);

const cityPage = await fetchPage('/farmers-markets/north-carolina/durham');
assert(headingOf(cityPage).includes('Durham'), '/farmers-markets/north-carolina/durham broke');

await fetchPage('/farmers-markets/not-a-real-state', 404);

const topicPaths = [
  '/farmers-markets/snap-ebt',
  '/farmers-markets/online',
  '/farmers-markets/hours',
  '/farmers-markets/saturday',
];

const sitemapChunk = await fetchPage('/sitemap/0.xml');
for (const topicPath of topicPaths) {
  assert(
    sitemapChunk.includes(`${topicPath}</loc>`),
    `the sitemap does not list ${topicPath}`
  );
}

// The footer is server-rendered site-wide, so an unrelated static page must
// carry all four topic links without any JavaScript running.
const about = await fetchPage('/about');
for (const topicPath of topicPaths) {
  assert(
    about.includes(`href="${topicPath}"`),
    `the footer on /about does not link ${topicPath}`
  );
}

const marketsIndex = await fetchPage('/markets');
for (const topicPath of topicPaths) {
  assert(
    marketsIndex.includes(`href="${topicPath}"`),
    `/markets does not link ${topicPath}`
  );
}

console.log(
  `Topic pages OK — SNAP ${format(expected.snap)}, ordering ${format(
    expected.online
  )}, day data ${format(expected.withDays)}, Saturday ${format(expected.saturday)}`
);
