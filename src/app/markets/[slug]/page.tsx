import { getMarketById, getMarketBySlug, getMarkets, getSlugByLegacyId } from "@/lib/data";
import { getMarketAddress } from "@/lib/api";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { notFound, permanentRedirect } from "next/navigation";
import MarketLocationMap from "@/components/MarketLocationMap";
import { MarketDetailAnalytics } from "@/components/MarketDetailAnalytics";
import { TrackedExternalLink } from "@/components/TrackedExternalLink";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import Link from "next/link";
import { Metadata } from "next";
import { SITE_URL, absoluteUrl } from "@/lib/site";
import { getCityForMarketSlug } from "@/lib/geoIndex";
import { cityPath } from "@/lib/cityPage";
import { statePath } from "@/lib/statePage";
import { displayName, marketAddressParts, marketDescription, marketTitle } from "@/lib/seo";
import { clean } from "@/lib/geo";
import { GLANCE_COVERED_TERMS, marketGlance } from "@/lib/marketFacts";
import { getMarketProse } from "@/lib/marketProse";
import { getNearbyMarkets } from "@/lib/nearby";
import { getMarketProvenance } from "@/lib/provenance";
import { marketFaqs, marketSchemaGraph } from "@/lib/schema";
import { MarketFaq } from "@/components/MarketFaq";
import { MarketFacts, MarketGlanceCard } from "@/components/MarketFacts";
import { MarketHighlights } from "@/components/MarketHighlights";
import { MarketFreshnessNotice } from "@/components/MarketFreshnessNotice";
import { MarketSourceNote } from "@/components/MarketSourceNote";
import { NearbyMarkets } from "@/components/NearbyMarkets";
import { TrackedMarketClaimLink } from "@/components/TrackedMarketClaimLink";
import { SITE_FRAME } from "@/lib/ui";
import { marketAlias } from "@/lib/marketAliases";
import { planVisitCoveredTerms, planVisitSummary } from "@/lib/planVisit";
import { planVisitView } from "@/lib/planVisitView";
import { openStatusInput } from "@/lib/openStatus";
import { PlanYourVisit } from "@/components/PlanYourVisit";

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

/** The main listing this record duplicates, when it is a known alias. */
async function getCanonicalMarket(id: string) {
  const alias = marketAlias(id);
  if (!alias) return undefined;
  const canonical = await getMarketById(alias.canonicalId);
  return canonical?.slug ? canonical : undefined;
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
  // A duplicate row of a market listed elsewhere (src/lib/marketAliases.ts)
  // names the main listing as canonical, so the signals land on one page.
  const canonicalMarket = await getCanonicalMarket(market.id);
  const canonicalPath = canonicalMarket ? `/markets/${canonicalMarket.slug}` : path;

  return {
    // `absolute` bypasses the root layout's "%s | Farmer Markets" template:
    // the suffix pushed every market title past the SERP truncation point and
    // added nothing a searcher was looking for.
    title: { absolute: title },
    description,
    openGraph: {
      title,
      description,
      url: canonicalPath,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    alternates: {
      canonical: canonicalPath,
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
  // clean() also strips upstream punctuation flaws ('Portland , Oregon').
  const address = clean(rawAddress.replace(/^[,\s]+/, ''));
  const hasAddress = Boolean(address) && address !== ',';

  // The record's own words where they are its own: `getMarketProse` drops the
  // per-source blurbs that hundreds of records share.
  const prose = await getMarketProse(market);

  const addressParts = marketAddressParts(market);

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
  const hasCoordinates = typeof latitude === 'number' && typeof longitude === 'number' &&
    Number.isFinite(latitude) && Number.isFinite(longitude);
  const mapActionUrl = market.suppress_map ? undefined : market.google_maps_url ??
    (hasCoordinates ? `https://www.google.com/maps/dir/?api=1&destination=${latitude}%2C${longitude}` : undefined);
  const websiteActionUrl = market.websites?.find((url) => /^https?:\/\//i.test(url) && !/google\.[^/]+\/maps|maps\.app\.goo\.gl/i.test(url));

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

  // The main listing, when this record is a duplicate row of it.
  const canonicalMarket = await getCanonicalMarket(market.id);

  // "Plan your visit": the when / getting there / paying / what is sold
  // answers for records with enough first-party facts; [] for everything
  // else, which keeps the full "Market details" list as before. Exceptions
  // are compared against the market's own local date when it has a sourced
  // timezone (the page revalidates daily).
  const timezone = market.first_party?.operations?.timezone?.value;
  let today = new Date().toISOString().slice(0, 10);
  if (timezone) {
    try {
      today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
    } catch {
      // Keep the UTC date for an invalid zone; the validator rejects those.
    }
  }
  const planRows = planVisitSummary(market, today);
  const planOpenStatus = planRows.length ? openStatusInput(market.first_party) : undefined;
  // The listing's directions fold into the card's "More details" when the
  // card shows, rather than repeating parking in a section of their own.
  const planView = planRows.length
    ? planVisitView(market, today, { directions: prose.location })
    : undefined;
  // Pages without the card get the schedule as a strip and a few values.
  const glance = planView ? undefined : marketGlance(market);
  const coveredTerms = planView
    ? planVisitCoveredTerms(planRows)
    : new Set(glance ? GLANCE_COVERED_TERMS : []);
  const firstPartyStatus = market.first_party?.operations?.status?.value;
  const firstPartyStatusLabel = firstPartyStatus?.value === 'seasonal_break'
    ? 'This market is currently between seasons.'
    : firstPartyStatus?.value === 'temporarily_closed'
      ? 'This market is temporarily closed.'
      : firstPartyStatus?.value === 'permanently_closed'
        ? 'This market is permanently closed.'
        : undefined;

  return (
    <>
      <MarketDetailAnalytics
        marketId={market.id}
        marketName={market.name}
        country={market.country}
        marketType={marketType}
        sourceId={market.provenance?.source_id}
        marketSlug={market.slug}
        cityName={placement?.city.name}
        stateSlug={placement?.state.slug}
        citySlug={placement?.city.slug}
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
              {/* One composed address line under the name: tidied street, a
                  clearly-clickable city segment (its page lists every market
                  there), and the postal code the raw string usually drops.
                  This replaces the old raw-address + city lines, which
                  stacked two near-duplicates ("1015 Bank St, Ottawa, ON" over
                  "Ottawa, Ontario, Canada"). */}
              {(addressParts.street || addressParts.cityLabel || hasAddress) && (
                <address className="text-base sm:text-lg not-italic text-zinc-600 dark:text-zinc-400">
                  {addressParts.street || addressParts.cityLabel ? (
                    <>
                      {addressParts.street && `${addressParts.street}, `}
                      {addressParts.cityLabel &&
                        (cityPageHref ? (
                          <Link
                            href={cityPageHref}
                            className="hover:text-green-700 hover:underline dark:hover:text-green-500"
                          >
                            {addressParts.cityLabel}
                          </Link>
                        ) : (
                          addressParts.cityLabel
                        ))}
                      {addressParts.postalCode && ` ${addressParts.postalCode}`}
                    </>
                  ) : (
                    address
                  )}
                </address>
              )}
              {/* "Last verified in 2020", or "no longer in the USDA
                  directory" — high enough on the page to be honest, muted
                  enough not to read as an alarm. Renders nothing for a record
                  whose date does not support the claim. */}
              {market.suppress_map && (
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Imported address; check the location note below before visiting.</p>
              )}
              <MarketFreshnessNotice market={market} />
              {canonicalMarket && (
                <p className="max-w-[75ch] text-sm text-zinc-700 dark:text-zinc-300">
                  This is one listing from a public dataset. The full guide to this market, with hours,
                  directions and vendors, is{' '}
                  <Link
                    href={`/markets/${canonicalMarket.slug}`}
                    className="font-medium text-green-700 underline hover:text-green-800 dark:text-green-500"
                  >
                    {displayName(canonicalMarket.name)}
                  </Link>
                  .
                </p>
              )}
              {(mapActionUrl || websiteActionUrl) && (
                <div className="flex flex-wrap gap-3 lg:hidden">
                  {mapActionUrl && (
                    <TrackedExternalLink href={mapActionUrl} target="_blank" rel="noopener noreferrer"
                      className="rounded-full bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700"
                      eventName="Market Directions Opened" eventProperties={{ ...analyticsProperties, destination: 'google-maps', placement: 'mobile-header' }}>
                      {market.google_maps_url ? 'View on Google Maps' : 'Get directions'}
                    </TrackedExternalLink>
                  )}
                  {websiteActionUrl && (
                    <TrackedExternalLink href={websiteActionUrl} target="_blank" rel="noopener noreferrer"
                      className="rounded-full border border-green-600 px-4 py-2.5 text-sm font-medium text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950"
                      eventName="Official Market Website Opened" eventProperties={{ ...analyticsProperties, placement: 'mobile-header' }}>
                      Official website
                    </TrackedExternalLink>
                  )}
                </div>
              )}
              {firstPartyStatusLabel && (
                <p className="max-w-[75ch] rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  {firstPartyStatusLabel}
                  {firstPartyStatus?.note ? ` ${clean(firstPartyStatus.note)}` : ''}
                </p>
              )}
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
                  {planView && (
                    <PlanYourVisit
                      view={planView}
                      timezone={timezone}
                      openStatus={planOpenStatus}
                      analyticsProperties={analyticsProperties}
                    />
                  )}
                  {glance && <MarketGlanceCard glance={glance} />}
                  {/* The market's own description, when it has one. No
                      heading: the name is the H1 directly above. */}
                  {prose.about.map((paragraph) => (
                    <p
                      key={paragraph}
                      className="mb-3 max-w-[75ch] text-sm sm:text-base text-zinc-600 last:mb-0 dark:text-zinc-400"
                    >
                      {paragraph}
                    </p>
                  ))}

                  {!planView && prose.location.length > 0 && (
                    <div className="mt-6 sm:mt-8">
                      <h2 className="text-lg sm:text-xl font-semibold tracking-tight mb-3">
                        Finding the market
                      </h2>
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

                  {/* The rows this record can fill that nothing above has
                      answered, then one contact row. */}
                  <MarketFacts market={market} analyticsProperties={analyticsProperties} omitTerms={coveredTerms} hasPlanCard={Boolean(planView)} />
                  <MarketHighlights market={market} analyticsProperties={analyticsProperties} />

                  {/* Answers in the words searchers type, in the HTML itself:
                      AI answer engines extract visible text on a direct fetch
                      and never run the JSON-LD. */}
                  <MarketFaq faqs={faqs} />

                  <NearbyMarkets
                    markets={nearby}
                    cityHref={cityPageHref}
                    cityName={placement?.city.name}
                  />

                  <MarketSourceNote
                    provenance={provenance}
                    lastUpdated={market.last_updated}
                    enrichment={market.enrichment}
                    audit={market.audit}
                  />

                  {/* The claim premise: operators land on their own listing
                      long before they find a "for operators" page. */}
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Do you run this market?{' '}
                    <TrackedMarketClaimLink
                      marketId={market.id}
                      marketSlug={market.slug}
                    />
                    . Listing is free for market operators.
                  </p>
                </div>
              </div>

              {/* Details precede the map on mobile; the map occupies the
                  right-hand column on wide screens. */}
              <div>
                {/* Just the map, which carries its own directions button; the
                    address sits under the market name in the header. */}
                <div className="lg:sticky lg:top-24">
                  {!market.suppress_map && (
                    <MarketLocationMap market={market} height="480px" />
                  )}
                  <div className="mt-6">
                    <NewsletterSignup
                      source="market"
                      variant="compact"
                      marketSlug={market.slug}
                      heading={placement ? `Markets near ${placement.city.name}, in your inbox` : 'Markets near you, in your inbox'}
                      blurb="Market days near you and what's in season, no more than once a week."
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
