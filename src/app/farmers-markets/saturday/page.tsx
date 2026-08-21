import type { Metadata } from 'next';
import Link from 'next/link';
import {
  TopicMarketList,
  TopicPageShell,
  TopicSection,
  TopicStateTable,
} from '@/components/TopicPage';
import { getSaturdayTopicPage, topicMetadata, topicPath } from '@/lib/topicPage';

export const revalidate = 86400;

/**
 * `/farmers-markets/saturday` — the busiest market day, state by state.
 */
export async function generateMetadata(): Promise<Metadata> {
  return topicMetadata(await getSaturdayTopicPage());
}

export default async function SaturdayTopicPage() {
  const data = await getSaturdayTopicPage();

  return (
    <TopicPageShell data={data}>
      {data.states.length > 0 && (
        <TopicSection
          heading={`Saturday farmers markets in ${data.states.length} states and regions`}
          intro="Ordered by number of Saturday markets. Each state links to its full directory of markets, city by city."
        >
          <TopicStateTable
            states={data.states}
            caption="Farmers markets open on Saturday, by state"
            countHeading="Saturday markets"
          />
          {data.statelessCount > 0 && (
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
              {data.statelessCount.toLocaleString('en-US')} more Saturday market
              {data.statelessCount === 1 ? '' : 's'} in the data name no state and are not in the
              table.
            </p>
          )}
        </TopicSection>
      )}

      {data.topMarkets.length > 0 && (
        <TopicSection
          heading="Saturday markets with the most complete listings"
          intro="The Saturday records that publish the most detail — opening times first, then address and season."
        >
          <TopicMarketList markets={data.topMarkets} />
        </TopicSection>
      )}

      {data.otherDays.length > 0 && (
        <section>
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
            Farmers markets on other days
          </h2>
          <p className="mt-3 text-sm text-zinc-600 sm:text-base dark:text-zinc-400">
            Saturday is the busiest day, but not the only one:{' '}
            {data.otherDays
              .slice(0, 3)
              .map((row) => `${row.day} (${row.count.toLocaleString('en-US')})`)
              .join(', ')}{' '}
            follow it, and {data.alsoOtherDayCount.toLocaleString('en-US')} of the Saturday markets
            above also trade on at least one other day.{' '}
            <Link
              href={topicPath('hours')}
              className="text-green-700 hover:underline dark:text-green-500"
            >
              The full day-of-week breakdown is on the market hours page
            </Link>
            .
          </p>
        </section>
      )}
    </TopicPageShell>
  );
}
