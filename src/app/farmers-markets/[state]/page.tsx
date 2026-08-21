import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { getStateByCode } from '@/lib/geoIndex';
import {
  getAllStateParams,
  getStatePageData,
  statePath,
  type StatePageData,
} from '@/lib/statePage';
import { absoluteUrl } from '@/lib/site';
import { SITE_FRAME } from "@/lib/ui";

export const revalidate = 86400;
// States added by a data refresh still render on demand and land in the ISR
// cache; anything not in the geo index 404s below.
export const dynamicParams = true;

/**
 * The state hub at `/farmers-markets/{state}`.
 *
 * This replaces `/markets/state/{state}`, which filtered on the raw `state`
 * value in the records and therefore published "NY" and "New York" as two
 * separate pages competing for one query. The hub is keyed on the geo index,
 * where those spellings are already one entry, and the old URLs 308 here.
 *
 * All 60 states/regions prerender — the deepest one lists 461 cities, which is
 * a few hundred KB of HTML, so there is no reason to render any of them lazily.
 */
export async function generateStaticParams() {
  return getAllStateParams();
}

interface StatePageProps {
  params: Promise<{ state: string }>;
}

export async function generateMetadata({ params }: StatePageProps): Promise<Metadata> {
  const { state } = await params;
  const data = await getStatePageData(state);

  if (!data) {
    return {
      title: 'State Not Found',
      description: 'No farmers markets were found for this state.',
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
    // A region whose markets never resolved to a city has no directory to
    // show. The URL stays linked and crawlable; it just does not ask to be
    // indexed.
    ...(data.noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

/** CollectionPage + ItemList (the cities), on absolute canonical URLs. */
function structuredData(data: StatePageData) {
  const pageUrl = absoluteUrl(data.path);

  // `dateModified` is a CreativeWork property and CollectionPage is a WebPage,
  // so it belongs on this node rather than on the AdministrativeArea — the
  // same rule `schema.ts` follows for market pages. The value is the newest
  // `last_updated` among the markets the hub covers, which is also the
  // `lastmod` the sitemap publishes for this URL. Omitted, never invented,
  // when no market here carries a date.
  const collectionPage = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Farmers Markets in ${data.regionFull}`,
    description: data.description,
    url: pageUrl,
    ...(data.lastModified ? { dateModified: data.lastModified } : {}),
    about: { '@type': 'AdministrativeArea', name: data.regionFull },
  };

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Cities with farmers markets in ${data.regionFull}`,
    url: pageUrl,
    numberOfItems: data.cities.length,
    itemListElement: data.cities.map((city, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: city.name,
      url: absoluteUrl(city.href),
    })),
  };

  return data.cities.length > 0 ? [collectionPage, itemList] : [collectionPage];
}

export default async function StateHubPage({ params }: StatePageProps) {
  const { state: stateSlug } = await params;
  const data = await getStatePageData(stateSlug);

  if (!data) {
    // `/farmers-markets/ny` resolves to New York but is not its canonical URL;
    // send it to the slug rather than serving the page twice.
    const canonical = await getStateByCode(stateSlug);
    if (canonical && canonical.slug !== stateSlug.trim().toLowerCase()) {
      permanentRedirect(statePath(canonical.slug));
    }
    notFound();
  }

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
                { label: data.regionFull, href: data.path },
              ]}
            />
            <h1 className="bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-2xl font-bold tracking-tighter text-transparent sm:text-3xl md:text-4xl">
              Farmers Markets in {data.regionFull}
            </h1>
            {/* Answer-first: the counts and the biggest city are the first
                thing both a reader and an extractive AI crawler see. */}
            <p className="mt-4 max-w-3xl text-base text-zinc-700 sm:text-lg dark:text-zinc-300">
              {data.opener}
            </p>
          </div>
        </section>

        <section className="w-full bg-white py-6 sm:py-8 md:py-10 dark:bg-zinc-900">
          <div className={`${SITE_FRAME} space-y-10`}>
            {data.notableMarkets.length > 0 && (
              <div>
                <h2 className="mb-4 text-xl font-bold tracking-tight sm:text-2xl">
                  Notable farmers markets in {data.regionFull}
                </h2>
                <p className="mb-4 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
                  The records with the most complete opening details.
                </p>
                <ul className="max-w-4xl divide-y divide-zinc-200 dark:divide-zinc-800">
                  {data.notableMarkets.map((market) => (
                    <li key={market.slug} className="py-3">
                      <Link
                        href={market.href}
                        className="font-medium text-green-700 hover:underline dark:text-green-500"
                      >
                        {market.name}
                      </Link>
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {' - '}
                        <Link href={market.cityHref} className="hover:underline">
                          {market.cityName}
                        </Link>
                        {[
                          market.address,
                          market.days.length > 0
                            ? market.days.map((day) => day.slice(0, 3)).join(', ')
                            : undefined,
                          market.hours,
                          market.snap ? 'SNAP' : undefined,
                        ]
                          .filter(Boolean)
                          .map((detail) => ` · ${detail}`)
                          .join('')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.cities.length > 0 && (
            <div>
              <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                {data.cityCount === 1
                  ? `The city with farmers markets in ${data.regionFull}`
                  : `All ${data.cityCount.toLocaleString()} cities with farmers markets in ${data.regionFull}`}
              </h2>
              <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
                Ordered by number of markets. The number after each city is how many markets it
                lists.
              </p>
              <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
                {data.cities.map((city) => (
                  <li key={city.slug}>
                    <Link
                      href={city.href}
                      className="flex items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50 hover:underline dark:hover:bg-zinc-800"
                    >
                      <span className="truncate">{city.name}</span>
                      <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                        {city.marketCount}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {data.uncategorizedCount > 0 && (
                <p className="mt-4 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
                  {data.uncategorizedCount.toLocaleString()} more {data.regionFull} market
                  {data.uncategorizedCount === 1 ? '' : 's'} in the data name no city and are not
                  listed above.
                </p>
              )}
            </div>
            )}

            {data.cities.length === 0 && (
              <p className="max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
                None of the {data.marketCount.toLocaleString()} {data.regionFull} market
                {data.marketCount === 1 ? '' : 's'} in the data names a city, so there is no city
                directory for this region yet.
              </p>
            )}

            <p className="text-sm">
              <Link
                href="/markets"
                className="text-green-700 hover:underline dark:text-green-500"
              >
                Browse every state and region in the directory
              </Link>
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
