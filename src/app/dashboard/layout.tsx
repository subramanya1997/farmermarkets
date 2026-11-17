import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ArrowUpRight, LayoutDashboard, Plus, ShieldCheck, UserRound } from 'lucide-react';
import { isAdmin, requireOrganizer } from '@/lib/organizer';
import { DashboardShell, type DashboardNavGroup, type DashboardNavItem } from '@/components/dashboard/DashboardShell';
import { cachedOrganizerOverview } from './_lib/overview';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Organizer dashboard',
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireOrganizer('/dashboard');
  const markets = await cachedOrganizerOverview(user);

  const groups: DashboardNavGroup[] = [
    {
      items: [
        { href: '/dashboard', label: 'Overview', icon: <LayoutDashboard />, exact: true },
        { href: '/dashboard/claim', label: 'Claim a market', icon: <Plus /> },
        { href: '/dashboard/account', label: 'Account', icon: <UserRound /> },
      ],
    },
    {
      label: markets.length === 1 ? 'Your market' : 'Your markets',
      items: markets.map(({ market, pending }) => ({
        href: `/dashboard/markets/${market.slug}`,
        label: market.name,
        dot: pending ? 'Update waiting for review' : undefined,
      })),
    },
  ];

  const links: DashboardNavItem[] = [
    ...(isAdmin(user) ? [{ href: '/admin', label: 'Admin dashboard', icon: <ShieldCheck /> }] : []),
    { href: '/', label: 'View site', icon: <ArrowUpRight /> },
  ];

  return (
    <DashboardShell title="Organizer" groups={groups} links={links} email={user.email}>
      {children}
    </DashboardShell>
  );
}
