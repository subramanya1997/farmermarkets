import { FaqSection } from '@/components/FaqSection';
import type { MarketFaq as MarketFaqItem } from '@/lib/schema';

interface MarketFaqProps {
  /** Built by `marketFaqs()` — the same list the page's FAQPage node mirrors. */
  faqs: MarketFaqItem[];
}

/**
 * The per-market FAQ block.
 *
 * This is the part of the ticket that AI answer engines actually read: they
 * extract visible HTML on a direct fetch and never execute the JSON-LD, so a
 * question a searcher types ("what days is X open?") has to be answered in the
 * text of the page, in those words. The questions come from
 * `marketFaqs(market)`, which only asks what the record can answer — so this
 * component renders whatever it is handed and simply disappears for a record
 * with nothing to say.
 *
 * Presentation is `FaqSection`, the site-wide `<details>` block shared with
 * the homepage, city pages and topic pages: collapsed answers are still in the
 * HTML for crawlers and answer engines, and it needs no client JavaScript on
 * 8,807 static pages.
 */
export function MarketFaq({ faqs }: MarketFaqProps) {
  if (!faqs.length) return null;

  return (
    <div className="mt-6 sm:mt-8">
      <FaqSection headingId="market-faq-heading"
      headingClassName="text-lg sm:text-xl font-semibold tracking-tight" items={faqs} />
    </div>
  );
}
