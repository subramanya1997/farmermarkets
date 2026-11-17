import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Info, LayoutDashboard, LifeBuoy, Plus, Settings } from 'lucide-react';
import { isAdmin, requireOrganizer } from '@/lib/organizer';
import { DashboardShell, type DashboardArea, type DashboardNavGroup, type DashboardNavItem } from '@/components/dashboard/DashboardShell';
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

  const footer: DashboardNavItem[] = [
    { href: '/dashboard/settings', label: 'Settings', icon: <Settings />, also: ['/dashboard/account'] },
    { href: '/dashboard/help', label: 'Help', icon: <LifeBuoy /> },
    { href: '/dashboard/about', label: 'About', icon: <Info /> },
  ];

  const areas: DashboardArea[] = isAdmin(user)
    ? [
        { href: '/dashboard', label: 'Organizer', current: true },
        { href: '/admin', label: 'Admin' },
      ]
    : [{ href: '/dashboard', label: 'Organizer', current: true }];

  return (
    <DashboardShell
      title="Organizer"
      groups={groups}
      footer={footer}
      areas={areas}
      user={{ name: user.name, email: user.email }}
      settingsHref="/dashboard/settings"
      helpHref="/dashboard/help"
    >
      {children}
    </DashboardShell>
  );
}
