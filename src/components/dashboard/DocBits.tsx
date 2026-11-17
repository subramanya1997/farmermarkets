/** Pieces for the dashboards' reading pages (Help, About, Settings). Server-safe. */
import type { ReactNode } from 'react';
import { Panel } from '@/components/admin/bits';

export { TEXT_LINK } from '@/components/organizer/auth/FormBits';

/** The title and one line under it, as on every dashboard page. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {children ? <p className="text-sm text-zinc-600 dark:text-zinc-400">{children}</p> : null}
    </div>
  );
}

/** A panel of running text: short paragraphs and lists. */
export function DocPanel({ title, id, children }: { title: ReactNode; id?: string; children: ReactNode }) {
  return (
    <Panel title={title} id={id} className="scroll-mt-6">
      <div className="space-y-3 p-4 text-sm leading-6 text-zinc-700 sm:p-5 dark:text-zinc-300">{children}</div>
    </Panel>
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
