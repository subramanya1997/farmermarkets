import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Info, MapPin, ShieldCheck } from 'lucide-react';
import { canEditMarket, claimsForUser, getPublishedMarket, requireOrganizer } from '@/lib/organizer';
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
            ? 'Tell us your role and start editing right away. Your changes go live once we confirm you run it.'
            : 'Find the market you run. You can start editing its listing as soon as you claim it.'}
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
  // Managers and anyone whose claim is already in go straight to the editor.
  if (await canEditMarket(user, market.id)) redirect(`/dashboard/markets/${market.slug}`);
  // `claimsForUser` is newest first.
  const claims = (await claimsForUser(user.id)).filter((claim) => claim.marketId === market.id);
  const lastRejected = claims[0]?.status === 'rejected' ? claims[0] : null;
  const place = [market.city, market.state].filter(Boolean).join(', ');
  const domainMatch = emailMatchesWebsite(user.email, market.websites);

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
          Your email matches the market&apos;s website, so this should be quick to confirm.
        </Notice>
      ) : null}

      <div className="rounded-lg border bg-white p-4 sm:p-5 dark:bg-zinc-900">
        <ClaimForm marketSlug={market.slug} marketId={market.id} />
      </div>
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
