'use client';

import { useId, useState, useTransition } from 'react';
import { Check, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { markLegacyClaimHandledAction } from '@/app/admin/actions';

/**
 * Clears an old contact-form claim from the queue. The optional note is kept
 * on the record for the site owner; nothing is emailed.
 */
export function LegacyHandledButton({ id }: { id: string }) {
  const noteId = useId();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function markHandled() {
    setError(null);
    startTransition(async () => {
      const result = await markLegacyClaimHandledAction(id, note.trim() || undefined);
      if (result.ok) setDone(true);
      else setError(result.error);
    });
  }

  if (done) {
    return (
      <p role="status" className="text-xs text-green-700 dark:text-green-400">
        Marked handled
      </p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5 md:items-end">
      {open ? (
        <div className="flex w-full flex-col gap-1.5 md:w-64">
          <label htmlFor={noteId} className="text-xs text-zinc-600 dark:text-zinc-400">
            Note for your records (optional)
          </label>
          <Input
            id={noteId}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={1000}
            disabled={isPending}
            className="h-8"
            placeholder="Replied by email"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={markHandled} disabled={isPending}>
              {isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
              Mark handled
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Mark handled
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
