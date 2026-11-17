import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { FileText, LayoutDashboard, MapPin, Settings, Store } from 'lucide-react';
import { isAdmin, managedMarketIds, requireOrganizer } from '@/lib/organizer';
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
  const [overview, managed] = await Promise.all([cachedVendorOverview(user), admin ? Promise.resolve([]) : managedMarketIds(user.id)]);
  const attention = overview.applications.filter(needsDocument).length;

  const groups: DashboardNavGroup[] = [
    {
      items: [
        { href: '/vendor', label: 'Overview', icon: <LayoutDashboard />, exact: true },
        { href: '/vendor/profile', label: 'Profile', icon: <Store /> },
        { href: '/vendor/markets', label: 'Markets', icon: <MapPin />, count: attention },
        { href: '/vendor/documents', label: 'Documents', icon: <FileText /> },
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
      {children}
    </DashboardShell>
  );
}
