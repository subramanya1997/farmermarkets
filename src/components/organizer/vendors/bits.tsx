/** Small presentational pieces the vendor desk pages share. Server-safe, no server-only imports. */
import { CheckCircle2, Clock, MinusCircle, Store, XCircle } from 'lucide-react';
import type { ApplicationProgress } from '@/lib/vendors';
import type { ApplicationStatus } from '@/lib/vendorRules';
import { PRODUCT_LABELS } from '@/components/organizer/editor/labels';
import { cn } from '@/lib/utils';

/** The desk's tabs, as `?tab=` values. */
export const DESK_TABS = ['applications', 'vendors', 'checklist'] as const;
export type DeskTab = (typeof DESK_TABS)[number];

export function readDeskTab(value: string | string[] | undefined): DeskTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return (DESK_TABS as readonly string[]).includes(raw ?? '') ? (raw as DeskTab) : 'applications';
}

type Tone ='amber' | 'green' | 'zinc' | 'red';

const TONES: Record<Tone, string> = {
  amber: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200',
  green: 'border-green-200 bg-green-50 text-green-900 dark:border-green-900/60 dark:bg-green-950/40 dark:text-green-200',
  zinc: 'border-zinc-200 bg-zinc-100 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200',
  red: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200',
};

function Pill({ tone, Icon, children }: { tone: Tone; Icon: typeof Clock; children: string }) {
  return (
    <span className={cn('inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', TONES[tone])}>
      <Icon aria-hidden="true" className="size-3.5" />
      {children}
    </span>
  );
}

const APPLICATION_STATUS: Record<ApplicationStatus, { label: string; tone: Tone; Icon: typeof Clock }> = {
  pending: { label: 'Waiting for you', tone: 'amber', Icon: Clock },
  approved: { label: 'Approved', tone: 'green', Icon: CheckCircle2 },
  denied: { label: 'Not approved', tone: 'zinc', Icon: XCircle },
  withdrawn: { label: 'Withdrawn', tone: 'zinc', Icon: MinusCircle },
};

export function ApplicationStatusPill({ status }: { status: ApplicationStatus }) {
  const { label, tone, Icon } = APPLICATION_STATUS[status];
  return (
    <Pill tone={tone} Icon={Icon}>
      {label}
    </Pill>
  );
}

export type DocumentStatus = 'pending' | 'approved' | 'rejected';

const DOCUMENT_STATUS: Record<DocumentStatus, { label: string; tone: Tone; Icon: typeof Clock }> = {
  pending: { label: 'Waiting for you', tone: 'amber', Icon: Clock },
  approved: { label: 'Approved', tone: 'green', Icon: CheckCircle2 },
  rejected: { label: 'Denied', tone: 'red', Icon: XCircle },
};

export function DocumentStatusPill({ status }: { status: DocumentStatus }) {
  const { label, tone, Icon } = DOCUMENT_STATUS[status];
  return (
    <Pill tone={tone} Icon={Icon}>
      {label}
    </Pill>
  );
}

export function ConfirmedPill() {
  return (
    <Pill tone="green" Icon={CheckCircle2}>
      Confirmed by the market
    </Pill>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * One line on how the documents stand, plus whether it needs attention.
 * "2 of 3 documents approved, 1 required document missing".
 */
export function progressSummary(progress: ApplicationProgress): { text: string; attention: boolean } {
  if (progress.active === 0) return { text: 'No documents asked for', attention: false };
  const parts = [`${progress.approved} of ${plural(progress.active, 'document', 'documents')} approved`];
  if (progress.missingRequired) parts.push(`${plural(progress.missingRequired, 'required document', 'required documents')} missing`);
  if (progress.rejected) parts.push(`${progress.rejected} denied`);
  if (progress.waiting) parts.push(`${progress.waiting} waiting for you`);
  return { text: parts.join(', '), attention: progress.missingRequired > 0 || progress.rejected > 0 };
}

/** "Baked goods, Eggs" from product codes; unknown codes are skipped. */
export function productsLabel(products: readonly string[]): string {
  return products
    .map((code) => PRODUCT_LABELS[code as keyof typeof PRODUCT_LABELS])
    .filter(Boolean)
    .join(', ');
}

/** The vendor's cover photo as a small square, or a quiet placeholder. */
export function VendorThumb({ url, className }: { url?: string; className?: string }) {
  return (
    <div
      className={cn(
        'flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 sm:size-16 dark:border-zinc-800 dark:bg-zinc-800',
        className,
      )}
    >
      {url ? (
        // A small thumbnail from the public Blob store; the name next to it says who it is.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        <Store aria-hidden="true" className="size-6 text-zinc-400 dark:text-zinc-500" />
      )}
    </div>
  );
}
