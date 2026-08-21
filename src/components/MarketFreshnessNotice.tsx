import { Clock } from 'lucide-react';
import { marketFreshness, type MarketFreshnessRecord } from '@/lib/freshness';

interface MarketFreshnessNoticeProps {
  market: MarketFreshnessRecord;
}

/**
 * The header caveat: this listing is old, or is gone from the source directory.
 *
 * Deliberately quiet — a muted line under the location, not a warning banner.
 * The claim is only ever the one the record supports (see `src/lib/freshness.ts`),
 * so a record with no usable date renders nothing rather than hedging about a
 * staleness we cannot demonstrate.
 */
export function MarketFreshnessNotice({ market }: MarketFreshnessNoticeProps) {
  const freshness = marketFreshness(market);
  if (!freshness.notice) return null;

  return (
    <p className="flex max-w-3xl items-start gap-1.5 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
      <Clock aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{freshness.notice}</span>
    </p>
  );
}
