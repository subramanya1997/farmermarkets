import type { Metadata } from 'next';
import {
  TopicChipGrid,
  TopicDayBars,
  TopicMarketList,
  TopicPageShell,
  TopicSection,
} from '@/components/TopicPage';
import { getYearRoundTopicPage, topicMetadata } from '@/lib/topicPage';

export const revalidate = 86400;

/**
 * `/markets/year-round`: the markets that do not close for winter, by state
 * and city. Only records that state a year-round season are counted.
 */
export async function generateMetadata(): Promise<Metadata> {
  return topicMetadata(await getYearRoundTopicPage());
}

export default async function YearRoundTopicPage() {
  const data = await getYearRoundTopicPage();

  return (
    <TopicPageShell data={data}>
      {data.states.length > 0 && (
        <TopicSection heading="Year-round markets by state">
          <TopicChipGrid
            items={data.states.map((state) => ({
              label: state.name,
              href: state.href,
              count: state.count,
            }))}
            highlight={5}
            countLabel="year-round markets"
          />
        </TopicSection>
      )}

      {data.topCities.length > 0 && (
        <TopicSection heading="Cities with the most year-round markets">
          <TopicChipGrid
            items={data.topCities.map((city) => ({
              label: city.name,
              href: city.href,
              count: city.count,
            }))}
            countLabel="year-round markets"
          />
        </TopicSection>
      )}

      {data.dayRows.length > 0 && (
        <TopicSection heading="Days year-round markets open">
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
