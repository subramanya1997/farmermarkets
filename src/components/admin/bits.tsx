/** Small presentational pieces the admin pages share. Server-safe. */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatTimestamp, timeAgo } from './format';

export function TimeAgo({ date, className }: { date: Date | string; className?: string }) {
  const value = typeof date === 'string' ? new Date(date) : date;
  return (
    <time dateTime={value.toISOString()} title={formatTimestamp(value)} className={className}>
      {timeAgo(value)}
    </time>
  );
}

const STATUS_TONES: Record<string, string> = {
  pending: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/30 dark:text-amber-200',
  approved: 'border-green-300 bg-green-50 text-green-800 dark:border-green-700/60 dark:bg-green-900/30 dark:text-green-200',
  rejected: 'border-red-300 bg-red-50 text-red-800 dark:border-red-700/60 dark:bg-red-900/30 dark:text-red-200',
  removed: 'border-zinc-300 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};

const STATUS_TEXT: Record<string, string> = {
  pending: 'Waiting',
  approved: 'Approved',
  rejected: 'Rejected',
  removed: 'Removed',
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap',
        STATUS_TONES[status] ?? STATUS_TONES.removed,
        className,
      )}
    >
      {STATUS_TEXT[status] ?? status}
    </span>
  );
}

/** A labelled box with a heading row; the working unit of every admin page. */
export function Panel({
  title,
  action,
  children,
  className,
  id,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn('rounded-lg border bg-white dark:bg-zinc-900', className)}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Definition list rows: label on the left, value on the right; stacked on phones. */
export function Facts({ children }: { children: ReactNode }) {
  return <dl className="divide-y text-sm">{children}</dl>;
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 px-4 py-2 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <span className="text-zinc-500 dark:text-zinc-400">{children}</span>;
}

export function ExternalA({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={cn('text-green-700 underline-offset-2 hover:underline dark:text-green-400', className)}
    >
      {children}
    </a>
  );
}
