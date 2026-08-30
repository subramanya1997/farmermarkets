import type { ReactNode } from 'react';

/**
 * Article typography for blog posts.
 *
 * The repo has no Tailwind typography plugin (the `prose` classes elsewhere
 * are inert), so this wrapper styles plain semantic children — h2, h3, p, ul,
 * ol, a, strong, blockquote — through arbitrary variants. Post bodies stay
 * clean HTML with no per-element classes, and every post reads identically.
 */
export function BlogProse({ children }: { children: ReactNode }) {
  return (
    <div
      className={[
        'text-[15px] leading-7 text-zinc-700 dark:text-zinc-300 sm:text-base sm:leading-8',
        '[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:scroll-mt-24 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-zinc-900 dark:[&_h2]:text-zinc-50 sm:[&_h2]:text-2xl',
        '[&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:scroll-mt-24 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-zinc-900 dark:[&_h3]:text-zinc-50',
        '[&_p]:mb-4',
        '[&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul>li]:mb-1.5',
        '[&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol>li]:mb-1.5',
        '[&_a]:font-medium [&_a]:text-green-700 [&_a]:underline [&_a]:decoration-green-600/40 [&_a]:underline-offset-2 hover:[&_a]:text-green-800 dark:[&_a]:text-green-400 dark:hover:[&_a]:text-green-300',
        '[&_strong]:font-semibold [&_strong]:text-zinc-900 dark:[&_strong]:text-zinc-100',
        '[&_blockquote]:mb-4 [&_blockquote]:border-l-2 [&_blockquote]:border-green-600/50 [&_blockquote]:pl-4 [&_blockquote]:text-zinc-600 dark:[&_blockquote]:text-zinc-400',
      ].join(' ')}
    >
      {children}
    </div>
  );
}
