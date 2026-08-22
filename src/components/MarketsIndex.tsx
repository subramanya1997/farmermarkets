import { notFound } from 'next/navigation';
import { BrowseByState } from '@/components/BrowseByState';
import { BrowseByTopic } from '@/components/BrowseByTopic';
import { DiscoverySurvey } from '@/components/DiscoverySurvey';
import { MarketsExplorer } from '@/components/MarketsExplorer';
import { MarketsPagination } from '@/components/MarketsPagination';
import { MarketSummaryCard } from '@/components/MarketSummaryCard';
import { MARKETS_PER_PAGE, getMarketsPage, marketsPagePath } from '@/lib/marketsIndex';
import { getStateHubSummaries } from '@/lib/statePage';
import { getTopicSummaries } from '@/lib/topicPage';
import { absoluteUrl } from '@/lib/site';
import { SITE_FRAME } from "@/lib/ui";

interface MarketsIndexProps {
  page: number;
}

/**
 * The crawlable market index, shared by `/markets` (page 1) and
 * `/markets/page/[n]`.
 *
 * Page 1 leads with the interactive search/filter/map explorer and shows no
 * hero copy or A-Z card grid: readers land straight on markets. Its crawl
 * paths are the server-rendered state and topic directories below the
 * explorer, plus the sitemap. Pages 2+ stay pure link-based index pages (48
 * market links and pagination) for crawlers and no-JS readers.
 */
export async function MarketsIndex({ page }: MarketsIndexProps) {
  const result = await getMarketsPage(page);
  if (!result) {
    notFound();
  }

  const [states, topics] = await Promise.all([getStateHubSummaries(), getTopicSummaries()]);
  const firstIndex = (result.page - 1) * MARKETS_PER_PAGE + 1;
  const lastIndex = firstIndex + result.markets.length - 1;

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name:
      result.page === 1
        ? 'Farmers Markets Directory'
        : `Farmers Markets Directory - Page ${result.page}`,
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
        {result.page === 1 ? (
          <>
            {/* Readers land straight on markets; the h1 stays for crawlers
                and screen readers. */}
            <h1 className="sr-only">Find Local Food Markets</h1>
            <MarketsExplorer />
          </>
        ) : (
          <section className="w-full py-8">
            <div className={SITE_FRAME}>
              <div className="mb-5">
                <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                  Local Food Markets - Page {result.page}
                </h1>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Showing {firstIndex.toLocaleString()}-{lastIndex.toLocaleString()} of{' '}
                  {result.total.toLocaleString()} markets, listed A-Z
                </p>
              </div>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
                {result.markets.map((market) => (
                  <li key={market.id}>
                    <MarketSummaryCard market={market} />
                  </li>
                ))}
              </ul>
              <MarketsPagination page={result.page} totalPages={result.totalPages} />
            </div>
          </section>
        )}

        <BrowseByTopic topics={topics} />

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
