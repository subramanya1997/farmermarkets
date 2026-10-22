import type { Metadata } from 'next';
import {
  TopicChipGrid,
  TopicChipRow,
  TopicMarketList,
  TopicPageShell,
  TopicSection,
} from '@/components/TopicPage';
import { getSaturdayTopicPage, topicMetadata } from '@/lib/topicPage';

export const revalidate = 86400;

/**
 * `/farmers-markets/saturday`: the busiest market day, state by state.
 */
export async function generateMetadata(): Promise<Metadata> {
  return topicMetadata(await getSaturdayTopicPage());
}

export default async function SaturdayTopicPage() {
  const data = await getSaturdayTopicPage();

  return (
    <TopicPageShell data={data}>
      {data.states.length > 0 && (
        <TopicSection heading="Saturday markets by state">
          <TopicChipGrid
            items={data.states.map((state) => ({
              label: state.name,
              href: state.href,
              count: state.count,
            }))}
            highlight={5}
            countLabel="Saturday markets"
          />
        </TopicSection>
      )}

      {data.topMarkets.length > 0 && (
        <TopicSection heading="One market in each top state">
          <TopicMarketList markets={data.topMarkets} />
        </TopicSection>
      )}

      {data.otherDays.length > 0 && (
        <TopicSection heading="Markets on other days">
          <TopicChipRow
            items={data.otherDays.map((row) => ({
              label: row.day,
              href: row.href ?? '/farmers-markets/hours',
              count: row.count,
            }))}
          />
        </TopicSection>
      )}
    </TopicPageShell>
  );
}
