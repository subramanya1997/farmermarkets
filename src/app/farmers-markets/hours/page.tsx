import type { Metadata } from 'next';
import Link from 'next/link';
import {
  TopicDayTable,
  TopicMarketList,
  TopicPageShell,
  TopicSection,
} from '@/components/TopicPage';
import { getHoursTopicPage, topicMetadata } from '@/lib/topicPage';

export const revalidate = 86400;

/**
 * `/farmers-markets/hours` — the hours-intent page: which days markets trade
 * on, how common each day is, and where to find the times for one city.
 */
export async function generateMetadata(): Promise<Metadata> {
  return topicMetadata(await getHoursTopicPage());
}

export default async function HoursTopicPage() {
  const data = await getHoursTopicPage();

  return (
    <TopicPageShell data={data}>
      <TopicSection
        heading="Farmers markets by day of the week"
        intro={`Counted across the ${data.withDayData.toLocaleString(
          'en-US'
        )} markets that state at least one opening day. A market open on two days is counted in both rows.`}
      >
        <TopicDayTable
          days={data.dayRows}
          caption="Farmers markets by day of the week"
          total={data.withDayData}
        />
      </TopicSection>

      <section>
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
          Opening times vary market to market
        </h2>
        <p className="mt-3 max-w-3xl text-sm text-zinc-600 sm:text-base dark:text-zinc-400">
          {data.withDaysAndHours.toLocaleString('en-US')} of these records state their opening
          times as well as their days
          {data.commonHours
            ? `, and ${data.commonHours.hours} is the single most common window, used by ${data.commonHours.count.toLocaleString(
                'en-US'
              )} of the ${data.withHours.toLocaleString('en-US')} markets that state their times`
            : ''}
          . Even within one city the times differ, and many markets shorten their season or their
          hours outside summer, so the city pages are the place to check before you go: each lists
          every market in that city with its days, hours and season.
        </p>
        {data.topCities.length > 0 && (
          <ul className="mt-4 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
            {data.topCities.map((city) => (
              <li key={city.href}>
                <Link
                  href={city.href}
                  className="flex items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50 hover:underline dark:hover:bg-zinc-800"
                >
                  <span className="truncate text-green-700 dark:text-green-500">
                    {city.name} market hours
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                    {city.count.toLocaleString('en-US')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.topMarkets.length > 0 && (
        <TopicSection
          heading="Markets with the most complete schedules"
          intro="The records that publish both their opening days and their opening times."
        >
          <TopicMarketList markets={data.topMarkets} />
        </TopicSection>
      )}
    </TopicPageShell>
  );
}
