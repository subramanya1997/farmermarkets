import type { Metadata } from 'next';
import Link from 'next/link';
import { Clock, Info, MapPin, Pencil, ShieldCheck } from 'lucide-react';
import { canManageMarket, claimsForUser, getPublishedMarket, requireOrganizer } from '@/lib/organizer';
import { buttonVariants } from '@/components/ui/button';
import { ClaimForm } from '@/components/organizer/dashboard/ClaimForm';
import { ClaimSearch } from '@/components/organizer/dashboard/ClaimSearch';
import { TEXT_LINK } from '@/components/organizer/auth/FormBits';
import { firstParam } from '@/components/organizer/auth/nextPath';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Claim a market',
  robots: { index: false, follow: false },
};

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/** Same rule the admin hint uses: the email's domain and a market website share a domain. */
function emailMatchesWebsite(email: string, websites: string[] | undefined): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  if (!domain) return false;
  return (websites ?? [])
    .map(hostOf)
    .some((host) => host && (host === domain || host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`)));
}

export default async function ClaimPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const slug = firstParam(params.market)?.trim().toLowerCase() ?? '';
  const validSlug = /^[a-z0-9-]{1,200}$/.test(slug) ? slug : '';
  const user = await requireOrganizer(validSlug ? `/dashboard/claim?market=${validSlug}` : '/dashboard/claim');
  const market = validSlug ? await getPublishedMarket(validSlug) : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{market ? `Claim ${market.name}` : 'Claim a market'}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {market
            ? 'Tell us how you are involved. Once we confirm it, you can edit this listing.'
            : 'Find the market you run. Once we confirm your claim, you can edit its listing.'}
        </p>
      </header>

      {market ? (
        <MarketClaim user={user} market={market} />
      ) : (
        <>
          {slug ? (
            <Notice icon={<Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}>
              We could not find that market. Search for it below.
            </Notice>
          ) : null}
          <div className="rounded-lg border bg-white p-4 sm:p-5 dark:bg-zinc-900">
            <ClaimSearch />
          </div>
        </>
      )}
    </div>
  );
}

type Organizer = Awaited<ReturnType<typeof requireOrganizer>>;
type Market = NonNullable<Awaited<ReturnType<typeof getPublishedMarket>>>;

async function MarketClaim({ user, market }: { user: Organizer; market: Market }) {
  const [manages, allClaims] = await Promise.all([canManageMarket(user, market.id), claimsForUser(user.id)]);
  // `claimsForUser` is newest first.
  const claims = allClaims.filter((claim) => claim.marketId === market.id);
  const pending = claims.find((claim) => claim.status === 'pending');
  const lastRejected = claims[0]?.status === 'rejected' ? claims[0] : null;
  const place = [market.city, market.state].filter(Boolean).join(', ');
  const domainMatch = emailMatchesWebsite(user.email, market.websites);
  const siteHost = (market.websites ?? []).map(hostOf).find(Boolean);

  return (
    <>
      <div className="flex flex-col gap-1 rounded-lg border bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 dark:bg-zinc-900">
        <div className="min-w-0">
          <p className="font-semibold text-zinc-900 dark:text-zinc-100">{market.name}</p>
          {place ? (
            <p className="mt-0.5 flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
              <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
              {place}
            </p>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm sm:mt-0 sm:shrink-0">
          <Link href={`/markets/${market.slug}`} className={TEXT_LINK}>
            View page
          </Link>
          <Link href="/dashboard/claim" className={TEXT_LINK}>
            Not this market?
          </Link>
        </div>
      </div>

      {manages ? (
        <Notice tone="success" icon={<ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}>
          <p>You already manage this market.</p>
          <Link
            href={`/dashboard/markets/${market.slug}`}
            className={cn(
              buttonVariants(),
              'mt-3 h-11 w-full bg-green-700 text-white hover:bg-green-800 sm:h-9 sm:w-auto dark:bg-green-600 dark:hover:bg-green-700',
            )}
          >
            <Pencil aria-hidden="true" />
            Edit listing
          </Link>
        </Notice>
      ) : pending ? (
        <Notice icon={<Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}>
          <p>
            Your claim for this market is waiting for review. You sent it on {dateFormat.format(pending.createdAt)}. We will email you
            once it is reviewed, usually within two business days.
          </p>
          <p className="mt-2">
            <Link href="/dashboard" className={TEXT_LINK}>
              Back to the overview
            </Link>
          </p>
        </Notice>
      ) : (
        <>
          {lastRejected ? (
            <Notice icon={<Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}>
              <p>
                Your last claim for this market was not approved.
                {lastRejected.reviewNote ? (
                  <>
                    {' '}
                    <span className="font-medium">Note from our team: </span>
                    {lastRejected.reviewNote}
                  </>
                ) : null}
              </p>
              <p className="mt-1">You can send a new claim with more detail below.</p>
            </Notice>
          ) : null}

          {domainMatch ? (
            <Notice tone="success" icon={<ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}>
              Your account email matches the market&apos;s website, so your claim should be quick to confirm.
            </Notice>
          ) : (
            <Notice icon={<Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}>
              Claims are fastest to confirm when your account email is on the market&apos;s own domain, like{' '}
              <span className="font-medium">you@{siteHost ?? 'yourmarket.org'}</span>. A personal email is fine too. We may just
              ask a question or two.
            </Notice>
          )}

          <div className="rounded-lg border bg-white p-4 sm:p-5 dark:bg-zinc-900">
            <ClaimForm marketSlug={market.slug} marketName={market.name} marketId={market.id} />
          </div>
        </>
      )}
    </>
  );
}

function Notice({ tone = 'info', icon, children }: { tone?: 'info' | 'success'; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border px-4 py-3 text-sm',
        tone === 'success'
          ? 'border-green-200 bg-green-50 text-green-900 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-200'
          : 'border-zinc-200 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300',
      )}
    >
      {icon}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
