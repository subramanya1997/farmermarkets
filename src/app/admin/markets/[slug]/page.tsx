import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, ImageOff } from 'lucide-react';
import { getPublishedMarket, managersFor, photosFor, recentChangesFor, requireAdmin } from '@/lib/organizer';
import { LISTING_SECTIONS, SECTION_LABELS } from '@/lib/listingEdits';
import { PhotoReviewCard } from '@/components/admin/PhotoReviewCard';
import { RevokeManagerButton } from '@/components/admin/RevokeManagerButton';
import { Muted, Panel, StatusPill, TimeAgo } from '@/components/admin/bits';
import { formatTimestamp, placeLabel, timeAgo } from '@/components/admin/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Market admin',
  robots: { index: false, follow: false },
};

function sectionsOf(changes: unknown): string {
  if (!changes || typeof changes !== 'object') return 'No sections';
  const labels = LISTING_SECTIONS.filter((section) => section in changes).map((section) => SECTION_LABELS[section]);
  return labels.length ? labels.join(', ') : 'No sections';
}

export default async function MarketAdminPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAdmin();
  const { slug } = await params;
  const market = await getPublishedMarket(slug);
  if (!market) notFound();

  const [managers, photos, changes] = await Promise.all([
    managersFor(market.id),
    photosFor(market.id, ['pending', 'approved', 'rejected', 'removed']),
    recentChangesFor(market.id, 10),
  ]);
  const pending = photos.filter((photo) => photo.status === 'pending');
  const decided = photos.filter((photo) => photo.status !== 'pending');
  const place = placeLabel(market);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="space-y-1">
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:underline dark:text-zinc-400">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Queue
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">{market.name}</h1>
        {place ? <p className="text-sm text-zinc-600 dark:text-zinc-400">{place}</p> : null}
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href={`/markets/${market.slug}`} className="text-green-700 hover:underline dark:text-green-400">
            Public page
          </Link>
          <Link href={`/dashboard/markets/${market.slug}`} className="text-green-700 hover:underline dark:text-green-400">
            Open the organizer editor
          </Link>
        </p>
      </div>

      <Panel title={`Managers (${managers.length})`}>
        {managers.length === 0 ? (
          <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">Nobody manages this market yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {managers.map((manager) => (
              <li key={manager.userId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="font-medium">{manager.name || 'No name'}</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {manager.email} · since <TimeAgo date={manager.createdAt} />
                  </div>
                </div>
                <RevokeManagerButton marketId={market.id} userId={manager.userId} name={manager.name || manager.email} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={`Photos waiting (${pending.length})`}>
        {pending.length === 0 ? (
          <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">No photos waiting.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4">
            {pending.map((photo) => (
              <PhotoReviewCard
                key={photo.id}
                photo={{
                  id: photo.id,
                  url: photo.blobUrl,
                  alt: photo.alt,
                  caption: photo.caption,
                  uploaded: timeAgo(photo.createdAt),
                  uploadedTitle: formatTimestamp(photo.createdAt),
                }}
              />
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={`Other photos (${decided.length})`}>
        {decided.length === 0 ? (
          <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">No other photos.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4">
            {decided.map((photo) => (
              <li key={photo.id} className="overflow-hidden rounded-lg border bg-white dark:bg-zinc-900">
                <div className="relative aspect-[4/3] bg-zinc-100 dark:bg-zinc-800">
                  {photo.status === 'approved' ? (
                    <a href={photo.blobUrl} target="_blank" rel="noopener noreferrer" title="Open full size">
                      <Image
                        src={photo.blobUrl}
                        alt={photo.alt || `Photo for ${market.name}`}
                        fill
                        sizes="(min-width: 1024px) 240px, (min-width: 640px) 33vw, 50vw"
                        className="object-cover"
                      />
                    </a>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <ImageOff className="size-5" aria-hidden="true" />
                      File deleted
                    </div>
                  )}
                </div>
                <div className="space-y-1 p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <StatusPill status={photo.status} />
                    <Muted>
                      <TimeAgo date={photo.reviewedAt ?? photo.createdAt} />
                    </Muted>
                  </div>
                  {photo.alt ? <p className="line-clamp-2 text-zinc-600 dark:text-zinc-400">{photo.alt}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Recent listing updates">
        {changes.length === 0 ? (
          <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">No listing updates yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {changes.map((change) => (
              <li key={change.id} className="grid items-center gap-x-4 gap-y-1 px-4 py-2.5 sm:grid-cols-[6rem_minmax(0,1fr)_7rem_auto]">
                <StatusPill status={change.status} className="justify-self-start" />
                <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-300">{sectionsOf(change.changes)}</span>
                <TimeAgo date={change.createdAt} className="text-xs text-zinc-500 dark:text-zinc-400" />
                <Link
                  href={`/admin/changes/${change.id}`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-green-700 hover:underline dark:text-green-400"
                >
                  {change.status === 'pending' ? 'Review' : 'View'}
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
