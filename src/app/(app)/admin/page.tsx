import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, BadgeCheck, FilePen, Flag, ImageIcon, Images, Inbox, PencilLine, Store, Users, type LucideIcon } from 'lucide-react';
import { adminOverview, requireAdmin } from '@/lib/organizer';
import { MarketSearch } from '@/components/admin/MarketSearch';
import { Panel, StatusPill, TimeAgo } from '@/components/admin/bits';
import { placeLabel, roleLabel } from '@/components/admin/format';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin overview',
  robots: { index: false, follow: false },
};

type Overview = Awaited<ReturnType<typeof adminOverview>>;

const KIND_ICONS: Record<Overview['activity'][number]['kind'], LucideIcon> = {
  claim: Flag,
  change: FilePen,
  photo: ImageIcon,
};

const KIND_LABELS: Record<Overview['activity'][number]['kind'], string> = {
  claim: 'Claim',
  change: 'Listing update',
  photo: 'Photo',
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The overview's claim lines carry the raw role code ("Claim as market_manager"). */
function activityDetail(item: Overview['activity'][number]): string {
  if (item.kind !== 'claim') return item.detail;
  const role = /^Claim as (.+)$/.exec(item.detail)?.[1];
  return role ? `Claim as ${roleLabel(role).toLowerCase()}` : item.detail;
}

export default async function AdminOverviewPage() {
  await requireAdmin();
  const { counts, activity, recentAccounts, markets } = await adminOverview();
  const waiting = counts.claimsPending + counts.changesPending + counts.photosPending;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="sr-only">Overview</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">What needs you, and what changed lately.</p>
      </div>

      <section aria-labelledby="edit-any" className="rounded-lg border bg-white p-4 sm:p-5 dark:bg-zinc-900">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="edit-any" className="flex items-center gap-2 text-sm font-semibold">
            <PencilLine aria-hidden="true" className="size-4 text-green-700 dark:text-green-400" />
            Edit any market
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Changes you publish go live right away.</p>
        </div>
        <MarketSearch />
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          href="/admin/review"
          icon={Inbox}
          label="Waiting for review"
          value={waiting}
          tone={waiting > 0 ? 'attention' : 'default'}
          className="sm:col-span-2 xl:col-span-1"
        >
          {waiting > 0
            ? [
                plural(counts.claimsPending, 'claim', 'claims'),
                plural(counts.changesPending, 'update', 'updates'),
                plural(counts.photosPending, 'photo', 'photos'),
              ].join(', ')
            : 'All caught up'}
        </StatCard>
        <StatCard href="/admin/organizers" icon={Users} label="Organizer accounts" value={counts.accounts}>
          {counts.verifiedAccounts} of {counts.accounts} verified
        </StatCard>
        <StatCard href="/admin/markets" icon={Store} label="Markets with organizers" value={counts.managedMarkets}>
          At least one manager
        </StatCard>
        <StatCard href="/admin/markets" icon={BadgeCheck} label="Markets with published edits" value={counts.editedMarkets}>
          Differ from the original data
        </StatCard>
        <StatCard icon={Images} label="Live photos" value={counts.photosLive}>
          Approved and on market pages
        </StatCard>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel title="Recent activity">
          {activity.length === 0 ? (
            <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">No claims, updates or photos yet.</p>
          ) : (
            <ul className="divide-y">
              {activity.map((item, index) => {
                const market = markets.get(item.marketId);
                const Icon = KIND_ICONS[item.kind];
                // Photo rows link to the market; without a known market there is nowhere to go.
                const href = item.href.endsWith('/admin/markets/') ? null : item.href;
                const body = (
                  <>
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-zinc-50 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                      <Icon aria-hidden="true" className="size-3.5" />
                      <span className="sr-only">{KIND_LABELS[item.kind]}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{market?.name ?? 'Unknown market'}</span>
                      <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {activityDetail(item)}
                        {item.who ? <> by {item.who.name || item.who.email}</> : null}
                        {market && placeLabel(market) ? <> · {placeLabel(market)}</> : null}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <StatusPill status={item.status} />
                      <TimeAgo date={item.at} className="text-xs text-zinc-500 dark:text-zinc-400" />
                    </span>
                  </>
                );
                return (
                  <li key={`${item.kind}-${item.href}-${index}`}>
                    {href ? (
                      <Link href={href} className="flex items-start gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        {body}
                      </Link>
                    ) : (
                      <div className="flex items-start gap-3 px-4 py-2.5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel
          title="Newest accounts"
          action={
            <Link href="/admin/organizers" className="inline-flex items-center gap-1 text-xs font-medium text-green-700 hover:underline dark:text-green-400">
              All organizers
              <ArrowRight aria-hidden="true" className="size-3" />
            </Link>
          }
        >
          {recentAccounts.length === 0 ? (
            <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">Nobody has signed up yet.</p>
          ) : (
            <ul className="divide-y">
              {recentAccounts.map((account) => (
                <li key={account.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{account.name || 'No name'}</span>
                    <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{account.email}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {account.emailVerified ? (
                      <span className="text-xs font-medium text-green-700 dark:text-green-400">Verified</span>
                    ) : (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">Not verified</span>
                    )}
                    <TimeAgo date={account.createdAt} className="text-xs text-zinc-500 dark:text-zinc-400" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function StatCard({
  href,
  icon: Icon,
  label,
  value,
  tone = 'default',
  className,
  children,
}: {
  href?: string;
  icon: LucideIcon;
  label: string;
  value: number;
  tone?: 'default' | 'attention';
  className?: string;
  children: ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
        <Icon
          aria-hidden="true"
          className={cn('size-4', tone === 'attention' ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400 dark:text-zinc-500')}
        />
      </div>
      <div className={cn('mt-1 text-2xl font-semibold tabular-nums', value === 0 && 'text-zinc-400 dark:text-zinc-600')}>
        {value.toLocaleString('en-US')}
      </div>
      <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{children}</div>
    </>
  );
  const base = cn(
    'block rounded-lg border bg-white px-4 py-3 dark:bg-zinc-900',
    tone === 'attention' && 'border-amber-300 dark:border-amber-700/60',
    className,
  );
  return href ? (
    <Link href={href} className={cn(base, 'transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/60')}>
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
}
