import Link from 'next/link';
import { cn } from '@/lib/utils';
import { marketsPagePath } from '@/lib/marketsIndex';

interface MarketsPaginationProps {
  page: number;
  totalPages: number;
}

/**
 * Page numbers to render: always first and last, plus a window around the
 * current page, with `null` standing in for an ellipsis gap.
 */
function pageWindow(page: number, totalPages: number): (number | null)[] {
  const window = new Set<number>([1, totalPages, page]);
  for (let offset = 1; offset <= 2; offset += 1) {
    if (page - offset >= 1) window.add(page - offset);
    if (page + offset <= totalPages) window.add(page + offset);
  }
  // Page 1 is the entry point for crawlers, so give it a couple of shallow
  // neighbours to follow even when the reader is deep in the list.
  window.add(Math.min(2, totalPages));

  const pages = [...window].sort((left, right) => left - right);
  const withGaps: (number | null)[] = [];
  let previous = 0;
  for (const value of pages) {
    if (previous && value - previous > 1) withGaps.push(null);
    withGaps.push(value);
    previous = value;
  }
  return withGaps;
}

const linkClass =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-zinc-200 px-3 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-800';

/**
 * Link-based pagination for the market index.
 *
 * Every control is a real `<a href>` to a real URL, not a `useState` button:
 * that is the whole point of the route split, so crawlers (and anyone with a
 * bookmark) can address page N directly.
 */
export function MarketsPagination({ page, totalPages }: MarketsPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Market index pagination" className="flex flex-col items-center gap-3 py-8">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {page > 1 ? (
          <Link href={marketsPagePath(page - 1)} rel="prev" className={linkClass}>
            ← Previous
          </Link>
        ) : (
          <span className={cn(linkClass, 'opacity-40')} aria-hidden="true">
            ← Previous
          </span>
        )}

        {pageWindow(page, totalPages).map((value, index) =>
          value === null ? (
            <span key={`gap-${index}`} className="px-1 text-sm text-zinc-500">
              …
            </span>
          ) : value === page ? (
            <span
              key={value}
              aria-current="page"
              className={cn(linkClass, 'border-green-600 bg-green-600 text-white')}
            >
              {value}
            </span>
          ) : (
            <Link key={value} href={marketsPagePath(value)} className={linkClass}>
              {value}
            </Link>
          )
        )}

        {page < totalPages ? (
          <Link href={marketsPagePath(page + 1)} rel="next" className={linkClass}>
            Next →
          </Link>
        ) : (
          <span className={cn(linkClass, 'opacity-40')} aria-hidden="true">
            Next →
          </span>
        )}
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Page {page.toLocaleString()} of {totalPages.toLocaleString()}
      </p>
    </nav>
  );
}
