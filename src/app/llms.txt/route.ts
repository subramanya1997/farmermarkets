import { getAllPosts, blogPath } from '@/lib/blog';
import { getMarkets } from '@/lib/data';
import { getGeoIndex } from '@/lib/geoIndex';
import { statePath } from '@/lib/statePage';
import { absoluteUrl, GITHUB_REPO_URL } from '@/lib/site';

/**
 * `/llms.txt`, per the llmstxt.org convention: a curated, markdown map of the
 * site for AI assistants and their retrieval crawlers, the way robots.txt and
 * sitemap.xml serve classic crawlers.
 *
 * Same rules as the sitemap:
 *
 *  1. **No fetch-time dates.** The only date in the file is the newest
 *     `last_updated` in the dataset, so two fetches minutes apart are
 *     byte-identical.
 *  2. **Only canonical URLs**, absolute, on the canonical host, so an agent
 *     that fetched this file from anywhere can follow every link.
 *  3. **Every number is computed from the dataset**, never written into the
 *     copy, matching the contract in `src/lib/topicPage.ts` and friends.
 *
 * The heavyweight companion, `/llms-full.txt`, carries the whole directory as
 * plain text and is linked from the Optional section here, so an agent with a
 * small context can stop at this file and one with a large context can take
 * everything in one fetch.
 */
export const revalidate = 86400;
export const dynamic = 'force-static';

function number(value: number): string {
  return value.toLocaleString('en-US');
}

export async function GET(): Promise<Response> {
  const [markets, geoIndex] = await Promise.all([getMarkets(), getGeoIndex()]);

  const countries = new Set(geoIndex.states.map((state) => state.country_code));
  const newestUpdate = markets.reduce<string | undefined>((newest, market) => {
    const date = market.last_updated?.slice(0, 10);
    return date && (!newest || date > newest) ? date : newest;
  }, undefined);

  const stateLines = geoIndex.states.map(
    (state) =>
      `- [${state.name} farmers markets](${absoluteUrl(statePath(state.slug))}): ${number(state.market_count)} markets in ${number(state.city_count)} cities`
  );

  const body = [
    '# Farmer Markets',
    '',
    `> A free public directory of ${number(geoIndex.market_count)} farmers markets, public food markets, co-ops and other local-food places across ${number(countries.size)} countries, built from USDA Local Food Portal directory data and official government open-data portals, normalized to one schema and refreshed from the upstream publishers.`,
    '',
    'Every market page is server rendered HTML with JSON-LD structured data (name, address, coordinates, opening hours, payment options including SNAP/EBT, and links to the official site where one exists). The complete dataset is also published as JSON, linked below, and is free to read. All facts come from public government sources; the About the data page lists each publisher and its terms.',
    ...(newestUpdate ? ['', `Data last updated: ${newestUpdate}.`] : []),
    '',
    '## Directory',
    '',
    `- [Browse all markets](${absoluteUrl('/markets')}): searchable, filterable index of every market, with a map view`,
    `- [Markets that accept SNAP/EBT](${absoluteUrl('/farmers-markets/snap-ebt')}): every market that takes SNAP, WIC or FMNP benefits, by state`,
    `- [Markets with online ordering](${absoluteUrl('/farmers-markets/online')}): markets offering online ordering, delivery or CSA shares`,
    `- [Market hours](${absoluteUrl('/farmers-markets/hours')}): opening days and hours across the directory`,
    `- [Saturday markets](${absoluteUrl('/farmers-markets/saturday')}): markets open on Saturday, by state`,
    '',
    '## Guides',
    '',
    'Practical articles for market shoppers, written in markdown in the site repo.',
    '',
    `- [Blog index](${absoluteUrl('/blog')})`,
    ...getAllPosts().map(
      (post) => `- [${post.title}](${absoluteUrl(blogPath(post.slug))}): ${post.description}`
    ),
    '',
    '## States and provinces',
    '',
    'Each state hub links to its city pages, and each city page lists the individual markets.',
    '',
    ...stateLines,
    '',
    '## Data',
    '',
    `- [About the data](${absoluteUrl('/about-the-data')}): sources, processing, refresh cadence and per-publisher terms`,
    `- [Full dataset, JSON](${absoluteUrl('/data/farmers_markets.json')}): every market record in one file, around 18 MB`,
    `- [Geo index, JSON](${absoluteUrl('/data/geo_index.json')}): states and cities with the market slugs each one contains`,
    `- [Source code and data pipeline](${GITHUB_REPO_URL}): the site and its data pipeline are open source`,
    '',
    '## Optional',
    '',
    `- [llms-full.txt](${absoluteUrl('/llms-full.txt')}): the whole directory as plain text, one line per market, around 2 MB`,
    `- [Sitemap](${absoluteUrl('/sitemap.xml')}): sitemap index covering every canonical URL`,
    `- [About](${absoluteUrl('/about')})`,
    `- [Privacy](${absoluteUrl('/privacy')})`,
    `- [Terms](${absoluteUrl('/terms')})`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
}
