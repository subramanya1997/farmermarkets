import type { ReactNode } from 'react';
import { DashboardSidebar, DashboardTopBar, type DashboardNavProps } from './DashboardNav';

export type { DashboardArea, DashboardNavGroup, DashboardNavItem, DashboardNavProps } from './DashboardNav';

/**
 * The frame both dashboards share, laid out like Linear or Vercel: the
 * sidebar sits on a quiet grey canvas and the page is a raised white panel
 * beside it, with a slim breadcrumb bar on top. The panel scrolls on its own,
 * so the sidebar and bar stay put. On phones the panel fills the screen and
 * the sidebar opens as a sheet. The root layout adds nothing around it.
 */
export function DashboardShell({ children, ...nav }: DashboardNavProps & { children: ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <DashboardSidebar {...nav} />
      <div className="flex min-w-0 flex-1 flex-col lg:py-2 lg:pr-2">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white lg:rounded-xl lg:shadow-xs lg:ring-1 lg:ring-zinc-900/[0.06] dark:bg-zinc-900 dark:lg:ring-white/[0.06]">
          <DashboardTopBar {...nav} />
          <main className="flex-1 overflow-y-auto overscroll-contain">
            <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
