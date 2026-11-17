import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { FileCheck, MapPin, Store, Sprout } from 'lucide-react';
import { getPublishedMarket, getSessionUser } from '@/lib/organizer';
import { resolveMarketSlug } from '@/lib/marketSlug';
import { displayName } from '@/lib/seo';
import { AuthShell } from '@/components/organizer/auth/AuthShell';
import { EmailCodeForm } from '@/components/organizer/auth/EmailCodeForm';
import { TEXT_LINK } from '@/components/organizer/auth/FormBits';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Apply to sell at this market',
  robots: { index: false, follow: false },
};

/**
 * The link an organizer sends to vendors: /markets/<slug>/apply. A vendor
 * enters their email, types the code we send, and lands on the application
 * for this market, setting up their vendor page first if they have none.
 */
export default async function MarketApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  // A link shared last season may carry an old slug: follow it to the
  // current one so the URL the vendor sees matches the market.
  const slug = resolveMarketSlug(rawSlug);
  if (!slug) notFound();
  if (slug !== rawSlug) redirect(`/markets/${slug}/apply`);

  const market = await getPublishedMarket(slug);
  if (!market) notFound();

  const next = `/vendor/markets/apply?market=${encodeURIComponent(market.slug)}`;
  const user = await getSessionUser();
  if (user?.emailVerified) redirect(next);

  const name = displayName(market.name);
  const place = [market.city, market.state].filter(Boolean).join(', ');

  return (
    <AuthShell
      title={`Sell at ${name}`}
      description="Sign in with your email to apply. We send you a code, no password needed."
      footer={
        <p>
          New to vendor pages?{' '}
          <Link href="/for-vendors" className={TEXT_LINK}>
            See how they work
          </Link>
        </p>
      }
    >
      <div className="mb-5 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="font-semibold text-zinc-900 dark:text-zinc-100">{name}</p>
        {place ? (
          <p className="mt-0.5 flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
            <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
            {place}
          </p>
        ) : null}
        <ul className="mt-3 space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          <li className="flex items-center gap-2">
            <Sprout aria-hidden="true" className="size-4 shrink-0 text-green-700 dark:text-green-400" />
            Set up a free vendor page
          </li>
          <li className="flex items-center gap-2">
            <FileCheck aria-hidden="true" className="size-4 shrink-0 text-green-700 dark:text-green-400" />
            Send this market what it asks for
          </li>
          <li className="flex items-center gap-2">
            <Store aria-hidden="true" className="size-4 shrink-0 text-green-700 dark:text-green-400" />
            Get listed on the market page
          </li>
        </ul>
      </div>
      <EmailCodeForm next={next} surface="sign_in" />
    </AuthShell>
  );
}
