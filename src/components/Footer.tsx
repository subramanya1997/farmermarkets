import Link from "next/link";
import { getStateHubSummaries } from "@/lib/statePage";
import { TOPIC_LABELS, TOPIC_SLUGS, topicPath } from "@/lib/topicPage";
import { SITE_FRAME } from "@/lib/ui";

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

  const navigation = [
    { name: 'Discover', href: '/markets' },
    { name: 'About', href: '/about' },
    { name: 'About the data', href: '/about-the-data' },
  ];

  return (
    <footer className="border-t bg-white dark:bg-zinc-950">
      <div className={`${SITE_FRAME} py-8 md:py-12`}>
        <div className="flex flex-col gap-8">
          {/* Link columns */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div>
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
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3">States</h3>
              <ul className="space-y-2">
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
              <h3 className="text-sm font-semibold mb-3">Site</h3>
              <ul className="space-y-2">
                {navigation.map((item) => (
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

          {/* Bottom bar: legal links and credits on one slim line */}
          <div className="pt-6 border-t flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-zinc-600 dark:text-zinc-400">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link href="/terms" className="hover:text-green-600 dark:hover:text-green-500">
                Terms
              </Link>
              <Link href="/privacy" className="hover:text-green-600 dark:hover:text-green-500">
                Privacy
              </Link>
              <span>&copy; {new Date().getFullYear()} Farmer Markets</span>
              <span>
                Built by{' '}
                <a href="https://subramanya.ai/" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">
                  Subramanya N
                </a>
              </span>
            </div>
            {/* The credit line links to the page that documents it: sources,
                refresh cadence, coverage numbers and licence terms. */}
            <p>
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
