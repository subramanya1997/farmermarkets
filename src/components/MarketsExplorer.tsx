'use client';

import dynamic from 'next/dynamic';

/**
 * The interactive search / filter / map view.
 *
 * `ssr: false` is the point: nothing about this view is server-rendered, so
 * `/markets` still ships a small, fully crawlable HTML document and the
 * explorer's JavaScript and data hydrate on the client. The explorer mounts
 * immediately — search and the map are the primary way readers use the page,
 * so there is no click-to-load gate in front of it anymore.
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

export function MarketsExplorer() {
  return (
    <section className="w-full border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <InteractiveMarkets hideHero showDiscoverySurvey={false} />
    </section>
  );
}
