import { Check } from 'lucide-react';
import { clean } from '@/lib/geo';
import { PRODUCT_LABELS } from '@/components/organizer/editor/labels';

/**
 * What a vendor sells, for public pages: the broad categories in their
 * site-wide labels, then the vendor's own words, without repeats.
 */
export function vendorSellsList(products: readonly string[], items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const labels = PRODUCT_LABELS as Record<string, string | undefined>;
  for (const text of [...products.map((code) => labels[code] ?? ''), ...items.map((item) => clean(item))]) {
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

/** "Fruits and vegetables, eggs and honey": the first is capitalized, the rest read as one sentence. */
export function vendorSellsLine(products: readonly string[], items: readonly string[], limit = 6): string {
  const list = vendorSellsList(products, items).slice(0, limit);
  const words = list.map((text, index) => (index === 0 ? text : lowerFirst(text)));
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** Lowercase a label's first letter unless it looks like a name or an acronym ("CSA", "Honeycrisp"). */
export function lowerFirst(text: string): string {
  const [first = '', second = ''] = text;
  return second && second === second.toUpperCase() && /[A-Z]/.test(second) ? text : first.toLowerCase() + text.slice(1);
}

/** A quiet mark that one of the market's own organizers approved this vendor. */
export function VendorConfirmedBadge() {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950/40 dark:text-green-300">
      <Check aria-hidden="true" className="size-3" strokeWidth={2.5} />
      Confirmed by the market
    </span>
  );
}
