import type { Metadata } from 'next';
import {
  TopicMarketList,
  TopicPageShell,
  TopicSection,
  TopicStateTable,
} from '@/components/TopicPage';
import { getOnlineTopicPage, topicMetadata } from '@/lib/topicPage';

export const revalidate = 86400;

/**
 * `/farmers-markets/online` — the markets recorded as selling beyond the
 * stall: online ordering, delivery, CSA shares and phone orders, each segment
 * with its own count.
 */
export async function generateMetadata(): Promise<Metadata> {
  return topicMetadata(await getOnlineTopicPage());
}

export default async function OnlineTopicPage() {
  const data = await getOnlineTopicPage();

  return (
    <TopicPageShell data={data}>
      {data.segments.map((segment) => (
        <TopicSection
          key={segment.key}
          heading={`${segment.heading} (${segment.count.toLocaleString('en-US')})`}
          intro={segment.intro}
        >
          <TopicMarketList markets={segment.markets} />
          {segment.count > segment.markets.length && (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              {(segment.count - segment.markets.length).toLocaleString('en-US')} more are counted in
              the state table below.
            </p>
          )}
        </TopicSection>
      ))}

      {data.states.length > 0 && (
        <TopicSection
          heading={`Ordering, delivery and CSA markets in ${data.states.length} states and regions`}
          intro="Ordered by number of markets. A market offering more than one of these channels is counted once."
        >
          <TopicStateTable
            states={data.states}
            caption="Farmers markets with online ordering, delivery, CSA or phone orders, by state"
            countHeading="Markets"
          />
          {data.statelessCount > 0 && (
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
              {data.statelessCount.toLocaleString('en-US')} more market
              {data.statelessCount === 1 ? '' : 's'} in the data name no state and are not in the
              table.
            </p>
          )}
        </TopicSection>
      )}
    </TopicPageShell>
  );
}
