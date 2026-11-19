import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Eye, FileText, Footprints, LayoutDashboard, MapPin, Settings, ShoppingBasket, Store } from 'lucide-react';
import { isAdmin, managedMarketIds, requireOrganizer } from '@/lib/organizer';
import { vendorPreview } from '@/lib/vendors';
import { Button } from '@/components/ui/button';
import { endVendorPreviewAction } from './actions';
import { DashboardShell, type DashboardArea, type DashboardNavGroup, type DashboardNavItem } from '@/components/dashboard/DashboardShell';
import { cachedVendorOverview, needsDocument } from './_lib/overview';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Vendor',
  robots: { index: false, follow: false },
};

export default async function VendorLayout({ children }: { children: ReactNode }) {
  const user = await requireOrganizer('/vendor');
  const admin = isAdmin(user);
  const [overview, managed, preview] = await Promise.all([
    cachedVendorOverview(user),
    admin ? Promise.resolve([]) : managedMarketIds(user.id),
    vendorPreview(user),
  ]);
  const attention = overview.applications.filter(needsDocument).length;
  const asked = overview.applications.some((application) => application.progress.active > 0 && (application.status === 'pending' || application.status === 'approved'));
  const listed = overview.applications.some((application) => application.market && application.status === 'approved');

  const groups: DashboardNavGroup[] = [
    {
      items: [
        { href: '/vendor', label: 'Overview', icon: <LayoutDashboard />, exact: true },
        { href: '/vendor/profile', label: 'Profile', icon: <Store /> },
        { href: '/vendor/markets', label: 'Markets', icon: <MapPin />, count: attention },
        ...(listed ? [{ href: '/vendor/offerings', label: 'This week', icon: <ShoppingBasket /> }] : []),
        ...(overview.publicPath ? [{ href: '/vendor/footprint', label: 'Footprint', icon: <Footprints /> }] : []),
        ...(asked || overview.documents.length > 0 ? [{ href: '/vendor/documents', label: 'Documents', icon: <FileText /> }] : []),
      ],
    },
  ];

  const footer: DashboardNavItem[] = [{ href: '/vendor/settings', label: 'Settings', icon: <Settings /> }];

  const areas: DashboardArea[] = [{ href: '/vendor', label: 'Vendor', current: true }];
  if (admin || managed.length > 0) areas.push({ href: '/dashboard', label: 'Organizer' });
  if (admin) areas.push({ href: '/admin', label: 'Admin' });

  return (
    <DashboardShell
      title="Vendor"
      groups={groups}
      footer={footer}
      areas={areas}
      user={{ name: user.name, email: user.email }}
      settingsHref="/vendor/settings"
      helpHref="/vendor"
      mobileLink={attention > 0 ? { href: '/vendor/markets', label: attention === 1 ? '1 needs a document' : `${attention} need a document`, icon: <FileText /> } : undefined}
    >
      {preview ? (
        <div className="mb-6 flex flex-col gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950 sm:flex-row sm:items-center sm:justify-between dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-100">
          <p className="flex items-start gap-2">
            <Eye aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-medium">Previewing as {preview.label}.</span>{' '}
              {preview.vendor ? 'This is their vendor desk.' : 'This is the first screen a vendor sees.'} Nothing you do here is saved.
            </span>
          </p>
          <form action={endVendorPreviewAction} className="shrink-0">
            <Button
              type="submit"
              variant="outline"
              className="h-11 w-full border-sky-300 bg-white hover:bg-sky-100 sm:h-9 sm:w-auto dark:border-sky-800 dark:bg-sky-950 dark:hover:bg-sky-900"
            >
              Exit preview
            </Button>
          </form>
        </div>
      ) : null}
      {children}
    </DashboardShell>
  );
}
