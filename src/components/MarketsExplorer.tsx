'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Map as MapIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trackEvent } from '@/lib/analytics';

/**
 * The interactive search / filter / map view, loaded on demand.
 *
 * `ssr: false` is the point: nothing about this view is server-rendered, so
 * `/markets` ships a small, fully crawlable HTML document and the explorer's
 * JavaScript and data only arrive when a reader asks for them.
 */
const InteractiveMarkets = dynamic(
  () => import('@/components/Markets').then((module) => ({ default: module.Markets })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-16">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-green-600" />
      </div>
    ),
  }
);

/**
 * Progressive enhancement wrapper for the map/filter UX.
 *
 * Collapsed by default so the server-rendered index below stays the primary
 * content; expanding it mounts the client explorer, which fetches its own data
 * from `/api/markets` rather than receiving it as props.
 */
export function MarketsExplorer() {
  const [open, setOpen] = useState(false);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    trackEvent('Market Explorer Toggled', { open: next });
  };

  return (
    <section className="w-full border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Prefer to search, filter, or see the markets on a map?
          </p>
          <Button variant="outline" size="sm" onClick={toggle}>
            {open ? (
              <>
                <X className="mr-2 h-4 w-4" />
                Close search &amp; map
              </>
            ) : (
              <>
                <MapIcon className="mr-2 h-4 w-4" />
                Open search &amp; map
              </>
            )}
          </Button>
        </div>
      </div>
      {open && <InteractiveMarkets hideHero showDiscoverySurvey={false} />}
    </section>
  );
}
