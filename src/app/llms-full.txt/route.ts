import { getMarkets, getMarketAddress, type FarmerMarket } from '@/lib/data';
import { getGeoIndex } from '@/lib/geoIndex';
import { clean } from '@/lib/geo';
import { cityPath } from '@/lib/cityPage';
import { statePath } from '@/lib/statePage';
import { absoluteUrl } from '@/lib/site';

/**
 * `/llms-full.txt`: the whole directory as plain text, one line per market,
 * grouped by state and city, for agents that want everything in one fetch.
 * The curated companion is `/llms.txt`; the same rules apply here (no
 * fetch-time dates, canonical absolute URLs, every number computed).
 *
 * The grouping mirrors the geo index exactly, so this file and the state and
 * city pages always agree on which market belongs where. Markets the index
 * could not place (`unresolved`) are listed in a final section rather than
 * dropped: the file promises the *whole* directory.
 *
 * Output is around 2 MB, well under what a single crawler fetch handles, and
 * far cheaper for an agent than walking thousands of HTML pages.
 */
export const revalidate = 86400;
export const dynamic = 'force-static';

function number(value: number): string {
  return value.toLocaleString('en-US');
}

/** One market as a single pipe-separated line; empty fields are omitted. */
function marketLine(market: FarmerMarket): string {
  const parts: string[] = [];

  const name = clean(market.name) || 'Unnamed market';
  parts.push(market.slug ? `${name}: ${absoluteUrl(`/markets/${market.slug}`)}` : name);

  const address = clean(getMarketAddress(market));
  if (address) parts.push(address);

  // `days` is free text some sources fill with schedules ("Saturdays 6:00am
  // – 1:00pm"); normalize the dashes the site's copy style bans and which
  // clean() handles on the other fields.
  const days = (market.days ?? []).join(', ').replace(/\s*[–—]\s*/g, '-');
  if (days) parts.push(days);

  const season = clean(market.season);
  if (season) parts.push(`Season: ${season}`);

  const benefits = [
    market.snap ? 'SNAP' : null,
    market.wic ? 'WIC' : null,
    market.fmnp ? 'FMNP' : null,
    market.sfmnp ? 'SFMNP' : null,
  ].filter(Boolean);
  if (benefits.length > 0) parts.push(`Accepts ${benefits.join(', ')}`);

  if (market.online_ordering_available) parts.push('Online ordering');
  if (market.csa_available) parts.push('CSA');

  const website = market.websites?.[0];
  if (website) parts.push(`Official site: ${website}`);

  return `- ${parts.join(' | ')}`;
}

export async function GET(): Promise<Response> {
  const [markets, geoIndex] = await Promise.all([getMarkets(), getGeoIndex()]);

  const bySlug = new Map<string, FarmerMarket>();
  for (const market of markets) {
    if (market.slug) bySlug.set(market.slug, market);
  }
  const lookup = (slugs: string[]): FarmerMarket[] =>
    slugs.map((slug) => bySlug.get(slug)).filter((market): market is FarmerMarket => !!market);

  const newestUpdate = markets.reduce<string | undefined>((newest, market) => {
    const date = market.last_updated?.slice(0, 10);
    return date && (!newest || date > newest) ? date : newest;
  }, undefined);

  const lines: string[] = [
    '# Farmer Markets: the full directory',
    '',
    `> Every market on ${absoluteUrl('/')}, grouped by state and city: ${number(geoIndex.market_count)} farmers markets, public food markets, co-ops and other local-food places. Each line links to the market's page, which carries the complete record as HTML with JSON-LD. The curated site map is at ${absoluteUrl('/llms.txt')}; the raw dataset is at ${absoluteUrl('/data/farmers_markets.json')}.`,
  ];
  if (newestUpdate) {
    lines.push('', `Data last updated: ${newestUpdate}.`);
  }

  for (const state of geoIndex.states) {
    lines.push(
      '',
      `## ${state.name} (${number(state.market_count)} markets): ${absoluteUrl(statePath(state.slug))}`
    );
    for (const city of state.cities) {
      lines.push(
        '',
        `### ${city.name}, ${state.name}: ${absoluteUrl(cityPath(state.slug, city.slug))}`,
        ...lookup(city.market_slugs).map(marketLine)
      );
    }
    const uncategorized = lookup(state.uncategorized_slugs);
    if (uncategorized.length > 0) {
      lines.push('', `### Elsewhere in ${state.name}`, ...uncategorized.map(marketLine));
    }
  }

  const unresolved = lookup(geoIndex.unresolved);
  if (unresolved.length > 0) {
    lines.push('', '## Location not yet resolved', ...unresolved.map(marketLine));
  }
  lines.push('');

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
}
