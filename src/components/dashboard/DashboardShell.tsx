import type { ReactNode } from 'react';
import { DashboardMobileBar, DashboardSidebar, type DashboardNavProps } from './DashboardNav';

export type { DashboardNavGroup, DashboardNavItem, DashboardNavProps } from './DashboardNav';

/**
 * The frame both dashboards share: a sidebar on large screens, a slim bar
 * with a menu sheet on phones, and the page on the right.
 */
export function DashboardShell({ children, ...nav }: DashboardNavProps & { children: ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-zinc-50 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] dark:bg-zinc-950">
      <DashboardSidebar {...nav} />
      <div className="min-w-0">
        <DashboardMobileBar {...nav} />
        <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </div>
    </div>
  );
}
