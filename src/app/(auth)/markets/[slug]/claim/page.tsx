import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Camera, CalendarClock, MapPin } from 'lucide-react';
import { canEditMarket, getPublishedMarket, getSessionUser } from '@/lib/organizer';
import { AuthShell } from '@/components/organizer/auth/AuthShell';
import { EmailCodeForm } from '@/components/organizer/auth/EmailCodeForm';
import { TEXT_LINK } from '@/components/organizer/auth/FormBits';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Claim this market',
  robots: { index: false, follow: false },
};

/**
 * The one link an organizer needs: /markets/<slug>/claim. They enter their
 * email, type the code we send, and land on the listing editor if they
 * already manage the market (the outreach bot may have set that up, see
 * docs/organizer-bot.md) or on the claim form if not.
 */
export default async function MarketClaimPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const market = await getPublishedMarket(slug.toLowerCase());
  if (!market) notFound();

  const user = await getSessionUser();
  if (user?.emailVerified) {
    redirect(
      (await canEditMarket(user, market.id))
        ? `/dashboard/markets/${market.slug}`
        : `/dashboard/claim?market=${market.slug}`,
    );
  }

  const place = [market.city, market.state].filter(Boolean).join(', ');
  const here = `/markets/${market.slug}/claim`;

  return (
    <AuthShell
      title={`Update ${market.name}`}
      description="Takes about a minute. We email you a code, no password, and you can start editing right away."
      footer={
        <>
          <p>
            Have a password?{' '}
            <Link href={`/sign-in?method=password&next=${encodeURIComponent(here)}`} className={TEXT_LINK}>
              Sign in with it
            </Link>
          </p>
          <p>
            Only want to suggest a correction?{' '}
            <Link href="/for-market-operators" className={TEXT_LINK}>
              Send us a note instead
            </Link>
          </p>
        </>
      }
    >
      <div className="mb-5 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="font-semibold text-zinc-900 dark:text-zinc-100">{market.name}</p>
        {place ? (
          <p className="mt-0.5 flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
            <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
            {place}
          </p>
        ) : null}
        <ul className="mt-3 space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          <li className="flex items-center gap-2">
            <CalendarClock aria-hidden="true" className="size-4 shrink-0 text-green-700 dark:text-green-400" />
            Update hours, season, location and payment options
          </li>
          <li className="flex items-center gap-2">
            <Camera aria-hidden="true" className="size-4 shrink-0 text-green-700 dark:text-green-400" />
            Add photos of market days and vendors
          </li>
        </ul>
      </div>
      <EmailCodeForm next={here} surface="claim" />
    </AuthShell>
  );
}
