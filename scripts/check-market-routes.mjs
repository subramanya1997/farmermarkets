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

const marketsPage = await fetch(`${baseUrl}/markets`);
assert(marketsPage.status === 200, `/markets returned ${marketsPage.status}`);

const sitemap = await fetch(`${baseUrl}/sitemap.xml`);
assert(sitemap.status === 200, `/sitemap.xml returned ${sitemap.status}`);
const sitemapText = await sitemap.text();
assert(!sitemapText.includes('<loc>https://farmermarkets.app/map</loc>'), 'sitemap still includes missing /map route');

const marketUrlCount = (sitemapText.match(/<loc>https:\/\/farmermarkets\.app\/markets\//g) || []).length;
assert(marketUrlCount >= 6832, `sitemap contains ${marketUrlCount} market URLs, expected at least 6832`);

console.log('Market route checks passed');
