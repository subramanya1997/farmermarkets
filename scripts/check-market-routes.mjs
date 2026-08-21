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

const sitemap = await fetch(`${baseUrl}/sitemap.xml`);
assert(sitemap.status === 200, `/sitemap.xml returned ${sitemap.status}`);
const sitemapText = await sitemap.text();
// Host-agnostic: the canonical origin lives in src/lib/site.ts and may be
// overridden by NEXT_PUBLIC_SITE_URL, so match any host here.
assert(!/<loc>https?:\/\/[^/]+\/map<\/loc>/.test(sitemapText), 'sitemap still includes missing /map route');

const marketUrlCount = (sitemapText.match(/<loc>https?:\/\/[^/]+\/markets\//g) || []).length;
assert(marketUrlCount >= 6832, `sitemap contains ${marketUrlCount} market URLs, expected at least 6832`);

console.log('Market route checks passed');
