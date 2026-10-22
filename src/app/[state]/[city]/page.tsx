import type { Metadata } from 'next';
import type { ComponentType, ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, CalendarDays, HandCoins, Store } from 'lucide-react';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { CityGuide } from '@/components/CityGuide';
import { CityMarkets } from '@/components/CityMarkets';
import { FaqSection } from '@/components/FaqSection';
import { NearbyMarkets } from '@/components/NearbyMarkets';
import { getCityPageData, type CityPageData } from '@/lib/cityPage';
import { SNAP_HASH, dayHash } from '@/lib/cityPageView';
import { getAllCityParams } from '@/lib/geoIndex';
import { absoluteUrl } from '@/lib/site';
import { SITE_FRAME } from "@/lib/ui";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { CityPromptContext } from "@/components/CityPromptContext";

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

type Icon = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

const STAT_CHIP =
  'inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200';
const STAT_LINK =
  'transition-colors hover:border-green-600 hover:text-green-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 dark:hover:border-green-500 dark:hover:text-green-400';

/** One stat as a chip; a link when it can filter the list below. */
function StatChip({ icon: Glyph, href, children }: { icon: Icon; href?: string; children: ReactNode }) {
  const body = (
    <>
      <Glyph aria-hidden className="h-4 w-4 shrink-0 text-green-700 dark:text-green-500" />
      {children}
    </>
  );
  return (
    <li>
      {href ? (
        <a href={href} className={`${STAT_CHIP} ${STAT_LINK}`}>
          {body}
        </a>
      ) : (
        <span className={STAT_CHIP}>{body}</span>
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

  // Mirrors the rendered Q&A exactly: a FAQPage node that carries a question
  // the page does not show is a manual-action risk, not a rich result. No
  // visible FAQ, no node.
  if (data.faqs.length === 0) return [collectionPage, itemList];
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
  // The SNAP chip filters only when it would narrow the list.
  const snapFilters = data.snapCount > 0 && data.snapCount < data.marketCount;

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
        <section className="w-full bg-gradient-to-b from-green-50 to-white py-6 sm:py-8 dark:from-green-900/20 dark:to-zinc-950">
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
            {/* Answer-first, at a glance: how many, which day, who takes
                SNAP. Each chip that can narrow the list links to that filter. */}
            {data.marketCount > 1 && (
              <ul className="mt-4 flex flex-wrap gap-2" aria-label={`${data.city.name} at a glance`}>
                <StatChip icon={Store} href="#markets">
                  <strong className="font-semibold tabular-nums">{data.marketCount}</strong> markets
                </StatChip>
                {data.busiest && (
                  <StatChip icon={CalendarDays} href={`#${dayHash(data.busiest.day)}`}>
                    Busiest on <strong className="font-semibold">{data.busiest.day}</strong>
                    <span className="text-zinc-500 tabular-nums dark:text-zinc-400">
                      {data.busiest.count}
                    </span>
                  </StatChip>
                )}
                {data.snapCount > 0 && (
                  <StatChip icon={HandCoins} href={snapFilters ? `#${SNAP_HASH}` : undefined}>
                    {snapFilters ? (
                      <>
                        <strong className="font-semibold tabular-nums">{data.snapCount}</strong> take SNAP/EBT
                      </>
                    ) : (
                      'All take SNAP/EBT'
                    )}
                  </StatChip>
                )}
              </ul>
            )}
            {data.summary && (
              <p className="mt-3 max-w-3xl text-sm text-zinc-600 sm:text-base dark:text-zinc-400">
                {data.summary}
              </p>
            )}
          </div>
        </section>

        <section className="w-full bg-white py-6 sm:py-8 dark:bg-zinc-900">
          <div className={`${SITE_FRAME} space-y-12`}>
            <div id="markets" className="scroll-mt-24">
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

            {data.guide && <CityGuide guide={data.guide} />}

            <FaqSection items={data.faqs} />

            {data.nearby.length > 0 && (
              <NearbyMarkets
                markets={data.nearby}
                heading={`Farmers markets near ${data.city.name}`}
                headingClassName="text-xl font-bold tracking-tight sm:text-2xl"
              />
            )}

            <nav aria-labelledby="more-cities-heading">
              <h2
                id="more-cities-heading"
                className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
              >
                More cities in {data.regionFull}
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {data.siblings.map((sibling) => (
                  <li key={sibling.slug}>
                    <Link
                      href={sibling.href}
                      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-800 transition-colors hover:border-green-600 hover:text-green-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-green-500 dark:hover:text-green-400"
                    >
                      {sibling.name}
                      <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                        {sibling.marketCount}
                      </span>
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href={data.stateHubPath}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-green-700 hover:underline dark:text-green-500"
                  >
                    All {data.state.market_count.toLocaleString()} in {data.regionFull}
                    <ArrowRight aria-hidden className="h-4 w-4" />
                  </Link>
                </li>
              </ul>
            </nav>

            <CityPromptContext name={data.city.name} stateName={data.regionFull} />
            <NewsletterSignup
              source="city"
              heading={`Get ${data.city.name} market days in your inbox`}
              blurb={`Markets near ${data.city.name} and what's in season, no more than once a week.`}
            />
          </div>
        </section>
      </div>
    </>
  );
}
