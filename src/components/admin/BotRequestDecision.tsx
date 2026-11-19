'use client';

import { useId, useState, useTransition } from 'react';
import { Check, LoaderCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { decideBotActionAction } from '@/app/(app)/admin/actions';

/**
 * Approve or dismiss one pending outreach bot request. `approveLabel` says
 * what approving does ("Take down", "Publish"), since that differs by kind.
 * The optional note is kept on the audit row; nothing is emailed.
 */
export function BotRequestDecision({ id, approveLabel }: { id: string; approveLabel: string }) {
  const noteId = useId();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [choice, setChoice] = useState<'approve' | 'dismiss' | null>(null);
  const [isPending, startTransition] = useTransition();

  function decide(approve: boolean) {
    setError(null);
    setChoice(approve ? 'approve' : 'dismiss');
    startTransition(async () => {
      const result = await decideBotActionAction(id, approve, note.trim() || undefined);
      if (result.ok) setDone(result.message ?? (approve ? 'Approved' : 'Dismissed'));
      else setError(result.error);
    });
  }

  if (done) {
    return (
      <p role="status" className="text-xs text-green-700 dark:text-green-400">
        {done}
      </p>
    );
  }

  return (
    <div className="flex w-full flex-col gap-1.5 md:w-60">
      <label htmlFor={noteId} className="sr-only">
        Note for the record
      </label>
      <Input
        id={noteId}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={1000}
        disabled={isPending}
        className="h-9"
        placeholder="Note (optional)"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => decide(true)} disabled={isPending} className="flex-1">
          {isPending && choice === 'approve' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
          {approveLabel}
        </Button>
        <Button size="sm" variant="outline" onClick={() => decide(false)} disabled={isPending} className="flex-1">
          {isPending && choice === 'dismiss' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <X aria-hidden="true" />}
          Dismiss
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
