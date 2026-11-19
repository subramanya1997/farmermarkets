'use client';

import { useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, LoaderCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { decideVendorProfileAction } from '@/app/(app)/admin/vendors/actions';
import { Field, TextArea } from '@/components/vendor/fields';

/** Publish or reject a vendor's proposed profile. A rejection needs a note the vendor will read. */
export function VendorDecisionForm({
  vendorId,
  firstTime,
  submittedAt,
}: {
  vendorId: string;
  firstTime: boolean;
  /** ISO time of the proposal shown on this page; the server refuses to decide a newer one. */
  submittedAt: string;
}) {
  const router = useRouter();
  const errorId = useId();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<'approve' | 'reject' | null>(null);
  const [isPending, startTransition] = useTransition();

  function decide(approve: boolean) {
    setError(null);
    if (!approve && !note.trim()) {
      setError('Add a short note so the vendor knows what to fix.');
      noteRef.current?.focus();
      return;
    }
    setChoice(approve ? 'approve' : 'reject');
    startTransition(async () => {
      const result = await decideVendorProfileAction(vendorId, approve, note.trim() || undefined, submittedAt);
      if (!result.ok) {
        setError(result.error);
        setChoice(null);
        return;
      }
      router.push(`/admin/review?done=${approve ? 'vendor-published' : 'vendor-rejected'}`);
    });
  }

  return (
    <div className="space-y-3 border-t px-4 py-4">
      <Field label="Note to the vendor" optional hint="Emailed to the vendor with your decision. Needed when rejecting.">
        {(control) => (
          <TextArea
            {...control}
            ref={noteRef}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={1000}
            rows={3}
            disabled={isPending}
            aria-invalid={Boolean(error && !note.trim()) || undefined}
            className="min-h-20"
          />
        )}
      </Field>
      {error ? (
        <p id={errorId} role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => decide(true)} disabled={isPending} className="h-11 sm:h-9">
          {isPending && choice === 'approve' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
          Publish
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => decide(false)}
          disabled={isPending}
          className="h-11 text-red-700 hover:text-red-800 sm:h-9 dark:text-red-400"
        >
          {isPending && choice === 'reject' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <X aria-hidden="true" />}
          Reject
        </Button>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {firstTime ? 'Publishing creates the vendor’s public page.' : 'Publishing replaces the live profile with the version above.'}
      </p>
      <p className="sr-only" aria-live="polite">
        {isPending ? (choice === 'approve' ? 'Publishing' : 'Rejecting') : ''}
      </p>
    </div>
  );
}
