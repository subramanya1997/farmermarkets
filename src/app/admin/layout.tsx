import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ArrowUpRight, Inbox, LayoutDashboard, Store, Users } from 'lucide-react';
import { requireAdmin } from '@/lib/organizer';
import { DashboardShell, type DashboardNavGroup } from '@/components/dashboard/DashboardShell';
import { cachedReviewQueue, waitingCount } from './_lib/queue';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  // Claims, updates, photos and older requests waiting for a decision.
  const pending = waitingCount(await cachedReviewQueue());

  const groups: DashboardNavGroup[] = [
    {
      items: [
        { href: '/admin', label: 'Overview', icon: <LayoutDashboard />, exact: true },
        { href: '/admin/review', label: 'Review queue', icon: <Inbox />, also: ['/admin/claims', '/admin/changes'], count: pending },
        { href: '/admin/markets', label: 'Markets', icon: <Store /> },
        { href: '/admin/organizers', label: 'Organizers', icon: <Users /> },
      ],
    },
  ];

  return (
    <DashboardShell
      title="Admin"
      groups={groups}
      links={[{ href: '/', label: 'View site', icon: <ArrowUpRight /> }]}
      email={admin.email}
      mobileLink={pending > 0 ? { href: '/admin/review', label: `${pending} waiting`, icon: <Inbox /> } : undefined}
    >
      {children}
    </DashboardShell>
  );
}
