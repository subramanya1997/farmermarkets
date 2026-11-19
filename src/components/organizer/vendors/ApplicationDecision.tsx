'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, TextArea } from '@/components/vendor/fields';
import { FormAlert, PRIMARY_BUTTON } from '@/components/organizer/auth/FormBits';
import { decideApplicationAction } from '@/app/(app)/dashboard/markets/[slug]/vendors/actions';
import type { ApplicationStatus } from '@/lib/vendorRules';
import { cn } from '@/lib/utils';

const MAX_NOTE = 1000;

const DENY_BUTTON =
  'h-11 w-full text-red-700 hover:bg-red-50 hover:text-red-800 sm:h-10 sm:w-auto dark:text-red-400 dark:hover:bg-red-950/40';

/**
 * The organizer's call on one application. Pending: approve or deny with an
 * optional note. Approved: remove from the market, after a confirm. Denied or
 * withdrawn: nothing left to do. Every decision emails the vendor; after one,
 * the server's message shows here and the page refreshes in place.
 */
export function ApplicationDecision({
  slug,
  applicationId,
  vendorName,
  status,
  decisionNote,
  requiredNotReady,
  vendorLive,
}: {
  slug: string;
  applicationId: string;
  vendorName: string;
  status: ApplicationStatus;
  decisionNote: string | null;
  /** Required documents that are missing or not approved yet. */
  requiredNotReady: number;
  /** False while the vendor's profile is not public (held or suspended). */
  vendorLive: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [choice, setChoice] = useState<'approve' | 'deny' | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function decide(approve: boolean) {
    setError(null);
    setNotice(null);
    setChoice(approve ? 'approve' : 'deny');
    startTransition(async () => {
      const result = await decideApplicationAction(slug, applicationId, approve, note.trim() || undefined);
      setChoice(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirmOpen(false);
      setNote('');
      setNotice(result.message ?? 'Saved.');
      router.refresh();
    });
  }

  const spinner = (which: 'approve' | 'deny') => isPending && choice === which;

  return (
    <section
      aria-labelledby="application-decision-title"
      className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs sm:p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 id="application-decision-title" className="text-base font-semibold tracking-tight">
        Decision
      </h2>

      <div className="mt-3 flex flex-col gap-4">
        {notice ? <FormAlert tone="success">{notice}</FormAlert> : null}

        {status === 'pending' ? (
          <>
            <Field label="Note to the vendor" optional hint="Sent by email with your decision.">
              {(control) => (
                <TextArea
                  {...control}
                  value={note}
                  maxLength={MAX_NOTE}
                  rows={3}
                  className="min-h-24"
                  disabled={isPending}
                  placeholder="Welcome aboard. Load in starts at 7."
                  onChange={(event) => setNote(event.target.value)}
                />
              )}
            </Field>

            {requiredNotReady > 0 ? (
              <p className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>
                  {requiredNotReady === 1
                    ? '1 required document is missing or not approved yet.'
                    : `${requiredNotReady} required documents are missing or not approved yet.`}{' '}
                  You can still approve; it is your call.
                </span>
              </p>
            ) : null}
            {!vendorLive ? (
              <p className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>This vendor&apos;s profile is not public right now, so approving may not go through yet.</span>
              </p>
            ) : null}

            {error ? <FormAlert>{error}</FormAlert> : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" onClick={() => decide(true)} disabled={isPending} className={cn(PRIMARY_BUTTON, 'sm:w-auto sm:px-5')}>
                {spinner('approve') ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
                Approve
              </Button>
              <Button type="button" variant="outline" onClick={() => decide(false)} disabled={isPending} className={DENY_BUTTON}>
                {spinner('deny') ? <Loader2 aria-hidden="true" className="animate-spin" /> : <X aria-hidden="true" />}
                Deny
              </Button>
            </div>
          </>
        ) : null}

        {status === 'approved' ? (
          <>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {vendorName} is approved and shows on your market page.
            </p>
            {decisionNote ? <NoteQuote label="Your note" note={decisionNote} /> : null}
            <Dialog
              open={confirmOpen}
              onOpenChange={(open) => {
                if (isPending) return;
                setConfirmOpen(open);
                if (!open) setError(null);
              }}
            >
              <DialogTrigger asChild>
                <Button type="button" variant="outline" className={DENY_BUTTON}>
                  Remove from this market
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="break-words">Remove {vendorName} from this market?</DialogTitle>
                  <DialogDescription>
                    They stop showing on your market page, and we email them to let them know.
                  </DialogDescription>
                </DialogHeader>
                <Field label="Note to the vendor" optional hint="Included in the email.">
                  {(control) => (
                    <TextArea
                      {...control}
                      value={note}
                      maxLength={MAX_NOTE}
                      rows={3}
                      className="min-h-24"
                      disabled={isPending}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  )}
                </Field>
                {error ? <FormAlert>{error}</FormAlert> : null}
                <DialogFooter className="gap-2">
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={isPending} className="h-11 w-full sm:h-10 sm:w-auto">
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button
                    type="button"
                    onClick={() => decide(false)}
                    disabled={isPending}
                    className="h-11 w-full bg-red-700 text-white hover:bg-red-800 sm:h-10 sm:w-auto dark:bg-red-700 dark:hover:bg-red-600"
                  >
                    {spinner('deny') ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                    Remove
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {/* Errors from the dialog stay inside it; this one is for anything after it closed. */}
            {error && !confirmOpen ? <FormAlert>{error}</FormAlert> : null}
          </>
        ) : null}

        {status === 'denied' ? (
          <>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">This vendor is not approved for your market. There is nothing more to do here.</p>
            {decisionNote ? <NoteQuote label="Note sent to the vendor" note={decisionNote} /> : null}
          </>
        ) : null}

        {status === 'withdrawn' ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">The vendor withdrew this application. There is nothing more to do here.</p>
        ) : null}
      </div>
    </section>
  );
}

function NoteQuote({ label, note }: { label: string; note: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-950/40">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 whitespace-pre-line break-words text-zinc-800 dark:text-zinc-200">{note}</p>
    </div>
  );
}
