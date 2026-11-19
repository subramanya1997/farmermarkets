import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inbox, LayoutDashboard, LifeBuoy, Settings, Store, Users } from 'lucide-react';
import { requireAdmin } from '@/lib/organizer';
import { DashboardShell, type DashboardNavGroup } from '@/components/dashboard/DashboardShell';
import { cachedReviewQueue, cachedVendorQueue, vendorWaitingCount, waitingCount } from './_lib/queue';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  // Claims, updates, photos, older requests and vendor reviews waiting for a decision.
  const [reviewQueue, vendorQueue] = await Promise.all([cachedReviewQueue(), cachedVendorQueue()]);
  const pending = waitingCount(reviewQueue) + vendorWaitingCount(vendorQueue);

  const groups: DashboardNavGroup[] = [
    {
      items: [
        { href: '/admin', label: 'Overview', icon: <LayoutDashboard />, exact: true },
        { href: '/admin/review', label: 'Review queue', icon: <Inbox />, also: ['/admin/claims', '/admin/changes'], count: pending },
        { href: '/admin/markets', label: 'Markets', icon: <Store /> },
        { href: '/admin/organizers', label: 'Organizers', icon: <Users /> },
        { href: '/admin/vendors', label: 'Vendors', icon: <Store /> },
      ],
    },
  ];

  return (
    <DashboardShell
      title="Admin"
      groups={groups}
      footer={[
        { href: '/admin/settings', label: 'Settings', icon: <Settings /> },
        { href: '/admin/help', label: 'Help', icon: <LifeBuoy /> },
      ]}
      areas={[
        { href: '/admin', label: 'Admin', current: true },
        { href: '/dashboard', label: 'Organizer' },
        { href: '/vendor', label: 'Vendor' },
      ]}
      user={{ name: admin.name, email: admin.email }}
      settingsHref="/admin/settings"
      helpHref="/admin/help"
      mobileLink={pending > 0 ? { href: '/admin/review', label: `${pending} waiting`, icon: <Inbox /> } : undefined}
    >
      {children}
    </DashboardShell>
  );
}
