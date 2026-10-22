import Link from 'next/link';
import { CalendarDays, Clock, HandCoins, Laptop, MapPin } from 'lucide-react';
import type { TopicSummary } from '@/lib/topicPage';
import { SITE_FRAME } from '@/lib/ui';

interface BrowseByTopicProps {
  topics: TopicSummary[];
}

const TOPIC_ICONS = {
  saturday: CalendarDays,
  'snap-ebt': HandCoins,
  hours: Clock,
  online: Laptop,
} as const;

/** Server-rendered links to the four topic pages, as a row of icon chips. */
export function BrowseByTopic({ topics }: BrowseByTopicProps) {
  if (topics.length === 0) return null;

  return (
    <section className="w-full border-t border-zinc-200 py-8 dark:border-zinc-800">
      <div className={SITE_FRAME}>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Browse by topic
        </h2>
        <ul className="flex flex-wrap gap-2">
          {topics.map((topic) => {
            const Icon = TOPIC_ICONS[topic.slug] ?? MapPin;
            return (
              <li key={topic.slug}>
                <Link
                  href={topic.href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-800 transition-colors hover:border-green-600/40 hover:bg-green-50 hover:text-green-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-green-500/40 dark:hover:bg-green-900/20 dark:hover:text-green-300"
                >
                  <Icon aria-hidden className="h-4 w-4 text-green-700 dark:text-green-500" />
                  {topic.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
