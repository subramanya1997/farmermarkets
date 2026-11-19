import type { Metadata } from 'next';
import Link from 'next/link';
import { Download, Eye, Megaphone } from 'lucide-react';
import { startVendorPreviewAction } from '@/app/(app)/vendor/actions';
import { Button } from '@/components/ui/button';
import { requireAdmin } from '@/lib/organizer';
import { adminVendors, VENDOR_PREVIEW_NEW } from '@/lib/vendors';
import { VendorsTable, type VendorTableRow } from '@/components/admin/VendorsTable';
import { VendorInviteForm } from '@/components/admin/VendorInviteForm';
import { vendorStatus } from '@/components/admin/VendorStatus';
import { formatTimestamp, timeAgo } from '@/components/admin/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Vendors',
  robots: { index: false, follow: false },
};

const LINK_BUTTON =
  'inline-flex h-11 items-center gap-2 rounded-md border bg-white px-4 text-sm font-medium shadow-xs hover:bg-zinc-50 sm:h-9 dark:bg-zinc-900 dark:hover:bg-zinc-800';

export default async function AdminVendorsPage() {
  await requireAdmin();
  const vendors = await adminVendors();

  const rows: VendorTableRow[] = vendors.map((vendor) => ({
    id: vendor.id,
    name: vendor.name,
    email: vendor.email,
    status: vendorStatus(vendor),
    source: vendor.source,
    joined: timeAgo(vendor.createdAt),
    joinedTitle: formatTimestamp(vendor.createdAt),
    listed: vendor.markets.approved.map((market) => market.name),
    waiting: vendor.markets.pending.map((market) => market.name),
    documents: vendor.documents,
  }));
  const live = rows.filter((row) => row.status === 'live' || row.status === 'live-update').length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="sr-only">Vendors</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {rows.length} {rows.length === 1 ? 'vendor' : 'vendors'}, {live} with a live profile. Newest first.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* A plain link on purpose: the CSV is a download and must not be prefetched. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/admin/vendors/export" className={LINK_BUTTON}>
            <Download className="size-4" aria-hidden="true" />
            Download CSV
          </a>
          <Link href="/admin/vendors/announce" className={LINK_BUTTON}>
            <Megaphone className="size-4" aria-hidden="true" />
            Send an announcement
          </Link>
          <form action={startVendorPreviewAction.bind(null, VENDOR_PREVIEW_NEW)}>
            <Button type="submit" variant="outline" className="h-11 sm:h-9">
              <Eye aria-hidden="true" />
              Preview as a new vendor
            </Button>
          </form>
        </div>
      </div>

      <VendorInviteForm />
      <VendorsTable rows={rows} />
    </div>
  );
}
