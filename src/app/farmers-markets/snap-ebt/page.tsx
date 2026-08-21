import type { Metadata } from 'next';
import {
  TopicMarketList,
  TopicPageShell,
  TopicSection,
  TopicStateTable,
} from '@/components/TopicPage';
import { getSnapTopicPage, topicMetadata } from '@/lib/topicPage';

export const revalidate = 86400;

/**
 * `/farmers-markets/snap-ebt` — every market in the data recorded as taking
 * SNAP/EBT.
 *
 * A static segment, so Next matches it ahead of the sibling `[state]` route;
 * `snap-ebt` is not a state slug in the geo index, so nothing is shadowed in
 * the other direction either.
 */
export async function generateMetadata(): Promise<Metadata> {
  return topicMetadata(await getSnapTopicPage());
}

export default async function SnapTopicPage() {
  const data = await getSnapTopicPage();

  return (
    <TopicPageShell data={data}>
      <section>
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
          How SNAP works at a farmers market
        </h2>
        <p className="mt-3 max-w-3xl text-sm text-zinc-600 sm:text-base dark:text-zinc-400">
          SNAP benefits are paid with an EBT card. Markets that accept them usually work one of two
          ways: a single card terminal at an information booth, where you swipe for tokens or scrip
          to spend with any participating vendor, or individual vendors taking the card at their own
          stalls. SNAP covers food to take home and eat (fruit, vegetables, meat, dairy, bread, and
          seeds and plants that produce food) but not hot prepared meals, alcohol or non-food
          goods. Many states also run programs that match SNAP spending on fruit and vegetables at
          participating markets; the amounts and rules are set locally, so ask at the market’s
          information booth what is available there.
        </p>
      </section>

      {data.states.length > 0 && (
        <TopicSection
          heading={`SNAP/EBT farmers markets in ${data.states.length} states and regions`}
          intro="Ordered by number of SNAP-accepting markets. Each state links to its full directory of markets, city by city."
        >
          <TopicStateTable
            states={data.states}
            caption="Farmers markets that accept SNAP/EBT, by state"
            countHeading="SNAP markets"
          />
          {data.statelessCount > 0 && (
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
              {data.statelessCount.toLocaleString('en-US')} more SNAP market
              {data.statelessCount === 1 ? '' : 's'} in the data name no state and are not in the
              table.
            </p>
          )}
        </TopicSection>
      )}

      {data.topMarkets.length > 0 && (
        <TopicSection
          heading="SNAP markets with the most complete listings"
          intro="The SNAP-accepting records that publish the most detail: opening times first, then days."
        >
          <TopicMarketList markets={data.topMarkets} />
        </TopicSection>
      )}
    </TopicPageShell>
  );
}
