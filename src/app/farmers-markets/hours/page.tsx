import type { Metadata } from 'next';
import {
  TopicChipGrid,
  TopicDayBars,
  TopicMarketList,
  TopicPageShell,
  TopicSection,
} from '@/components/TopicPage';
import { getHoursTopicPage, topicMetadata } from '@/lib/topicPage';

export const revalidate = 86400;

/**
 * `/farmers-markets/hours`: the hours-intent page. Which days markets open,
 * the most common times, and where to check the times for one city.
 */
export async function generateMetadata(): Promise<Metadata> {
  return topicMetadata(await getHoursTopicPage());
}

export default async function HoursTopicPage() {
  const data = await getHoursTopicPage();

  return (
    <TopicPageShell data={data}>
      {data.dayRows.length > 0 && (
        <TopicSection heading="Markets open each day">
          <TopicDayBars days={data.dayRows} />
        </TopicSection>
      )}

      {data.topCities.length > 0 && (
        <TopicSection heading="Check hours in your city">
          <TopicChipGrid
            items={data.topCities.map((city) => ({
              label: city.name,
              href: city.href,
              count: city.count,
            }))}
          />
        </TopicSection>
      )}

      {data.topMarkets.length > 0 && (
        <TopicSection heading="Example schedules">
          <TopicMarketList markets={data.topMarkets} />
        </TopicSection>
      )}
    </TopicPageShell>
  );
}
