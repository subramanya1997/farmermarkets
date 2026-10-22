'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { OrderingBadge, TopicMarketRow } from '@/lib/topicPage';
import { TopicMarketCard } from '../_components/TopicMarketRow';

type Filter = 'All' | OrderingBadge;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'All', label: 'All' },
  { key: 'Online', label: 'Online ordering' },
  { key: 'Delivery', label: 'Delivery' },
  { key: 'CSA', label: 'CSA' },
];

/**
 * Every ordering, delivery and CSA market, grouped by state, with filter
 * chips. The full list is server-rendered (the filter only hides rows), so
 * crawlers and no-JS readers see every market.
 */
export function OrderingMarkets({
  markets,
  counts,
}: {
  markets: TopicMarketRow[];
  counts: Record<OrderingBadge, number>;
}) {
  const [filter, setFilter] = useState<Filter>('All');

  const groups = useMemo(() => {
    const byState = new Map<string, { name: string; href: string; markets: TopicMarketRow[] }>();
    for (const market of markets) {
      if (filter !== 'All' && !market.badges.includes(filter)) continue;
      const group = byState.get(market.stateHref) ?? {
        name: market.stateName,
        href: market.stateHref,
        markets: [],
      };
      group.markets.push(market);
      byState.set(market.stateHref, group);
    }
    return [...byState.values()];
  }, [markets, filter]);

  return (
    <div>
      <div role="group" aria-label="Filter markets" className="flex flex-wrap gap-1.5">
        {FILTERS.map(({ key, label }) => {
          const active = filter === key;
          const count = key === 'All' ? markets.length : counts[key];
          if (count === 0) return null;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                active
                  ? 'border-green-700 bg-green-700 text-white dark:border-green-500 dark:bg-green-600'
                  : 'border-zinc-200 bg-white text-zinc-800 hover:border-green-300 hover:bg-green-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'
              }`}
            >
              {label}
              <span
                className={`text-xs tabular-nums ${
                  active ? 'text-green-100' : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                {count.toLocaleString('en-US')}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 space-y-6">
        {groups.map((group) => (
          <section key={group.href} aria-label={group.name}>
            <h3 className="mb-2.5 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <Link href={group.href} className="hover:text-green-700 hover:underline dark:hover:text-green-500">
                {group.name}
              </Link>
              <span className="font-normal tabular-nums">{group.markets.length}</span>
            </h3>
            <TopicMarketCard markets={group.markets} />
          </section>
        ))}
      </div>
    </div>
  );
}
