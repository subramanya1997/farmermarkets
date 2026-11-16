'use client';

import { useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, LoaderCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { decideChangeAction, decideClaimAction } from '@/app/admin/actions';

/**
 * Approve or reject a claim or a listing update, with an optional note that is
 * emailed to the organizer. A rejection needs a note so the organizer knows
 * what to fix. On success it returns to the queue with a short result banner.
 */
export function DecisionForm({
  kind,
  id,
  approveLabel = 'Approve',
  approveHint,
  rejectOnly = false,
}: {
  kind: 'claim' | 'change';
  id: string;
  approveLabel?: string;
  approveHint?: string;
  /** Only rejecting is possible, for example when the market left the dataset. */
  rejectOnly?: boolean;
}) {
  const router = useRouter();
  const noteId = useId();
  const errorId = useId();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<'approve' | 'reject' | null>(null);
  const [isPending, startTransition] = useTransition();

  function decide(approve: boolean) {
    setError(null);
    if (!approve && !note.trim()) {
      setError('Add a short note so the organizer knows why.');
      noteRef.current?.focus();
      return;
    }
    setChoice(approve ? 'approve' : 'reject');
    startTransition(async () => {
      const action = kind === 'claim' ? decideClaimAction : decideChangeAction;
      const result = await action(id, approve, note.trim() || undefined);
      if (!result.ok) {
        setError(result.error);
        setChoice(null);
        return;
      }
      const done = kind === 'claim' ? (approve ? 'claim-approved' : 'claim-rejected') : approve ? 'change-published' : 'change-rejected';
      router.push(`/admin?done=${done}`);
    });
  }

  return (
    <section className="rounded-lg border bg-white dark:bg-zinc-900" aria-label="Decision">
      <div className="border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">Decision</h2>
      </div>
      <div className="space-y-3 px-4 py-4">
        <div className="space-y-1.5">
          <Label htmlFor={noteId}>Note to the organizer</Label>
          <Textarea
            id={noteId}
            ref={noteRef}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={1000}
            rows={3}
            disabled={isPending}
            aria-describedby={error ? `${errorId} ${noteId}-hint` : `${noteId}-hint`}
            aria-invalid={Boolean(error && !note.trim()) || undefined}
            placeholder={rejectOnly ? 'Say why this update was not published.' : 'Optional when approving. Needed when rejecting.'}
          />
          <p id={`${noteId}-hint`} className="text-xs text-zinc-500 dark:text-zinc-400">
            Sent to the organizer with your decision.
          </p>
        </div>

        {error ? (
          <p id={errorId} role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          {rejectOnly ? null : (
            <div>
              <Button type="button" onClick={() => decide(true)} disabled={isPending}>
                {isPending && choice === 'approve' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
                {approveLabel}
              </Button>
              {approveHint ? <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{approveHint}</p> : null}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => decide(false)}
            disabled={isPending}
            className="text-red-700 hover:text-red-800 dark:text-red-400"
          >
            {isPending && choice === 'reject' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <X aria-hidden="true" />}
            Reject
          </Button>
        </div>
        <p className="sr-only" aria-live="polite">
          {isPending ? (choice === 'approve' ? 'Approving' : 'Rejecting') : ''}
        </p>
      </div>
    </section>
  );
}
