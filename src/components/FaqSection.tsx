import type { ReactNode } from 'react';

export interface FaqSectionItem {
  question: string;
  answer: ReactNode;
}

interface FaqSectionProps {
  /** Overrides the standard heading only when a page genuinely asks something else. */
  title?: string;
  /** Optional lead paragraph under the heading. */
  subtitle?: string;
  /** Heading block alignment. The rows themselves are identical either way. */
  align?: 'left' | 'center';
  /** Anchor id on the heading, for pages that link to or label the section. */
  headingId?: string;
  items: FaqSectionItem[];
}

/**
 * The one FAQ renderer for the whole site.
 *
 * Every page type used to draw its own Q&A markup: the homepage had a Radix
 * accordion behind `'use client'`, market pages a `<dl>`, city and topic pages
 * an `<h3>` + `<p>` list. This is the same block everywhere, and it is a
 * server component built on native `<details>`/`<summary>` so the 14k static
 * pages keep shipping zero JavaScript for it. Google indexes collapsed
 * `<details>` content, and answer engines reading a raw fetch still see every
 * answer in the HTML, which is the property the FAQPage JSON-LD mirroring
 * depends on.
 *
 * The component only presents. Questions, answers and the FAQPage JSON-LD stay
 * with the caller that owns them, so the visible text and the markup can never
 * drift apart.
 */
export function FaqSection({
  title = 'Frequently Asked Questions',
  subtitle,
  align = 'left',
  headingId,
  items,
}: FaqSectionProps) {
  if (items.length === 0) return null;

  const centered = align === 'center';

  return (
    <section aria-labelledby={headingId}>
      <div className={centered ? 'text-center' : undefined}>
        <h2
          id={headingId}
          className="text-xl font-bold tracking-tight sm:text-2xl"
        >
          {title}
        </h2>
        {subtitle && (
          <p
            className={
              centered
                ? 'mx-auto mt-3 max-w-2xl text-zinc-600 dark:text-zinc-400'
                : 'mt-3 max-w-2xl text-zinc-600 dark:text-zinc-400'
            }
          >
            {subtitle}
          </p>
        )}
      </div>

      <div className="mt-4 divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-700 dark:border-zinc-700">
        {items.map((item) => (
          <details key={item.question} className="group">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-4 text-left text-zinc-900 outline-none marker:content-none hover:text-green-700 focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 dark:text-zinc-100 dark:hover:text-green-400 dark:focus-visible:ring-offset-zinc-900 [&::-webkit-details-marker]:hidden">
              {/*
                The question is a real heading, not just summary text: question
                headings are what extractive answer engines anchor citations to,
                and <summary> permits heading content. The h3 sets only size and
                weight and inherits color, so the summary hover state still
                paints the whole question.
              */}
              <h3 className="text-base font-semibold sm:text-lg">{item.question}</h3>
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mt-1 size-4 shrink-0 text-zinc-500 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none dark:text-zinc-400"
              >
                <path d="m5 7.5 5 5 5-5" />
              </svg>
            </summary>
            <div className="pb-4 text-sm text-zinc-600 sm:text-base dark:text-zinc-400">
              {item.answer}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
