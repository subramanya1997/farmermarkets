/**
 * SEO smoke tests — a fixed sample of live URLs, each with its own expectations.
 *
 * The two existing route checks cover breadth: `check-market-routes.mjs` walks
 * the sitemap and counts what is in it, `check-topic-pages.mjs` recomputes the
 * four topic pages' numbers from the snapshots. Neither one opens a page and
 * asks whether it is still fit to be indexed. That is this file's job: ~25
 * hand-picked URLs — one per shape the site actually serves, including the
 * awkward records — checked for the handful of things that silently break and
 * cost rankings months later:
 *
 *   - a title that grew past the SERP truncation point, or collapsed to the
 *     homepage's title because a metadata export stopped resolving;
 *   - a description assembled from a missing field ("Find fresh ." / " in ." /
 *     a literal "undefined");
 *   - a canonical that is missing, duplicated, cross-host, or points somewhere
 *     other than the page you are on;
 *   - JSON-LD that stopped parsing, or that publishes an empty value — a
 *     `"name": ""` is a claim the validator rejects and the extractor drops;
 *   - a page that lost its internal links (the crawl paths into 9,132 market
 *     pages run through these lists);
 *   - `noindex` appearing where it must not, or disappearing from where it
 *     must be: 404s, and the deliberately thin single-market city pages;
 *   - the legacy redirects (numeric market IDs, `/markets/state/*`, uppercase
 *     paths) degrading into 404s and dropping their accumulated equity;
 *   - a sitemap chunk that grew past the 5,000-URL cap, started advertising a
 *     retired route, or gained a fetch-time `lastmod`;
 *   - a page with no H1, more than one H1, or an H1 that stopped naming what
 *     the page is about (the homepage's used to be a slogan);
 *   - a hub page whose JSON-LD `dateModified` went missing or drifted away
 *     from the `lastmod` the sitemap publishes for the same URL;
 *   - `robots.txt` losing its sitemap line, or quietly gaining a `Disallow`
 *     that shuts a crawler out of the directory.
 *
 * The sample is fixed and deterministic on purpose. A random sample fails
 * differently on every run and teaches you nothing; these URLs were selected
 * once (see SAMPLE below, where every pick records why it is in the list) and
 * change only when someone deliberately changes them.
 *
 * Run it against a built server:
 *
 *   npm run build && npm start &
 *   npm run test:seo                 # or: MARKET_BASE_URL=https://... npm run test:seo
 *
 * `npm test` also runs it, and it skips cleanly — exit 0, one clear notice —
 * when nothing is listening, so the offline unit-test suite stays offline.
 */

import test, { after } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = (process.env.MARKET_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

/**
 * The host every canonical must be on.
 *
 * Defaults to the production origin from `src/lib/site.ts` because that is what
 * a default `next build` bakes in, and follows `NEXT_PUBLIC_SITE_URL` when a
 * preview build overrode it — the same precedence the app itself uses.
 */
const CANONICAL_ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://www.farmermarkets.app'
).replace(/\/$/, '');

/** How long any single request may take before the run is called a failure. */
const REQUEST_TIMEOUT_MS = Number(process.env.SEO_SMOKE_TIMEOUT_MS || 20_000);

/** A page bigger than this is a rendering bug, not a page. */
const MAX_RESPONSE_BYTES = 1_500_000;

/** Titles are budgeted at 60; 65 is the point at which Google truncates. */
const MAX_TITLE_LENGTH = 65;

/** No sitemap chunk may exceed the protocol's practical cap. */
const MAX_SITEMAP_CHUNK_URLS = 5000;

/**
 * Fragments that only ever appear when a template interpolated a field the
 * record does not have. Each one is a bug we have actually shipped.
 */
const BANNED_DESCRIPTION_FRAGMENTS = [
  'Find fresh .',
  ' in .',
  ' at .',
  ' , ',
  'undefined',
  'null ',
  // Generated copy uses plain hyphens; an en/em dash means a builder regressed
  // or raw upstream text leaked past `clean()` (see docs/seo-decisions.md).
  '–',
  '—',
];

/* ------------------------------------------------------------------ *
 * The sample
 * ------------------------------------------------------------------ */

/**
 * Per-page expectations.
 *
 * `minInternalLinks` is set well below what each shape renders today (see the
 * counts in the comments) so a normal data refresh never trips it, while the
 * loss of a whole navigation block does.
 *
 * `h1Contains` asserts a case-insensitive substring of the page's single H1.
 * `expectDateModified` says the page must publish a JSON-LD `dateModified`,
 * which the sitemap block then cross-checks against that URL's `lastmod`.
 *
 * `robots` is one of:
 *   'indexable'      — no robots meta may say noindex
 *   'noindex,follow' — deliberately unindexed but still crawled
 *   'noindex'        — an error page; must not be indexed
 */
const SAMPLE = [
  {
    path: '/',
    kind: 'home',
    minInternalLinks: 20, // renders 37
    robots: 'indexable',
    // The site's most weighted heading has to name the site's subject. It read
    // "Fresh from Farm to Your Table" until T18 — a slogan with no entity in it.
    h1Contains: 'farmers market',
  },
  {
    path: '/markets',
    kind: 'markets index',
    minInternalLinks: 60, // renders 130
    robots: 'indexable',
  },
  {
    path: '/markets/page/2',
    kind: 'markets pagination',
    minInternalLinks: 60, // renders 130
    robots: 'indexable',
    // The self-canonical check below is what guards the decision in
    // `markets/page/[n]/page.tsx` not to canonicalize every page at page 1.
  },

  /* --- Five market pages, one per awkward record shape --------------- *
   * Picked deterministically: within each category the whole dataset was
   * filtered and the first slug in ascending slug order taken, so the pick is
   * reproducible from the snapshots rather than a matter of taste.
   * ------------------------------------------------------------------ */
  {
    // With stated opening times. All 1,734 records that state a clock time are
    // government records — no legacy USDA record carries one — so this is what
    // "with hours" looks like on this dataset.
    path: '/markets/13-petals-roadside-farm-stand-fort-johnson-80267f2e',
    kind: 'market (with hours)',
    minInternalLinks: 20, // renders 35
    robots: 'indexable',
    mustContain: ['4pm-7pm'],
  },
  {
    // A legacy record the geo index could not place in any city (25 of them).
    // Its breadcrumb has to drop the two geographic tiers rather than link
    // pages that do not exist — hence the 3-item trail.
    path: '/markets/atwood-farmers-market',
    kind: 'market (no city placement)',
    minInternalLinks: 20, // renders 34
    robots: 'indexable',
    breadcrumbLength: 3, // Home › Markets › Atwood Farmers Market
  },
  {
    // A government record with full provenance: publisher, dataset, catalogue
    // page and a retrieval date joined from the manifest.
    path: '/markets/175th-street-greenmarket-new-york-1bc4f6ef',
    kind: 'market (government provenance)',
    minInternalLinks: 20, // renders 35
    robots: 'indexable',
    mustContain: ['New York State Department of Agriculture and Markets'],
  },
  {
    // `last_updated` in 2021, past STALE_AFTER_YEARS — the page owes the reader
    // the "may be out of date" caveat (952 records qualify).
    path: '/markets/18th-street-farmers-market-scottsbluff',
    kind: 'market (freshness notice)',
    minInternalLinks: 20, // renders 36
    robots: 'indexable',
    mustContain: ['may be out of date'],
  },
  {
    // Flagged `unverified` by the legacy refresh: no longer listed upstream.
    // Still indexable — the notice is the honest part, not a reason to hide.
    path: '/markets/down-to-earth-new-rochelle-farmers-market-new-rochelle',
    kind: 'market (unverified)',
    minInternalLinks: 20, // renders 35
    robots: 'indexable',
    mustContain: ['no longer published in the USDA directory'],
  },

  /* --- Three city pages, including one deliberately unindexed -------- */
  {
    path: '/farmers-markets/north-carolina/durham',
    kind: 'city (small)',
    minInternalLinks: 25, // renders 47
    robots: 'indexable',
    expectDateModified: true,
  },
  {
    path: '/farmers-markets/alabama/birmingham',
    kind: 'city (10 markets)',
    minInternalLinks: 25, // renders 55
    robots: 'indexable',
    expectDateModified: true,
  },
  {
    // One market, no schedule, no description of its own: `isThin` in
    // `src/lib/cityPage.ts` marks it `noindex, follow` on purpose. Asserting
    // the noindex is the point — losing it would push 2,473 near-duplicate
    // pages at the index.
    path: '/farmers-markets/alabama/abbeville',
    kind: 'city (thin, intentionally noindex)',
    minInternalLinks: 25, // renders 46
    robots: 'noindex,follow',
  },

  /* --- Two state hubs ----------------------------------------------- */
  {
    path: '/farmers-markets/north-carolina',
    kind: 'state hub',
    minInternalLinks: 60, // renders 170
    robots: 'indexable',
    expectDateModified: true,
  },
  {
    // The largest hub (965 markets across 397 cities) — the response-size
    // check has something to bite on here.
    path: '/farmers-markets/california',
    kind: 'state hub (largest)',
    minInternalLinks: 60, // renders 434
    robots: 'indexable',
    expectDateModified: true,
  },

  /* --- Two topic pages ---------------------------------------------- */
  {
    path: '/farmers-markets/snap-ebt',
    kind: 'topic page',
    minInternalLinks: 40, // renders 77
    robots: 'indexable',
    expectDateModified: true,
  },
  {
    path: '/farmers-markets/saturday',
    kind: 'topic page',
    minInternalLinks: 40, // renders 77
    robots: 'indexable',
    expectDateModified: true,
  },

  /* --- The dataset page --------------------------------------------- */
  {
    path: '/about-the-data',
    kind: 'dataset page',
    minInternalLinks: 15, // renders 31
    robots: 'indexable',
  },
];

/** The negative cases: what must NOT be a 200. */
const NEGATIVE_CASES = [
  {
    name: 'unknown market slug 404s and is noindexed',
    path: '/markets/not-a-real-market-slug-2f8c1d',
    status: 404,
    expectNoindex: true,
  },
  {
    name: 'legacy numeric market ID 308s to its slug',
    path: '/markets/301598',
    status: 308,
    location: '/markets/texas-farmers-market-at-mueller-austin',
  },
  {
    name: 'uppercase path 308s to lowercase',
    path: '/MARKETS/durham-farmers-market-durham',
    status: 308,
    location: '/markets/durham-farmers-market-durham',
  },
  {
    name: 'retired /markets/state/* 308s to the state hub',
    path: '/markets/state/texas',
    status: 308,
    location: '/farmers-markets/texas',
  },
  {
    name: 'unknown state 404s and is noindexed',
    path: '/farmers-markets/not-a-state',
    status: 404,
    expectNoindex: true,
  },
  {
    name: 'out-of-range pagination 404s and is noindexed',
    path: '/markets/page/9999',
    status: 404,
    expectNoindex: true,
  },
];

/* ------------------------------------------------------------------ *
 * HTML helpers
 * ------------------------------------------------------------------ */

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * Entity-decoded text.
 *
 * Titles are measured decoded because that is what a SERP shows: `&#x27;`
 * renders as one apostrophe, and counting it as six characters would fail a
 * title that is genuinely within budget.
 */
function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);
}

function titleOf(html) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? decodeEntities(match[1]).replace(/\s+/g, ' ').trim() : '';
}

/** Every `<meta name="{name}">` content value on the page, decoded. */
function metaContents(html, name) {
  const pattern = new RegExp(
    `<meta[^>]+name=["']${name}["'][^>]*content=["']([^"']*)["']`,
    'gi'
  );
  return [...html.matchAll(pattern)].map((match) => decodeEntities(match[1]).trim());
}

function canonicalHrefs(html) {
  return [
    ...html.matchAll(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/gi),
  ].map((match) => decodeEntities(match[1]).trim());
}

/**
 * The text of every `<h1>` on the page, tags stripped and entities decoded.
 *
 * Crude on purpose: these pages render their H1 as a single element with plain
 * text (or a gradient span) inside it, so a regex is enough and pulling in an
 * HTML parser for one check is not worth the dependency.
 */
function h1Texts(html) {
  return [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) =>
    decodeEntities(match[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
  );
}

/** Distinct root-relative hrefs — the crawl paths out of this page. */
function internalLinks(html) {
  const hrefs = [...html.matchAll(/href=["'](\/[^"'#][^"']*)["']/g)].map((m) => m[1]);
  return new Set(hrefs);
}

function jsonLdBlocks(html) {
  return [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ].map((match) => match[1]);
}

/**
 * Every empty value in a JSON-LD tree, as dotted paths.
 *
 * `false` and `0` are real values and pass. `null`, `undefined`, a blank
 * string, `[]` and `{}` are not: schema.org has no way to read them, and a
 * validator flags them. Reporting the path is what makes a failure actionable
 * on a page that emits five nodes.
 */
function emptyValuePaths(node, path = '$', found = []) {
  if (node === null || node === undefined) {
    found.push(`${path} = ${String(node)}`);
    return found;
  }
  if (typeof node === 'string') {
    if (!node.trim()) found.push(`${path} = ""`);
    return found;
  }
  if (Array.isArray(node)) {
    if (node.length === 0) found.push(`${path} = []`);
    else node.forEach((item, index) => emptyValuePaths(item, `${path}[${index}]`, found));
    return found;
  }
  if (typeof node === 'object') {
    const keys = Object.keys(node);
    if (keys.length === 0) found.push(`${path} = {}`);
    else for (const key of keys) emptyValuePaths(node[key], `${path}.${key}`, found);
  }
  return found;
}

/** Every JSON-LD node on the page, `@graph` members flattened out. */
function flattenNodes(parsed) {
  const nodes = [];
  for (const value of Array.isArray(parsed) ? parsed : [parsed]) {
    if (value && Array.isArray(value['@graph'])) nodes.push(...value['@graph']);
    else nodes.push(value);
  }
  return nodes;
}

/* ------------------------------------------------------------------ *
 * Fetching
 * ------------------------------------------------------------------ */

class UnreachableError extends Error {}

async function request(path, { redirect = 'follow' } = {}) {
  const url = `${BASE_URL}${path}`;
  let response;
  try {
    response = await fetch(url, {
      redirect,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { 'user-agent': 'farmermarkets-seo-smoke/1' },
    });
  } catch (error) {
    const reason = error?.name === 'TimeoutError'
      ? `did not respond within ${REQUEST_TIMEOUT_MS}ms`
      : `could not be reached (${error?.cause?.code || error?.message})`;
    throw new UnreachableError(`${url} ${reason}`);
  }

  const body = await response.text();
  return {
    status: response.status,
    location: response.headers.get('location'),
    body,
    bytes: Buffer.byteLength(body, 'utf8'),
  };
}

/**
 * The path a redirect points at, as one value.
 *
 * `Location` is a singleton field, but Next emits it twice on the *first*
 * (uncached) render of a `permanentRedirect()` from an ISR route — the second
 * request for the same URL, served from the ISR cache, carries one. `fetch`
 * folds repeated headers into "a, a", so the raw value has to be split.
 * Repeats of the same target collapse; two *different* targets are a genuine
 * failure and are left to fail on the comparison.
 */
function redirectTarget(location) {
  const values = (location || '')
    .split(',')
    .map((value) => value.trim().replace(CANONICAL_ORIGIN, ''))
    .filter(Boolean);
  return [...new Set(values)].join(', ');
}

/* ------------------------------------------------------------------ *
 * The report
 * ------------------------------------------------------------------ */

const results = [];

/**
 * Run one named check, record the outcome for the summary table, and let the
 * failure through to `node:test`.
 *
 * Checks are deliberately not short-circuited within a page: one run should
 * tell you everything that is wrong with it, not just the first thing.
 */
function check(group, name, fn) {
  try {
    fn();
    results.push({ group, name, ok: true });
  } catch (error) {
    results.push({ group, name, ok: false, detail: error.message });
    throw error;
  }
}

function printReport() {
  const width = Math.min(
    72,
    Math.max(...results.map((result) => `${result.group} › ${result.name}`.length), 20)
  );
  const failures = results.filter((result) => !result.ok);

  console.log('\nSEO smoke report');
  console.log(`base URL: ${BASE_URL}`);
  console.log(`canonical host: ${CANONICAL_ORIGIN}\n`);
  for (const result of results) {
    const label = `${result.group} › ${result.name}`;
    console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${label.padEnd(width)}`);
    if (!result.ok) console.log(`      ↳ ${result.detail}`);
  }
  console.log(
    `\n${results.length - failures.length}/${results.length} checks passed` +
      (failures.length ? `, ${failures.length} FAILED` : '')
  );
}

/* ------------------------------------------------------------------ *
 * Page assertions
 * ------------------------------------------------------------------ */

let homeTitle = '';

/**
 * path → the `dateModified` the page published, filled in as pages are
 * checked and read back by the sitemap block, which asserts each one equals
 * the `lastmod` the sitemap advertises for the same URL. Two different dates
 * for one URL is worse than one date: it tells a crawler the page's own
 * markup and the site's own sitemap disagree.
 */
const publishedDateModified = new Map();

function assertPage(page, response) {
  const { path, kind } = page;
  const group = path;
  const html = response.body;

  check(group, 'status 200', () => {
    assert.equal(response.status, 200, `expected 200, got ${response.status}`);
  });

  check(group, `response under ${(MAX_RESPONSE_BYTES / 1e6).toFixed(1)} MB`, () => {
    assert.ok(
      response.bytes < MAX_RESPONSE_BYTES,
      `response is ${response.bytes} bytes, over the ${MAX_RESPONSE_BYTES} cap`
    );
  });

  const title = titleOf(html);
  check(group, `title present and ≤ ${MAX_TITLE_LENGTH} chars`, () => {
    assert.ok(title, 'page has no <title>');
    assert.ok(
      title.length <= MAX_TITLE_LENGTH,
      `title is ${title.length} decoded characters ("${title}")`
    );
  });

  check(group, 'title is specific to the page', () => {
    if (path === '/') return;
    assert.notEqual(
      title,
      homeTitle,
      `title fell back to the homepage title ("${title}") — did generateMetadata stop resolving?`
    );
  });

  const descriptions = metaContents(html, 'description');
  check(group, 'meta description present and well-formed', () => {
    assert.equal(
      descriptions.length,
      1,
      `expected exactly 1 meta description, found ${descriptions.length}`
    );
    const description = descriptions[0];
    assert.ok(description.length > 0, 'meta description is empty');
    for (const fragment of BANNED_DESCRIPTION_FRAGMENTS) {
      assert.ok(
        !description.includes(fragment),
        `description contains "${fragment}" — a field interpolated empty: "${description}"`
      );
    }
  });

  check(group, 'exactly one self-referential canonical on the canonical host', () => {
    const hrefs = canonicalHrefs(html);
    assert.equal(hrefs.length, 1, `expected 1 canonical, found ${hrefs.length}`);
    // The homepage canonical is emitted without a trailing slash, so compare
    // normalized forms rather than raw strings.
    const expected = `${CANONICAL_ORIGIN}${path === '/' ? '' : path}`;
    assert.equal(hrefs[0].replace(/\/$/, ''), expected, `canonical points elsewhere`);
  });

  check(group, `robots: ${page.robots}`, () => {
    const robots = metaContents(html, 'robots').join(' ').toLowerCase();
    if (page.robots === 'indexable') {
      assert.ok(
        !robots.includes('noindex'),
        `an indexable ${kind} carries robots "${robots}"`
      );
    } else if (page.robots === 'noindex,follow') {
      assert.ok(robots.includes('noindex'), `expected noindex, got "${robots}"`);
      assert.ok(
        !robots.includes('nofollow'),
        `expected the page to stay crawlable, got "${robots}"`
      );
    } else {
      assert.ok(robots.includes('noindex'), `expected noindex, got "${robots}"`);
    }
  });

  check(group, `at least ${page.minInternalLinks} internal links`, () => {
    const links = internalLinks(html);
    assert.ok(
      links.size >= page.minInternalLinks,
      `only ${links.size} distinct internal links (expected ≥ ${page.minInternalLinks})`
    );
  });

  const parsedNodes = [];
  check(group, 'every JSON-LD block parses', () => {
    const blocks = jsonLdBlocks(html);
    assert.ok(blocks.length > 0, 'page emits no JSON-LD');
    blocks.forEach((block, index) => {
      let parsed;
      try {
        parsed = JSON.parse(block);
      } catch (error) {
        assert.fail(`JSON-LD block ${index} does not parse: ${error.message}`);
      }
      parsedNodes.push(...flattenNodes(parsed));
    });
  });

  check(group, 'no empty values in JSON-LD', () => {
    const empties = parsedNodes.flatMap((node, index) =>
      emptyValuePaths(node, `node[${index}]:${node?.['@type'] ?? '?'}`)
    );
    assert.deepEqual(empties, [], `empty JSON-LD values: ${empties.join(', ')}`);
  });

  check(group, 'exactly one H1', () => {
    const headings = h1Texts(html);
    assert.equal(
      headings.length,
      1,
      `expected 1 <h1>, found ${headings.length}: ${JSON.stringify(headings)}`
    );
    assert.ok(headings[0].length > 0, 'the <h1> is empty');
  });

  if (page.h1Contains) {
    check(group, `H1 names "${page.h1Contains}"`, () => {
      const [heading = ''] = h1Texts(html);
      assert.ok(
        heading.toLowerCase().includes(page.h1Contains.toLowerCase()),
        `the H1 is "${heading}" — it does not name "${page.h1Contains}"`
      );
    });
  }

  if (page.expectDateModified) {
    check(group, 'publishes a JSON-LD dateModified', () => {
      const dates = parsedNodes
        .map((node) => node?.dateModified)
        .filter((value) => typeof value === 'string' && value.length > 0);
      assert.ok(dates.length > 0, 'no node on the page carries a dateModified');
      // One page, one answer: several nodes may repeat the date, none may
      // contradict it.
      assert.equal(
        new Set(dates).size,
        1,
        `the page publishes ${new Set(dates).size} different dateModified values: ${[...new Set(dates)].join(', ')}`
      );
      assert.ok(
        !Number.isNaN(Date.parse(dates[0])),
        `dateModified "${dates[0]}" is not a parseable date`
      );
      publishedDateModified.set(path, dates[0]);
    });
  }

  if (page.breadcrumbLength !== undefined) {
    check(group, `breadcrumb trail has ${page.breadcrumbLength} items`, () => {
      const breadcrumb = parsedNodes.find((node) => node?.['@type'] === 'BreadcrumbList');
      assert.ok(breadcrumb, 'page emits no BreadcrumbList');
      assert.equal(
        breadcrumb.itemListElement.length,
        page.breadcrumbLength,
        `trail is ${breadcrumb.itemListElement.map((item) => item.name).join(' › ')}`
      );
    });
  }

  if (page.mustContain) {
    check(group, 'renders its edge-case content', () => {
      const text = decodeEntities(html);
      for (const needle of page.mustContain) {
        assert.ok(
          text.includes(needle),
          `page does not render "${needle}" — is this still a ${kind}?`
        );
      }
    });
  }
}

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

/**
 * Is anything listening?
 *
 * `npm test` runs the offline unit suites and this file together, so an
 * unreachable server has to skip rather than fail — otherwise nobody could run
 * the unit tests without building the site first. An explicit
 * `MARKET_BASE_URL` says the caller meant to hit a server, so that case fails
 * loudly instead of skipping silently.
 */
async function serverIsReachable() {
  try {
    await request('/', { redirect: 'manual' });
    return true;
  } catch (error) {
    if (!(error instanceof UnreachableError)) throw error;
    if (process.env.MARKET_BASE_URL) {
      throw new Error(
        `MARKET_BASE_URL is set to ${BASE_URL} but ${error.message}. ` +
          'Start the server (npm run build && npm start) or unset MARKET_BASE_URL.'
      );
    }
    return false;
  }
}

const reachable = await serverIsReachable();

if (!reachable) {
  test('SEO smoke tests', { skip: `no server at ${BASE_URL} — run "npm run build && npm start" first` }, () => {});
  console.log(
    `\n[seo-smoke] skipped: nothing is listening at ${BASE_URL}.\n` +
      '            Run `npm run build && npm start`, then `npm run test:seo`.\n'
  );
} else {
  test('SEO smoke tests', async (t) => {
    for (const page of SAMPLE) {
      await t.test(`${page.path} — ${page.kind}`, async () => {
        const response = await request(page.path);
        // The homepage runs first, and its title is the yardstick every other
        // page is measured against.
        if (page.path === '/') homeTitle = titleOf(response.body);
        assertPage(page, response);
      });
    }

    for (const negative of NEGATIVE_CASES) {
      await t.test(`${negative.path} — ${negative.name}`, async () => {
        const response = await request(negative.path, { redirect: 'manual' });
        const group = negative.path;

        check(group, `status ${negative.status}`, () => {
          assert.equal(
            response.status,
            negative.status,
            `expected ${negative.status}, got ${response.status}`
          );
        });

        if (negative.location) {
          check(group, `redirects to ${negative.location}`, () => {
            assert.equal(
              redirectTarget(response.location),
              negative.location,
              `Location was "${response.location}"`
            );
          });
        }

        if (negative.expectNoindex) {
          check(group, 'carries noindex', () => {
            const robots = metaContents(response.body, 'robots').join(' ').toLowerCase();
            assert.ok(
              robots.includes('noindex'),
              `error page robots meta is "${robots}" — a soft 404 Google will index`
            );
          });
        }
      });
    }

    await t.test('sitemap index and chunks', async () => {
      const group = '/sitemap.xml';
      const index = await request('/sitemap.xml');

      check(group, 'index reachable and is a sitemapindex', () => {
        assert.equal(index.status, 200, `returned ${index.status}`);
        assert.match(index.body, /<sitemapindex\b/, 'not a sitemap index');
      });

      const chunkPaths = [...index.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
        (match) => new URL(match[1]).pathname
      );

      check(group, 'index references at least one chunk', () => {
        assert.ok(chunkPaths.length > 0, 'sitemap index references no chunks');
      });

      const chunks = [];
      for (const chunkPath of chunkPaths) {
        const chunk = await request(chunkPath);
        chunks.push(chunk.body);
        check(chunkPath, 'reachable', () => {
          assert.equal(chunk.status, 200, `returned ${chunk.status}`);
        });
        check(chunkPath, `at most ${MAX_SITEMAP_CHUNK_URLS} URLs`, () => {
          const count = (chunk.body.match(/<loc>/g) || []).length;
          assert.ok(
            count <= MAX_SITEMAP_CHUNK_URLS,
            `chunk holds ${count} URLs, over the ${MAX_SITEMAP_CHUNK_URLS} cap`
          );
        });
      }

      check(group, 'no retired /markets/state/ URLs advertised', () => {
        const joined = chunks.join('\n');
        assert.ok(
          !/<loc>https?:\/\/[^/]+\/markets\/state\//.test(joined),
          'a chunk still lists retired /markets/state/ URLs'
        );
      });

      // The pages that publish a JSON-LD `dateModified` must publish the same
      // instant the sitemap advertises as that URL's `lastmod`. They are built
      // from one rule (newest `last_updated` among the markets the page lists)
      // in two places; this is what keeps the two in step.
      const sitemapLastmod = new Map();
      for (const entry of chunks.join('\n').matchAll(
        /<url>[\s\S]*?<loc>([^<]+)<\/loc>([\s\S]*?)<\/url>/g
      )) {
        const lastmod = /<lastmod>([^<]+)<\/lastmod>/.exec(entry[2]);
        if (lastmod) sitemapLastmod.set(new URL(entry[1]).pathname, lastmod[1].trim());
      }

      for (const [pagePath, dateModified] of publishedDateModified) {
        check(pagePath, 'dateModified matches the sitemap lastmod', () => {
          const lastmod = sitemapLastmod.get(pagePath);
          assert.ok(lastmod, `the sitemap advertises no lastmod for ${pagePath}`);
          assert.equal(
            Date.parse(dateModified),
            Date.parse(lastmod),
            `page says ${dateModified}, sitemap says ${lastmod}`
          );
        });
      }

      // A `lastmod` built from the fetch time would tell Google every URL
      // changed on every crawl; two reads of one chunk must be identical.
      const second = await request(chunkPaths[0]);
      check(chunkPaths[0], 'stable lastmod (no fetch-time stamp)', () => {
        assert.equal(
          second.body,
          chunks[0],
          'the chunk changed between two fetches — a fetch-time lastmod?'
        );
      });
    });

    await t.test('robots.txt', async () => {
      const group = '/robots.txt';
      const response = await request('/robots.txt');
      const body = response.body;

      check(group, 'reachable', () => {
        assert.equal(response.status, 200, `returned ${response.status}`);
      });

      check(group, 'points at the sitemap index on the canonical host', () => {
        const sitemaps = [...body.matchAll(/^\s*Sitemap:\s*(\S+)\s*$/gim)].map((m) => m[1]);
        assert.deepEqual(sitemaps, [`${CANONICAL_ORIGIN}/sitemap.xml`]);
      });

      check(group, 'disallows /api/* and nothing else', () => {
        const disallowed = [...body.matchAll(/^\s*Disallow:\s*(\S*)\s*$/gim)]
          .map((m) => m[1])
          .filter(Boolean);
        // `/private/*` used to be here and referred to a path that has never
        // existed. Anything new in this list is a crawler being shut out of a
        // public directory, which is a decision, not a tidy-up — see the
        // rationale in `src/app/robots.ts` and `docs/seo-decisions.md`.
        assert.deepEqual(disallowed, ['/api/*']);
      });

      check(group, 'singles out no crawler', () => {
        const agents = [...body.matchAll(/^\s*User-agent:\s*(\S+)\s*$/gim)].map((m) => m[1]);
        assert.deepEqual(
          agents,
          ['*'],
          `robots.txt now has per-agent blocks (${agents.join(', ')}) — retrieval bots ` +
            'gate AI-answer inclusion, so this is deliberate or it is a regression'
        );
      });
    });
  });

  after(printReport);
}
