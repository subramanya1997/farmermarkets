import { notFound } from 'next/navigation';
import { BrowseByState } from '@/components/BrowseByState';
import { DiscoverySurvey } from '@/components/DiscoverySurvey';
import { MarketsExplorer } from '@/components/MarketsExplorer';
import { MarketsPagination } from '@/components/MarketsPagination';
import { MarketSummaryCard } from '@/components/MarketSummaryCard';
import {
  MARKETS_PER_PAGE,
  getMarketsPage,
  getStateSummaries,
  marketsPagePath,
} from '@/lib/marketsIndex';
import { absoluteUrl } from '@/lib/site';

interface MarketsIndexProps {
  page: number;
}

/**
 * The crawlable market index, shared by `/markets` (page 1) and
 * `/markets/page/[n]`.
 *
 * Everything a crawler needs is plain server-rendered HTML: 48 market links,
 * link-based pagination, and a full state directory. The interactive
 * search/filter/map view sits above it as an opt-in client island.
 */
export async function MarketsIndex({ page }: MarketsIndexProps) {
  const result = await getMarketsPage(page);
  if (!result) {
    notFound();
  }

  const states = await getStateSummaries();
  const firstIndex = (result.page - 1) * MARKETS_PER_PAGE + 1;
  const lastIndex = firstIndex + result.markets.length - 1;

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name:
      result.page === 1
        ? 'Farmers Markets Directory'
        : `Farmers Markets Directory — Page ${result.page}`,
    url: absoluteUrl(marketsPagePath(result.page)),
    numberOfItems: result.total,
    mainEntity: {
      '@type': 'ItemList',
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      numberOfItems: result.markets.length,
      itemListElement: result.markets.map((market, index) => ({
        '@type': 'ListItem',
        position: firstIndex + index,
        url: absoluteUrl(`/markets/${market.slug}`),
        name: market.name,
      })),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }}
      />
      <div className="min-h-[calc(100vh-4rem)]">
        <section className="w-full bg-gradient-to-b from-green-50 to-white py-8 dark:from-green-900/20 dark:to-zinc-950 sm:py-12">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
            <div className="flex flex-col items-center space-y-4 text-center">
              <h1 className="text-2xl font-bold tracking-tighter sm:text-3xl md:text-4xl lg:text-5xl">
                {result.page === 1
                  ? 'Find Local Food Markets'
                  : `Local Food Markets — Page ${result.page}`}
              </h1>
              <p className="mx-auto max-w-[700px] text-sm text-zinc-600 dark:text-zinc-400 sm:text-base md:text-lg">
                Browse {result.total.toLocaleString()} farmers markets, public food markets,
                cooperatives, and other local-food places, listed A–Z.
              </p>
            </div>
          </div>
        </section>

        <MarketsExplorer />

        <section className="w-full py-8">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
            <p className="mb-5 text-sm text-zinc-600 dark:text-zinc-400">
              Showing {firstIndex.toLocaleString()}–{lastIndex.toLocaleString()} of{' '}
              {result.total.toLocaleString()} markets
            </p>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
              {result.markets.map((market) => (
                <li key={market.id}>
                  <MarketSummaryCard market={market} />
                </li>
              ))}
            </ul>
            <MarketsPagination page={result.page} totalPages={result.totalPages} />
          </div>
        </section>

        <BrowseByState states={states} />

        {/*
          The discovery survey used to live inside the client `Markets`
          component, which every visitor to `/markets` mounted. Now that the
          explorer is opt-in, the index page owns it so the prompt still
          reaches the same readers.
        */}
        <DiscoverySurvey selectedCountry="All countries" resultCount={result.total} />
      </div>
    </>
  );
}
