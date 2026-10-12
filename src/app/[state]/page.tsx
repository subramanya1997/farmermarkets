import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { CityDirectory } from '@/components/CityDirectory';
import { LazyPlacesMap } from '@/components/LazyPlacesMap';
import { WeekStrip } from '@/components/WeekStrip';
import { getAllStateParams, getStatePageData, type StatePageData } from '@/lib/statePage';
import { absoluteUrl } from '@/lib/site';
import { SITE_FRAME } from "@/lib/ui";

export const revalidate = 86400;
// This segment sits at the site root, so it also catches every mistyped or
// probed top-level URL (`/wp-login`, `/admin`). Only the states in the geo
// index exist; everything else is a static 404 that never invokes a render.
// A state added by a data refresh arrives with the deploy that refresh's
// commit triggers.
export const dynamicParams = false;

/**
 * The state hub at `/{state}` (`/new-york`).
 *
 * It lived at `/farmers-markets/{state}` until October 2026, and at
 * `/markets/state/{state}` before that; both 308 here (`next.config.ts` and
 * the retired route respectively). The hub is keyed on the geo index, where
 * "NY" and "New York" are one entry rather than two competing pages.
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

/** How many cities the "most markets" ranking shows. */
const TOP_CITIES = 8;
/** A state with fewer cities than this is fully covered by the A to Z list. */
const TOP_CITIES_MIN = 12;

export default async function StateHubPage({ params }: StatePageProps) {
  const { state: stateSlug } = await params;
  const data = await getStatePageData(stateSlug);

  if (!data) notFound();

  const topCities = data.cities.length >= TOP_CITIES_MIN ? data.cities.slice(0, TOP_CITIES) : [];
  const topCount = topCities[0]?.marketCount ?? 1;
  const facts = [
    { value: data.marketCount, label: data.marketCount === 1 ? 'farmers market' : 'farmers markets' },
    ...(data.cityCount > 0
      ? [{ value: data.cityCount, label: data.cityCount === 1 ? 'city' : 'cities and towns' }]
      : []),
    ...(data.snapCount > 0 ? [{ value: data.snapCount, label: 'accept SNAP/EBT' }] : []),
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
            <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3">
              {facts.map((fact) => (
                <div key={fact.label} className="flex items-baseline gap-2">
                  <dd className="text-2xl font-bold tabular-nums tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
                    {fact.value.toLocaleString()}
                  </dd>
                  <dt className="text-sm text-zinc-600 dark:text-zinc-400">{fact.label}</dt>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="w-full bg-white py-6 sm:py-8 md:py-10 dark:bg-zinc-900">
          <div className={`${SITE_FRAME} space-y-12`}>
            {(data.mapPoints.length > 0 || topCities.length > 0) && (
              <div
                className={
                  data.mapPoints.length > 0 && topCities.length > 0
                    ? 'grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'
                    : ''
                }
              >
                {data.mapPoints.length > 0 && (
                  <div>
                    <h2 className="mb-4 text-xl font-bold tracking-tight sm:text-2xl">
                      Map of farmers markets in {data.regionFull}
                    </h2>
                    <div className="h-72 sm:h-96 lg:h-[30rem]">
                      <LazyPlacesMap
                        places={data.mapPoints}
                        region={data.regionFull}
                        className="h-full w-full"
                      />
                    </div>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                      Each dot is one market. Select a dot to open that market.
                    </p>
                  </div>
                )}

                {topCities.length > 0 && (
                  <div>
                    <h2 className="mb-4 text-xl font-bold tracking-tight sm:text-2xl">
                      Cities with the most markets
                    </h2>
                    <ol className="space-y-1">
                      {topCities.map((city) => (
                        <li key={city.slug}>
                          <Link
                            href={city.href}
                            className="group block rounded-lg px-2 py-2 hover:bg-green-50 dark:hover:bg-green-900/20"
                          >
                            <span className="flex items-baseline justify-between gap-3">
                              <span className="font-medium text-green-800 group-hover:underline dark:text-green-400">
                                {city.name}
                              </span>
                              <span className="text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
                                {city.marketCount} {city.marketCount === 1 ? 'market' : 'markets'}
                              </span>
                            </span>
                            {/* The bar is the count again, drawn to scale
                                against the state's biggest city. */}
                            <span
                              aria-hidden="true"
                              className="mt-1.5 block h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800"
                            >
                              <span
                                className="block h-full rounded-full bg-green-600"
                                style={{ width: `${Math.max(3, (city.marketCount / topCount) * 100)}%` }}
                              />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}

            {data.notableMarkets.length > 0 && (
              <div>
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                  Notable farmers markets in {data.regionFull}
                </h2>
                <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
                  The records with the most complete opening details.
                </p>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {data.notableMarkets.map((market) => (
                    <li
                      key={market.slug}
                      className="group relative flex flex-col rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-green-600/60 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-green-500/60"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-base font-semibold leading-snug">
                          <Link
                            href={market.href}
                            className="text-green-800 after:absolute after:inset-0 after:rounded-xl after:content-[''] group-hover:underline dark:text-green-400"
                          >
                            {market.name}
                          </Link>
                        </h3>
                        {market.snap && (
                          <span className="shrink-0 rounded-md bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            SNAP/EBT
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                        {market.address ? `${market.address}, ` : ''}
                        <Link href={market.cityHref} className="relative z-10 underline-offset-2 hover:underline">
                          {market.cityName}
                        </Link>
                      </p>
                      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-3 text-sm text-zinc-700 dark:text-zinc-300">
                        <WeekStrip days={market.days} />
                        {market.hours && <span>{market.hours}</span>}
                      </div>
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
                  Listed A to Z. The number after each city is how many markets it lists.
                </p>
                <CityDirectory cities={data.cities} regionFull={data.regionFull} />
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
