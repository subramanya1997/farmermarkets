import Link from 'next/link';
import { ChevronDown, Globe2 } from 'lucide-react';
import type { StateHubSummary } from '@/lib/statePage';
import { SITE_FRAME } from '@/lib/ui';

interface BrowseByStateProps {
  states: StateHubSummary[];
  /** Section heading; the homepage and `/markets` word it the same way. */
  heading?: string;
}

const linkClass =
  'block truncate rounded-md px-2 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-white hover:text-green-700 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-green-400';

function byName(left: StateHubSummary, right: StateHubSummary): number {
  return left.name.localeCompare(right.name, 'en');
}

/**
 * Server-rendered directory of every state hub: US states A to Z, then the
 * provinces and countries outside the US folded into their own row.
 *
 * Every link is in the HTML (a closed `<details>` still ships its content), so
 * each market stays three hops from here: state, city, market.
 */
export function BrowseByState({ states, heading = 'Browse by state' }: BrowseByStateProps) {
  if (states.length === 0) return null;

  const us = states.filter((state) => state.countryCode === 'US').sort(byName);
  const elsewhere = states.filter((state) => state.countryCode !== 'US').sort(byName);

  return (
    <section className="w-full border-t border-zinc-200 bg-zinc-50 py-10 dark:border-zinc-800 dark:bg-zinc-900/50 sm:py-12">
      <div className={SITE_FRAME}>
        <h2 className="mb-5 text-xl font-bold tracking-tight sm:text-2xl">{heading}</h2>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
          {us.map((state) => (
            <li key={state.slug}>
              <Link href={state.href} className={linkClass}>
                {state.name}
              </Link>
            </li>
          ))}
        </ul>

        {elsewhere.length > 0 && (
          <details className="group mt-6 rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-zinc-800 dark:text-zinc-200 [&::-webkit-details-marker]:hidden">
              <Globe2 aria-hidden className="h-4 w-4 text-green-700 dark:text-green-500" />
              Outside the US
              <span className="text-zinc-500 dark:text-zinc-400">{elsewhere.length}</span>
              <ChevronDown aria-hidden className="ml-auto h-4 w-4 text-zinc-500 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 px-2 pb-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
              {elsewhere.map((state) => (
                <li key={state.slug}>
                  <Link href={state.href} className={linkClass}>
                    {state.name}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
