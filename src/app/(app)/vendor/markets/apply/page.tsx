import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowUpRight, MapPin, UserCheck } from 'lucide-react';
import { getPublishedMarket, requireOrganizer } from '@/lib/organizer';
import { applicationFormFor } from '@/lib/vendors';
import { DOCUMENT_CONTENT_TYPES, MAX_DOCUMENT_BYTES } from '@/lib/vendorProfile';
import { ApplicationForm, type ExistingApplication } from '@/components/vendor/ApplicationForm';
import { ApplicationBadge, Callout, LINK, NoteFrom, place, type LockerDocument } from '@/components/vendor/bits';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Apply to a market',
  robots: { index: false, follow: false },
};

export default async function ApplyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { market: raw } = await searchParams;
  const slug = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!slug) redirect('/vendor/markets');
  const user = await requireOrganizer(`/vendor/markets/apply?market=${encodeURIComponent(slug)}`);
  const market = await getPublishedMarket(slug);
  if (!market) notFound();
  const form = await applicationFormFor(user, market);

  const application = form.application;
  const listed = application?.status === 'approved';
  const where = place(form.market);
  const intro = form.checklist.settings.intro;

  const existing: ExistingApplication | null = application
    ? {
        status: application.status,
        days: application.days,
        stallNote: application.stallNote,
        message: application.message,
        sent: application.checklist.flatMap((line) =>
          line.submission
            ? [
                {
                  itemId: line.item.id,
                  documentId: line.submission.documentId,
                  documentLabel: line.submission.documentLabel,
                  status: line.submission.status,
                  note: line.submission.note,
                },
              ]
            : [],
        ),
      }
    : null;

  const documents: LockerDocument[] = form.documents.map((document) => ({
    id: document.id,
    label: document.label,
    contentType: document.contentType,
    size: document.size,
    expiresOn: document.expiresOn,
    expired: document.expired,
    usedBy: document.usedBy,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="space-y-2">
        <p className="text-sm font-medium text-green-700 dark:text-green-400">{application ? 'Your application' : 'Apply to sell at'}</p>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">{form.market.name}</h1>
          {application ? <ApplicationBadge status={application.status} /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          {where ? (
            <span className="flex items-center gap-1">
              <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
              {where}
            </span>
          ) : null}
          <Link href={`/markets/${form.market.slug}`} target="_blank" rel="noopener" className={`${LINK} inline-flex items-center gap-1`}>
            Market page
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
            <span className="sr-only">(opens in a new tab)</span>
          </Link>
        </div>
        <p className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <UserCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-zinc-400" />
          {form.hasOrganizer
            ? 'The market’s organizer reviews this.'
            : 'Farmer Markets reviews this because the market has no organizer here yet.'}
        </p>
      </header>

      {application?.status === 'denied' ? (
        <div className="space-y-2">
          <Callout title="This application was not approved">You can change it and send it again.</Callout>
          {application.decisionNote ? <NoteFrom who="Note from the reviewer">{application.decisionNote}</NoteFrom> : null}
        </div>
      ) : null}
      {application?.status === 'withdrawn' ? <Callout title="You withdrew this application">Send it again any time.</Callout> : null}
      {application?.confirmed ? <Callout tone="success" title="Confirmed by the market">You are listed on the market page.</Callout> : null}
      {listed && !application?.confirmed ? <Callout tone="success" title="You are listed at this market" /> : null}
      {application?.waitingOnProfile ? (
        <Callout tone="waiting" title="Waiting on your profile">
          The market will see this once your profile is approved.{' '}
          <Link href="/vendor/profile" className={LINK}>
            Check your profile
          </Link>
        </Callout>
      ) : null}

      {!form.checklist.settings.accepting && !listed ? (
        <Callout title="This market is not taking vendor applications right now">Check back later, or look for another market you sell at.</Callout>
      ) : (
        <>
          {(form.profileState === 'none' || form.profileState === 'draft') && !application?.waitingOnProfile ? (
            <Callout tone="waiting" title="Set up your profile too">
              You can send this now. The market sees it once your profile is approved.{' '}
              <Link href="/vendor/profile" className={LINK}>
                Set up your profile
              </Link>
            </Callout>
          ) : null}

          {intro ? (
            <figure className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <figcaption className="text-xs font-medium text-zinc-500 dark:text-zinc-400">From the market</figcaption>
              <blockquote className="mt-1 text-[15px] leading-7 break-words whitespace-pre-line text-zinc-800 dark:text-zinc-200">{intro}</blockquote>
            </figure>
          ) : null}

          <ApplicationForm
            slug={form.market.slug}
            items={form.checklist.items}
            existing={existing}
            documents={documents}
            documentsEnabled={form.documentsEnabled}
            limits={{ maxDocumentBytes: MAX_DOCUMENT_BYTES, documentTypes: DOCUMENT_CONTENT_TYPES }}
          />
        </>
      )}
    </div>
  );
}
