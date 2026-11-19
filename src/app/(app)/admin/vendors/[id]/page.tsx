import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { startVendorPreviewAction } from '@/app/(app)/vendor/actions';
import { Button } from '@/components/ui/button';
import { requireAdmin } from '@/lib/organizer';
import { adminVendor } from '@/lib/vendors';
import { attendanceLabel } from '@/lib/vendorRules';
import { Fact, Facts, Muted, Panel, TimeAgo } from '@/components/admin/bits';
import { formatDay, placeLabel } from '@/components/admin/format';
import { VendorApplicationAdmin, type AdminApplicationProps } from '@/components/admin/VendorApplicationAdmin';
import { VendorDangerZone } from '@/components/admin/VendorDangerZone';
import { VendorDecisionForm } from '@/components/admin/VendorDecisionForm';
import { ProfileDiff, ProfileReadOnly } from '@/components/admin/VendorProfileView';
import { SOURCE_LABELS, VENDOR_STATUS_LABELS, VendorStatusPill, vendorStatus } from '@/components/admin/VendorStatus';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Vendor',
  robots: { index: false, follow: false },
};

function documentType(contentType: string): string {
  if (contentType === 'application/pdf') return 'PDF';
  if (contentType === 'image/jpeg') return 'JPEG image';
  if (contentType === 'image/png') return 'PNG image';
  return contentType;
}

function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default async function AdminVendorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const vendor = await adminVendor(id);
  if (!vendor) notFound();

  const name = vendor.live?.name || vendor.proposed?.name || vendor.accountName || 'No name yet';
  const isLive = vendor.live !== null && !vendor.suspended;
  const status = vendorStatus({ state: vendor.state, live: isLive, suspended: vendor.suspended });
  const applications: AdminApplicationProps[] = vendor.applications.map((application) => ({
    id: application.id,
    market: application.market
      ? { slug: application.market.slug, name: application.market.name, place: placeLabel(application.market) }
      : null,
    status: application.status,
    decider: application.decider,
    waitingOnProfile: application.waitingOnProfile,
    days: attendanceLabel(application.days),
    stallNote: application.stallNote,
    message: application.message,
    decisionNote: application.decisionNote,
    createdAt: application.createdAt.toISOString(),
    checklist: application.checklist.map((line) => ({
      key: line.item.id,
      label: line.item.label,
      required: line.item.required,
      submission: line.submission,
    })),
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{name}</h1>
          <VendorStatusPill status={status} />
        </div>
        <form action={startVendorPreviewAction.bind(null, vendor.id)}>
          <Button type="submit" variant="link" className="h-auto gap-1 p-0 text-green-700 has-[>svg]:px-0 dark:text-green-400">
            Preview as vendor
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Button>
        </form>
      </div>

      <Panel title="Account">
        <Facts>
          <Fact label="Business name">{name}</Fact>
          <Fact label="Account email">
            <a href={`mailto:${vendor.email}`} className="text-green-700 underline-offset-2 hover:underline dark:text-green-400">
              {vendor.email}
            </a>
            {vendor.accountName ? <Muted>{` (${vendor.accountName})`}</Muted> : null}
          </Fact>
          <Fact label="Status">{VENDOR_STATUS_LABELS[status]}</Fact>
          <Fact label="Source">{SOURCE_LABELS[vendor.source] ?? vendor.source}</Fact>
          <Fact label="Joined">
            <TimeAgo date={vendor.createdAt} />
          </Fact>
          <Fact label="Announcements">{vendor.announcementsOptOut ? 'Opted out' : 'Subscribed'}</Fact>
          <Fact label="Public page">
            {isLive ? (
              <Link href={`/vendors/${vendor.slug}`} className="text-green-700 underline-offset-2 hover:underline dark:text-green-400">
                {`/vendors/${vendor.slug}`}
              </Link>
            ) : (
              <Muted>Not live</Muted>
            )}
          </Fact>
        </Facts>
      </Panel>

      <ProfileSection vendor={vendor} />

      <Panel title={`Applications (${applications.length})`}>
        {applications.length === 0 ? (
          <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">No applications yet.</p>
        ) : (
          <div className="divide-y">
            {applications.map((application) => (
              <VendorApplicationAdmin key={application.id} vendorId={vendor.id} application={application} />
            ))}
          </div>
        )}
      </Panel>

      <Panel title={`Documents (${vendor.documents.length})`}>
        {vendor.documents.length === 0 ? (
          <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">Nothing uploaded.</p>
        ) : (
          <ul className="divide-y">
            {vendor.documents.map((document) => (
              <li key={document.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium break-words">{document.label}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {documentType(document.contentType)}, {fileSize(document.size)}
                    {document.expiresOn ? `, ${document.expired ? 'expired' : 'expires'} ${formatDay(document.expiresOn)}` : ', no expiry'}
                    {`, used by ${document.usedBy} ${document.usedBy === 1 ? 'application' : 'applications'}`}
                  </p>
                </div>
                {/* A plain link: the file downloads, it is not a page. */}
                <a
                  href={`/api/vendor/documents/${document.id}`}
                  className="inline-flex min-h-11 items-center text-green-700 underline-offset-2 hover:underline sm:min-h-0 dark:text-green-400"
                >
                  Open
                </a>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Danger zone" className="border-red-200 dark:border-red-900/60">
        <VendorDangerZone vendorId={vendor.id} name={name} suspended={vendor.suspended} />
      </Panel>
    </div>
  );
}

function ProfileSection({ vendor }: { vendor: NonNullable<Awaited<ReturnType<typeof adminVendor>>> }) {
  const { state, proposed, live } = vendor;

  if (state === 'pending' && proposed) {
    return (
      <Panel title={live ? 'Profile update to review' : 'New profile to review'}>
        <ProfileDiff live={live} proposed={proposed} changed={vendor.changedFields} />
        <VendorDecisionForm vendorId={vendor.id} firstTime={live === null} submittedAt={vendor.submittedAt?.toISOString() ?? ''} />
      </Panel>
    );
  }

  if (state === 'rejected' && proposed) {
    return (
      <Panel title="Rejected proposal">
        <div className="border-b px-4 py-3 text-sm">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Note sent to the vendor</p>
          <p className="break-words whitespace-pre-line">{vendor.reviewNote || <Muted>No note was sent.</Muted>}</p>
        </div>
        <ProfileDiff live={live} proposed={proposed} changed={vendor.changedFields} />
      </Panel>
    );
  }

  if (state === 'draft' && proposed) {
    return (
      <Panel title="Draft, not submitted">
        <ProfileReadOnly profile={proposed} />
      </Panel>
    );
  }

  if (live) {
    return (
      <Panel title="Live profile">
        <ProfileReadOnly profile={live} />
      </Panel>
    );
  }

  return (
    <Panel title="Profile">
      <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">The vendor has not started a profile.</p>
    </Panel>
  );
}
