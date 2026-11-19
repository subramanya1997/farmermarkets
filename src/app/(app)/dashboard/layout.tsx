import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Eye, Info, LayoutDashboard, LifeBuoy, Plus, Settings, Store } from 'lucide-react';
import { isAdmin, organizerPreviewMarket, requireOrganizer } from '@/lib/organizer';
import { getVendorForUser, pendingApplicationCounts } from '@/lib/vendors';
import { Button } from '@/components/ui/button';
import { endOrganizerPreviewAction } from './actions';
import { DashboardShell, type DashboardArea, type DashboardNavGroup, type DashboardNavItem } from '@/components/dashboard/DashboardShell';
import { cachedOrganizerOverview } from './_lib/overview';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Organizer dashboard',
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireOrganizer('/dashboard');
  const [markets, preview, vendor] = await Promise.all([
    cachedOrganizerOverview(user),
    organizerPreviewMarket(user),
    getVendorForUser(user.id),
  ]);
  // Vendor applications waiting on each market this account manages.
  const waiting = await pendingApplicationCounts(markets.map(({ market }) => market.id));

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
        // The vendor desk below is its own entry, so only the market home and its updates light this one.
        exact: true,
        also: [`/dashboard/markets/${market.slug}/updates`],
        dot: pending ? 'Update waiting for review' : undefined,
      })),
    },
    {
      label: 'Vendors',
      items: markets.map(({ market }) => ({
        href: `/dashboard/markets/${market.slug}/vendors`,
        label: markets.length === 1 ? 'Applications' : market.name,
        icon: <Store />,
        count: waiting.get(market.id) || undefined,
      })),
    },
  ];

  const footer: DashboardNavItem[] = [
    { href: '/dashboard/settings', label: 'Settings', icon: <Settings />, also: ['/dashboard/account'] },
    { href: '/dashboard/help', label: 'Help', icon: <LifeBuoy /> },
    { href: '/dashboard/about', label: 'About', icon: <Info /> },
  ];

  const areas: DashboardArea[] = [
    { href: '/dashboard', label: 'Organizer', current: true },
    // An account can run a market and sell at markets too.
    ...(vendor ? [{ href: '/vendor', label: 'Vendor' }] : []),
    ...(isAdmin(user) ? [{ href: '/admin', label: 'Admin' }] : []),
  ];

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
      {preview ? (
        <div className="mb-6 flex flex-col gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950 sm:flex-row sm:items-center sm:justify-between dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-100">
          <p className="flex items-start gap-2">
            <Eye aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-medium">Previewing as the organizer of {preview.name}.</span> This is what they see once their claim is
              approved. Anything you send here goes to your review queue.
            </span>
          </p>
          <form action={endOrganizerPreviewAction.bind(null, preview.slug)} className="shrink-0">
            <Button
              type="submit"
              variant="outline"
              className="w-full border-sky-300 bg-white hover:bg-sky-100 sm:w-auto dark:border-sky-800 dark:bg-sky-950 dark:hover:bg-sky-900"
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
