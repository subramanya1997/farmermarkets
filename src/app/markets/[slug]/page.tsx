import { getMarketBySlug, getMarkets, getSlugByLegacyId } from "@/lib/data";
import { getMarketAddress } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { notFound, permanentRedirect } from "next/navigation";
import ClientSingleMarketMap from "@/components/ClientSingleMarketMap";
import { MarketDetailAnalytics } from "@/components/MarketDetailAnalytics";
import { TrackedExternalLink } from "@/components/TrackedExternalLink";
import Link from "next/link";
import { Metadata } from "next";
import { SITE_URL, absoluteUrl } from "@/lib/site";
import { getCityForMarketSlug } from "@/lib/geoIndex";
import { cityPath } from "@/lib/cityPage";
import { statePath } from "@/lib/statePage";
import { displayName, marketDescription, marketLocationLine, marketTitle } from "@/lib/seo";
import { composedSummary } from "@/lib/marketFacts";
import { getMarketProse } from "@/lib/marketProse";
import { getNearbyMarkets } from "@/lib/nearby";
import { getMarketProvenance } from "@/lib/provenance";
import { marketFaqs, marketSchemaGraph } from "@/lib/schema";
import { MarketFaq } from "@/components/MarketFaq";
import { MarketFacts } from "@/components/MarketFacts";
import { MarketFreshnessNotice } from "@/components/MarketFreshnessNotice";
import { MarketSourceNote } from "@/components/MarketSourceNote";
import { NearbyMarkets } from "@/components/NearbyMarkets";
import { SITE_FRAME } from "@/lib/ui";

export const revalidate = 86400;
// Slugs outside generateStaticParams (legacy numeric IDs, records added by a
// data refresh) are still rendered on demand and then held in the ISR cache.
export const dynamicParams = true;

/**
 * Prerender every market.
 *
 * Measured on this repo: the full 8,807-page prerender adds ~10s to
 * `next build` (whole build ~15s wall) and peaks well under 1 GB, so there is
 * no reason to prerender only a subset. If a much larger dataset ever makes
 * that too slow or memory-hungry, narrow this to a deterministic subset (e.g.
 * the ~2,000 markets with `operations.days` populated, or the first N by
 * slug) — `dynamicParams = true` above means the rest keep working, they just
 * pay one cold render before landing in the ISR cache.
 */
export async function generateStaticParams() {
  const markets = await getMarkets();
  return markets
    .filter((market) => market.slug)
    .map((market) => ({ slug: market.slug }));
}

/**
 * Absolute URL of this market's Open Graph card (`opengraph-image.tsx` in this
 * folder), used as the LocalBusiness JSON-LD `image`. Google requires an
 * `image` for LocalBusiness rich results, and the per-market card at least
 * names the place — the old value pointed every one of the 8,807 pages at the
 * same site-wide file.
 *
 * The `og:image` / `twitter:image` meta tags are NOT set here: Next wires the
 * `opengraph-image` file convention into the page metadata itself, and a
 * manual `openGraph.images` entry would override it.
 */
function marketImageUrl(slug: string): string {
  return absoluteUrl(`/markets/${slug}/opengraph-image`);
}

interface MarketDetailPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({ params }: MarketDetailPageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const market = await getMarketBySlug(resolvedParams.slug);

  if (!market) {
    // This response is a 404 (the page calls notFound()). Never let the
    // root layout's `robots: index, follow` leak onto an error page.
    return {
      title: 'Market Not Found',
      description: 'The requested farmer market could not be found.',
      robots: {
        index: false,
        follow: false,
        googleBot: { index: false, follow: false },
      },
    };
  }

  // Both are built entirely from fields this record actually has (see
  // src/lib/seo.ts) — an empty field drops its clause instead of rendering an
  // empty slot, and the title is capped at 60 characters.
  const title = marketTitle(market);
  const description = marketDescription(market);
  const path = `/markets/${resolvedParams.slug}`;

  return {
    // `absolute` bypasses the root layout's "%s | Farmer Markets" template:
    // the suffix pushed every market title past the SERP truncation point and
    // added nothing a searcher was looking for.
    title: { absolute: title },
    description,
    openGraph: {
      title,
      description,
      url: path,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    alternates: {
      canonical: path,
    },
  };
}

export default async function MarketDetailPage({
  params
}: MarketDetailPageProps) {
  // Safely extract the slug
  const resolvedParams = await params;
  const slug = resolvedParams?.slug;

  if (!slug) {
    console.error("Market slug is undefined");
    notFound();
  }

  const market = await getMarketBySlug(slug);

  if (!market) {
    // Legacy `/markets/{numericId}` URLs (still in Google's index from before
    // the slug migration) permanently redirect to the current slug URL.
    if (/^\d+$/.test(slug)) {
      const legacySlug = await getSlugByLegacyId(slug);
      if (legacySlug) {
        permanentRedirect(`/markets/${legacySlug}`);
      }
    }

    console.error(`No market found with slug: ${slug}`);
    notFound();
  }

  const rawAddress = getMarketAddress(market);
  const address = rawAddress.replace(/^[,\s]+/, '').trim();
  const hasAddress = Boolean(address) && address !== ',';

  // The record's own words where they are its own — `getMarketProse` drops the
  // per-source blurbs that hundreds of records share — otherwise a summary
  // composed from the fields this record does have. Both replace the two
  // paragraphs that used to be byte-identical on all 8,807 pages.
  const prose = await getMarketProse(market);
  const summary = prose.about.length ? [] : composedSummary(market);

  // "Durham, North Carolina" — deduplicated, and undefined (rather than an
  // empty string that rendered as a blank subtitle) when the record has no
  // usable location at all.
  const cityStateDisplay = marketLocationLine(market);

  // The city page this market is listed on, when the geo index placed it in a
  // city. Linking the location line both gives the reader the obvious next
  // step ("what else is open here?") and gives the city pages an inbound link
  // from every market they list, which is how they get crawled at all.
  const placement = await getCityForMarketSlug(market.slug);
  const cityPageHref = placement
    ? cityPath(placement.state.slug, placement.city.slug)
    : undefined;

  // Home › Markets › {State} › {City} › {Market}. The two geographic tiers are
  // dropped for the ~2,200 records the geo index could not place in a city,
  // rather than linking a breadcrumb at a page that does not exist. The
  // `Breadcrumbs` component emits the matching BreadcrumbList JSON-LD.
  const breadcrumbItems = [
    { label: 'Markets', href: '/markets' },
    ...(placement
      ? [
          { label: placement.state.name, href: statePath(placement.state.slug) },
          { label: placement.city.name, href: cityPath(placement.state.slug, placement.city.slug) },
        ]
      : []),
    { label: displayName(market.name), href: `/markets/${market.slug}` },
  ];

  // Get coordinates from location object
  const latitude = market.location?.lat;
  const longitude = market.location?.lon;

  const marketType = market.organization_types?.find((type) => type !== 'Official government dataset');
  const analyticsProperties = {
    market_id: market.id,
    market_name: market.name.slice(0, 80),
    country: market.country,
    market_type: marketType,
    source_id: market.provenance?.source_id
  };

  // The five nearest markets by great-circle distance, from a half-degree grid
  // built once per server process (see src/lib/nearby.ts) — a per-page scan of
  // all 8,451 geocoded records would be 74M distance calls across the build.
  const nearby = await getNearbyMarkets(market);

  // Publisher, dataset and fetch date for the 1,975 official records; null for
  // the legacy ones, which name no publisher to credit.
  const provenance = await getMarketProvenance(market);

  // One `@graph` per page: GroceryStore/LocalBusiness, the recurring Event
  // when a day *and* a time are known, and the FAQPage mirroring the visible
  // block below. Every property is built from fields this record actually has
  // (see src/lib/schema.ts) — the old node claimed "Cash", "$$" and free-text
  // `openingHours` on all 8,807 pages, and emitted empty geo/address nodes.
  // BreadcrumbList stays in `Breadcrumbs`, which renders the trail it declares.
  const jsonLd = marketSchemaGraph(market, {
    siteUrl: SITE_URL,
    imageUrl: marketImageUrl(market.slug),
  });

  // The same list the FAQPage node quotes, so markup and page can never drift.
  const faqs = marketFaqs(market);

  return (
    <>
      <MarketDetailAnalytics
        marketId={market.id}
        marketName={market.name}
        country={market.country}
        marketType={marketType}
        sourceId={market.provenance?.source_id}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="flex flex-col min-h-[calc(100vh-4rem)]">
        {/* Header Section */}
        <section className="w-full py-6 sm:py-8 md:py-12 bg-gradient-to-b from-green-50 to-white dark:from-green-900/20 dark:to-zinc-950">
          <div className={SITE_FRAME}>
            <div className="flex flex-col gap-3 sm:gap-4">
              <Breadcrumbs items={breadcrumbItems} />
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tighter bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                {displayName(market.name)}
              </h1>
              {cityStateDisplay && (
                <p className="text-base sm:text-lg md:text-xl text-zinc-600 dark:text-zinc-400">
                  {cityPageHref ? (
                    <Link
                      href={cityPageHref}
                      className="hover:text-green-700 hover:underline dark:hover:text-green-500"
                    >
                      {cityStateDisplay}
                    </Link>
                  ) : (
                    cityStateDisplay
                  )}
                </p>
              )}
              {/* "Last verified in 2020", or "no longer in the USDA
                  directory" — high enough on the page to be honest, muted
                  enough not to read as an alarm. Renders nothing for a record
                  whose date does not support the claim. */}
              <MarketFreshnessNotice market={market} />
            </div>
          </div>
        </section>

        {/* Content Section */}
        <section className="w-full py-6 sm:py-8 md:py-12 bg-white dark:bg-zinc-900">
          <div className={SITE_FRAME}>
            <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] 2xl:grid-cols-[minmax(0,1fr)_32rem] 2xl:gap-10">
              {/* Main content */}
              <div>
                <div className="max-w-none">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-3 sm:mb-4">
                    About {displayName(market.name)}
                  </h2>
                  {/* The market's own description where the record has one,
                      otherwise a summary composed from its schedule, size,
                      setting and programs — every clause backed by a field
                      this record actually carries. */}
                  {(prose.about.length ? prose.about : summary).map((paragraph) => (
                    <p
                      key={paragraph}
                      className="mb-3 max-w-[75ch] text-sm sm:text-base text-zinc-600 last:mb-0 dark:text-zinc-400"
                    >
                      {paragraph}
                    </p>
                  ))}

                  {prose.location.length > 0 && (
                    <div className="mt-6 sm:mt-8">
                      <h3 className="text-lg sm:text-xl font-bold tracking-tight mb-3 sm:mb-4">
                        Finding the market
                      </h3>
                      {prose.location.map((paragraph) => (
                        <p
                          key={paragraph}
                          className="mb-3 max-w-[75ch] text-sm sm:text-base text-zinc-600 last:mb-0 dark:text-zinc-400"
                        >
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Days, hours, season, vendors, setting, what is sold,
                      amenities, payment, ordering, phone, website, socials —
                      only the rows this record can fill. */}
                  <MarketFacts market={market} analyticsProperties={analyticsProperties} />

                  {/* Answers in the words searchers type, in the HTML itself:
                      AI answer engines extract visible text on a direct fetch
                      and never run the JSON-LD. */}
                  <MarketFaq faqs={faqs} />

                  <NearbyMarkets
                    markets={nearby}
                    cityHref={cityPageHref}
                    cityName={placement?.city.name}
                  />

                  <MarketSourceNote provenance={provenance} lastUpdated={market.last_updated} />
                </div>
              </div>

              {/* Location card. One instance, ordered first on a narrow screen
                  and into the right-hand column on a wide one — rendering it
                  twice put two <h2>Location</h2> headings in every page's
                  HTML, which is one heading more than the page has sections. */}
              <div className="order-first lg:order-none">
                <Card className="sticky top-24 bg-white dark:bg-zinc-800">
                  <CardContent className="p-4 sm:p-6">
                    <h2 className="text-xl font-semibold mb-4">Location</h2>
                    {hasAddress && (
                      <address className="mb-4 not-italic text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                        {address}
                      </address>
                    )}
                    <div className="rounded-lg overflow-hidden">
                      <ClientSingleMarketMap market={market} height="300px" />
                    </div>
                    {latitude && longitude && (
                      <div className="mt-4">
                        <TrackedExternalLink
                          href={`https://www.openstreetmap.org/directions?from=&to=${latitude}%2C${longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full block"
                          eventName="Market Directions Opened"
                          eventProperties={{ ...analyticsProperties, destination: 'openstreetmap' }}
                        >
                          <Button className="w-full bg-green-600 hover:bg-green-700">Get Directions</Button>
                        </TrackedExternalLink>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
