'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: 'What are farmers markets?',
    answer: 'Farmers markets are community gathering places where local farmers, growers, and food producers sell their products directly to consumers. They offer fresh, locally-grown produce, meats, dairy, baked goods, and artisanal products.',
  },
  {
    question: 'How do I find farmers markets near me?',
    answer: 'Use our location-based search on the Markets page. We automatically detect your location and show the closest farmers markets. You can also search by city, state, or market name.',
  },
  {
    question: 'What payment methods do farmers markets accept?',
    answer: 'Most farmers markets accept cash, credit/debit cards, and many accept SNAP/EBT, WIC, and other food assistance programs. Check individual market details for specific payment options.',
  },
  {
    question: 'When are farmers markets open?',
    answer: 'Market hours vary by location. Most farmers markets operate seasonally (spring through fall) and are typically open on weekends. Check each market\'s details page for specific hours and days of operation.',
  },
  {
    question: 'Are farmers markets cheaper than grocery stores?',
    answer: 'Prices at farmers markets can vary. While some specialty items might be more expensive, you often get better quality, fresher produce, and support local farmers. Many markets also accept SNAP benefits and offer nutrition assistance programs.',
  },
  {
    question: 'Can I bring my dog to farmers markets?',
    answer: 'Pet policies vary by market. Use our filters to find pet-friendly markets. Always check individual market rules and keep pets on leash.',
  },
  {
    question: 'Do farmers markets have parking?',
    answer: 'Many farmers markets offer parking facilities. Use our amenities filter to find markets with parking, restrooms, and wheelchair accessibility.',
  },
  {
    question: 'What products can I find at farmers markets?',
    answer: 'Farmers markets typically offer fresh produce, fruits, vegetables, meats, poultry, seafood, dairy products, eggs, baked goods, honey, jams, flowers, plants, and artisanal crafts. Product availability varies by season and location.',
  },
];

export function FAQ() {
  // Generate FAQ schema for SEO
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <section className="w-full py-12 md:py-16 lg:py-20 bg-zinc-50 dark:bg-zinc-800">
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8 md:mb-12">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
              Everything you need to know about finding and visiting farmers markets
            </p>
          </div>

          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-zinc-600 dark:text-zinc-400">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </>
  );
}

