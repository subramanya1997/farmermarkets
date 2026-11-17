/** Pieces for the dashboards' reading pages (Help, About, Settings). Server-safe. */
import type { ReactNode } from 'react';

export { TEXT_LINK } from '@/components/organizer/auth/FormBits';

/** The title and one line under it, as on every dashboard page. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children ? <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{children}</p> : null}
    </div>
  );
}

/** A titled section of running text, for Help and About: short paragraphs and lists under a hairline. */
export function DocPanel({ title, id, children }: { title: ReactNode; id?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 border-t border-zinc-200/80 pt-7 dark:border-zinc-800">
      <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{title}</h2>
      <div className="mt-2.5 space-y-3 text-[15px] leading-7 text-zinc-600 dark:text-zinc-400">{children}</div>
    </section>
  );
}

export function DocList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-zinc-400">{children}</ul>;
}

/** Inline code-ish text for env var names and paths. */
export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.8125rem] text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
      {children}
    </code>
  );
}

/**
 * One settings group, laid out the way Linear and Vercel do it: the title and
 * a line of context on the left, the controls in a card on the right. Stacks
 * on phones. Put several inside `SettingsSections`.
 */
export function SettingsSection({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-x-10 gap-y-3 py-8 first:pt-0 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{description}</p> : null}
      </div>
      <div className="min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
        {children}
      </div>
    </section>
  );
}

export function SettingsSections({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-zinc-200/80 dark:divide-zinc-800">{children}</div>;
}
