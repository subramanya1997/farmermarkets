'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, LoaderCircle, Pencil, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { sendAnnouncementAction } from '@/app/(app)/admin/vendors/actions';
import { Field, FieldErrorsContext, FieldGroup, TextArea, TextInput } from '@/components/vendor/fields';

type Audience = 'live' | 'all';

function plural(count: number): string {
  return `${count} ${count === 1 ? 'vendor' : 'vendors'}`;
}

/** Write, preview, then confirm. Nothing is sent until the dialog's button is pressed. */
export function AnnouncementForm({ counts }: { counts: Record<Audience, number> }) {
  const router = useRouter();
  const audienceId = useId();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>('live');
  const [step, setStep] = useState<'write' | 'preview'>('write');
  const [confirming, setConfirming] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const recipients = counts[audience];
  const paragraphs = body
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  function preview() {
    const next: Record<string, string> = {};
    const cleanSubject = subject.trim().replace(/\s+/g, ' ');
    const cleanBody = body.trim();
    if (cleanSubject.length < 3 || cleanSubject.length > 120) next.subject = 'Write a subject of 3 to 120 characters';
    if (cleanBody.length < 10 || cleanBody.length > 5000) next.body = 'Write a message of 10 to 5000 characters';
    setErrors(next);
    setResult(null);
    if (Object.keys(next).length === 0) setStep('preview');
  }

  function send() {
    startTransition(async () => {
      const response = await sendAnnouncementAction({ subject, body, audience });
      setConfirming(false);
      if (!response.ok) {
        const fields = Object.fromEntries((response.fieldErrors ?? []).map((issue) => [issue.path, issue.message]));
        setErrors(fields);
        setResult({ ok: false, text: response.error });
        setStep('write');
        return;
      }
      setResult({ ok: true, text: response.message ?? 'Sent.' });
      setSubject('');
      setBody('');
      setErrors({});
      setStep('write');
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border bg-white dark:bg-zinc-900" aria-label="New announcement">
      <div className="border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">{step === 'write' ? 'New announcement' : 'Preview'}</h2>
      </div>

      <div className="space-y-4 px-4 py-4">
        {result ? (
          <p
            role={result.ok ? 'status' : 'alert'}
            className={
              result.ok
                ? 'rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900 dark:border-green-800/60 dark:bg-green-950/40 dark:text-green-100'
                : 'rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-200'
            }
          >
            {result.text}
          </p>
        ) : null}

        {step === 'write' ? (
          <FieldErrorsContext.Provider value={errors}>
            <Field label="Subject" path="subject" hint="3 to 120 characters.">
              {(control) => <TextInput {...control} maxLength={120} value={subject} onChange={(event) => setSubject(event.target.value)} />}
            </Field>
            <Field label="Message" path="body" hint="Plain text, 10 to 5000 characters. Leave a blank line between paragraphs.">
              {(control) => (
                <TextArea {...control} rows={10} maxLength={5000} value={body} onChange={(event) => setBody(event.target.value)} />
              )}
            </Field>
            <FieldGroup legend="Send to" path="audience">
              <RadioGroup
                value={audience}
                onValueChange={(next) => setAudience(next === 'all' ? 'all' : 'live')}
                aria-label="Send to"
                className="gap-2"
              >
                {(
                  [
                    ['live', `Vendors with a live profile (${counts.live})`],
                    ['all', `Everyone who has sent a profile (${counts.all})`],
                  ] as const
                ).map(([value, label]) => (
                  <div key={value} className="flex min-h-11 items-center gap-3">
                    <RadioGroupItem value={value} id={`${audienceId}-${value}`} className="size-5" />
                    <Label htmlFor={`${audienceId}-${value}`} className="flex-1 py-2 text-sm font-normal">
                      {label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </FieldGroup>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Every email carries a one-click &ldquo;Stop these emails&rdquo; link. Vendors who already opted out are skipped, and the counts above leave them out.
            </p>
            <Button type="button" onClick={preview} className="h-11 sm:h-9">
              <Eye aria-hidden="true" />
              Preview
            </Button>
          </FieldErrorsContext.Provider>
        ) : (
          <>
            <div className="space-y-3 rounded-md border bg-zinc-50 p-4 dark:bg-zinc-950/40">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Subject</p>
              <p className="font-medium break-words">{subject.trim().replace(/\s+/g, ' ')}</p>
              <div className="space-y-3 border-t pt-3 text-sm leading-6 break-words">
                {paragraphs.map((paragraph, index) => (
                  <p key={index} className="whitespace-pre-line">
                    {paragraph}
                  </p>
                ))}
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Each email ends with a &ldquo;Stop these emails&rdquo; link.</p>
              </div>
            </div>
            <p className="text-sm">
              This will go to <strong>{plural(recipients)}</strong> ({audience === 'live' ? 'vendors with a live profile' : 'everyone who has sent a profile'}), not counting vendors who opted out.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setStep('write')} className="h-11 sm:h-9">
                <Pencil aria-hidden="true" />
                Edit
              </Button>
              <Button type="button" onClick={() => setConfirming(true)} disabled={recipients === 0} className="h-11 sm:h-9">
                <Send aria-hidden="true" />
                Send to {plural(recipients)}
              </Button>
            </div>
            {recipients === 0 ? <p className="text-xs text-zinc-500 dark:text-zinc-400">Nobody is in that audience yet.</p> : null}
          </>
        )}
      </div>

      <Dialog open={confirming} onOpenChange={(open) => (isPending ? undefined : setConfirming(open))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send to {plural(recipients)}?</DialogTitle>
            <DialogDescription>
              Emails go out right away and cannot be recalled. Each one has a link to stop these emails.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirming(false)} disabled={isPending} className="h-11 sm:h-9">
              Cancel
            </Button>
            <Button type="button" onClick={send} disabled={isPending} className="h-11 sm:h-9">
              {isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
              Send to {plural(recipients)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
