import Link from "next/link";
import { getStateHubSummaries } from "@/lib/statePage";
import { TOPIC_LABELS, TOPIC_SLUGS, topicPath } from "@/lib/topicPage";

/** How many state hubs the footer links to, biggest first. */
const FOOTER_STATE_LIMIT = 10;

/**
 * The site-wide footer.
 *
 * The "Browse" column is server-rendered from the geo index, so the topic
 * pages and the largest state hubs are in the HTML of every page — the
 * internal links that make those pages crawlable from anywhere on the site
 * rather than only from `/markets`.
 */
export async function Footer() {
  const states = (await getStateHubSummaries()).slice(0, FOOTER_STATE_LIMIT);

  const navigation = {
    main: [
      { name: 'Discover', href: '/markets' },
      { name: 'About', href: '/about' },
      { name: 'About the data', href: '/about-the-data' },
    ],
    legal: [
      { name: 'Terms', href: '/terms' },
      { name: 'Privacy', href: '/privacy' },
    ],
  };

  return (
    <footer className="border-t bg-white dark:bg-zinc-950">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        <div className="flex flex-col gap-8">
          {/* Main navigation */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:grid-cols-5">
            <div className="col-span-2">
              <Link href="/" className="inline-block font-bold text-xl sm:text-2xl bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                Farmer Markets
              </Link>
              <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400 max-w-xs">
                Connecting people with farmers markets and public local-food places around the world.
              </p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <h3 className="text-sm font-semibold mb-3">Browse</h3>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/markets"
                    className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-green-600 dark:hover:text-green-500"
                  >
                    All markets
                  </Link>
                </li>
                {TOPIC_SLUGS.map((slug) => (
                  <li key={slug}>
                    <Link
                      href={topicPath(slug)}
                      className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-green-600 dark:hover:text-green-500"
                    >
                      {TOPIC_LABELS[slug]}
                    </Link>
                  </li>
                ))}
                {states.map((state) => (
                  <li key={state.slug}>
                    <Link
                      href={state.href}
                      className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-green-600 dark:hover:text-green-500"
                    >
                      {state.name} markets
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3">Navigation</h3>
              <ul className="space-y-2">
                {navigation.main.map((item) => (
                  <li key={item.name}>
                    <Link 
                      href={item.href}
                      className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-green-600 dark:hover:text-green-500"
                    >
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3">Legal</h3>
              <ul className="space-y-2">
                {navigation.legal.map((item) => (
                  <li key={item.name}>
                    <Link 
                      href={item.href}
                      className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-green-600 dark:hover:text-green-500"
                    >
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bottom section */}
          <div className="pt-8 border-t flex flex-col sm:flex-row justify-between gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                &copy; {new Date().getFullYear()} Farmer Markets. All rights reserved.
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Built by <a href="https://subramanya.ai/" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">Subramanya N</a>
              </p>
            </div>
            {/* The credit line links to the page that documents it: sources,
                refresh cadence, coverage numbers and licence terms. */}
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Data from the USDA Local Food Portal directory and official government open-data
              portals:{' '}
              <Link href="/about-the-data" className="text-green-600 hover:underline">
                about the data
              </Link>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
