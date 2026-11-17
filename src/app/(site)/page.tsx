import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getMarketsPage } from "@/lib/marketsIndex";
import { getStateHubSummaries } from "@/lib/statePage";
import { MarketsExplorer } from "@/components/MarketsExplorer";
import { BrowseByState } from "@/components/BrowseByState";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import type { Metadata } from "next";
import { SITE_URL, absoluteUrl } from "@/lib/site";
import { SITE_FRAME } from "@/lib/ui";

// Statically rendered and revalidated daily. The dataset is a versioned
// snapshot in the repo, so a 24h window is well inside its update cadence.
export const revalidate = 86400;

export const metadata: Metadata = {
  alternates: {
    canonical: '/',
  },
  openGraph: {
    url: '/',
  },
};

export default async function Home() {
  let homeData;
  try {
    homeData = await Promise.all([
      getStateHubSummaries(),
      getMarketsPage(1),
    ]);
  } catch (error) {
    console.error('Error fetching markets for homepage:', error);
    return (
      <div className="flex flex-col min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Temporarily Unavailable</h1>
        <p className="text-center max-w-md mb-6">
          We&apos;re experiencing some technical difficulties fetching market data.
          Please try again in a few moments.
        </p>
        <Link href="/">
          <Button>Refresh Page</Button>
        </Link>
      </div>
    );
  }

  const [states, indexPage] = homeData;
  const totalMarkets = indexPage?.total ?? 0;

  const websiteSchema = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Farmer Markets',
      description: 'Discover farmers markets and local-food places around the world',
      url: SITE_URL,
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${absoluteUrl('/markets')}?search={search_term_string}`
        },
        'query-input': 'required name=search_term_string'
      }
  };

  return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
        <div className="flex flex-col min-h-[calc(100vh-4rem)]">
          {/* Compact hero: what the site is, in one line, then straight into
              the explorer. Topic links live on /markets and in the footer. */}
          <section className="relative w-full bg-gradient-to-b from-green-50 to-white py-6 dark:from-green-900/20 dark:to-zinc-950 sm:py-8">
            <div className={SITE_FRAME}>
              <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 text-center">
                <h1 className="text-2xl font-bold tracking-tighter sm:text-3xl md:text-4xl">
                  Find Farmers Markets Near You
                </h1>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 sm:text-base">
                  {totalMarkets > 0
                    ? `${totalMarkets.toLocaleString()} markets with hours and SNAP/EBT.`
                    : 'Markets with hours and SNAP/EBT.'}
                </p>
              </div>
            </div>
          </section>

          {/* The discovery experience, front and center: the same explorer as
              /markets — search, filters, nearest-first results from the
              reader's approximate location, and the grid/map toggle. */}
          <MarketsExplorer />

          {/* Every state hub, one crawlable hop from the homepage; the
              explorer itself is client-rendered. */}
          <BrowseByState states={states} />

          <section className="w-full bg-white py-10 dark:bg-zinc-900 sm:py-14">
            <div className={SITE_FRAME}>
              <NewsletterSignup source="home" variant="band" />
            </div>
          </section>
        </div>
      </>
  );
}
