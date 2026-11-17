import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, Inbox, Users } from 'lucide-react';
import { getPublishedMarket, requireOrganizer } from '@/lib/organizer';
import { marketVendorDesk, type DeskApplication } from '@/lib/vendors';
import { attendanceLabel } from '@/lib/vendorRules';
import { PageHeader } from '@/components/dashboard/DocBits';
import { TimeAgo } from '@/components/admin/bits';
import { FormAlert } from '@/components/organizer/auth/FormBits';
import { ApplyLink } from '@/components/organizer/vendors/ApplyLink';
import { ChecklistEditor } from '@/components/organizer/vendors/ChecklistEditor';
import { DeskTabs } from '@/components/organizer/vendors/DeskTabs';
import {
  ConfirmedPill,
  VendorThumb,
  productsLabel,
  progressSummary,
  readDeskTab,
} from '@/components/organizer/vendors/bits';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Vendors',
  robots: { index: false, follow: false },
};

export default async function VendorDeskPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { slug } = await params;
  const { tab } = await searchParams;
  const user = await requireOrganizer(`/dashboard/markets/${slug}/vendors`);
  const market = await getPublishedMarket(slug);
  if (!market) notFound();
  const desk = await marketVendorDesk(user, market);
  if (!desk) notFound();

  const base = `/dashboard/markets/${market.slug}/vendors`;
  const pending = desk.applications.filter((row) => row.status === 'pending');
  const approved = desk.applications.filter((row) => row.status === 'approved');
  const denied = desk.applications.filter((row) => row.status === 'denied');
  const place = [market.city, market.state].filter(Boolean).join(', ');

  return (
    <div className="mx-auto flex max-w-3xl min-w-0 flex-col gap-5">
      <PageHeader title={`Vendors at ${market.name}`} />

      <div className="min-w-0">
        <p className="text-xl font-semibold tracking-tight break-words text-zinc-900 dark:text-zinc-50">{market.name}</p>
        {place ? <p className="text-sm text-zinc-600 dark:text-zinc-400">{place}</p> : null}
      </div>

      <ApplyLink url={desk.applyUrl} accepting={desk.checklist.settings.accepting} />

      <DeskTabs
        initialTab={readDeskTab(tab)}
        pendingCount={desk.counts.pending}
        applications={
          <div className="flex flex-col gap-3">
            {desk.hasOrganizer ? null : (
              <FormAlert tone="info">
                This market has no organizer yet, so Farmer Markets decides these applications.
              </FormAlert>
            )}
            {pending.length === 0 ? (
              <EmptyState icon={<Inbox aria-hidden="true" className="size-6" />} title="No applications waiting">
                Vendors apply from your application link above. Once they send one, it shows up here and we email you. Set the documents
                you want them to send under Checklist.
              </EmptyState>
            ) : (
              <>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Oldest first, so nobody waits too long.</p>
                <ul className="flex flex-col gap-3">
                  {pending.map((application) => (
                    <li key={application.id}>
                      <PendingCard application={application} href={`${base}/${application.id}`} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        }
        vendors={
          <div className="flex flex-col gap-6">
            <section aria-labelledby="approved-vendors" className="flex flex-col gap-3">
              <h2 id="approved-vendors" className="text-base font-semibold tracking-tight">
                Approved <span className="font-normal text-zinc-500 tabular-nums dark:text-zinc-400">{approved.length}</span>
              </h2>
              {approved.length === 0 ? (
                <EmptyState icon={<Users aria-hidden="true" className="size-6" />} title="No approved vendors yet">
                  Vendors you approve show up here and on your market page.
                </EmptyState>
              ) : (
                <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
                  {approved.map((application) => (
                    <li key={application.id}>
                      <VendorRow application={application} href={`${base}/${application.id}`} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {denied.length > 0 ? (
              <section aria-labelledby="denied-vendors" className="flex flex-col gap-2">
                <h2 id="denied-vendors" className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
                  Not approved <span className="font-normal tabular-nums">{denied.length}</span>
                </h2>
                <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                  {denied.map((application) => (
                    <li key={application.id}>
                      <VendorRow application={application} href={`${base}/${application.id}`} quiet />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        }
        checklist={<ChecklistEditor slug={market.slug} checklist={desk.checklist} />}
      />
    </div>
  );
}

function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-zinc-300 bg-white px-5 py-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <span className="flex size-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        {icon}
      </span>
      <p className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</p>
      <p className="mt-1 max-w-md text-sm text-zinc-600 dark:text-zinc-400">{children}</p>
    </div>
  );
}

/** A pending application as a card; the whole card opens it. */
function PendingCard({ application, href }: { application: DeskApplication; href: string }) {
  const sells = productsLabel(application.vendor.products);
  const days = attendanceLabel(application.days);
  const docs = progressSummary(application.progress);
  return (
    <article className="relative flex gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-xs transition-colors focus-within:ring-2 focus-within:ring-green-700/40 hover:border-zinc-300 sm:gap-4 sm:p-4 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
      <VendorThumb url={application.vendor.cover?.url} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="text-base leading-6 font-semibold break-words text-zinc-900 dark:text-zinc-50">
          <Link href={href} className="outline-none after:absolute after:inset-0 after:rounded-xl">
            {application.vendor.name}
          </Link>
        </h3>
        {sells ? <p className="text-sm break-words text-zinc-700 dark:text-zinc-300">{sells}</p> : null}
        {days ? <p className="text-sm text-zinc-600 dark:text-zinc-400">{days}</p> : null}
        <p className={cn('text-sm', docs.attention ? 'text-amber-900 dark:text-amber-200' : 'text-zinc-600 dark:text-zinc-400')}>{docs.text}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Applied <TimeAgo date={application.createdAt} />
        </p>
      </div>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 self-center text-zinc-400" />
    </article>
  );
}

/** One row in the Vendors tab. */
function VendorRow({ application, href, quiet = false }: { application: DeskApplication; href: string; quiet?: boolean }) {
  const sells = productsLabel(application.vendor.products);
  const days = attendanceLabel(application.days);
  const detail = [sells, days].filter(Boolean).join(' · ');
  return (
    <Link
      href={href}
      className={cn(
        'flex min-h-14 items-center gap-3 px-3 py-3 outline-none focus-visible:bg-zinc-50 hover:bg-zinc-50 sm:px-4 dark:focus-visible:bg-zinc-800/60 dark:hover:bg-zinc-800/60',
        quiet && 'py-2.5',
      )}
    >
      {quiet ? null : <VendorThumb url={application.vendor.cover?.url} className="size-11 sm:size-12" />}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            'break-words',
            quiet ? 'text-sm text-zinc-700 dark:text-zinc-300' : 'text-sm font-semibold text-zinc-900 dark:text-zinc-50',
          )}
        >
          {application.vendor.name}
        </span>
        {!quiet && detail ? <span className="text-sm break-words text-zinc-600 dark:text-zinc-400">{detail}</span> : null}
        {quiet && application.decidedAt ? (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Decided <TimeAgo date={application.decidedAt} />
          </span>
        ) : null}
        {!quiet && application.confirmed ? (
          <span className="mt-1">
            <ConfirmedPill />
          </span>
        ) : null}
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-zinc-400" />
    </Link>
  );
}
