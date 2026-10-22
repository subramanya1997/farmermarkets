import type { ComponentType, ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Baby,
  CalendarDays,
  Clock,
  HandCoins,
  MapPin,
  MousePointerClick,
  ShoppingBasket,
  Truck,
} from 'lucide-react';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { FaqSection } from '@/components/FaqSection';
import { TopicMarketCard } from '@/app/farmers-markets/_components/TopicMarketRow';
import { absoluteUrl } from '@/lib/site';
import {
  TOPIC_LABELS,
  TOPIC_SLUGS,
  topicPath,
  type TopicDayRow,
  type TopicMarketRow,
  type TopicPageData,
  type TopicStat,
  type TopicStatIcon,
} from '@/lib/topicPage';
import { SITE_FRAME } from '@/lib/ui';

/**
 * The one layout the four topic pages share.
 *
 * Each page supplies its view model from `src/lib/topicPage.ts` plus its own
 * sections as children; everything the four have in common (breadcrumbs, the
 * answer sentence and headline numbers, the FAQ block, the
 * CollectionPage/ItemList/FAQPage JSON-LD and the cross-links to the other
 * topics) lives here once, so the pages cannot drift into four slightly
 * different templates.
 *
 * Built to be scanned, not read, in the same visual language as the market
 * page's "Plan your visit" card: numbers as tiles, states and cities as chip
 * grids, weekdays as bars, market rows as chips. Content sits in one centered
 * max-w-4xl column.
 */

/** CollectionPage + ItemList + FAQPage, on absolute canonical URLs. */
function structuredData(data: TopicPageData) {
  const pageUrl = absoluteUrl(data.path);

  // `dateModified` sits on the CollectionPage (a WebPage, so a CreativeWork)
  // and carries the newest `last_updated` among the markets this topic lists —
  // the same value the sitemap publishes as this URL's `lastmod`. Omitted
  // rather than faked when the topic's markets carry no usable date.
  const collectionPage = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: data.heading,
    description: data.description,
    url: pageUrl,
    ...(data.lastModified ? { dateModified: data.lastModified } : {}),
  };

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: data.heading,
    url: pageUrl,
    numberOfItems: data.topMarkets.length,
    itemListElement: data.topMarkets.map((market, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: market.name,
      url: absoluteUrl(market.href),
    })),
  };

  // Mirrors the rendered Q&A exactly — a FAQPage node carrying a question the
  // page does not show is a manual-action risk, not a rich result.
  const faqPage = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: data.faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };

  return [
    collectionPage,
    ...(data.topMarkets.length > 0 ? [itemList] : []),
    ...(data.faqs.length > 0 ? [faqPage] : []),
  ];
}

type Icon = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

const STAT_ICONS: Record<TopicStatIcon, Icon> = {
  snap: HandCoins,
  wic: Baby,
  map: MapPin,
  calendar: CalendarDays,
  clock: Clock,
  online: MousePointerClick,
  delivery: Truck,
  csa: ShoppingBasket,
};

const HEADING = 'text-xl font-bold tracking-tight sm:text-2xl';

/** An h2 section. */
export function TopicSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className={HEADING}>{heading}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** The headline numbers under the answer sentence. */
function TopicStats({ stats }: { stats: TopicStat[] }) {
  if (stats.length === 0) return null;
  const columns = stats.length >= 4 ? 'sm:grid-cols-4' : stats.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2';

  return (
    <dl className={`mt-5 grid grid-cols-2 gap-2 sm:gap-3 ${columns}`}>
      {stats.map((stat) => {
        const Glyph = STAT_ICONS[stat.icon];
        return (
          <div
            key={stat.label}
            className="flex flex-col-reverse rounded-2xl border border-zinc-200 bg-white/80 p-3 sm:p-4 dark:border-zinc-800 dark:bg-zinc-900/60"
          >
            <dt className="mt-1 flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              <Glyph aria-hidden className="h-4 w-4 shrink-0 text-green-700 dark:text-green-500" />
              {stat.label}
            </dt>
            <dd className="text-xl font-semibold tracking-tight text-zinc-900 tabular-nums sm:text-2xl dark:text-zinc-100">
              {stat.value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export interface TopicChip {
  label: string;
  href: string;
  count?: number;
}

/**
 * A compact multi-column grid of linked chips ("New York 327"), the first
 * `highlight` drawn in green. Used for states and cities.
 */
export function TopicChipGrid({
  items,
  highlight = 0,
  countLabel = 'markets',
}: {
  items: TopicChip[];
  highlight?: number;
  /** Read after the count by screen readers: "327 markets". */
  countLabel?: string;
}) {
  if (items.length === 0) return null;

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item, index) => (
        <li key={item.href}>
          <Link
            href={item.href}
            className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
              index < highlight
                ? 'border-green-200 bg-green-50 font-medium text-green-900 hover:bg-green-100 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200 dark:hover:bg-green-950/70'
                : 'border-zinc-200 text-zinc-800 hover:border-green-300 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800'
            }`}
          >
            <span className="truncate">{item.label}</span>
            {item.count !== undefined && (
              <span className="shrink-0 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                {item.count.toLocaleString('en-US')}
                <span className="sr-only"> {countLabel}</span>
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** A single wrapping row of rounded-full link chips. */
export function TopicChipRow({ items }: { items: TopicChip[] }) {
  if (items.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item.label}>
          <Link
            href={item.href}
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-800 transition-colors hover:border-green-300 hover:bg-green-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {item.label}
            {item.count !== undefined && (
              <span className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                {item.count.toLocaleString('en-US')}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Weekdays as horizontal bars, busiest in full green. Days with a page link to it. */
export function TopicDayBars({ days }: { days: TopicDayRow[] }) {
  if (days.length === 0) return null;
  const max = Math.max(...days.map((row) => row.count));

  return (
    <ul className="space-y-2.5 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
      {days.map((row) => {
        const width = Math.max(2, Math.round((row.count / max) * 100));
        return (
          <li
            key={row.day}
            className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-3 text-sm"
          >
            {row.href ? (
              <Link
                href={row.href}
                className="inline-flex items-center gap-1 font-medium text-green-700 hover:underline dark:text-green-500"
              >
                {row.day}
                <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <span className="font-medium text-zinc-800 dark:text-zinc-200">{row.day}</span>
            )}
            <div aria-hidden className="h-3 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className={`h-full rounded-full ${
                  row.count === max ? 'bg-green-600' : 'bg-green-600/45 dark:bg-green-500/40'
                }`}
                style={{ width: `${width}%` }}
              />
            </div>
            <span className="text-right text-zinc-600 tabular-nums dark:text-zinc-400">
              {row.count.toLocaleString('en-US')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Market rows: name and city, then day, hours and pill chips. */
export function TopicMarketList({ markets }: { markets: TopicMarketRow[] }) {
  return <TopicMarketCard markets={markets} />;
}

/** The FAQ block, mirrored exactly by the FAQPage JSON-LD above. */
function TopicFaqs({ data }: { data: TopicPageData }) {
  if (data.faqs.length === 0) return null;

  return <FaqSection items={data.faqs} />;
}

/** Links to the other three topic pages and back to the directory. */
function TopicCrossLinks({ current }: { current: TopicPageData['slug'] }) {
  const items: TopicChip[] = [
    ...TOPIC_SLUGS.filter((slug) => slug !== current).map((slug) => ({
      label: TOPIC_LABELS[slug],
      href: topicPath(slug),
    })),
    { label: 'All states', href: '/markets' },
  ];

  return (
    <section>
      <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Keep browsing
      </h2>
      <TopicChipRow items={items} />
    </section>
  );
}

export function TopicPageShell({
  data,
  children,
}: {
  data: TopicPageData;
  /** The page's own sections, between the opener and the FAQ block. */
  children: ReactNode;
}) {
  return (
    <>
      {structuredData(data).map((node, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }}
        />
      ))}

      <div className="flex min-h-[calc(100vh-4rem)] flex-col">
        <section className="w-full bg-gradient-to-b from-green-50 to-white py-6 sm:py-8 md:py-12 dark:from-green-900/20 dark:to-zinc-950">
          <div className={SITE_FRAME}>
            <div className="mx-auto w-full max-w-4xl">
              <Breadcrumbs
                items={[
                  { label: 'Markets', href: '/markets' },
                  { label: TOPIC_LABELS[data.slug], href: data.path },
                ]}
              />
              <h1 className="bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-2xl font-bold tracking-tighter text-transparent sm:text-3xl md:text-4xl">
                {data.heading}
              </h1>
              {/* Answer-first: the count is the first thing both a reader and
                  an extractive AI crawler see. */}
              <p className="mt-3 max-w-3xl text-base text-zinc-700 sm:text-lg dark:text-zinc-300">
                {data.answer}
              </p>
              <TopicStats stats={data.stats} />
            </div>
          </div>
        </section>

        <section className="w-full bg-white py-6 sm:py-8 md:py-10 dark:bg-zinc-900">
          <div className={SITE_FRAME}>
            <div className="mx-auto w-full max-w-4xl space-y-10">
              {children}
              <TopicFaqs data={data} />
              <TopicCrossLinks current={data.slug} />
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
