'use client';

import { useEffect, useMemo, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { currentMarketUpdates } from '@/lib/marketUpdateRules';

export interface MarketShopperUpdatesProps {
  updates: { id: string; body: string; startsAt: string; endsAt: string }[];
  /** When the server rendered the page, so the first paint matches the HTML. */
  renderedAt: string;
}

/**
 * Notes from the market's organizers, under the market name. The page can be
 * cached for a day, so it carries every update that has not ended yet; which
 * ones show is decided again in the browser, and an expired update
 * disappears on its own. The body is plain text: React escapes it, and line
 * breaks come from CSS, never from HTML.
 */
export function MarketShopperUpdates({ updates, renderedAt }: MarketShopperUpdatesProps) {
  const [now, setNow] = useState(() => new Date(renderedAt));

  useEffect(() => {
    // Re-check at the next start or end after the time we last rendered for.
    // If the page was cached and one already passed, that is right away.
    const times = updates.flatMap((update) => [Date.parse(update.startsAt), Date.parse(update.endsAt)]);
    const next = Math.min(...times.filter((time) => time > now.getTime()));
    if (!Number.isFinite(next)) return;
    // setTimeout overflows past about 24.8 days; a tab open that long can wait.
    const delay = Math.min(Math.max(0, next - Date.now() + 500), 2 ** 31 - 1);
    const timer = window.setTimeout(() => setNow(new Date()), delay);
    return () => window.clearTimeout(timer);
  }, [updates, now]);

  const live = useMemo(
    () =>
      currentMarketUpdates(
        updates.map((update) => ({ ...update, startsAt: new Date(update.startsAt), endsAt: new Date(update.endsAt), withdrawnAt: null })),
        now,
      ),
    [updates, now],
  );

  if (live.length === 0) return null;

  return (
    <section
      aria-label="Updates from the market"
      className="flex max-w-3xl gap-3 rounded-lg border border-green-200 bg-green-50 px-3.5 py-3 text-sm text-green-950 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-50"
    >
      <Megaphone aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-green-700 dark:text-green-400" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold tracking-wide text-green-800 uppercase dark:text-green-300">From the market</p>
        <ul className="mt-1 flex flex-col gap-2">
          {live.map((update) => (
            <li key={update.id} className="break-words whitespace-pre-line">
              {update.body}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
