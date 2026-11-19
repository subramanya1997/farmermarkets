import { cn } from '@/lib/utils';

export type VendorStatusKey = 'live' | 'live-update' | 'waiting' | 'draft' | 'fix' | 'down';

export const VENDOR_STATUS_LABELS: Record<VendorStatusKey, string> = {
  live: 'Live',
  'live-update': 'Live, update waiting',
  waiting: 'Waiting',
  draft: 'Draft',
  fix: 'Needs a fix',
  down: 'Taken down',
};

const TONES: Record<VendorStatusKey, string> = {
  live: 'border-green-300 bg-green-50 text-green-800 dark:border-green-700/60 dark:bg-green-900/30 dark:text-green-200',
  'live-update': 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/30 dark:text-amber-200',
  waiting: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/30 dark:text-amber-200',
  draft: 'border-zinc-300 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  fix: 'border-red-300 bg-red-50 text-red-800 dark:border-red-700/60 dark:bg-red-900/30 dark:text-red-200',
  down: 'border-red-300 bg-red-50 text-red-800 dark:border-red-700/60 dark:bg-red-900/30 dark:text-red-200',
};

/** One plain status for a vendor from the server's state, live and suspended flags. */
export function vendorStatus(input: { state: string; live: boolean; suspended: boolean }): VendorStatusKey {
  if (input.suspended) return 'down';
  if (input.live) return input.state === 'pending' ? 'live-update' : 'live';
  if (input.state === 'pending') return 'waiting';
  if (input.state === 'rejected') return 'fix';
  return 'draft';
}

export const SOURCE_LABELS: Record<string, string> = {
  self: 'Signed up',
  'outreach-bot': 'Outreach bot',
  'admin-invite': 'Admin invite',
};

export function VendorStatusPill({ status, className }: { status: VendorStatusKey; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap', TONES[status], className)}
    >
      {VENDOR_STATUS_LABELS[status]}
    </span>
  );
}
