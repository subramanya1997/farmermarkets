import Link from 'next/link';
import type { TopicSummary } from '@/lib/topicPage';

interface BrowseByTopicProps {
  topics: TopicSummary[];
}

/**
 * Server-rendered links to the four topic pages, shown on `/markets` above the
 * state directory.
 *
 * The counts come from the same builders the pages themselves use, so a data
 * refresh moves this section and the pages together.
 */
export function BrowseByTopic({ topics }: BrowseByTopicProps) {
  if (topics.length === 0) return null;

  return (
    <section className="w-full border-t border-zinc-200 py-12 dark:border-zinc-800">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Browse markets by topic</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Payment programs, ordering options and opening days, counted across the whole directory.
        </p>
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {topics.map((topic) => (
            <li key={topic.slug}>
              <Link
                href={topic.href}
                className="flex h-full flex-col rounded-lg border border-zinc-200 p-4 transition-colors hover:border-green-600 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-green-500 dark:hover:bg-zinc-800"
              >
                <span className="text-sm font-semibold text-green-700 dark:text-green-500">
                  {topic.heading}
                </span>
                <span className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{topic.blurb}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
