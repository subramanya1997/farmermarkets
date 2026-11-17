import type { ReactNode } from 'react';
import { DashboardSidebar, DashboardTopBar, type DashboardNavProps } from './DashboardNav';

export type { DashboardNavGroup, DashboardNavItem, DashboardNavProps } from './DashboardNav';

/**
 * The frame both dashboards share, filling the window like an app: a
 * full-height sidebar on large screens, a top bar over the page (with the
 * menu sheet on phones), and the page itself, which scrolls on its own so
 * the sidebar and top bar stay put. It is the whole page: the root layout
 * adds no header or footer around it.
 */
export function DashboardShell({ children, ...nav }: DashboardNavProps & { children: ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <DashboardSidebar {...nav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopBar {...nav} />
        <main className="flex-1 overflow-y-auto overscroll-contain">
          <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
