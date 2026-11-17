'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, LoaderCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { adminDecideApplicationAction, adminDecideDocumentAction } from '@/app/(app)/admin/vendors/actions';
import { Field, TextInput } from '@/components/vendor/fields';
import { StatusPill, TimeAgo } from './bits';

export interface AdminApplicationProps {
  id: string;
  market: { slug: string; name: string; place: string } | null;
  status: 'pending' | 'approved' | 'denied' | 'withdrawn';
  decider: 'organizer' | 'admin';
  waitingOnProfile: boolean;
  days: string;
  stallNote: string | null;
  message: string | null;
  decisionNote: string | null;
  createdAt: string;
  checklist: {
    key: string;
    label: string;
    required: boolean;
    submission: { id: string; documentId: string; documentLabel: string; status: 'pending' | 'approved' | 'rejected'; note: string | null } | null;
  }[];
}

function Notice({ ok, children }: { ok: boolean; children: string }) {
  return (
    <p
      role={ok ? 'status' : 'alert'}
      className={
        ok
          ? 'rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900 dark:border-green-800/60 dark:bg-green-950/40 dark:text-green-100'
          : 'rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-200'
      }
    >
      {children}
    </p>
  );
}

function AppStatus({ status }: { status: AdminApplicationProps['status'] }) {
  if (status === 'withdrawn') {
    return (
      <span className="inline-flex items-center rounded-md border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
        Withdrawn
      </span>
    );
  }
  return <StatusPill status={status === 'denied' ? 'rejected' : status} />;
}

/** One application with its checklist, and the admin's controls for it. */
export function VendorApplicationAdmin({ vendorId, application }: { vendorId: string; application: AdminApplicationProps }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [docDenying, setDocDenying] = useState<string | null>(null);
  const [docNote, setDocNote] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function decideApplication(approve: boolean, key: string) {
    setNotice(null);
    setBusy(key);
    startTransition(async () => {
      const result = await adminDecideApplicationAction(vendorId, application.id, approve, note.trim() || undefined);
      setBusy(null);
      if (!result.ok) {
        setNotice({ ok: false, text: result.error });
        return;
      }
      setNote('');
      setNotice({ ok: true, text: result.message ?? 'Done.' });
      router.refresh();
    });
  }

  function decideDocument(submissionId: string, approve: boolean) {
    setNotice(null);
    if (!approve && !docNote.trim()) {
      setNotice({ ok: false, text: 'Add a note so the vendor knows why the document was denied.' });
      return;
    }
    setBusy(submissionId);
    startTransition(async () => {
      const result = await adminDecideDocumentAction(vendorId, submissionId, approve, approve ? undefined : docNote.trim());
      setBusy(null);
      if (!result.ok) {
        setNotice({ ok: false, text: result.error });
        return;
      }
      setDocDenying(null);
      setDocNote('');
      setNotice({ ok: true, text: result.message ?? 'Done.' });
      router.refresh();
    });
  }

  const { market } = application;
  return (
    <article className="space-y-3 px-4 py-4 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {market ? (
          <Link href={`/markets/${market.slug}`} className="font-medium break-words text-green-700 hover:underline dark:text-green-400">
            {market.name}
          </Link>
        ) : (
          <span className="font-medium">Unknown market</span>
        )}
        <AppStatus status={application.status} />
        <TimeAgo date={application.createdAt} className="text-xs text-zinc-500 dark:text-zinc-400" />
      </div>
      {market?.place ? <p className="-mt-2 text-xs text-zinc-500 dark:text-zinc-400">{market.place}</p> : null}

      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[8rem_1fr]">
        <dt className="text-zinc-500 dark:text-zinc-400">Decided by</dt>
        <dd>{application.decider === 'admin' ? 'You (the market has no organizer on the site)' : 'The market’s organizer'}</dd>
        {application.waitingOnProfile ? (
          <>
            <dt className="text-zinc-500 dark:text-zinc-400">Held back</dt>
            <dd>Waiting for the vendor’s profile to be approved first.</dd>
          </>
        ) : null}
        <dt className="text-zinc-500 dark:text-zinc-400">Days</dt>
        <dd>{application.days || <span className="text-zinc-400 dark:text-zinc-600">Not given</span>}</dd>
        <dt className="text-zinc-500 dark:text-zinc-400">Stall note</dt>
        <dd className="break-words">{application.stallNote || <span className="text-zinc-400 dark:text-zinc-600">None</span>}</dd>
        <dt className="text-zinc-500 dark:text-zinc-400">Vendor’s message</dt>
        <dd className="break-words whitespace-pre-line">{application.message || <span className="text-zinc-400 dark:text-zinc-600">None</span>}</dd>
        {application.decisionNote ? (
          <>
            <dt className="text-zinc-500 dark:text-zinc-400">Decision note</dt>
            <dd className="break-words whitespace-pre-line">{application.decisionNote}</dd>
          </>
        ) : null}
      </dl>

      <div>
        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">Documents asked for</h3>
        {application.checklist.length === 0 ? (
          <p className="text-zinc-500 dark:text-zinc-400">This market asks for no documents.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {application.checklist.map((line) => {
              const submission = line.submission;
              const denying = submission !== null && docDenying === submission.id;
              return (
                <li key={line.key} className="space-y-2 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium break-words">{line.label}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{line.required ? 'Required' : 'Optional'}</span>
                  </div>
                  {submission ? (
                    <>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="break-words">{submission.documentLabel}</span>
                        {/* A plain link: the file downloads, it is not a page. */}
                        <a
                          href={`/api/vendor/documents/${submission.documentId}`}
                          className="inline-flex min-h-11 items-center text-green-700 underline-offset-2 hover:underline sm:min-h-0 dark:text-green-400"
                        >
                          Open
                        </a>
                        <StatusPill status={submission.status} />
                      </div>
                      {submission.note ? <p className="text-xs break-words whitespace-pre-line text-zinc-600 dark:text-zinc-400">Note: {submission.note}</p> : null}
                      {denying ? (
                        <div className="space-y-2">
                          <Field label="Why is it denied?" hint="Sent to the vendor.">
                            {(control) => (
                              <TextInput {...control} maxLength={500} value={docNote} onChange={(event) => setDocNote(event.target.value)} disabled={isPending} />
                            )}
                          </Field>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="destructive" onClick={() => decideDocument(submission.id, false)} disabled={isPending} className="h-11 sm:h-8">
                              {busy === submission.id ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <X aria-hidden="true" />}
                              Deny document
                            </Button>
                            <Button type="button" variant="outline" onClick={() => { setDocDenying(null); setDocNote(''); }} disabled={isPending} className="h-11 sm:h-8">
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {submission.status !== 'approved' ? (
                            <Button type="button" size="sm" onClick={() => decideDocument(submission.id, true)} disabled={isPending} className="h-11 sm:h-8">
                              {busy === submission.id ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
                              Approve
                            </Button>
                          ) : null}
                          {submission.status !== 'rejected' ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => { setDocDenying(submission.id); setDocNote(''); setNotice(null); }}
                              disabled={isPending}
                              className="h-11 text-red-700 sm:h-8 dark:text-red-400"
                            >
                              <X aria-hidden="true" />
                              Deny
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-zinc-500 dark:text-zinc-400">Nothing attached yet.</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {application.status === 'pending' ? (
        <div className="space-y-2 rounded-md border bg-zinc-50 p-3 dark:bg-zinc-950/40">
          {application.decider === 'organizer' ? (
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              This market’s organizer normally decides this. You can override their decision.
            </p>
          ) : null}
          <Field label="Note to the vendor" optional>
            {(control) => (
              <TextInput {...control} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} disabled={isPending} />
            )}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => decideApplication(true, 'approve')} disabled={isPending} className="h-11 sm:h-9">
              {busy === 'approve' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
              Approve
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => decideApplication(false, 'deny')}
              disabled={isPending}
              className="h-11 text-red-700 sm:h-9 dark:text-red-400"
            >
              {busy === 'deny' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <X aria-hidden="true" />}
              Deny
            </Button>
          </div>
        </div>
      ) : null}

      {application.status === 'approved' ? (
        <div className="space-y-2">
          <Field label="Note to the vendor" optional>
            {(control) => (
              <TextInput {...control} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} disabled={isPending} />
            )}
          </Field>
          <Button
            type="button"
            variant="outline"
            onClick={() => decideApplication(false, 'remove')}
            disabled={isPending}
            className="h-11 text-red-700 sm:h-9 dark:text-red-400"
          >
            {busy === 'remove' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <X aria-hidden="true" />}
            Remove from this market
          </Button>
        </div>
      ) : null}

      {notice ? <Notice ok={notice.ok}>{notice.text}</Notice> : null}
    </article>
  );
}
