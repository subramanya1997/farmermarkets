'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, TextArea } from '@/components/vendor/fields';
import { FormAlert } from '@/components/organizer/auth/FormBits';
import { decideDocumentAction } from '@/app/(app)/dashboard/markets/[slug]/vendors/actions';
import type { DocumentStatus } from './bits';

const MAX_NOTE = 1000;

/**
 * Approve or deny one attached document. Denying needs a note, which the
 * vendor gets by email; a verdict can be changed later.
 */
export function DocumentDecision({
  slug,
  submissionId,
  status,
  note,
}: {
  slug: string;
  submissionId: string;
  status: DocumentStatus;
  note: string | null;
}) {
  const router = useRouter();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [denying, setDenying] = useState(false);
  const [draft, setDraft] = useState(note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [choice, setChoice] = useState<'approve' | 'deny' | null>(null);
  const [isPending, startTransition] = useTransition();

  function decide(approve: boolean) {
    setError(null);
    setNotice(null);
    if (!approve && !draft.trim()) {
      setError('Say what is wrong so the vendor can fix it.');
      noteRef.current?.focus();
      return;
    }
    setChoice(approve ? 'approve' : 'deny');
    startTransition(async () => {
      const result = await decideDocumentAction(slug, submissionId, approve, approve ? undefined : draft.trim());
      setChoice(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDenying(false);
      setNotice(result.message ?? (approve ? 'Document approved.' : 'Document denied.'));
      router.refresh();
    });
  }

  const busy = (which: 'approve' | 'deny') => (isPending && choice === which ? <Loader2 aria-hidden="true" className="animate-spin" /> : null);

  if (denying) {
    return (
      <div className="flex flex-col gap-3">
        <Field
          label={status === 'rejected' ? 'What needs fixing' : 'Why are you denying this document?'}
          hint={status === 'rejected' ? 'Saved with the document for the vendor to see.' : 'We email this to the vendor so they can send a new one.'}
        >
          {(control) => (
            <TextArea
              {...control}
              ref={noteRef}
              value={draft}
              maxLength={MAX_NOTE}
              rows={3}
              className="min-h-24"
              disabled={isPending}
              aria-invalid={error && !draft.trim() ? true : undefined}
              placeholder="For example: the certificate expired in May."
              onChange={(event) => setDraft(event.target.value)}
            />
          )}
        </Field>
        {error ? <FormAlert>{error}</FormAlert> : null}
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button
            type="button"
            onClick={() => decide(false)}
            disabled={isPending}
            className="h-11 bg-red-700 text-white hover:bg-red-800 sm:h-10 dark:bg-red-700 dark:hover:bg-red-600"
          >
            {busy('deny') ?? <X aria-hidden="true" />}
            {status === 'rejected' ? 'Save note' : 'Deny'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDenying(false);
              setError(null);
              setDraft(note ?? '');
            }}
            disabled={isPending}
            className="h-11 sm:h-10"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 sm:flex">
        {status !== 'approved' ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => decide(true)}
            disabled={isPending}
            className="h-11 border-green-700 text-green-800 hover:bg-green-50 hover:text-green-900 sm:h-10 dark:border-green-600 dark:text-green-300 dark:hover:bg-green-950/40"
          >
            {busy('approve') ?? <Check aria-hidden="true" />}
            Approve
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setNotice(null);
            setError(null);
            setDraft(note ?? '');
            setDenying(true);
          }}
          disabled={isPending}
          className="h-11 text-red-700 hover:bg-red-50 hover:text-red-800 sm:h-10 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          <X aria-hidden="true" />
          {status === 'rejected' ? 'Change note' : 'Deny'}
        </Button>
      </div>
      {error ? <FormAlert>{error}</FormAlert> : null}
      {notice ? <FormAlert tone="success">{notice}</FormAlert> : null}
    </div>
  );
}
