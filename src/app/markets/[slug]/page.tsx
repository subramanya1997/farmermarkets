import { getMarketBySlug, getMarkets, getSlugByLegacyId } from "@/lib/data";
import { getMarketProducts, getMarketHours, getMarketAddress } from "@/lib/api";
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
import { marketDescription, marketLocationLine, marketTitle } from "@/lib/seo";

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

  const products = getMarketProducts(market);
  const hours = getMarketHours(market);
  const address = getMarketAddress(market);

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

  // Get coordinates from location object
  const latitude = market.location?.lat;
  const longitude = market.location?.lon;

  // Get website from websites array
  const website = market.websites?.[0];
  const websiteHost = (() => {
    try {
      return website ? new URL(website).hostname : undefined;
    } catch {
      return undefined;
    }
  })();
  const marketType = market.organization_types?.find((type) => type !== 'Official government dataset');
  const analyticsProperties = {
    market_id: market.id,
    market_name: market.name.slice(0, 80),
    country: market.country,
    market_type: marketType,
    source_id: market.provenance?.source_id
  };

  // Handle payment method flags
  const hasWic = market.wic === true;
  const hasSnap = market.snap === true;
  const hasFmnp = market.fmnp === true;
  const hasSfmnp = market.sfmnp === true;
  const hasCredit = market.payment_methods?.includes("Credit/Debit");

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${SITE_URL}/markets/${market.slug}`,
    name: market.name,
    description: market.location_description || marketDescription(market),
    url: `${SITE_URL}/markets/${market.slug}`,
    telephone: market.phone_numbers?.[0],
    email: market.emails?.[0],
    address: {
      '@type': 'PostalAddress',
      streetAddress: address,
      addressLocality: market.city,
      addressRegion: market.state,
      postalCode: market.zip_code,
      addressCountry: market.country_code || market.country || 'US'
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: market.location?.lat,
      longitude: market.location?.lon
    },
    openingHours: hours,
    paymentAccepted: [
      ...(hasCredit ? ['Credit Card'] : []),
      'Cash',
      ...(hasWic ? ['WIC'] : []),
      ...(hasSnap ? ['SNAP'] : []),
      ...(hasFmnp ? ['FMNP'] : []),
      ...(hasSfmnp ? ['SFMNP'] : [])
    ].join(', '),
    priceRange: '$$',
    image: marketImageUrl(market.slug),
    potentialAction: {
      '@type': 'ViewAction',
      target: `${SITE_URL}/markets/${market.slug}`
    }
  };

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
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:gap-4">
              <Breadcrumbs
                items={[
                  { label: 'Markets', href: '/markets' },
                  { label: market.name, href: `/markets/${market.slug}` }
                ]}
              />
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tighter bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                {market.name}
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
            </div>
          </div>
        </section>

        {/* Content Section */}
        <section className="w-full py-6 sm:py-8 md:py-12 bg-white dark:bg-zinc-900">
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6">
            <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
              {/* Map section for mobile - shown at top */}
              <div className="lg:hidden">
                <Card className="bg-white dark:bg-zinc-800">
                  <CardContent className="p-4">
                    <h2 className="text-xl font-semibold mb-4">Location</h2>
                    <div className="rounded-lg overflow-hidden">
                      <ClientSingleMarketMap market={market} height="250px" />
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

              {/* Main content */}
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 sm:mb-8">
                  <Card className="bg-white dark:bg-zinc-800">
                    <CardContent className="p-4">
                      <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">Location & Hours</h2>
                      <div className="space-y-2 text-sm sm:text-base">
                        {address && address.trim() && address.trim() !== ',' && (
                          <p className="text-zinc-600 dark:text-zinc-400">
                            <span className="font-medium text-zinc-900 dark:text-zinc-200">Address:</span><br className="sm:hidden" /> {address.replace(/^[,\s]+/, '').trim()}
                          </p>
                        )}
                        {hours && (
                          <p className="text-zinc-600 dark:text-zinc-400">
                            <span className="font-medium text-zinc-900 dark:text-zinc-200">Hours:</span><br className="sm:hidden" /> {hours}
                          </p>
                        )}
                        {website && (
                          <p className="text-zinc-600 dark:text-zinc-400">
                            <span className="font-medium text-zinc-900 dark:text-zinc-200">Website:</span>{" "}
                            <TrackedExternalLink
                              href={website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-600 hover:text-green-700 dark:text-green-500 dark:hover:text-green-400 hover:underline break-all"
                              eventName="Official Market Website Opened"
                              eventProperties={{ ...analyticsProperties, destination_host: websiteHost }}
                            >
                              Visit Website
                            </TrackedExternalLink>
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-white dark:bg-zinc-800">
                    <CardContent className="p-4">
                      <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">Available Products</h2>
                      {products && products.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {products.map((product, index) => (
                            <span
                              key={index}
                              className="inline-flex items-center px-2 py-1 rounded-full text-xs sm:text-sm bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            >
                              {product}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-zinc-500 dark:text-zinc-400 text-sm">No product information available.</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="prose max-w-none dark:prose-invert">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-3 sm:mb-4">About This Market</h2>
                  <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                    {market.name} is a local farmer market{cityStateDisplay && ` located in ${cityStateDisplay}`}.
                    Visitors can find a variety of fresh, locally-grown produce and artisanal goods.
                  </p>

                  {/* Payment options */}
                  {(hasCredit || hasWic || hasSnap || hasFmnp || hasSfmnp) && (
                    <div className="mt-6 sm:mt-8">
                      <h3 className="text-lg sm:text-xl font-bold tracking-tight mb-3 sm:mb-4">Payment Options</h3>
                      <ul className="list-none space-y-2 text-sm sm:text-base">
                        {hasCredit && (
                          <li className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                            Credit Cards Accepted
                          </li>
                        )}
                        {hasWic && (
                          <li className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                            WIC Accepted
                          </li>
                        )}
                        {hasSnap && (
                          <li className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                            SNAP Accepted
                          </li>
                        )}
                        {hasFmnp && (
                          <li className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                            Farmers&apos; Market Nutrition Program
                          </li>
                        )}
                        {hasSfmnp && (
                          <li className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                            Senior Farmers&apos; Market Nutrition Program
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  {market.location_description && (
                    <div className="mt-6 sm:mt-8">
                      <h3 className="text-lg sm:text-xl font-bold tracking-tight mb-3 sm:mb-4">Location Description</h3>
                      <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">{market.location_description}</p>
                    </div>
                  )}

                  <p className="mt-6 sm:mt-8 text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                    Supporting local farmers and producers is vital for sustainable communities.
                    By shopping at {market.name}, you&apos;re helping to strengthen the local economy
                    and reduce the environmental impact of food transportation.
                  </p>
                </div>
              </div>

              {/* Map section for desktop - shown on side */}
              <div className="hidden lg:block">
                <Card className="sticky top-24 bg-white dark:bg-zinc-800">
                  <CardContent className="p-4 sm:p-6">
                    <h2 className="text-xl font-semibold mb-4">Location</h2>
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
