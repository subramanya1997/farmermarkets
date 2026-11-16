import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

const STYLES: Record<ReviewStatus, { label: string; className: string; Icon: typeof Clock }> = {
  pending: {
    label: 'Waiting for review',
    className: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200',
    Icon: Clock,
  },
  approved: {
    label: 'Approved',
    className: 'border-green-200 bg-green-50 text-green-900 dark:border-green-900/60 dark:bg-green-950/40 dark:text-green-200',
    Icon: CheckCircle2,
  },
  rejected: {
    label: 'Not approved',
    className: 'border-zinc-200 bg-zinc-100 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200',
    Icon: XCircle,
  },
};

/** Review status as a small labelled pill; the label is text, never color alone. */
export function StatusBadge({ status }: { status: ReviewStatus }) {
  const { label, className, Icon } = STYLES[status];
  return (
    <span className={cn('inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', className)}>
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </span>
  );
}
