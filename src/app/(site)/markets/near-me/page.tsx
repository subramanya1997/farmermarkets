import type { Metadata } from 'next';
import {
  TopicChipGrid,
  TopicDayBars,
  TopicMarketList,
  TopicPageShell,
  TopicSection,
} from '@/components/TopicPage';
import { getNearMeTopicPage, topicMetadata } from '@/lib/topicPage';
import { NearMeMarkets } from './NearMeMarkets';

export const revalidate = 86400;

/**
 * `/markets/near-me`: the markets closest to the reader, with Today, This
 * weekend and Year-round tabs. The nearby list is filled in by the browser;
 * the states, days and FAQ below it are server rendered.
 */
export async function generateMetadata(): Promise<Metadata> {
  return topicMetadata(await getNearMeTopicPage());
}

export default async function NearMeTopicPage() {
  const data = await getNearMeTopicPage();

  return (
    <TopicPageShell data={data}>
      <TopicSection heading="Markets closest to you">
        <NearMeMarkets />
      </TopicSection>

      {data.states.length > 0 && (
        <TopicSection heading="Browse by state">
          <TopicChipGrid
            items={data.states.map((state) => ({
              label: state.name,
              href: state.href,
              count: state.count,
            }))}
            highlight={5}
          />
        </TopicSection>
      )}

      {data.dayRows.length > 0 && (
        <TopicSection heading="Markets open each day">
          <TopicDayBars days={data.dayRows} />
        </TopicSection>
      )}

      {data.topMarkets.length > 0 && (
        <TopicSection heading="One market in each top state">
          <TopicMarketList markets={data.topMarkets} />
        </TopicSection>
      )}
    </TopicPageShell>
  );
}
