import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublishedMarket, requireOrganizer } from '@/lib/organizer';
import { marketUpdatesFor } from '@/lib/marketUpdates';
import { MAX_OPEN_UPDATES, MAX_UPDATE_LENGTH } from '@/lib/marketUpdateRules';
import { PageHeader } from '@/components/dashboard/DocBits';
import { UpdatesManager } from '@/components/organizer/updates/UpdatesManager';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Shopper updates',
  robots: { index: false, follow: false },
};

export default async function MarketUpdatesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireOrganizer(`/dashboard/markets/${slug}/updates`);
  const market = await getPublishedMarket(slug);
  if (!market) notFound();
  // Confirmed managers and admins only; a waiting claim cannot speak to shoppers yet.
  const updates = await marketUpdatesFor(user, market);
  if (!updates) notFound();

  return (
    <div className="mx-auto flex max-w-3xl min-w-0 flex-col gap-5">
      <PageHeader title={`Shopper updates for ${market.name}`} />
      <div className="min-w-0">
        <p className="text-xl font-semibold tracking-tight break-words text-zinc-900 dark:text-zinc-50">Shopper updates</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          A short note at the top of your market page, like a closure or a special day. It comes down on its own after the end date.
        </p>
      </div>
      <UpdatesManager
        slug={market.slug}
        updates={updates}
        maxOpen={MAX_OPEN_UPDATES}
        maxLength={MAX_UPDATE_LENGTH}
      />
    </div>
  );
}
