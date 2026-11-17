'use client';

import { useState, type ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DESK_TABS, type DeskTab } from './bits';

const TRIGGER =
  'min-h-10 flex-1 px-3 text-sm data-[state=active]:text-zinc-950 dark:data-[state=active]:text-zinc-50';

/**
 * The desk's three tabs. The chosen tab is kept in `?tab=` (replaceState, so
 * no server round trip and no extra history entries), which means a refresh
 * or a `router.refresh()` after an action lands on the same tab.
 */
export function DeskTabs({
  initialTab,
  pendingCount,
  applications,
  vendors,
  checklist,
}: {
  initialTab: DeskTab;
  pendingCount: number;
  applications: ReactNode;
  vendors: ReactNode;
  checklist: ReactNode;
}) {
  const [tab, setTab] = useState<DeskTab>(initialTab);

  function choose(next: string) {
    const value = (DESK_TABS as readonly string[]).includes(next) ? (next as DeskTab) : 'applications';
    setTab(value);
    const url = new URL(window.location.href);
    if (value === 'applications') url.searchParams.delete('tab');
    else url.searchParams.set('tab', value);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  return (
    <Tabs value={tab} onValueChange={choose} className="gap-4">
      <TabsList className="h-12 w-full group-data-[orientation=horizontal]/tabs:h-12 sm:w-fit">
        <TabsTrigger value="applications" className={TRIGGER}>
          Applications
          {pendingCount > 0 ? (
            <span className="rounded-full bg-green-700 px-1.5 py-px text-xs font-semibold text-white tabular-nums dark:bg-green-600">
              {pendingCount}
              <span className="sr-only"> waiting</span>
            </span>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="vendors" className={TRIGGER}>
          Vendors
        </TabsTrigger>
        <TabsTrigger value="checklist" className={TRIGGER}>
          Checklist
        </TabsTrigger>
      </TabsList>
      <TabsContent value="applications" className="min-w-0">
        {applications}
      </TabsContent>
      <TabsContent value="vendors" className="min-w-0">
        {vendors}
      </TabsContent>
      {/* Kept mounted so unsaved checklist edits survive a look at another tab. */}
      <TabsContent value="checklist" forceMount className="min-w-0 data-[state=inactive]:hidden">
        {checklist}
      </TabsContent>
    </Tabs>
  );
}
