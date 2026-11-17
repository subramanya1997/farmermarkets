import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react';
import {
  MAX_PHOTOS_PER_MARKET,
  MAX_PHOTO_BYTES,
  PHOTO_CONTENT_TYPES,
  adminOrganizers,
  editedSectionsFor,
  editorValuesFor,
  getPublishedMarket,
  managersFor,
  photoPathPrefix,
  photosFor,
  recentChangesFor,
  requireAdmin,
} from '@/lib/organizer';
import { SECTION_LABELS, changedSections, listingEditsSchema } from '@/lib/listingEdits';
import { ListingEditor } from '@/components/organizer/editor/ListingEditor';
import { PhotoManager, type EditorPhoto } from '@/components/organizer/editor/PhotoManager';
import { AddManagerForm } from '@/components/admin/AddManagerForm';
import { PhotoReviewCard } from '@/components/admin/PhotoReviewCard';
import { ResetSectionButton } from '@/components/admin/ResetSectionButton';
import { RevokeManagerButton } from '@/components/admin/RevokeManagerButton';
import { Muted, Panel, StatusPill, TimeAgo } from '@/components/admin/bits';
import { formatTimestamp, placeLabel, timeAgo } from '@/components/admin/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Edit market',
  robots: { index: false, follow: false },
};

function sectionsOf(changes: unknown): string {
  const parsed = listingEditsSchema.safeParse(changes);
  const labels = parsed.success ? changedSections(parsed.data).map((section) => SECTION_LABELS[section]) : [];
  return labels.length ? labels.join(', ') : 'Listing update';
}

export default async function AdminMarketPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAdmin();
  const { slug } = await params;
  const market = await getPublishedMarket(slug);
  if (!market) notFound();

  const [values, edited, changes, photoRows, managers, accounts] = await Promise.all([
    editorValuesFor(market, { admin: true }),
    editedSectionsFor(market.id),
    recentChangesFor(market.id, 20),
    photosFor(market.id, ['pending', 'approved']),
    managersFor(market.id),
    // Only for names in the history list; recentChangesFor returns user ids.
    adminOrganizers(),
  ]);
  const people = new Map(accounts.map((account) => [account.id, account]));

  const photos: EditorPhoto[] = photoRows
    .filter((row): row is typeof row & { status: 'pending' | 'approved' } => row.status === 'pending' || row.status === 'approved')
    .map((row) => ({
      id: row.id,
      url: row.blobUrl,
      width: row.width,
      height: row.height,
      alt: row.alt,
      caption: row.caption,
      status: row.status,
    }));
  const waiting = photoRows.filter((row) => row.status === 'pending');
  const place = placeLabel(market);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="space-y-1">
        <Link href="/admin/markets" className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:underline dark:text-zinc-400">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Markets
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{market.name}</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{place || 'No city on file'}</p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <a
              href={`/markets/${market.slug}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 font-medium text-green-700 hover:underline dark:text-green-400"
            >
              Public page
              <ArrowUpRight aria-hidden="true" className="size-3.5" />
            </a>
            <Link
              href={`/dashboard/markets/${market.slug}`}
              className="inline-flex items-center gap-1 font-medium text-green-700 hover:underline dark:text-green-400"
            >
              Organizer view
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label="Listing" className="min-w-0">
          <ListingEditor
            mode="admin"
            slug={market.slug}
            initialValues={values}
            place={{ city: market.city, state: market.state }}
            photosWaiting={waiting.length}
            photos={
              <div className="flex flex-col gap-4">
                {waiting.length > 0 ? (
                  <Panel title={`Waiting for review (${waiting.length})`}>
                    <ul className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3">
                      {waiting.map((photo) => (
                        <PhotoReviewCard
                          key={photo.id}
                          photo={{
                            id: photo.id,
                            url: photo.blobUrl,
                            alt: photo.alt,
                            caption: photo.caption,
                            uploaded: timeAgo(photo.createdAt),
                            uploadedTitle: formatTimestamp(photo.createdAt),
                            uploader: photo.uploadedBy ? (people.get(photo.uploadedBy) ?? null) : null,
                          }}
                        />
                      ))}
                    </ul>
                  </Panel>
                ) : null}
                <PhotoManager
                  slug={market.slug}
                  photos={photos}
                  pathPrefix={photoPathPrefix(market.id)}
                  maxPhotos={MAX_PHOTOS_PER_MARKET}
                  maxBytes={MAX_PHOTO_BYTES}
                  contentTypes={PHOTO_CONTENT_TYPES}
                  description="Photos you add go live right away. Organizer uploads wait for your review."
                />
              </div>
            }
          />
        </section>

        <aside aria-label="Market details" className="flex min-w-0 flex-col gap-4">
          <Panel title="Published edits">
            {edited.length === 0 ? (
              <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
                Nothing edited. The listing shows the original data.
              </p>
            ) : (
              <>
                <p className="border-b px-4 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                  These sections differ from the original data. Resetting one shows the original values again.
                </p>
                <ul className="divide-y text-sm">
                  {edited.map((section) => (
                    <li key={section} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                      <span className="font-medium">{SECTION_LABELS[section]}</span>
                      <ResetSectionButton slug={market.slug} sections={[section]} label={SECTION_LABELS[section]} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>

          <Panel title={`Managers (${managers.length})`}>
            {managers.length === 0 ? (
              <p className="border-b px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">Nobody manages this market yet.</p>
            ) : (
              <ul className="divide-y border-b text-sm">
                {managers.map((manager) => (
                  <li key={manager.userId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{manager.name || 'No name'}</div>
                      <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {manager.email} · since <TimeAgo date={manager.createdAt} />
                      </div>
                    </div>
                    <RevokeManagerButton marketId={market.id} userId={manager.userId} name={manager.name || manager.email} />
                  </li>
                ))}
              </ul>
            )}
            <AddManagerForm slug={market.slug} />
          </Panel>

          <Panel title="History">
            {changes.length === 0 ? (
              <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">No listing updates yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {changes.map((change) => {
                  const who = people.get(change.userId);
                  return (
                    <li key={change.id}>
                      <Link
                        href={`/admin/changes/${change.id}`}
                        className="block space-y-1 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <StatusPill status={change.status} />
                          <TimeAgo date={change.createdAt} className="text-xs text-zinc-500 dark:text-zinc-400" />
                        </span>
                        <span className="block text-zinc-800 dark:text-zinc-200">{sectionsOf(change.changes)}</span>
                        <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                          {who ? who.name || who.email : 'Unknown account'}
                        </span>
                        {change.reviewNote ? (
                          <span className="block line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">
                            <Muted>Note:</Muted> {change.reviewNote}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
