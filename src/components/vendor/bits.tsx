/**
 * Small presentational pieces the vendor area shares. Server-safe: no hooks,
 * no server-only imports, so pages and client components can both use them.
 */
import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Clock, Info, MinusCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The green primary button, full width on phones. */
export const PRIMARY =
  'h-12 w-full bg-green-700 px-5 text-base text-white hover:bg-green-800 sm:h-11 sm:w-auto sm:text-sm dark:bg-green-700 dark:hover:bg-green-600';

/** A secondary button sized for thumbs. */
export const SECONDARY = 'h-12 w-full px-5 text-base sm:h-11 sm:w-auto sm:text-sm';

export const LINK = 'font-medium text-green-700 underline underline-offset-2 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300';

/** A document as the browser sees it: plain values only. */
export interface LockerDocument {
  id: string;
  label: string;
  contentType: string;
  size: number;
  expiresOn: string | null;
  expired: boolean;
  usedBy: number;
}

export function place(market: { city?: string; state?: string } | null | undefined): string {
  return [market?.city, market?.state].filter(Boolean).join(', ');
}

export function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
}

export function fileKind(contentType: string): string {
  if (contentType === 'application/pdf') return 'PDF';
  if (contentType === 'image/png') return 'PNG image';
  if (contentType === 'image/jpeg') return 'JPEG image';
  return 'File';
}

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** "2027-05-01" as "May 1, 2027". */
export function formatDay(isoDay: string): string {
  const date = new Date(`${isoDay}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? isoDay : dateFormat.format(date);
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/* ------------------------------------------------------------------ *
 * Badges
 * ------------------------------------------------------------------ */

type Tone = 'amber' | 'green' | 'zinc' | 'red';

const TONES: Record<Tone, string> = {
  amber: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200',
  green: 'border-green-200 bg-green-50 text-green-900 dark:border-green-900/60 dark:bg-green-950/40 dark:text-green-200',
  zinc: 'border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  red: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300',
};

export function Pill({ tone, icon, children, className }: { tone: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3.5',
        TONES[tone],
        className,
      )}
    >
      {icon ? <span aria-hidden="true" className="flex">{icon}</span> : null}
      {children}
    </span>
  );
}

export type ApplicationStatusCode = 'pending' | 'approved' | 'denied' | 'withdrawn';

export function ApplicationBadge({ status }: { status: ApplicationStatusCode }) {
  switch (status) {
    case 'pending':
      return <Pill tone="amber" icon={<Clock />}>Waiting</Pill>;
    case 'approved':
      return <Pill tone="green" icon={<CheckCircle2 />}>Listed</Pill>;
    case 'denied':
      return <Pill tone="zinc" icon={<XCircle />}>Not approved</Pill>;
    default:
      return <Pill tone="zinc" icon={<MinusCircle />}>Withdrawn</Pill>;
  }
}

export function DocumentVerdictBadge({ status }: { status: 'pending' | 'approved' | 'rejected' }) {
  if (status === 'approved') return <Pill tone="green" icon={<CheckCircle2 />}>Approved</Pill>;
  if (status === 'rejected') return <Pill tone="red" icon={<AlertCircle />}>Needs a new one</Pill>;
  return <Pill tone="amber" icon={<Clock />}>Waiting</Pill>;
}

/* ------------------------------------------------------------------ *
 * Callouts
 * ------------------------------------------------------------------ */

const CALLOUT_TONES = {
  info: { box: 'border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-200', icon: 'text-green-700 dark:text-green-400', Icon: Info },
  waiting: { box: 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100', icon: 'text-amber-600 dark:text-amber-400', Icon: Clock },
  success: { box: 'border-green-200 bg-green-50 text-green-950 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-100', icon: 'text-green-700 dark:text-green-400', Icon: CheckCircle2 },
  problem: { box: 'border-red-200 bg-red-50 text-red-950 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100', icon: 'text-red-700 dark:text-red-400', Icon: AlertCircle },
} as const;

/** A quiet box with an icon, a bold first line and an optional body. Not announced: use for page state. */
export function Callout({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: keyof typeof CALLOUT_TONES;
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const { box, icon, Icon } = CALLOUT_TONES[tone];
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border px-4 py-3 text-sm', box, className)}>
      <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', icon)} />
      <div className="min-w-0 flex-1 space-y-1 break-words">
        <p className="font-medium">{title}</p>
        {children ? <div className="leading-6 opacity-90">{children}</div> : null}
      </div>
    </div>
  );
}

/** A note someone wrote to the vendor (a reviewer, a market), set off as a quote. */
export function NoteFrom({ who, children }: { who: string; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{who}</p>
      <p className="mt-0.5 break-words whitespace-pre-line">{children}</p>
    </div>
  );
}
