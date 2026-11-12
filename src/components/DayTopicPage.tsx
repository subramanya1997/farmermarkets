import {
  TopicChipGrid,
  TopicChipRow,
  TopicMarketList,
  TopicPageShell,
  TopicSection,
} from '@/components/TopicPage';
import { getDayTopicPage } from '@/lib/topicPage';
import type { Weekday } from '@/lib/seo';

/**
 * The page the seven weekday routes (`/markets/monday` to `/markets/sunday`)
 * share: who opens that day, state by state, and the other days to try.
 */
export async function DayTopicPage({ day }: { day: Weekday }) {
  const data = await getDayTopicPage(day);

  return (
    <TopicPageShell data={data}>
      {data.states.length > 0 && (
        <TopicSection heading={`${day} markets by state`}>
          <TopicChipGrid
            items={data.states.map((state) => ({
              label: state.name,
              href: state.href,
              count: state.count,
            }))}
            highlight={5}
            countLabel={`${day} markets`}
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
              href: row.href ?? '/markets/hours',
              count: row.count,
            }))}
          />
        </TopicSection>
      )}
    </TopicPageShell>
  );
}
