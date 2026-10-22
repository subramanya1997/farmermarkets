import type { Metadata } from 'next';
import { Coins, CreditCard, ShoppingBasket } from 'lucide-react';
import {
  TopicChipGrid,
  TopicMarketList,
  TopicPageShell,
  TopicSection,
} from '@/components/TopicPage';
import { getSnapTopicPage, topicMetadata } from '@/lib/topicPage';

export const revalidate = 86400;

/**
 * `/farmers-markets/snap-ebt`: every market in the data that takes SNAP/EBT.
 *
 * A static segment, so Next matches it ahead of the sibling `[state]` route;
 * `snap-ebt` is not a state slug in the geo index, so nothing is shadowed in
 * the other direction either.
 */
export async function generateMetadata(): Promise<Metadata> {
  return topicMetadata(await getSnapTopicPage());
}

/** General guidance on using SNAP at a market, not a claim about any one market. */
const HOW_IT_WORKS = [
  {
    icon: CreditCard,
    text: 'Pay with your EBT card at the market’s info booth or at a vendor’s stall.',
  },
  {
    icon: Coins,
    text: 'Booths often swap EBT for tokens you can spend with any taking vendor.',
  },
  {
    icon: ShoppingBasket,
    text: 'SNAP covers food to take home, plus seeds and food plants. Not hot meals or alcohol.',
  },
];

export default async function SnapTopicPage() {
  const data = await getSnapTopicPage();

  return (
    <TopicPageShell data={data}>
      {data.states.length > 0 && (
        <TopicSection heading="SNAP markets by state">
          <TopicChipGrid
            items={data.states.map((state) => ({
              label: state.name,
              href: state.href,
              count: state.count,
            }))}
            highlight={5}
            countLabel="SNAP markets"
          />
        </TopicSection>
      )}

      {data.topMarkets.length > 0 && (
        <TopicSection heading="One market in each top state">
          <TopicMarketList markets={data.topMarkets} />
        </TopicSection>
      )}

      <TopicSection heading="How SNAP works at the market">
        <ul className="grid gap-2 sm:grid-cols-3 sm:gap-3">
          {HOW_IT_WORKS.map(({ icon: Glyph, text }) => (
            <li
              key={text}
              className="flex gap-3 rounded-2xl border border-zinc-200 p-4 text-sm text-zinc-700 sm:flex-col sm:gap-2 dark:border-zinc-800 dark:text-zinc-300"
            >
              <Glyph aria-hidden className="h-5 w-5 shrink-0 text-green-700 dark:text-green-500" />
              {text}
            </li>
          ))}
        </ul>
      </TopicSection>
    </TopicPageShell>
  );
}
