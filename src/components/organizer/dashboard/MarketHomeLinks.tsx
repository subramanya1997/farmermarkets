import type { ReactNode } from 'react';
import Link from 'next/link';
import { Clock, FilePenLine, Megaphone, Store } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The top of one market's dashboard: the four things an operator comes back
 * for, as big tap targets. Hours and Listing jump into the editor below
 * (`#hours` opens its Hours tab); Updates and Vendors are their own pages.
 */
export function MarketHomeLinks({
  slug,
  liveUpdates,
  scheduledUpdates,
  vendorsWaiting,
  listingPending,
}: {
  slug: string;
  liveUpdates: number;
  scheduledUpdates: number;
  vendorsWaiting: number;
  listingPending: boolean;
}) {
  const base = `/dashboard/markets/${slug}`;
  const updates =
    liveUpdates > 0 ? `${liveUpdates} live` : scheduledUpdates > 0 ? `${scheduledUpdates} scheduled` : 'Post a note';
  return (
    <nav aria-label="Run your market">
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile href={`${base}/updates`} icon={<Megaphone />} label="Updates" detail={updates} attention={false} />
        <Tile
          href={`${base}/vendors`}
          icon={<Store />}
          label="Vendors"
          detail={vendorsWaiting > 0 ? `${vendorsWaiting} to review` : 'Roster and applications'}
          attention={vendorsWaiting > 0}
        />
        <Tile href="#hours" icon={<Clock />} label="Hours and season" detail="Days, times, dates" attention={false} />
        <Tile
          href="#listing"
          icon={<FilePenLine />}
          label="Listing"
          detail={listingPending ? 'Waiting for review' : 'Live'}
          attention={false}
        />
      </ul>
    </nav>
  );
}

function Tile({
  href,
  icon,
  label,
  detail,
  attention,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  detail: string;
  attention: boolean;
}) {
  const className =
    'flex h-full min-h-20 flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-3 shadow-xs outline-none transition-colors hover:border-zinc-300 focus-visible:ring-2 focus-visible:ring-green-700/40 sm:p-4 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700';
  const body = (
    <>
      <span aria-hidden="true" className="flex text-green-700 dark:text-green-400 [&_svg]:size-5">
        {icon}
      </span>
      <span className="text-sm leading-5 font-semibold text-zinc-900 dark:text-zinc-50">{label}</span>
      <span className={cn('text-xs leading-4', attention ? 'font-medium text-amber-900 dark:text-amber-200' : 'text-zinc-600 dark:text-zinc-400')}>
        {detail}
      </span>
    </>
  );
  return (
    <li>
      {href.startsWith('#') ? (
        // A plain anchor: the editor below listens for the hash.
        <a href={href} className={className}>
          {body}
        </a>
      ) : (
        <Link href={href} className={className}>
          {body}
        </Link>
      )}
    </li>
  );
}
