'use client';

/**
 * A vendor's current weekly post on public pages. Pages are cached for up
 * to a day, so they carry the posts that are current or about to start and
 * this picks the one for the viewer's own date: a post disappears on its
 * own once its last day is over, and one posted for Saturday shows up on
 * Saturday without waiting for the page to rebuild.
 */
import { ShoppingBasket } from 'lucide-react';
import { useLocalDay } from '@/hooks/useLocalDay';
import { currentOffering, offeringDates, type DayRange } from '@/lib/offeringDays';
import type { PublicOffering } from '@/lib/vendorLayer';
import { cn } from '@/lib/utils';
import { lowerFirst } from '@/components/VendorBits';

function useCurrent(offerings: readonly PublicOffering[] | undefined, rendered: DayRange): { offering: PublicOffering; today: string } | null {
  // Before hydration the whole US day range counts, like the server did.
  const today = useLocalDay('');
  const range = today ? { from: today, to: today } : rendered;
  const offering = offerings?.length ? currentOffering(offerings, range) : null;
  return offering ? { offering, today } : null;
}

function heading(offering: PublicOffering, today: string): string {
  if (today && offering.startsOn === offering.endsOn && offering.startsOn === today) return 'Bringing today';
  return `Bringing ${offeringDates(offering)}`;
}

/** Plain text in one line: "heirloom tomatoes, eggs and 3 more". */
function itemsLine(offering: PublicOffering, limit: number): string {
  // Reads as one sentence: "Pasture eggs, wildflower honey and 2 more".
  const names = offering.items.map((item, index) => (index === 0 ? item.name : lowerFirst(item.name)));
  const shown = names.slice(0, limit);
  const more = names.length - shown.length;
  if (more > 0) return `${shown.join(', ')} and ${more} more`;
  if (shown.length <= 1) return shown[0] ?? '';
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

/** One line on a market page vendor card. */
export function VendorOfferingLine({ offerings, rendered }: { offerings?: PublicOffering[]; rendered: DayRange }) {
  const current = useCurrent(offerings, rendered);
  if (!current) return null;
  return (
    <p className="mt-1 flex items-start gap-1.5 text-sm text-green-900 dark:text-green-200">
      <ShoppingBasket aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-green-700 dark:text-green-400" />
      <span className="min-w-0 break-words">
        <span className="font-medium">{heading(current.offering, current.today)}:</span> {itemsLine(current.offering, 4)}
      </span>
    </p>
  );
}

/** The full post, under a market on the vendor's own page. */
export function VendorOfferingBlock({ offerings, rendered, className }: { offerings?: PublicOffering[]; rendered: DayRange; className?: string }) {
  const current = useCurrent(offerings, rendered);
  if (!current) return null;
  const { offering, today } = current;
  return (
    <div className={cn('relative z-10 mt-2 rounded-xl border border-green-200 bg-green-50/70 p-3 dark:border-green-900/60 dark:bg-green-950/30', className)}>
      <p className="flex items-center gap-1.5 text-sm font-semibold text-green-900 dark:text-green-100">
        <ShoppingBasket aria-hidden="true" className="size-4 shrink-0 text-green-700 dark:text-green-400" />
        {heading(offering, today)}
      </p>
      <ul className="mt-1.5 space-y-1 text-sm text-zinc-800 dark:text-zinc-200">
        {offering.items.map((item, index) => (
          <li key={index} className="break-words">
            <span className="font-medium">{item.name}</span>
            {item.note ? <span className="text-zinc-600 dark:text-zinc-400">, {item.note}</span> : null}
          </li>
        ))}
      </ul>
      {offering.note ? <p className="mt-2 text-sm break-words whitespace-pre-line text-zinc-600 dark:text-zinc-400">{offering.note}</p> : null}
    </div>
  );
}
