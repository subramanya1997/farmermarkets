const baseUrl = process.env.MARKET_BASE_URL || 'http://localhost:3000';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchJson(path, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${path}`);
  assert(
    response.status === expectedStatus,
    `${path} returned ${response.status}, expected ${expectedStatus}`
  );
  return await response.json();
}

const invalidPagination = await fetchJson('/api/markets?page=abc&limit=abc');
assert(Number.isFinite(invalidPagination.pagination.page), 'invalid page serialized as a non-finite value');
assert(Number.isFinite(invalidPagination.pagination.limit), 'invalid limit serialized as a non-finite value');
assert(Number.isFinite(invalidPagination.pagination.totalPages), 'invalid totalPages serialized as a non-finite value');

const negativePagination = await fetchJson('/api/markets?page=-1&limit=-5');
assert(negativePagination.pagination.page >= 1, 'negative page was not normalized');
assert(negativePagination.pagination.limit >= 1, 'negative limit was not normalized');
assert(negativePagination.pagination.totalPages >= 1, 'negative pagination produced an impossible totalPages value');

await fetchJson('/api/markets?lat=abc&lon=def&limit=1', 400);

const officialCanada = await fetchJson('/api/markets?search=Canada&limit=5');
assert(officialCanada.pagination.total >= 388, 'official Canadian markets were not merged into the API');
assert(
  officialCanada.data.some((market) => market.country === 'Canada' && market.provenance?.official === true),
  'Canadian search results do not include official source provenance'
);

const newZealand = await fetchJson('/api/markets?country=New%20Zealand&limit=50');
assert(newZealand.pagination.total === 12, `New Zealand filter returned ${newZealand.pagination.total}, expected 12`);
assert(
  newZealand.data.every((market) => market.country === 'New Zealand'),
  'New Zealand filter returned a record from another country'
);

const unitedStates = await fetchJson('/api/markets?country=US&limit=1');
assert(
  unitedStates.pagination.total >= 7916,
  `United States filter returned ${unitedStates.pagination.total}, expected the legacy and official US records`
);

const marketsPage = await fetch(`${baseUrl}/markets`);
assert(marketsPage.status === 200, `/markets returned ${marketsPage.status}`);

// `/sitemap.xml` is a sitemap **index** now (src/app/sitemap.xml/route.ts); the
// URLs live in the chunk files it references, so every check below walks all of
// them rather than reading one flat file.
const sitemapIndex = await fetch(`${baseUrl}/sitemap.xml`);
assert(sitemapIndex.status === 200, `/sitemap.xml returned ${sitemapIndex.status}`);
const sitemapIndexText = await sitemapIndex.text();
assert(
  /<sitemapindex\b/.test(sitemapIndexText),
  '/sitemap.xml is not a sitemap index'
);

const chunkUrls = [...sitemapIndexText.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
assert(chunkUrls.length > 0, 'sitemap index references no chunk sitemaps');

// Host-agnostic: the canonical origin lives in src/lib/site.ts and may be
// overridden by NEXT_PUBLIC_SITE_URL, so refetch each chunk from `baseUrl`.
const chunkTexts = [];
for (const chunkUrl of chunkUrls) {
  const path = new URL(chunkUrl).pathname;
  const chunk = await fetch(`${baseUrl}${path}`);
  assert(chunk.status === 200, `${path} returned ${chunk.status}`);
  const text = await chunk.text();
  const urlCount = (text.match(/<loc>/g) || []).length;
  assert(urlCount <= 5000, `${path} contains ${urlCount} URLs, over the 5,000 chunk cap`);
  chunkTexts.push(text);
}

const sitemapText = chunkTexts.join('\n');
assert(!/<loc>https?:\/\/[^/]+\/map<\/loc>/.test(sitemapText), 'sitemap still includes missing /map route');

// The retired state pages are 308s now and must not be advertised.
assert(
  !/<loc>https?:\/\/[^/]+\/markets\/state\//.test(sitemapText),
  'sitemap still includes retired /markets/state/ URLs'
);

const marketUrlCount = (sitemapText.match(/<loc>https?:\/\/[^/]+\/markets\/(?!page\/)/g) || []).length;
assert(marketUrlCount >= 6832, `sitemap contains ${marketUrlCount} market URLs, expected at least 6832`);

const stateHubCount = (sitemapText.match(/<loc>https?:\/\/[^/]+\/farmers-markets\/[^/<]+<\/loc>/g) || []).length;
assert(stateHubCount >= 50, `sitemap contains ${stateHubCount} state hub URLs, expected at least 50`);

const cityCount = (sitemapText.match(/<loc>https?:\/\/[^/]+\/farmers-markets\/[^/<]+\/[^<]+<\/loc>/g) || []).length;
assert(cityCount >= 4000, `sitemap contains ${cityCount} city URLs, expected at least 4000`);

// The lastmod trust check: nothing may be stamped with fetch time, so a second
// read of the same chunk has to come back byte-identical.
const firstChunkPath = new URL(chunkUrls[0]).pathname;
const secondRead = await (await fetch(`${baseUrl}${firstChunkPath}`)).text();
assert(secondRead === chunkTexts[0], `${firstChunkPath} changed between two fetches (fetch-time lastmod?)`);

const robots = await fetch(`${baseUrl}/robots.txt`);
assert(robots.status === 200, `/robots.txt returned ${robots.status}`);
const robotsText = await robots.text();
assert(/Sitemap:\s*https?:\/\/[^/]+\/sitemap\.xml/.test(robotsText), 'robots.txt does not point at /sitemap.xml');

console.log(
  `Market route checks passed (${chunkUrls.length} sitemap chunks, ${marketUrlCount} markets, ` +
    `${cityCount} cities, ${stateHubCount} state hubs)`
);
