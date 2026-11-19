'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Download, FileText, Image as ImageIcon, Loader2, Pencil, Trash2 } from 'lucide-react';
import { removeDocumentAction, updateDocumentAction } from '@/app/(app)/vendor/actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldErrorsContext, TextInput } from './fields';
import { Pill, fileKind, fileSize, formatDay, plural, type LockerDocument } from './bits';
import { ExpiryPicker } from './ExpiryPicker';
import { toErrorMap } from './StickyBar';

/** The vendor's documents, each with open, edit and delete. */
export function DocumentList({ documents }: { documents: LockerDocument[] }) {
  if (documents.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        Nothing here yet. Add a permit or an insurance certificate and you can attach it to any market.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
      {documents.map((document) => (
        <DocumentRow key={document.id} document={document} />
      ))}
    </ul>
  );
}

function DocumentRow({ document }: { document: LockerDocument }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const Icon = document.contentType === 'application/pdf' ? FileText : ImageIcon;

  return (
    <li className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium break-words text-zinc-900 dark:text-zinc-50">{document.label}</p>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {fileKind(document.contentType)}, {fileSize(document.size)}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {document.expiresOn ? (
              document.expired ? (
                <Pill tone="red" icon={<AlertCircle />}>
                  Expired {formatDay(document.expiresOn)}
                </Pill>
              ) : (
                <span className="text-zinc-600 dark:text-zinc-400">Expires {formatDay(document.expiresOn)}</span>
              )
            ) : null}
            <span className="text-zinc-600 dark:text-zinc-400">
              {document.usedBy > 0 ? `Used by ${plural(document.usedBy, 'application', 'applications')}` : 'Not attached to any application'}
            </span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:flex sm:justify-end">
        <Button asChild variant="outline" className="h-11 sm:h-9">
          <a href={`/api/vendor/documents/${document.id}`} aria-label={`Open ${document.label}`}>
            <Download aria-hidden="true" />
            Open
          </a>
        </Button>
        <Button type="button" variant="outline" className="h-11 sm:h-9" onClick={() => setEditing(true)} aria-label={`Edit ${document.label}`}>
          <Pencil aria-hidden="true" />
          Edit
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 text-red-700 hover:bg-red-50 hover:text-red-800 sm:h-9 dark:text-red-400 dark:hover:bg-red-950/40"
          onClick={() => setDeleting(true)}
          aria-label={`Delete ${document.label}`}
        >
          <Trash2 aria-hidden="true" />
          Delete
        </Button>
      </div>
      {editing ? <EditDialog document={document} onClose={() => setEditing(false)} /> : null}
      {deleting ? <DeleteDialog document={document} onClose={() => setDeleting(false)} /> : null}
    </li>
  );
}

const DIALOG = 'max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6';
const DIALOG_FOOTER = 'flex-col-reverse gap-2 sm:flex-row';

function EditDialog({ document, onClose }: { document: LockerDocument; onClose: () => void }) {
  const router = useRouter();
  const [label, setLabel] = useState(document.label);
  const [expires, setExpires] = useState(document.expiresOn ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function save() {
    if (label.trim().length < 2) {
      setErrors({ label: 'Name this document' });
      return;
    }
    setErrors({});
    setError(null);
    startSaving(async () => {
      try {
        const result = await updateDocumentAction(document.id, { label: label.trim(), expires_on: expires });
        if (result.ok) {
          router.refresh();
          onClose();
        } else {
          if (result.fieldErrors?.length) setErrors(toErrorMap(result.fieldErrors));
          setError(result.error);
        }
      } catch {
        setError('That did not go through. Check your connection and try again.');
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={DIALOG}>
        <DialogHeader className="pr-8 text-left">
          <DialogTitle>Edit document</DialogTitle>
          <DialogDescription>Change its name or when it runs out. The file stays the same.</DialogDescription>
        </DialogHeader>
        <FieldErrorsContext.Provider value={errors}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <Field label="Name" path="label">
              {(control) => <TextInput {...control} value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} />}
            </Field>
            <ExpiryPicker value={expires} onChange={setExpires} />
            {error ? (
              <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
                {error}
              </p>
            ) : null}
            <DialogFooter className={DIALOG_FOOTER}>
              <DialogClose asChild>
                <Button type="button" variant="outline" className="h-12 w-full sm:h-10 sm:w-auto">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={saving}
                className="h-12 w-full bg-green-700 text-white hover:bg-green-800 sm:h-10 sm:w-auto dark:bg-green-700 dark:hover:bg-green-600"
              >
                {saving ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                {saving ? 'Saving' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </FieldErrorsContext.Provider>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ document, onClose }: { document: LockerDocument; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [deleting, startDeleting] = useTransition();

  function remove() {
    setError(null);
    startDeleting(async () => {
      try {
        const result = await removeDocumentAction(document.id);
        if (result.ok) {
          router.refresh();
          onClose();
        } else {
          setError(result.error);
        }
      } catch {
        setError('That did not go through. Check your connection and try again.');
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={DIALOG}>
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="break-words">Delete {document.label}?</DialogTitle>
          <DialogDescription>
            {document.usedBy > 0
              ? `${document.usedBy === 1 ? 'One application loses' : `${document.usedBy} applications lose`} this document. If a market requires it, it will ask you for a new one. This cannot be undone.`
              : 'The file is deleted for good. This cannot be undone.'}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}
        <DialogFooter className={DIALOG_FOOTER}>
          <DialogClose asChild>
            <Button type="button" variant="outline" className="h-12 w-full sm:h-10 sm:w-auto">
              Keep it
            </Button>
          </DialogClose>
          <Button type="button" variant="destructive" disabled={deleting} onClick={remove} className="h-12 w-full sm:h-10 sm:w-auto">
            {deleting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Trash2 aria-hidden="true" />}
            {deleting ? 'Deleting' : 'Delete document'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
