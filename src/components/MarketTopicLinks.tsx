import Link from 'next/link';
import type { FarmerMarket } from '@/lib/data';
import { isYearRoundMarket } from '@/lib/marketWinter';
import { marketWeekdays } from '@/lib/seo';
import { topicPath, type TopicSlug } from '@/lib/topicSlugs';

interface TopicLink {
  slug: TopicSlug;
  label: string;
}

/**
 * The national topic pages this market belongs on, linked in words that say
 * what is behind them ("Farmers markets that accept SNAP/EBT").
 *
 * The header and footer already link every topic page, but site-wide
 * navigation is a weak signal: in November 2026 Search Console still listed
 * the SNAP, Saturday and near-me pages as "Discovered, not indexed". A link
 * in the body of thousands of market pages, only where the market actually
 * qualifies, tells a crawler those pages matter and what they are about.
 */
export function marketTopicLinks(market: FarmerMarket): TopicLink[] {
  const links: TopicLink[] = [];
  if (market.snap === true) {
    links.push({ slug: 'snap-ebt', label: 'Farmers markets that accept SNAP/EBT' });
  }
  for (const day of marketWeekdays(market)) {
    links.push({ slug: day.toLowerCase() as TopicSlug, label: `${day} farmers markets` });
  }
  if (isYearRoundMarket(market)) {
    links.push({ slug: 'year-round', label: 'Year-round farmers markets' });
  }
  links.push({ slug: 'hours', label: 'Farmers market hours by day' });
  return links;
}

export function MarketTopicLinks({ market }: { market: FarmerMarket }) {
  const links = marketTopicLinks(market);

  return (
    <nav aria-label="Similar farmers markets" className="mt-6 sm:mt-8">
      <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        More markets like this
      </h2>
      <ul className="flex flex-wrap gap-x-4 gap-y-2">
        {links.map((link) => (
          <li key={link.slug}>
            <Link
              href={topicPath(link.slug)}
              className="text-sm text-green-700 underline underline-offset-2 hover:text-green-800 dark:text-green-500 dark:hover:text-green-400"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
