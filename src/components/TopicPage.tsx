import type { ReactNode } from 'react';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { FaqSection } from '@/components/FaqSection';
import { absoluteUrl } from '@/lib/site';
import {
  TOPIC_LABELS,
  TOPIC_SLUGS,
  topicPath,
  type TopicDayRow,
  type TopicMarketRow,
  type TopicPageData,
  type TopicStateRow,
} from '@/lib/topicPage';
import { SITE_FRAME } from '@/lib/ui';

/**
 * The one layout the four topic pages share.
 *
 * Each page supplies its view model from `src/lib/topicPage.ts` plus its own
 * sections as children; everything the four have in common — breadcrumbs, the
 * answer-first opener, the FAQ block, the CollectionPage/ItemList/FAQPage
 * JSON-LD and the cross-links to the other topics — lives here once, so the
 * pages cannot drift into four slightly different templates.
 *
 * Styling mirrors the city and state pages deliberately: same hero gradient,
 * same max width, same table and list treatments.
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

/** An h2 section with an optional one-line intro. Renders nothing when empty. */
export function TopicSection({
  heading,
  intro,
  children,
}: {
  heading: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{heading}</h2>
      {intro && (
        <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">{intro}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** State → count table. Every row links to that state's hub. */
export function TopicStateTable({
  states,
  caption,
  countHeading,
}: {
  states: TopicStateRow[];
  caption: string;
  countHeading: string;
}) {
  if (states.length === 0) return null;

  return (
    <div className="max-w-4xl overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[20rem] border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">
              State or region
            </th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">
              {countHeading}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {states.map((state) => (
            <tr key={state.slug} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
              <th scope="row" className="px-4 py-2.5 font-medium">
                <Link
                  href={state.href}
                  className="text-green-700 hover:underline dark:text-green-500"
                >
                  {state.name}
                </Link>
              </th>
              <td className="px-4 py-2.5 text-right text-zinc-600 tabular-nums dark:text-zinc-400">
                {state.count.toLocaleString('en-US')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Weekday → count table. Days with a page of their own link to it. */
export function TopicDayTable({
  days,
  caption,
  total,
}: {
  days: TopicDayRow[];
  caption: string;
  /** The denominator the share column is a percentage of. */
  total: number;
}) {
  if (days.length === 0) return null;

  return (
    <div className="max-w-4xl overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[24rem] border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">
              Day
            </th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">
              Markets
            </th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">
              Share of {total.toLocaleString('en-US')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {days.map((row) => (
            <tr key={row.day} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
              <th scope="row" className="px-4 py-2.5 font-medium">
                {row.href ? (
                  <Link
                    href={row.href}
                    className="text-green-700 hover:underline dark:text-green-500"
                  >
                    {row.day} markets
                  </Link>
                ) : (
                  row.day
                )}
              </th>
              <td className="px-4 py-2.5 text-right text-zinc-600 tabular-nums dark:text-zinc-400">
                {row.count.toLocaleString('en-US')}
              </td>
              <td className="px-4 py-2.5 text-right text-zinc-600 tabular-nums dark:text-zinc-400">
                {row.share === undefined ? '-' : `${row.share}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Market list: name → city → the details the record actually has. */
export function TopicMarketList({ markets }: { markets: TopicMarketRow[] }) {
  if (markets.length === 0) return null;

  return (
    <ul className="max-w-4xl divide-y divide-zinc-200 dark:divide-zinc-800">
      {markets.map((market) => {
        const details = [
          market.address,
          market.days.length > 0
            ? market.days.map((day) => day.slice(0, 3)).join(', ')
            : undefined,
          market.hours,
          market.season,
          ...market.tags,
        ].filter((detail): detail is string => Boolean(detail));

        return (
          <li key={market.slug} className="py-3 text-sm">
            <Link
              href={market.href}
              className="font-medium text-green-700 hover:underline dark:text-green-500"
            >
              {market.name}
            </Link>
            <span className="text-zinc-600 dark:text-zinc-400">
              {market.placeLabel && (
                <>
                  {' - '}
                  {market.placeHref ? (
                    <Link href={market.placeHref} className="hover:underline">
                      {market.placeLabel}
                    </Link>
                  ) : (
                    market.placeLabel
                  )}
                </>
              )}
              {details.map((detail) => ` · ${detail}`).join('')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The FAQ block, mirrored exactly by the FAQPage JSON-LD above. */
function TopicFaqs({ data }: { data: TopicPageData }) {
  if (data.faqs.length === 0) return null;

  return <FaqSection items={data.faqs} />;
}

/** Links to the other three topic pages and back to the directory. */
function TopicCrossLinks({ current }: { current: TopicPageData['slug'] }) {
  const others = TOPIC_SLUGS.filter((slug) => slug !== current);

  return (
    <section>
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Keep browsing</h2>
      <ul className="mt-4 space-y-2 text-sm">
        {others.map((slug) => (
          <li key={slug}>
            <Link
              href={topicPath(slug)}
              className="text-green-700 hover:underline dark:text-green-500"
            >
              {TOPIC_LABELS[slug]}
            </Link>
          </li>
        ))}
        <li>
          <Link href="/markets" className="text-green-700 hover:underline dark:text-green-500">
            Every state and region in the directory
          </Link>
        </li>
      </ul>
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
            <Breadcrumbs
              items={[
                { label: 'Markets', href: '/markets' },
                { label: TOPIC_LABELS[data.slug], href: data.path },
              ]}
            />
            <h1 className="bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-2xl font-bold tracking-tighter text-transparent sm:text-3xl md:text-4xl">
              {data.heading}
            </h1>
            {/* Answer-first: the counts are the first thing both a reader and
                an extractive AI crawler see. */}
            <p className="mt-4 max-w-3xl text-base text-zinc-700 sm:text-lg dark:text-zinc-300">
              {data.opener}
            </p>
          </div>
        </section>

        <section className="w-full bg-white py-6 sm:py-8 md:py-10 dark:bg-zinc-900">
          <div className={`${SITE_FRAME} space-y-10`}>
            {children}
            <TopicFaqs data={data} />
            <TopicCrossLinks current={data.slug} />
          </div>
        </section>
      </div>
    </>
  );
}
