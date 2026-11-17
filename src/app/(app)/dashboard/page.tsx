import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CheckCircle2, Clock, Eye, Images, MapPin, MessageSquareWarning, Pencil, Plus, Stamp } from 'lucide-react';
import {
  VISITS_WINDOW_DAYS,
  claimsForUser,
  getMarketsByIds,
  requireOrganizer,
  type OrganizerMarketSummary,
} from '@/lib/organizer';
import { SECTION_LABELS } from '@/lib/listingEdits';
import { buttonVariants } from '@/components/ui/button';
import { Panel } from '@/components/admin/bits';
import { StatusBadge } from '@/components/organizer/dashboard/StatusBadge';
import { cn } from '@/lib/utils';
import { cachedOrganizerOverview } from './_lib/overview';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Organizer dashboard',
  robots: { index: false, follow: false },
};

const PRIMARY = 'bg-green-700 text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700';
const LINK = 'font-medium text-green-700 underline-offset-2 hover:underline dark:text-green-400';

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'America/New_York',
});

function place(market: { city?: string; state?: string } | undefined): string {
  return [market?.city, market?.state].filter(Boolean).join(', ');
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

export default async function DashboardPage() {
  const user = await requireOrganizer('/dashboard');
  const [summaries, allClaims] = await Promise.all([cachedOrganizerOverview(user), claimsForUser(user.id)]);

  // Only the newest claim per market matters, and only while it is still open
  // or was turned down for a market this account does not manage yet.
  const managed = new Set(summaries.map(({ market }) => market.id));
  const seen = new Set<string>();
  const claims = allClaims.filter((claim) => {
    if (seen.has(claim.marketId)) return false;
    seen.add(claim.marketId);
    return claim.status !== 'approved' && !managed.has(claim.marketId);
  });
  const claimMarkets = new Map((await getMarketsByIds(claims.map((claim) => claim.marketId))).map((market) => [market.id, market]));
  const waitingClaims = claims.some((claim) => claim.status === 'pending');

  const name = firstName(user.name);
  const hasMarkets = summaries.length > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{name ? `Hi, ${name}` : 'Welcome'}</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {hasMarkets
              ? 'Here is how your listing is doing. Changes you send go live after a quick review.'
              : 'Thanks for helping keep your market listing accurate.'}
          </p>
        </div>
        {hasMarkets ? (
          <Link href="/dashboard/claim" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-9')}>
            <Plus aria-hidden="true" />
            Claim another market
          </Link>
        ) : null}
      </div>

      {hasMarkets ? (
        <ul className="space-y-4">
          {summaries.map((summary) => (
            <li key={summary.market.id}>
              <MarketCard summary={summary} />
            </li>
          ))}
        </ul>
      ) : waitingClaims ? (
        <div className="flex items-start gap-3 rounded-lg border bg-white p-4 text-sm sm:p-5 dark:bg-zinc-900">
          <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-medium">Your claim is with our team</p>
            <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">
              Once we confirm it, your market shows up here and you can start editing its listing.
            </p>
          </div>
        </div>
      ) : (
        <GettingStarted />
      )}

      {claims.length > 0 ? (
        <Panel title="Your claims">
          <ul className="divide-y">
            {claims.map((claim) => {
              const market = claimMarkets.get(claim.marketId);
              const where = place(market);
              return (
                <li key={claim.id} className="space-y-2 px-4 py-3 text-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {market ? (
                          <Link href={`/markets/${market.slug}`} className="hover:underline">
                            {market.name}
                          </Link>
                        ) : (
                          'A market no longer in the directory'
                        )}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {[where, `Sent ${dateFormat.format(claim.createdAt)}`].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <StatusBadge status={claim.status === 'pending' ? 'pending' : 'rejected'} />
                  </div>
                  {claim.status === 'pending' ? (
                    <p className="text-zinc-600 dark:text-zinc-400">
                      We usually confirm claims within two business days and email you either way.
                    </p>
                  ) : (
                    <div className="rounded-md bg-zinc-50 px-3 py-2.5 text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300">
                      {claim.reviewNote ? (
                        <p className="whitespace-pre-line">
                          <span className="font-medium">Note from our team: </span>
                          {claim.reviewNote}
                        </p>
                      ) : (
                        <p>We could not confirm that you run this market.</p>
                      )}
                      {market ? (
                        <p className="mt-1.5">
                          <Link href={`/dashboard/claim?market=${market.slug}`} className={LINK}>
                            Claim again with more detail
                          </Link>
                        </p>
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

function MarketCard({ summary }: { summary: OrganizerMarketSummary }) {
  const { market, recentVisits, pending, lastApprovedAt, lastRejected, photos } = summary;
  const where = place(market);
  const sections = pending?.sections.map((section) => SECTION_LABELS[section]) ?? [];
  // A rejection only matters until the next update is sent.
  const rejection = pending ? null : lastRejected;

  return (
    <article className="rounded-lg border bg-white dark:bg-zinc-900">
      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">
              <Link href={`/dashboard/markets/${market.slug}`} className="hover:underline">
                {market.name}
              </Link>
            </h2>
            {where ? (
              <p className="mt-0.5 flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
                <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                {where}
              </p>
            ) : null}
          </div>
          {pending ? <StatusBadge status="pending" /> : <LivePill />}
        </div>

        {pending ? (
          <p className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
            <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              Update waiting for review since {dateFormat.format(pending.createdAt)}
              {sections.length > 0 ? `: ${sections.join(', ')}` : ''}.
            </span>
          </p>
        ) : (
          <p className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-green-700 dark:text-green-400" />
            <span>Your listing is live. Edit it anytime and we will check the changes.</span>
          </p>
        )}

        {rejection ? (
          <div className="flex gap-2.5 rounded-md bg-zinc-50 px-3 py-2.5 text-sm dark:bg-zinc-800/60">
            <MessageSquareWarning aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
            <div className="min-w-0">
              <p className="font-medium">
                Your last update was not approved
                {rejection.reviewedAt ? (
                  <span className="font-normal text-zinc-500 dark:text-zinc-400"> on {dateFormat.format(rejection.reviewedAt)}</span>
                ) : null}
              </p>
              <p className="mt-0.5 whitespace-pre-line text-zinc-700 dark:text-zinc-300">
                {rejection.note || 'Check the details and send it again.'}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <dl className="grid divide-y border-t sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Stat icon={<Eye />} label="Visitors" value={recentVisits}>
          {recentVisits > 0
            ? `${recentVisits === 1 ? 'person' : 'people'} viewed your page in the last ${VISITS_WINDOW_DAYS} days`
            : 'No visits counted yet this month'}
        </Stat>
        <Stat icon={<Images />} label="Photos" value={photos.live}>
          {photos.waiting > 0
            ? `live, ${photos.waiting} waiting for review`
            : photos.live > 0
              ? photos.live === 1
                ? 'photo on your page'
                : 'photos on your page'
              : 'Add a few so visitors know what to expect'}
        </Stat>
        <Stat icon={<Stamp />} label="Last approved" value={lastApprovedAt ? dateFormat.format(lastApprovedAt) : null}>
          {lastApprovedAt ? 'Your most recent update went live' : 'Nothing approved yet'}
        </Stat>
      </dl>

      <div className="grid grid-cols-2 gap-2 border-t p-3 sm:flex sm:justify-end sm:px-5">
        <Link
          href={`/markets/${market.slug}`}
          target="_blank"
          rel="noopener"
          className={cn(buttonVariants({ variant: 'outline' }), 'h-11 sm:h-9')}
          aria-label={`View page for ${market.name} (opens in a new tab)`}
        >
          View page
          <ArrowUpRight aria-hidden="true" />
        </Link>
        <Link
          href={`/dashboard/markets/${market.slug}`}
          className={cn(buttonVariants(), PRIMARY, 'h-11 sm:h-9')}
          aria-label={`Edit listing for ${market.name}`}
        >
          <Pencil aria-hidden="true" />
          Edit listing
        </Link>
      </div>
    </article>
  );
}

function LivePill() {
  return (
    <span className="inline-flex w-fit shrink-0 items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-900 dark:border-green-900/60 dark:bg-green-950/40 dark:text-green-200">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-green-600 dark:bg-green-400" />
      Live
    </span>
  );
}

/** One figure under a market card. A null value shows the note on its own. */
function Stat({ icon, label, value, children }: { icon: ReactNode; label: string; value: number | string | null; children: ReactNode }) {
  const empty = value === null || value === 0;
  return (
    <div className="px-4 py-3 sm:px-5">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 [&_svg]:size-3.5">
        <span aria-hidden="true" className="flex text-zinc-400 dark:text-zinc-500">
          {icon}
        </span>
        {label}
      </dt>
      <dd className="mt-1">
        {value !== null ? (
          <span className={cn('block text-xl font-semibold tabular-nums', empty && 'text-zinc-400 dark:text-zinc-600')}>
            {typeof value === 'number' ? value.toLocaleString('en-US') : value}
          </span>
        ) : null}
        <span className={cn('block text-xs text-zinc-500 dark:text-zinc-400', value === null && 'mt-1 text-sm')}>{children}</span>
      </dd>
    </div>
  );
}

function GettingStarted() {
  const steps = [
    { title: 'Claim your market', body: 'Find it in the directory and tell us how you are involved.' },
    { title: 'We confirm it is you', body: 'A person checks every claim, usually within two business days.' },
    { title: 'Keep it current', body: 'Update hours, details and photos. We check each change before it goes live.' },
  ];
  return (
    <section aria-labelledby="getting-started" className="rounded-lg border bg-white p-5 sm:p-6 dark:bg-zinc-900">
      <h2 id="getting-started" className="text-base font-semibold">
        Run a farmers market? Claim its page.
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        It takes a couple of minutes. Shoppers use the listing to plan their visit, so a current one helps.
      </p>
      <ol className="mt-5 grid gap-4 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3 sm:flex-col sm:gap-2">
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-300"
            >
              {index + 1}
            </span>
            <div>
              <h3 className="text-sm font-medium">{step.title}</h3>
              <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <Link href="/dashboard/claim" className={cn(buttonVariants(), PRIMARY, 'mt-6 h-11 w-full sm:h-9 sm:w-auto')}>
        <Plus aria-hidden="true" />
        Claim your market
      </Link>
    </section>
  );
}
