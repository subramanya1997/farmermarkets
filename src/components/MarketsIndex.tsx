import { notFound } from 'next/navigation';
import { BrowseByState } from '@/components/BrowseByState';
import { BrowseByTopic } from '@/components/BrowseByTopic';
import { MarketsExplorer } from '@/components/MarketsExplorer';
import { MarketsPagination } from '@/components/MarketsPagination';
import { MarketSummaryCard } from '@/components/MarketSummaryCard';
import { INDEX_NAME, MARKETS_PER_PAGE, getMarketsPage, marketsPagePath } from '@/lib/marketsIndex';
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
 * Page 1 leads with the interactive search/filter/map explorer, then the topic
 * chips and the state directory as its server-rendered crawl paths. Pages 2+
 * are plain link pages (48 market cards and pagination) for crawlers and no-JS
 * readers; they skip the topic and state blocks, which page 1 already carries.
 */
export async function MarketsIndex({ page }: MarketsIndexProps) {
  const result = await getMarketsPage(page);
  if (!result) {
    notFound();
  }

  const isFirst = result.page === 1;
  const [states, topics] = isFirst
    ? await Promise.all([getStateHubSummaries(), getTopicSummaries()])
    : [[], []];
  const firstIndex = (result.page - 1) * MARKETS_PER_PAGE + 1;
  const lastIndex = firstIndex + result.markets.length - 1;

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: isFirst ? INDEX_NAME : `${INDEX_NAME} - Page ${result.page}`,
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
        {isFirst ? (
          <>
            <section className="w-full bg-gradient-to-b from-green-50 to-white pt-6 pb-2 dark:from-green-900/20 dark:to-zinc-900">
              <div className={SITE_FRAME}>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{INDEX_NAME}</h1>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 sm:text-base">
                  {result.total.toLocaleString()} markets with hours and SNAP/EBT.
                </p>
              </div>
            </section>
            <MarketsExplorer />
            <BrowseByTopic topics={topics} />
            <BrowseByState states={states} />
          </>
        ) : (
          <section className="w-full py-8">
            <div className={SITE_FRAME}>
              <div className="mb-5">
                <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{INDEX_NAME}</h1>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Page {result.page.toLocaleString()} of {result.totalPages.toLocaleString()}
                  <span aria-hidden="true"> &middot; </span>
                  {firstIndex.toLocaleString()}-{lastIndex.toLocaleString()} of{' '}
                  {result.total.toLocaleString()}, A to Z
                </p>
              </div>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
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
      </div>
    </>
  );
}
