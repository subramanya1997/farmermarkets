'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resetSectionsAction } from '@/app/(app)/admin/actions';
import type { ListingSection } from '@/lib/listingEdits';

/**
 * Drops the published edit for one or more sections so the listing shows the
 * original dataset values again. Asks once before it goes.
 */
export function ResetSectionButton({
  slug,
  sections,
  label,
  children = 'Reset to original data',
}: {
  slug: string;
  sections: ListingSection[];
  /** What is being reset, for screen readers ("Days and hours"). */
  label: string;
  children?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setError(null);
    startTransition(async () => {
      const result = await resetSectionsAction(slug, sections);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {confirming ? (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <span className="text-xs text-zinc-600 dark:text-zinc-400">Put back the original?</span>
          <Button size="sm" variant="destructive" onClick={reset} disabled={isPending}>
            {isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
            Reset
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={isPending}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setConfirming(true)} aria-label={`${children}: ${label}`}>
          <RotateCcw aria-hidden="true" />
          {children}
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
