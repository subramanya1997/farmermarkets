import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink, MapPin, Pencil, Plus } from 'lucide-react';
import { claimsForUser, getMarketsByIds, managedMarketIds, requireOrganizer } from '@/lib/organizer';
import { buttonVariants } from '@/components/ui/button';
import { StatusBadge } from '@/components/organizer/dashboard/StatusBadge';
import { SITE_FRAME } from '@/lib/ui';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Organizer dashboard',
  robots: { index: false, follow: false },
};

const PRIMARY = 'bg-green-700 text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700';

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function place(market: { city?: string; state?: string }) {
  return [market.city, market.state].filter(Boolean).join(', ');
}

export default async function DashboardPage() {
  const user = await requireOrganizer('/dashboard');
  const [managedIds, claims] = await Promise.all([managedMarketIds(user.id), claimsForUser(user.id)]);
  const markets = await getMarketsByIds([...new Set([...managedIds, ...claims.map((claim) => claim.marketId)])]);
  const byId = new Map(markets.map((market) => [market.id, market]));
  const managed = managedIds
    .map((id) => byId.get(id))
    .filter((market) => market !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
  const pendingCount = claims.filter((claim) => claim.status === 'pending').length;
  const claimCta = cn(buttonVariants(), PRIMARY, 'h-11 sm:h-9');

  return (
    <div className={`${SITE_FRAME} py-8 sm:py-10`}>
      <div className="mx-auto flex max-w-3xl flex-col gap-10">
        <section aria-labelledby="your-markets" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 id="your-markets" className="text-2xl font-bold tracking-tight sm:text-3xl">
                Your markets
              </h1>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Edits you send are checked by a person before they go live.
              </p>
            </div>
            {managed.length > 0 || claims.length > 0 ? (
              <Link href="/dashboard/claim" className={cn(claimCta, 'w-full sm:w-auto')}>
                <Plus aria-hidden="true" />
                Claim a market
              </Link>
            ) : null}
          </div>

          {managed.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {managed.map((market) => (
                <li
                  key={market.id}
                  className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="min-w-0">
                    <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">{market.name}</h2>
                    {place(market) ? (
                      <p className="mt-0.5 flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
                        <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                        {place(market)}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                    <Link
                      href={`/dashboard/markets/${market.slug}`}
                      className={cn(buttonVariants(), PRIMARY, 'h-11 sm:h-9')}
                      aria-label={`Edit listing for ${market.name}`}
                    >
                      <Pencil aria-hidden="true" />
                      Edit listing
                    </Link>
                    <Link
                      href={`/markets/${market.slug}`}
                      className={cn(buttonVariants({ variant: 'outline' }), 'h-11 sm:h-9')}
                      aria-label={`View page for ${market.name}`}
                    >
                      <ExternalLink aria-hidden="true" />
                      View page
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : claims.length > 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-5 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
              {pendingCount > 0
                ? 'No markets yet. Once we approve your claim, the market shows up here and you can edit its listing.'
                : 'No markets yet. Claim the market you run to start editing its listing.'}
            </p>
          ) : (
            <HowClaimingWorks cta={claimCta} />
          )}
        </section>

        {claims.length > 0 ? (
          <section aria-labelledby="your-claims" className="flex flex-col gap-4">
            <h2 id="your-claims" className="text-xl font-semibold tracking-tight">
              Your claims
            </h2>
            <ul className="flex flex-col gap-3">
              {claims.map((claim) => {
                const market = byId.get(claim.marketId);
                return (
                  <li
                    key={claim.id}
                    className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
                          {market ? (
                            <Link href={`/markets/${market.slug}`} className="hover:text-green-700 hover:underline dark:hover:text-green-400">
                              {market.name}
                            </Link>
                          ) : (
                            'A market no longer in the directory'
                          )}
                        </h3>
                        <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                          {[market ? place(market) : '', `Sent ${dateFormat.format(claim.createdAt)}`].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <StatusBadge status={claim.status} />
                    </div>
                    {claim.status === 'pending' ? (
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        We usually review claims within two business days and will email you either way.
                      </p>
                    ) : null}
                    {claim.status === 'rejected' ? (
                      <div className="rounded-lg bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300">
                        {claim.reviewNote ? (
                          <p>
                            <span className="font-medium">Note from our team: </span>
                            {claim.reviewNote}
                          </p>
                        ) : (
                          <p>We could not confirm that you run this market.</p>
                        )}
                        {market ? (
                          <p className="mt-1.5">
                            <Link
                              href={`/dashboard/claim?market=${market.slug}`}
                              className="font-medium text-green-700 underline underline-offset-2 hover:text-green-800 dark:text-green-400"
                            >
                              Send a new claim with more detail
                            </Link>
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function HowClaimingWorks({ cta }: { cta: string }) {
  const steps = [
    { title: 'Find your market', body: 'Search the directory and send a short claim saying how you are involved.' },
    { title: 'We confirm it is you', body: 'A person checks your claim, usually within two business days. We email you either way.' },
    { title: 'Keep the listing current', body: 'Update hours, location, contact details and photos. We review each change before it goes live.' },
  ];
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold">You do not manage any markets yet</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Claim the market you run to start editing its listing.</p>
      <ol className="mt-5 flex flex-col gap-4">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-300"
            >
              {index + 1}
            </span>
            <div>
              <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{step.title}</h3>
              <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <Link href="/dashboard/claim" className={cn(cta, 'mt-6 w-full sm:w-auto')}>
        <Plus aria-hidden="true" />
        Claim a market
      </Link>
    </div>
  );
}
