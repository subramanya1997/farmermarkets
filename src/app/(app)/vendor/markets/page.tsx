import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertCircle, BadgeCheck, CalendarDays, Clock, FileText, MapPin, Pencil, RotateCcw, Tent } from 'lucide-react';
import { requireOrganizer } from '@/lib/organizer';
import { attendanceLabel } from '@/lib/vendorRules';
import type { VendorApplicationView } from '@/lib/vendors';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/dashboard/DocBits';
import { ApplicationBadge, LINK, NoteFrom, place, plural } from '@/components/vendor/bits';
import { MarketPicker } from '@/components/vendor/MarketPicker';
import { SuggestedList } from '@/components/vendor/SuggestedMarkets';
import { WithdrawButton } from '@/components/vendor/WithdrawButton';
import { cn } from '@/lib/utils';
import { cachedVendorOverview, needsDocument } from '../_lib/overview';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your markets',
  robots: { index: false, follow: false },
};

const PRIMARY_SMALL = 'h-11 w-full bg-green-700 text-white hover:bg-green-800 sm:h-9 sm:w-auto dark:bg-green-700 dark:hover:bg-green-600';

export default async function VendorMarketsPage() {
  const user = await requireOrganizer('/vendor/markets');
  const overview = await cachedVendorOverview(user);
  // Anything that needs the vendor comes first; otherwise newest first, as loaded.
  const applications = [...overview.applications].sort((a, b) => Number(needsDocument(b)) - Number(needsDocument(a)));
  const appliedSlugs = overview.applications.flatMap((application) =>
    application.market && application.status !== 'withdrawn' ? [application.market.slug] : [],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Markets">The markets you sell at. Once a market approves you, you are listed on its page.</PageHeader>

      <section aria-labelledby="apply" className="overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 shadow-xs sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 id="apply" className="text-lg font-semibold tracking-tight">
          Apply to a market
        </h2>
        <div className="mt-3">
          <MarketPicker appliedSlugs={appliedSlugs} />
        </div>
        {overview.suggestedMarkets.length > 0 ? (
          <div className="-mx-4 mt-4 sm:-mx-6">
            <p className="px-4 text-sm font-medium text-zinc-900 sm:px-6 dark:text-zinc-100">
              {overview.suggestedMarkets.length === 1 ? 'From your invite: a market you sell at' : 'From your invite: markets you sell at'}
            </p>
            <div className="-mb-4 sm:-mb-6">
              <SuggestedList markets={overview.suggestedMarkets} />
            </div>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="applications" className="space-y-3">
        <h2 id="applications" className="text-lg font-semibold tracking-tight">
          Your applications
        </h2>
        {applications.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            No applications yet. Search above for the markets you sell at.
          </p>
        ) : (
          <ul className="space-y-4">
            {applications.map((application) => (
              <li key={application.id}>
                <ApplicationCard application={application} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ApplicationCard({ application }: { application: VendorApplicationView }) {
  const { market, status, progress } = application;
  const open = status === 'pending' || status === 'approved';
  const attention = needsDocument(application);
  const where = place(market);
  const days = attendanceLabel(application.days);
  const rejected = application.checklist.filter((line) => line.submission?.status === 'rejected');
  const applyHref = market ? `/vendor/markets/apply?market=${encodeURIComponent(market.slug)}` : null;
  const name = market?.name ?? 'A market no longer in the directory';

  return (
    <article
      className={cn(
        'overflow-hidden rounded-xl border bg-white shadow-xs dark:bg-zinc-900',
        attention ? 'border-amber-300 dark:border-amber-800' : 'border-zinc-200 dark:border-zinc-800',
      )}
    >
      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold break-words">
              {applyHref ? (
                <Link href={applyHref} className="hover:underline">
                  {name}
                </Link>
              ) : (
                name
              )}
            </h3>
            {where ? (
              <p className="mt-0.5 flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
                <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                {where}
              </p>
            ) : null}
          </div>
          <ApplicationBadge status={status} />
        </div>

        {application.confirmed ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-green-800 dark:text-green-300">
            <BadgeCheck aria-hidden="true" className="size-4 shrink-0" />
            Confirmed by the market
          </p>
        ) : null}

        {days || application.stallNote ? (
          <dl className="grid gap-1.5 text-sm">
            {days ? (
              <div className="flex items-start gap-2">
                <dt className="flex shrink-0 items-center text-zinc-400">
                  <CalendarDays aria-hidden="true" className="mt-0.5 size-4" />
                  <span className="sr-only">Days</span>
                </dt>
                <dd className="min-w-0 text-zinc-700 dark:text-zinc-300">{days}</dd>
              </div>
            ) : null}
            {application.stallNote ? (
              <div className="flex items-start gap-2">
                <dt className="flex shrink-0 items-center text-zinc-400">
                  <Tent aria-hidden="true" className="mt-0.5 size-4" />
                  <span className="sr-only">Stall</span>
                </dt>
                <dd className="min-w-0 break-words text-zinc-700 dark:text-zinc-300">{application.stallNote}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {status === 'pending' ? (
          <p className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              {application.waitingOnProfile ? (
                <>
                  The market will see this once your profile is approved.{' '}
                  <Link href="/vendor/profile" className={LINK}>
                    Check your profile
                  </Link>
                </>
              ) : application.decider === 'organizer' ? (
                'The market’s organizer reviews this. We will email you when they decide.'
              ) : (
                'Farmer Markets reviews this because the market has no organizer here yet. We will email you when it is decided.'
              )}
            </span>
          </p>
        ) : null}

        {status === 'denied' && application.decisionNote ? <NoteFrom who="Note from the reviewer">{application.decisionNote}</NoteFrom> : null}

        {open && progress.active > 0 ? <ChecklistSummary application={application} /> : null}

        {open && rejected.length > 0 ? (
          <ul className="space-y-2">
            {rejected.map((line) => (
              <li
                key={line.item.id}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-950 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100"
              >
                <p className="flex items-start gap-2 font-medium">
                  <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-red-700 dark:text-red-400" />
                  <span className="min-w-0 break-words">{line.item.label} needs a new document</span>
                </p>
                {line.submission?.note ? <p className="mt-1 pl-6 break-words whitespace-pre-line">{line.submission.note}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {market ? (
        <div className="flex flex-col-reverse gap-2 border-t border-zinc-200 bg-zinc-50/60 p-3 sm:flex-row sm:justify-end sm:px-5 dark:border-zinc-800 dark:bg-zinc-950/30">
          {open ? <WithdrawButton applicationId={application.id} marketName={market.name} listed={status === 'approved'} /> : null}
          <Link href={applyHref!} className={cn(buttonVariants(), PRIMARY_SMALL)} aria-label={`${open ? 'Edit' : 'Apply again to'} ${market.name}`}>
            {open ? <Pencil aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
            {open ? (attention ? 'Add documents' : 'Edit') : 'Apply again'}
          </Link>
        </div>
      ) : open ? (
        <div className="border-t border-zinc-200 p-3 sm:flex sm:justify-end sm:px-5 dark:border-zinc-800">
          <WithdrawButton applicationId={application.id} marketName="this market" listed={status === 'approved'} />
        </div>
      ) : null}
    </article>
  );
}

function ChecklistSummary({ application }: { application: VendorApplicationView }) {
  const { progress } = application;
  const parts = [
    progress.approved ? `${progress.approved} approved` : null,
    progress.waiting ? `${progress.waiting} waiting` : null,
    progress.rejected ? `${progress.rejected} need a new one` : null,
    progress.missingRequired ? `${progress.missingRequired} required missing` : null,
  ].filter(Boolean);
  const warn = progress.missingRequired > 0 || progress.rejected > 0;
  return (
    <p className={cn('flex items-start gap-2 text-sm', warn ? 'text-amber-900 dark:text-amber-200' : 'text-zinc-600 dark:text-zinc-400')}>
      <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>
        {plural(progress.active, 'document asked for', 'documents asked for')}
        {parts.length ? `: ${parts.join(', ')}.` : '.'}
      </span>
    </p>
  );
}
