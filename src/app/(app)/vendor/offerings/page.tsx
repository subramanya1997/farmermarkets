import type { Metadata } from 'next';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { requireOrganizer } from '@/lib/organizer';
import { usToday } from '@/lib/offeringDays';
import { offeringsDesk } from '@/lib/vendorOfferings';
import { PageHeader } from '@/components/dashboard/DocBits';
import { MarketOfferings } from '@/components/vendor/MarketOfferings';
import { Callout, LINK, place } from '@/components/vendor/bits';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'This week',
  robots: { index: false, follow: false },
};

export default async function VendorOfferingsPage() {
  const user = await requireOrganizer('/vendor/offerings');
  const desk = await offeringsDesk(user);
  const today = usToday().from;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="This week">Tell shoppers what you are bringing. It shows on your page and the market page until the day is over.</PageHeader>

      {desk.markets.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          Once a market approves you, you can post here.{' '}
          <Link href="/vendor/markets" className={LINK}>
            See your markets
          </Link>
        </p>
      ) : null}

      {desk.markets.length > 0 && !desk.public ? (
        <Callout tone="info" title="Your page is not live yet">
          You can post now. Shoppers see it once your page is live.
        </Callout>
      ) : null}

      {desk.markets.map((market) => {
        const where = place(market);
        return (
          <section
            key={market.id}
            aria-labelledby={`market-${market.id}`}
            className="overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 shadow-xs sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="mb-4">
              <h2 id={`market-${market.id}`} className="text-lg font-semibold tracking-tight break-words">
                {market.name}
              </h2>
              {where ? (
                <p className="mt-0.5 flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
                  <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                  {where}
                </p>
              ) : null}
            </div>
            <MarketOfferings
              market={{ slug: market.slug, name: market.name, days: market.days }}
              posts={market.offerings}
              lastItems={market.lastItems}
              serverToday={today}
            />
          </section>
        );
      })}
    </div>
  );
}
