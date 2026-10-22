import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ComponentType } from 'react';
import { HandCoins, MapPin, Store } from 'lucide-react';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { CityDirectory } from '@/components/CityDirectory';
import { LazyPlacesMap } from '@/components/LazyPlacesMap';
import { WeekStrip } from '@/components/WeekStrip';
import { getAllStateParams, getStatePageData, type StatePageData, type StateWeekdayCount } from '@/lib/statePage';
import { topicPath } from '@/lib/topicPage';
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

type Icon = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

interface StatChip {
  icon: Icon;
  value: number;
  label: string;
  href?: string;
}

const chipClass =
  'inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-sm text-zinc-800 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200';

function StatChips({ chips }: { chips: StatChip[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const Glyph = chip.icon;
        const body = (
          <>
            <Glyph aria-hidden className="h-4 w-4 shrink-0 text-green-700 dark:text-green-500" />
            <span className="font-semibold tabular-nums">{chip.value.toLocaleString()}</span>
            {chip.label}
          </>
        );
        return (
          <li key={chip.label}>
            {chip.href ? (
              <Link
                href={chip.href}
                className={`${chipClass} transition-colors hover:border-green-600/40 hover:bg-green-50 dark:hover:border-green-500/40 dark:hover:bg-green-900/20`}
              >
                {body}
              </Link>
            ) : (
              <span className={chipClass}>{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Seven bars, Monday to Sunday: how many of the state's markets open each day. */
function WeekBars({ counts }: { counts: StateWeekdayCount[] }) {
  const max = Math.max(...counts.map((entry) => entry.count), 1);
  return (
    <figure className="w-full max-w-xs">
      <figcaption className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Markets by day
      </figcaption>
      <ol className="flex h-24 items-end gap-1.5">
        {counts.map((entry) => (
          <li key={entry.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
              {entry.count.toLocaleString()}
            </span>
            <span
              aria-hidden="true"
              className="w-full rounded-md bg-green-600 dark:bg-green-500"
              style={{ height: `${Math.max(4, (entry.count / max) * 64)}px` }}
            />
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300" title={entry.day}>
              <span aria-hidden="true">{entry.day.slice(0, 1)}</span>
              <span className="sr-only">{entry.day}</span>
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

export default async function StateHubPage({ params }: StatePageProps) {
  const { state: stateSlug } = await params;
  const data = await getStatePageData(stateSlug);

  if (!data) notFound();

  const topCities = data.cities.length >= TOP_CITIES_MIN ? data.cities.slice(0, TOP_CITIES) : [];
  const topCount = topCities[0]?.marketCount ?? 1;
  const chips: StatChip[] = [
    { icon: Store, value: data.marketCount, label: data.marketCount === 1 ? 'market' : 'markets' },
    ...(data.cityCount > 0
      ? [{ icon: MapPin, value: data.cityCount, label: data.cityCount === 1 ? 'town' : 'towns' }]
      : []),
    ...(data.snapCount > 0
      ? [{ icon: HandCoins, value: data.snapCount, label: 'take SNAP/EBT', href: topicPath('snap-ebt') }]
      : []),
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
        <section className="w-full bg-gradient-to-b from-green-50 to-white py-6 sm:py-8 md:py-10 dark:from-green-900/20 dark:to-zinc-950">
          <div className={`${SITE_FRAME} flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between`}>
            <div>
              <Breadcrumbs
                items={[
                  { label: 'Markets', href: '/markets' },
                  { label: data.regionFull, href: data.path },
                ]}
              />
              <h1 className="bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-2xl font-bold tracking-tighter text-transparent sm:text-3xl md:text-4xl">
                Farmers Markets in {data.regionFull}
              </h1>
              <div className="mt-4">
                <StatChips chips={chips} />
              </div>
              {data.summary && (
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400 sm:text-base">{data.summary}</p>
              )}
            </div>
            {data.weekdayCounts.length > 0 && <WeekBars counts={data.weekdayCounts} />}
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
                    <h2 className="mb-4 text-xl font-bold tracking-tight sm:text-2xl">Map</h2>
                    <div className="h-72 sm:h-96 lg:h-[30rem]">
                      <LazyPlacesMap
                        places={data.mapPoints}
                        region={data.regionFull}
                        className="h-full w-full"
                      />
                    </div>
                  </div>
                )}

                {topCities.length > 0 && (
                  <div>
                    <h2 className="mb-4 text-xl font-bold tracking-tight sm:text-2xl">Top cities</h2>
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
                                {city.marketCount}
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
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Notable markets</h2>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {data.notableMarkets.map((market) => (
                    <li
                      key={market.slug}
                      className="group relative flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors hover:border-green-600/40 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-green-500/40"
                    >
                      <h3 className="text-base font-semibold leading-snug">
                        <Link
                          href={market.href}
                          className="text-zinc-900 after:absolute after:inset-0 after:rounded-2xl after:content-[''] group-hover:text-green-700 dark:text-zinc-50 dark:group-hover:text-green-400"
                        >
                          {market.name}
                        </Link>
                      </h3>
                      <p className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                        <MapPin aria-hidden className="h-3.5 w-3.5 shrink-0 text-green-700 dark:text-green-500" />
                        <Link href={market.cityHref} className="relative z-10 underline-offset-2 hover:underline">
                          {market.cityName}
                        </Link>
                      </p>
                      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-1 text-sm text-zinc-700 dark:text-zinc-300">
                        <WeekStrip days={market.days} />
                        {market.hours && <span className="tabular-nums">{market.hours}</span>}
                        {market.snap && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
                            <HandCoins aria-hidden className="h-3.5 w-3.5" />
                            SNAP/EBT
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.cities.length > 0 && (
              <div>
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                  {data.cityCount === 1 ? 'Town' : 'Cities and towns'}
                </h2>
                <CityDirectory cities={data.cities} regionFull={data.regionFull} />
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
