import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowUpRight, Download, FileText } from 'lucide-react';
import { getPublishedMarket, requireOrganizer } from '@/lib/organizer';
import { deskApplication, type ChecklistLine } from '@/lib/vendors';
import { attendanceLabel } from '@/lib/vendorRules';
import { PageHeader } from '@/components/dashboard/DocBits';
import { ExternalA, Fact, Facts, Muted, TimeAgo } from '@/components/admin/bits';
import { safeHttpUrl } from '@/components/admin/format';
import { TEXT_LINK } from '@/components/organizer/auth/FormBits';
import { SOCIAL_LABELS } from '@/components/organizer/editor/labels';
import { ApplicationDecision } from '@/components/organizer/vendors/ApplicationDecision';
import { DocumentDecision } from '@/components/organizer/vendors/DocumentDecision';
import { ApplicationStatusPill, ConfirmedPill, DocumentStatusPill, VendorThumb, productsLabel } from '@/components/organizer/vendors/bits';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Vendor application',
  robots: { index: false, follow: false },
};

export default async function VendorApplicationPage({ params }: { params: Promise<{ slug: string; applicationId: string }> }) {
  const { slug, applicationId } = await params;
  const user = await requireOrganizer(`/dashboard/markets/${slug}/vendors/${applicationId}`);
  const market = await getPublishedMarket(slug);
  if (!market) notFound();
  const application = await deskApplication(user, market, applicationId);
  if (!application) notFound();

  const { vendor, profile } = application;
  const sells = productsLabel(vendor.products);
  const days = attendanceLabel(application.days);
  const website = safeHttpUrl(profile.website);
  const socials = profile.social_profiles.flatMap((social) => {
    const url = safeHttpUrl(social.url);
    return url ? [{ url, label: SOCIAL_LABELS[social.platform] ?? 'Link' }] : [];
  });
  const requiredNotReady = application.checklist.filter((line) => line.item.required && line.submission?.status !== 'approved').length;
  // Verdicts can still change while the vendor is waiting or selling here.
  const canDecideDocuments = application.status === 'pending' || application.status === 'approved';

  return (
    <div className="mx-auto flex max-w-6xl min-w-0 flex-col gap-5">
      <PageHeader title={`Application from ${vendor.name}`} />

      <header className="flex min-w-0 items-center gap-3 sm:gap-4">
        <VendorThumb url={vendor.cover?.url} />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xl leading-7 font-semibold tracking-tight break-words text-zinc-900 dark:text-zinc-50">{vendor.name}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            <ApplicationStatusPill status={application.status} />
            {application.status === 'approved' && application.confirmed ? <ConfirmedPill /> : null}
            <span>
              Applied <TimeAgo date={application.createdAt} />
            </span>
          </div>
        </div>
      </header>

      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card title="The vendor">
            {vendor.cover ? (
              // A plain image keeps the vendor's own crop; Blob photos are already sized for the web.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={vendor.cover.url}
                alt={vendor.cover.alt || `Photo from ${vendor.name}`}
                className="aspect-[16/9] w-full border-b border-zinc-200 object-cover dark:border-zinc-800"
              />
            ) : null}
            <Facts>
              <Fact label="Business name">{vendor.name}</Fact>
              <Fact label="What they sell">{sells || <Muted>Not given</Muted>}</Fact>
              {profile.items.length ? <Fact label="Specialties">{profile.items.join(', ')}</Fact> : null}
              {profile.description ? (
                <Fact label="About">
                  <span className="whitespace-pre-line">{profile.description}</span>
                </Fact>
              ) : null}
              {website ? (
                <Fact label="Website">
                  <ExternalA href={website} className="break-all">
                    {displayUrl(website)}
                  </ExternalA>
                </Fact>
              ) : null}
              {socials.length ? (
                <Fact label="Social">
                  <ul className="flex flex-col gap-1">
                    {socials.map((social) => (
                      <li key={social.url}>
                        <ExternalA href={social.url}>{social.label}</ExternalA>
                      </li>
                    ))}
                  </ul>
                </Fact>
              ) : null}
              {profile.phone ? (
                <Fact label="Public phone">
                  <a href={`tel:${profile.phone.replace(/[^\d+]/g, '')}`} className={TEXT_LINK}>
                    {profile.phone}
                  </a>
                </Fact>
              ) : null}
              {profile.email ? (
                <Fact label="Public email">
                  <a href={`mailto:${profile.email}`} className={cn(TEXT_LINK, 'break-all')}>
                    {profile.email}
                  </a>
                </Fact>
              ) : null}
              <Fact label="Email">
                <a href={`mailto:${application.accountEmail}`} className={cn(TEXT_LINK, 'break-all')}>
                  {application.accountEmail}
                </a>
                <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">The address they sign in with.</span>
              </Fact>
              {vendor.live ? (
                <Fact label="Public page">
                  <Link href={`/vendors/${vendor.slug}`} target="_blank" rel="noopener" className={cn(TEXT_LINK, 'inline-flex items-center gap-1')}>
                    See their page
                    <ArrowUpRight aria-hidden="true" className="size-3.5" />
                  </Link>
                </Fact>
              ) : null}
            </Facts>
          </Card>

          <Card title="The application">
            <Facts>
              <Fact label="Status">
                <ApplicationStatusPill status={application.status} />
              </Fact>
              <Fact label="Applied">
                <TimeAgo date={application.createdAt} />
              </Fact>
              {application.decidedAt ? (
                <Fact label="Decided">
                  <TimeAgo date={application.decidedAt} />
                </Fact>
              ) : null}
              <Fact label="Days">{days || <Muted>Not given</Muted>}</Fact>
              <Fact label="Stall">{application.stallNote ? application.stallNote : <Muted>No stall note</Muted>}</Fact>
              <Fact label="Their message">
                {application.message ? <span className="whitespace-pre-line">{application.message}</span> : <Muted>No message</Muted>}
              </Fact>
            </Facts>
          </Card>

          <Card title="Documents">
            {application.checklist.length === 0 ? (
              <p className="px-4 py-4 text-sm text-zinc-600 dark:text-zinc-400">
                Your market does not ask for any documents.{' '}
                <Link href={`/dashboard/markets/${market.slug}/vendors?tab=checklist`} className={TEXT_LINK}>
                  Set up a checklist
                </Link>
              </p>
            ) : (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {application.checklist.map((line) => (
                  <DocumentLine key={line.item.id} line={line} slug={market.slug} canDecide={canDecideDocuments} />
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-6">
          <ApplicationDecision
            slug={market.slug}
            applicationId={application.id}
            vendorName={vendor.name}
            status={application.status}
            decisionNote={application.decisionNote}
            requiredNotReady={requiredNotReady}
            vendorLive={vendor.live}
          />
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="border-b border-zinc-200 px-4 py-3 text-base font-semibold tracking-tight dark:border-zinc-800">{title}</h2>
      {children}
    </section>
  );
}

function DocumentLine({ line, slug, canDecide }: { line: ChecklistLine; slug: string; canDecide: boolean }) {
  const { item, submission } = line;
  return (
    <li className="flex min-w-0 flex-col gap-3 px-4 py-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="text-sm font-semibold break-words text-zinc-900 dark:text-zinc-100">{item.label}</p>
          {item.description ? <p className="mt-0.5 text-xs break-words text-zinc-500 dark:text-zinc-400">{item.description}</p> : null}
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium',
            item.required
              ? 'border-zinc-300 text-zinc-800 dark:border-zinc-600 dark:text-zinc-200'
              : 'border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400',
          )}
        >
          {item.required ? 'Required' : 'Optional'}
        </span>
      </div>

      {submission ? (
        <>
          <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:flex-row sm:items-center dark:border-zinc-800 dark:bg-zinc-950/40">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-zinc-500" />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-sm break-words text-zinc-800 dark:text-zinc-200">{submission.documentLabel}</span>
                <DocumentStatusPill status={submission.status} />
              </div>
            </div>
            <a
              href={`/api/vendor/documents/${submission.documentId}`}
              className="inline-flex h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 sm:h-10 sm:w-auto dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              aria-label={`Open ${submission.documentLabel}`}
            >
              <Download aria-hidden="true" className="size-4" />
              Open
            </a>
          </div>
          {submission.note ? (
            <p className="text-sm break-words whitespace-pre-line text-zinc-700 dark:text-zinc-300">
              <span className="font-medium">Your note: </span>
              {submission.note}
            </p>
          ) : null}
          {canDecide ? (
            <DocumentDecision
              slug={slug}
              submissionId={submission.id}
              status={submission.status}
              note={submission.note}
            />
          ) : null}
        </>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Not provided</p>
      )}
    </li>
  );
}

/** "example.com/shop" for a link's visible text. */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}
