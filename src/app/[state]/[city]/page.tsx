import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { CityMarkets } from '@/components/CityMarkets';
import { FaqSection } from '@/components/FaqSection';
import { NearbyMarkets } from '@/components/NearbyMarkets';
import { getCityPageData, type CityMarketRow, type CityPageData } from '@/lib/cityPage';
import { getAllCityParams } from '@/lib/geoIndex';
import { absoluteUrl } from '@/lib/site';
import { SITE_FRAME } from "@/lib/ui";

export const revalidate = 86400;
// Only the cities in the geo index exist; see the note on the state hub for
// why this root-level route does not render unknown params on demand.
export const dynamicParams = false;

/**
 * Prerender every city in the geo index (4,870 pages).
 *
 * The 8,807 market pages already prerender in ~10s, so there is no reason to
 * ship only the 556 cities with 3+ markets: a single-market city page is the
 * page that answers "farmers markets in {small town}", which is a query with
 * no competition at all. The genuinely thin ones are rendered but kept out of
 * the index instead — see `isThin` in `src/lib/cityPage.ts`.
 */
export async function generateStaticParams() {
  return getAllCityParams();
}

/**
 * Markets listed under one weekday heading.
 *
 * The day sections repeat rows that are already in the list, so in a city
 * like Rochester (64 markets, 14 of them on a Tuesday) an uncapped list pushed
 * the page past 5,900 words — well outside the 500–2,000 band that gets cited.
 * Ten keeps the heading's answer concrete and points the rest at the list.
 */
const DAY_SECTION_LIMIT = 10;

interface CityPageProps {
  params: Promise<{ state: string; city: string }>;
}

export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const { state, city } = await params;
  const data = await getCityPageData(state, city);

  if (!data) {
    return {
      title: 'City Not Found',
      description: 'No farmers markets were found for this city.',
      robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
    };
  }

  return {
    // `absolute` skips the layout's "%s | Farmer Markets" suffix, which would
    // push these titles past the SERP truncation point.
    title: { absolute: data.title },
    description: data.description,
    alternates: { canonical: data.path },
    openGraph: {
      title: data.title,
      description: data.description,
      url: data.path,
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title: data.title, description: data.description },
    // Every resolved city page is indexable. The one-market cities that used to
    // be `noindex` now render the nearest markets beyond the city instead
    // (`nearbyMarkets` in `src/lib/cityPage.ts`); Search Console reported the
    // old noindex on every one of them because the sitemap submitted them all.
  };
}

function DayRow({ row }: { row: CityMarketRow }) {
  return (
    <li className="py-2">
      <Link href={row.href} className="font-medium text-green-800 hover:underline dark:text-green-400">
        {row.name}
      </Link>
      {(row.hours || row.address) && (
        <span className="block text-zinc-600 dark:text-zinc-400">
          {[row.hours, row.address].filter(Boolean).join(', ')}
        </span>
      )}
    </li>
  );
}

/**
 * CollectionPage + ItemList + FAQPage, on absolute canonical URLs. The
 * BreadcrumbList is emitted by the `Breadcrumbs` component itself, from the
 * trail it renders.
 */
function structuredData(data: CityPageData) {
  const pageUrl = absoluteUrl(data.path);

  // The state and topic hubs already described themselves with a
  // CollectionPage; the city pages did not, which left them with no node that
  // could legally carry `dateModified` (a CreativeWork property — it does not
  // belong on an ItemList of places). The date is the newest `last_updated`
  // among the markets listed below, the same value the sitemap publishes as
  // this URL's `lastmod`, and is omitted rather than invented when no market
  // in the city carries one.
  const collectionPage = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Farmers Markets in ${data.city.name}, ${data.regionFull}`,
    description: data.description,
    url: pageUrl,
    ...(data.lastModified ? { dateModified: data.lastModified } : {}),
    about: { '@type': 'City', name: data.city.name },
  };

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Farmers markets in ${data.city.name}, ${data.regionFull}`,
    url: pageUrl,
    numberOfItems: data.rows.length,
    itemListElement: data.rows.map((row, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: row.name,
      url: absoluteUrl(row.href),
    })),
  };

  // Mirrors the rendered Q&A exactly — a FAQPage node that carries a question
  // the page does not show is a manual-action risk, not a rich result.
  const faqPage = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: data.faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };

  return [collectionPage, itemList, faqPage];
}

export default async function CityPage({ params }: CityPageProps) {
  const { state, city } = await params;
  const data = await getCityPageData(state, city);

  if (!data) notFound();

  const heading = `Farmers Markets in ${data.city.name}, ${data.regionFull}`;
  const busiest = [...data.dayGroups].sort((left, right) => right.rows.length - left.rows.length)[0];
  const facts = [
    { value: data.marketCount.toLocaleString(), label: 'farmers markets' },
    ...(data.snapCount > 0
      ? [{ value: data.snapCount.toLocaleString(), label: 'accept SNAP/EBT' }]
      : []),
    ...(busiest ? [{ value: busiest.day, label: 'is the busiest day' }] : []),
  ];

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
                { label: data.regionFull, href: data.stateHubPath },
                { label: data.city.name, href: data.path },
              ]}
            />
            <h1 className="bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-2xl font-bold tracking-tighter text-transparent sm:text-3xl md:text-4xl">
              {heading}
            </h1>
            {/* Answer-first: the count and the notable market are the first
                thing both a reader and an extractive AI crawler see. */}
            <p className="mt-4 max-w-3xl text-base text-zinc-700 sm:text-lg dark:text-zinc-300">
              {data.opener}
            </p>
            {data.marketCount > 1 && (
              <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3">
                {facts.map((fact) => (
                  <div key={fact.label} className="flex items-baseline gap-2">
                    <dd className="text-2xl font-bold tabular-nums tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
                      {fact.value}
                    </dd>
                    <dt className="text-sm text-zinc-600 dark:text-zinc-400">{fact.label}</dt>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </section>

        <section className="w-full bg-white py-6 sm:py-8 md:py-10 dark:bg-zinc-900">
          <div className={`${SITE_FRAME} space-y-10`}>
            <div>
              <h2 className="mb-4 text-xl font-bold tracking-tight sm:text-2xl">
                {data.marketCount === 1
                  ? `The farmers market in ${data.city.name}`
                  : `All ${data.marketCount} farmers markets in ${data.city.name}`}
              </h2>
              <CityMarkets
                rows={data.rows}
                cityName={data.city.name}
                regionFull={data.regionFull}
                days={data.dayGroups.map((group) => ({ day: group.day, count: group.rows.length }))}
                snapCount={data.snapCount}
              />
            </div>

            {data.dayGroups.length > 0 && (
              /* The week as a board: one column per trading day, so "what is
                 on this Saturday" is a glance across rather than a scroll. */
              <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
                {data.dayGroups.map((group) => (
                  <div key={group.day} className="border-t-2 border-green-700 pt-3 dark:border-green-600">
                    <h2 className="text-base font-bold tracking-tight">
                      {group.day} farmers markets in {data.city.name}
                    </h2>
                    <ul className="mt-2 divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                      {group.rows.slice(0, DAY_SECTION_LIMIT).map((row) => (
                        <DayRow key={row.slug} row={row} />
                      ))}
                    </ul>
                    {group.rows.length > DAY_SECTION_LIMIT && (
                      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                        {group.rows.length - DAY_SECTION_LIMIT} more {group.day} market
                        {group.rows.length - DAY_SECTION_LIMIT === 1 ? ' is' : 's are'} in the list
                        above.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <FaqSection items={data.faqs} />

            {data.nearby.length > 0 && (
              <NearbyMarkets
                markets={data.nearby}
                heading={`Farmers markets near ${data.city.name}`}
                headingClassName="text-xl font-bold tracking-tight sm:text-2xl"
              />
            )}

            {data.siblings.length > 0 && (
              <div>
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                  Other cities in {data.regionFull}
                </h2>
                <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
                  {data.siblings.map((sibling) => (
                    <li key={sibling.slug}>
                      <Link
                        href={sibling.href}
                        className="flex items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50 hover:underline dark:hover:bg-zinc-800"
                      >
                        <span className="truncate">{sibling.name}</span>
                        <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                          {sibling.marketCount}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-sm">
                  <Link
                    href={data.stateHubPath}
                    className="text-green-700 hover:underline dark:text-green-500"
                  >
                    Browse all {data.state.market_count.toLocaleString()} farmers markets in{' '}
                    {data.regionFull}
                  </Link>
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
