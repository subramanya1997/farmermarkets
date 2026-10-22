import Link from 'next/link';
import { CalendarDays, HandCoins, MapPin } from 'lucide-react';
import type { FarmerMarket } from '@/lib/api';
import { cardPlace, cardScheduleLine, notableMarketType } from '@/lib/marketDisplay';
import { displayName } from '@/lib/seo';

interface MarketCardViewProps {
  market: FarmerMarket;
  /** Client callers wire this to analytics; the server index card omits it. */
  onDetailClick?: () => void;
}

/**
 * The one market card design, shared by the interactive explorer grid and the
 * server-rendered A-Z index so the two views read as the same product.
 *
 * Four things, scannable at a glance: the name, where it is (and how far),
 * one line for when it opens, and whether it takes SNAP/EBT. Products,
 * social links and the rest live on the market page.
 *
 * The whole card is clickable through a stretched link on the title, which
 * keeps the market name as the anchor text a crawler follows.
 */
export function MarketCardView({ market, onDetailClick }: MarketCardViewProps) {
  const name = displayName(market.name);
  const schedule = cardScheduleLine(market);
  const marketType = notableMarketType(market);
  const distance =
    market.distance !== undefined && Number.isFinite(market.distance) ? market.distance : undefined;

  const locationParts = cardPlace(market);

  return (
    <article className="group relative isolate flex h-full flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-green-600/40 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-green-500/40">
      {marketType && (
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {marketType}
        </p>
      )}

      <h3 className="text-[15px] font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
        <Link
          href={`/markets/${market.slug}`}
          onClick={onDetailClick}
          className="line-clamp-2 transition-colors after:absolute after:inset-0 after:z-0 after:content-[''] group-hover:text-green-700 focus-visible:outline-none dark:group-hover:text-green-400"
        >
          {name}
        </Link>
      </h3>

      <div className="space-y-1 text-[13px] text-zinc-600 dark:text-zinc-400">
        {(locationParts.length > 0 || distance !== undefined) && (
          <p className="flex items-center gap-1.5">
            <MapPin aria-hidden className="h-3.5 w-3.5 shrink-0 text-green-700 dark:text-green-500" />
            <span className="truncate">{locationParts.join(', ')}</span>
            {distance !== undefined && (
              <span className="shrink-0 text-zinc-500 dark:text-zinc-500">
                {locationParts.length > 0 ? '· ' : ''}
                {distance} mi
              </span>
            )}
          </p>
        )}
        {schedule && (
          <p className="flex items-center gap-1.5">
            <CalendarDays aria-hidden className="h-3.5 w-3.5 shrink-0 text-green-700 dark:text-green-500" />
            <span className="truncate">{schedule}</span>
          </p>
        )}
      </div>

      {market.snap && (
        <p className="mt-auto pt-1">
          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
            <HandCoins aria-hidden className="h-3.5 w-3.5" />
            SNAP/EBT
          </span>
        </p>
      )}
    </article>
  );
}
