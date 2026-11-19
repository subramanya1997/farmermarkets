import Link from 'next/link';
import { ChevronRight, MapPin } from 'lucide-react';
import { place } from './bits';

/** Markets an invite suggested, each one tap from its application. Server-safe. */
export function SuggestedList({ markets }: { markets: { id: string; slug: string; name: string; city?: string; state?: string }[] }) {
  return (
    <ul className="mt-3 divide-y divide-zinc-200 border-t border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {markets.map((market) => (
        <li key={market.id}>
          <Link
            href={`/vendor/markets/apply?market=${encodeURIComponent(market.slug)}`}
            className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-green-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-green-700 sm:px-5 dark:hover:bg-green-950/30"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-medium break-words text-zinc-900 dark:text-zinc-100">{market.name}</span>
              {place(market) ? (
                <span className="mt-0.5 flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
                  <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                  {place(market)}
                </span>
              ) : null}
            </span>
            <span className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-green-700 dark:text-green-400">
              Apply
              <ChevronRight aria-hidden="true" className="size-4" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
