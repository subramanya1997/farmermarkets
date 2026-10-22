import type { Metadata } from 'next';
import { TopicPageShell, TopicSection } from '@/components/TopicPage';
import { getOnlineTopicPage, topicMetadata } from '@/lib/topicPage';
import { OrderingMarkets } from './OrderingMarkets';

export const revalidate = 86400;

/**
 * `/farmers-markets/online`: the markets that sell beyond the stall (online
 * ordering, delivery or a CSA share), listed in full by state with a filter.
 */
export async function generateMetadata(): Promise<Metadata> {
  return topicMetadata(await getOnlineTopicPage());
}

export default async function OnlineTopicPage() {
  const data = await getOnlineTopicPage();

  return (
    <TopicPageShell data={data}>
      {data.topMarkets.length > 0 && (
        <TopicSection heading={`All ${data.topMarkets.length.toLocaleString('en-US')} markets, by state`}>
          <OrderingMarkets markets={data.topMarkets} counts={data.counts} />
        </TopicSection>
      )}
    </TopicPageShell>
  );
}
