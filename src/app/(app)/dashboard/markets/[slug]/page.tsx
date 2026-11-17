import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowUpRight, CheckCircle2, Clock, MessageSquareWarning } from 'lucide-react';
import {
  MAX_PHOTOS_PER_MARKET,
  MAX_PHOTO_BYTES,
  PHOTO_CONTENT_TYPES,
  canManageMarket,
  editorValuesFor,
  getPublishedMarket,
  pendingChangeFor,
  photoPathPrefix,
  photosFor,
  recentChangesFor,
  requireOrganizer,
} from '@/lib/organizer';
import { SECTION_LABELS, changedSections, listingEditsSchema, mergeListingEdits } from '@/lib/listingEdits';
import { Panel } from '@/components/admin/bits';
import { ListingEditor } from '@/components/organizer/editor/ListingEditor';
import { PhotoManager, type EditorPhoto } from '@/components/organizer/editor/PhotoManager';
import { BadgeSnippet } from '@/components/organizer/editor/BadgeSnippet';
import { StatusBadge } from '@/components/organizer/dashboard/StatusBadge';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Edit your listing',
  robots: { index: false, follow: false },
};

const formatDate = (date: Date) =>
  date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });

export default async function EditMarketPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireOrganizer(`/dashboard/markets/${slug}`);
  const market = await getPublishedMarket(slug);
  if (!market) notFound();
  if (!(await canManageMarket(user, market.id))) notFound();

  const [published, pending, recent, photoRows] = await Promise.all([
    editorValuesFor(market),
    pendingChangeFor(user.id, market.id),
    recentChangesFor(market.id),
    photosFor(market.id),
  ]);

  // Organizers pick up where they left off: what they sent, over what is live.
  const pendingEdits = pending ? listingEditsSchema.safeParse(pending.changes) : null;
  const initialValues = pendingEdits?.success ? mergeListingEdits(published, pendingEdits.data) : published;

  const latest = recent[0];
  const rejection = latest?.status === 'rejected' ? latest : null;
  const history = recent.filter((row) => row.status !== 'pending').slice(0, 3);

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

  const place = [market.city, market.state].filter(Boolean).join(', ');

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{market.name}</h1>
            {place ? <p className="text-sm text-zinc-600 dark:text-zinc-400">{place}</p> : null}
          </div>
          <a
            href={`/markets/${market.slug}`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 text-sm font-medium text-green-700 hover:underline dark:text-green-400"
          >
            View public page
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </a>
        </div>
        <div className="pt-1">
          {pending ? (
            <p className="inline-flex items-start gap-1.5 text-sm text-amber-900 dark:text-amber-200">
              <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              Your last update is waiting for review, sent {formatDate(pending.createdAt)}.
            </p>
          ) : (
            <p className="inline-flex items-center gap-1.5 text-sm text-green-800 dark:text-green-300">
              <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
              Live
            </p>
          )}
        </div>
      </header>

      {rejection ? (
        <div className="flex gap-3 rounded-lg border bg-white p-4 text-sm dark:bg-zinc-900">
          <MessageSquareWarning aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-zinc-500" />
          <div>
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">
              Your last update was not approved
              {rejection.reviewedAt ? <span className="font-normal text-zinc-500"> on {formatDate(rejection.reviewedAt)}</span> : null}
            </p>
            {rejection.reviewNote ? (
              <p className="mt-1 whitespace-pre-line text-zinc-700 dark:text-zinc-300">{rejection.reviewNote}</p>
            ) : (
              <p className="mt-1 text-zinc-600 dark:text-zinc-400">Check the details below and send it again.</p>
            )}
          </div>
        </div>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-label="Listing" className="min-w-0">
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
            Edit any section, then send it for review. We usually publish within two business days and email you when it is live.
          </p>
          <ListingEditor
            slug={market.slug}
            initialValues={initialValues}
            hasPending={Boolean(pending)}
            place={{ city: market.city, state: market.state }}
            photos={
              <PhotoManager
                slug={market.slug}
                photos={photos}
                pathPrefix={photoPathPrefix(market.id)}
                maxPhotos={MAX_PHOTOS_PER_MARKET}
                maxBytes={MAX_PHOTO_BYTES}
                contentTypes={PHOTO_CONTENT_TYPES}
              />
            }
          />
        </section>

        <aside aria-label="More for this market" className="flex min-w-0 flex-col gap-6">
          <Panel title="Recent updates">
            {history.length === 0 ? (
              <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">Reviewed updates show up here.</p>
            ) : (
              <ul className="divide-y">
                {history.map((row) => {
                  const parsed = listingEditsSchema.safeParse(row.changes);
                  const sections = parsed.success ? changedSections(parsed.data).map((section) => SECTION_LABELS[section]) : [];
                  return (
                    <li key={row.id} className="flex flex-col gap-1.5 px-4 py-2.5 text-sm">
                      <p className="min-w-0">{sections.length ? sections.join(', ') : 'Listing update'}</p>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">Sent {formatDate(row.createdAt)}</span>
                        <StatusBadge status={row.status === 'approved' ? 'approved' : 'rejected'} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
          <BadgeSnippet slug={market.slug} marketName={market.name} />
        </aside>
      </div>
    </div>
  );
}
