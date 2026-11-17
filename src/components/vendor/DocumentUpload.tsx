'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';
import { AlertCircle, CheckCircle2, Loader2, Upload } from 'lucide-react';
import { registerDocumentAction } from '@/app/(app)/vendor/actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Field, FieldErrorsContext, TextInput } from './fields';
import { fileSize, type LockerDocument } from './bits';
import { toErrorMap } from './StickyBar';

const EXTENSIONS: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

function blobFileName(file: File, label: string): string {
  const base = (label || file.name.replace(/\.[^.]+$/, ''))
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'document'}.${EXTENSIONS[file.type] ?? 'pdf'}`;
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

type Phase = { kind: 'idle' } | { kind: 'uploading'; progress: number; name: string } | { kind: 'saving'; name: string } | { kind: 'done'; label: string } | { kind: 'error'; text: string };

/**
 * Add one document to the locker: name it, optionally give it an expiry
 * date, then pick the file (a phone offers the camera). The upload starts as
 * soon as a file is picked and the document is saved to the locker.
 */
export function DocumentUpload({
  defaultLabel = '',
  onUploaded,
  maxBytes,
  contentTypes,
  buttonLabel = 'Choose a file and upload',
  className,
}: {
  defaultLabel?: string;
  onUploaded?: (document: LockerDocument) => void;
  maxBytes: number;
  contentTypes: string[];
  buttonLabel?: string;
  className?: string;
}) {
  const router = useRouter();
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState(defaultLabel);
  const [expires, setExpires] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const busy = phase.kind === 'uploading' || phase.kind === 'saving';

  function pick() {
    if (busy) return;
    const name = label.trim();
    if (name.length < 2) {
      setErrors({ label: 'Name this document' });
      requestAnimationFrame(() => labelRef.current?.querySelector('input')?.focus());
      return;
    }
    setErrors({});
    inputRef.current?.click();
  }

  async function onFile(file: File | undefined) {
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    if (!contentTypes.includes(file.type)) {
      setPhase({ kind: 'error', text: 'Upload a PDF, JPEG or PNG.' });
      return;
    }
    if (file.size > maxBytes) {
      setPhase({ kind: 'error', text: `That file is over ${fileSize(maxBytes)}. Try a smaller scan or a photo.` });
      return;
    }
    const name = label.trim();
    try {
      setPhase({ kind: 'uploading', progress: 0, name: file.name });
      const response = await fetch('/api/vendor/documents', { cache: 'no-store' });
      const body = (await response.json().catch(() => ({}))) as { pathPrefix?: string; error?: string };
      if (!response.ok || !body.pathPrefix) throw new Error(body.error || 'Uploads are not working right now. Try again in a moment.');
      const blob = await upload(`${body.pathPrefix}${blobFileName(file, name)}`, file, {
        access: 'private',
        handleUploadUrl: '/api/vendor/documents',
        contentType: file.type,
        onUploadProgress: ({ percentage }) => setPhase({ kind: 'uploading', progress: Math.round(percentage), name: file.name }),
      });
      setPhase({ kind: 'saving', name: file.name });
      const result = await registerDocumentAction({ pathname: blob.pathname, contentType: file.type, size: file.size, label: name, expires_on: expires });
      if (!result.ok) {
        if (result.fieldErrors?.length) setErrors(toErrorMap(result.fieldErrors));
        throw new Error(result.error);
      }
      if (result.documentId) {
        onUploaded?.({
          id: result.documentId,
          label: name,
          contentType: file.type,
          size: file.size,
          expiresOn: expires || null,
          expired: Boolean(expires && expires < today()),
          usedBy: 0,
        });
      }
      setPhase({ kind: 'done', label: name });
      setLabel(defaultLabel);
      setExpires('');
      router.refresh();
    } catch (cause) {
      setPhase({ kind: 'error', text: cause instanceof Error && cause.message ? cause.message : 'Upload failed. Please try again.' });
    }
  }

  return (
    <FieldErrorsContext.Provider value={errors}>
      <div className={cn('flex flex-col gap-4', className)}>
        <div ref={labelRef}>
          <Field label="What is it?" path="label" hint="Like liability insurance or health permit.">
            {(control) => (
              <TextInput
                {...control}
                value={label}
                maxLength={80}
                placeholder="Liability insurance"
                onChange={(event) => {
                  setLabel(event.target.value);
                  if (errors.label) setErrors({});
                  if (phase.kind === 'done' || phase.kind === 'error') setPhase({ kind: 'idle' });
                }}
              />
            )}
          </Field>
        </div>
        <Field label="Expires on" optional path="expires_on" hint="We show it as expired after this date.">
          {(control) => (
            <TextInput {...control} type="date" value={expires} className="w-full sm:w-56" onChange={(event) => setExpires(event.target.value)} />
          )}
        </Field>

        <input
          ref={inputRef}
          type="file"
          accept={contentTypes.join(',')}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            onClick={pick}
            disabled={busy}
            aria-describedby={statusId}
            className="h-12 w-full bg-green-700 px-5 text-base text-white hover:bg-green-800 sm:h-11 sm:w-auto sm:self-start sm:text-sm dark:bg-green-700 dark:hover:bg-green-600"
          >
            {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Upload aria-hidden="true" />}
            {phase.kind === 'uploading' ? `Uploading ${phase.progress}%` : phase.kind === 'saving' ? 'Saving' : buttonLabel}
          </Button>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">PDF, JPEG or PNG, up to {fileSize(maxBytes)}. On a phone you can take a photo of it.</p>
          {phase.kind === 'uploading' ? (
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800" aria-hidden="true">
              <div className="h-full rounded-full bg-green-600 transition-[width]" style={{ width: `${phase.progress}%` }} />
            </div>
          ) : null}
          <div id={statusId} aria-live="polite" className="text-sm">
            {phase.kind === 'done' ? (
              <p className="flex items-start gap-2 font-medium text-green-800 dark:text-green-300">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0 break-words">Saved {phase.label} to your documents.</span>
              </p>
            ) : null}
            {phase.kind === 'error' ? (
              <p role="alert" className="flex items-start gap-2 font-medium text-red-700 dark:text-red-400">
                <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0 break-words">{phase.text}</span>
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </FieldErrorsContext.Provider>
  );
}
