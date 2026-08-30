import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getMarketsPage } from "@/lib/marketsIndex";
import { getStateHubSummaries } from "@/lib/statePage";
import { getTopicSummaries } from "@/lib/topicPage";
import { MarketsExplorer } from "@/components/MarketsExplorer";
import { FAQ } from "@/components/FAQ";
import { MapPin, CalendarDays, CreditCard, Clock, Laptop } from "lucide-react";
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

/**
 * Quick links to the four topic hubs; icons are picked here because the topic
 * summaries carry no icon.
 */
const TOPIC_ICONS = {
  saturday: CalendarDays,
  'snap-ebt': CreditCard,
  hours: Clock,
  online: Laptop,
} as const;

export default async function Home() {
  let homeData;
  try {
    homeData = await Promise.all([
      getStateHubSummaries(),
      getTopicSummaries(),
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

  const [states, topics, indexPage] = homeData;
  const totalMarkets = indexPage?.total ?? 0;
  const stateCount = states.length;

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
          {/* Compact hero: name the site and what it holds, then hand over to
              the explorer. No search form here — the explorer's own search
              bar sits directly below, and two search boxes read as clutter. */}
          <section className="relative w-full bg-gradient-to-b from-green-50 to-white py-6 dark:from-green-900/20 dark:to-zinc-950 sm:py-8">
            <div className={SITE_FRAME}>
              <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-center">
                {/* The H1 keeps naming the thing the site is about; the
                    tagline under it states what the site is. */}
                <h1 className="text-2xl font-bold tracking-tighter sm:text-3xl md:text-4xl">
                  Find Farmers Markets Near You
                </h1>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 sm:text-base">
                  Every farmers market, in one place. Hours, market days, and SNAP/EBT acceptance
                  {totalMarkets > 0 && stateCount > 0
                    ? ` for ${totalMarkets.toLocaleString()} markets across ${stateCount} states and regions.`
                    : ' for thousands of markets across the directory.'}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {topics.map((topic) => {
                    const Icon = TOPIC_ICONS[topic.slug as keyof typeof TOPIC_ICONS] ?? MapPin;
                    return (
                      <Link
                        key={topic.slug}
                        href={topic.href}
                        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:border-green-600/40 hover:bg-green-50 hover:text-green-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-green-500/40 dark:hover:bg-green-900/20 dark:hover:text-green-400 sm:text-sm"
                      >
                        <Icon className="h-3.5 w-3.5 text-green-600 dark:text-green-500" />
                        {topic.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* The discovery experience, front and center: the same explorer as
              /markets — search, filters, nearest-first results from the
              reader's approximate location, and the grid/map toggle. */}
          <MarketsExplorer />

          {/* Browse-by-state: a compact link directory rather than tiles, so
              every state hub is one crawlable hop from the homepage. Together
              with the topic chips above, these are the homepage's crawl
              paths; the explorer itself is client-rendered. */}
          <section className="w-full border-t border-zinc-200 bg-zinc-50 py-8 dark:border-zinc-800 dark:bg-zinc-800/50 sm:py-12">
            <div className={SITE_FRAME}>
              <h2 className="mb-5 text-xl font-bold tracking-tight sm:text-2xl">
                Browse Farmers Markets by State
              </h2>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {states.map((state) => (
                  <li key={state.slug}>
                    <Link
                      href={state.href}
                      className="group flex items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-white dark:hover:bg-zinc-800"
                    >
                      <span className="truncate font-medium text-zinc-700 group-hover:text-green-700 dark:text-zinc-300 dark:group-hover:text-green-400">
                        {state.name}
                      </span>
                      <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                        {state.marketCount.toLocaleString()}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* FAQ Section */}
          <FAQ />
        </div>
      </>
  );
}
