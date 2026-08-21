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
 * It is a plain `<h3>` + `<p>` list rather than an accordion: collapsed
 * answers are still in the HTML, but an open one is readable without a click
 * and needs no client JavaScript on 8,807 static pages.
 */
export function MarketFaq({ faqs }: MarketFaqProps) {
  if (!faqs.length) return null;

  return (
    <section className="mt-6 sm:mt-8" aria-labelledby="market-faq-heading">
      <h2
        id="market-faq-heading"
        className="text-xl sm:text-2xl font-bold tracking-tight mb-3 sm:mb-4"
      >
        Frequently Asked Questions
      </h2>
      <dl className="space-y-4">
        {faqs.map((faq) => (
          <div
            key={faq.question}
            className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50"
          >
            <dt className="text-base sm:text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {faq.question}
            </dt>
            <dd className="mt-1 text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
              {faq.answer}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
