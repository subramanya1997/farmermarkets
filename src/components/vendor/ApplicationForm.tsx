'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ChevronDown, ChevronUp, FileText, Mail, Upload } from 'lucide-react';
import { submitApplicationAction } from '@/app/(app)/vendor/actions';
import { WEEKDAYS, type Weekday } from '@/lib/listingEdits';
import { applicationDetailsSchema, type ChecklistItem } from '@/lib/vendorProfile';
import { WEEKDAY_LONG, WEEKDAY_SHORT } from '@/components/organizer/editor/labels';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChipGroup, Field, FieldErrorsContext, FieldGroup, SectionCard, SelectInput, TextArea, TextInput } from './fields';
import { Callout, DocumentVerdictBadge, LINK, Pill, formatDay, type ApplicationStatusCode, type LockerDocument } from './bits';
import { DocumentUpload } from './DocumentUpload';
import { StickyBar, focusFirstInvalid, toErrorMap, useLeaveGuard, type Notice } from './StickyBar';

export interface SentDocument {
  itemId: string;
  documentId: string;
  documentLabel: string;
  status: 'pending' | 'approved' | 'rejected';
  note: string | null;
}

export interface ExistingApplication {
  status: ApplicationStatusCode;
  days: string[];
  stallNote: string | null;
  message: string | null;
  sent: SentDocument[];
}

export interface ApplicationFormProps {
  slug: string;
  items: ChecklistItem[];
  existing: ExistingApplication | null;
  documents: LockerDocument[];
  documentsEnabled: boolean;
  limits: { maxDocumentBytes: number; documentTypes: string[] };
}

const MAX_STALL = 140;
const MAX_MESSAGE = 600;

interface FormValues {
  days: Weekday[];
  stallNote: string;
  message: string;
  chosen: Record<string, string>;
}

function initialValues(existing: ExistingApplication | null): FormValues {
  return {
    days: WEEKDAYS.filter((day) => existing?.days.includes(day)),
    stallNote: existing?.stallNote ?? '',
    message: existing?.message ?? '',
    chosen: Object.fromEntries((existing?.sent ?? []).map((line) => [line.itemId, line.documentId])),
  };
}

function fingerprint(values: FormValues): string {
  return JSON.stringify({
    days: values.days,
    stallNote: values.stallNote.trim(),
    message: values.message.trim(),
    chosen: Object.entries(values.chosen).sort(([a], [b]) => a.localeCompare(b)),
  });
}

export function ApplicationForm({ slug, items, existing, documents, documentsEnabled, limits }: ApplicationFormProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<FormValues>(() => initialValues(existing));
  const [baseline, setBaseline] = useState(() => fingerprint(initialValues(existing)));
  const [uploaded, setUploaded] = useState<LockerDocument[]>([]);
  const [submitted, setSubmitted] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [sending, startSending] = useTransition();

  const status = existing?.status ?? null;
  const listed = status === 'approved';
  const reopening = status === 'denied' || status === 'withdrawn';
  const dirty = fingerprint(values) !== baseline;
  useLeaveGuard(dirty);

  // The locker as the server knows it, plus anything uploaded here since.
  const locker = useMemo(() => {
    const known = new Set(documents.map((document) => document.id));
    return [...documents, ...uploaded.filter((document) => !known.has(document.id))];
  }, [documents, uploaded]);

  const sentByItem = useMemo(() => new Map((existing?.sent ?? []).map((line) => [line.itemId, line])), [existing]);
  // Documents come after applying: a new application only says what the market will ask for.
  const showDocuments = items.length > 0 && (status === 'pending' || status === 'approved');
  const owed = items.filter((item) => item.required).length;

  // Errors from the last send fade out as they are fixed.
  const errors = useMemo(() => {
    const paths = Object.keys(submitted);
    if (paths.length === 0) return submitted;
    const tooLong: Record<string, boolean> = { stall_note: values.stallNote.trim().length > MAX_STALL, message: values.message.trim().length > MAX_MESSAGE };
    return Object.fromEntries(paths.filter((path) => (path in tooLong ? tooLong[path] : true)).map((path) => [path, submitted[path]]));
  }, [submitted, values]);

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setNotice(null);
  }

  function choose(itemId: string, documentId: string | undefined) {
    setValues((current) => {
      const chosen = { ...current.chosen };
      if (documentId) chosen[itemId] = documentId;
      else delete chosen[itemId];
      return { ...current, chosen };
    });
    setNotice(null);
  }

  function fail(list: { path: string; message: string }[], text: string) {
    setSubmitted(toErrorMap(list));
    setNotice({ tone: 'error', text });
    focusFirstInvalid(rootRef.current);
  }

  function submit() {
    if (sending) return;
    const details = applicationDetailsSchema.safeParse({ days: values.days, stall_note: values.stallNote, message: values.message });
    const issues = details.success ? [] : details.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
    if (issues.length) {
      fail(issues, 'A few fields need a fix.');
      return;
    }
    setSubmitted({});
    setNotice(null);
    const sent = { ...values, stallNote: values.stallNote.trim(), message: values.message.trim() };
    startSending(async () => {
      try {
        const result = await submitApplicationAction(slug, {
          days: sent.days,
          stall_note: sent.stallNote,
          message: sent.message,
          documents: sent.chosen,
        });
        if (result.ok) {
          setValues(sent);
          setBaseline(fingerprint(sent));
          setNotice({
            tone: 'success',
            text: result.message ?? 'Sent.',
            extra: (
              <Link href="/vendor/markets" className={LINK}>
                See all your markets
              </Link>
            ),
          });
          router.refresh();
        } else if (result.fieldErrors?.length) {
          fail(result.fieldErrors, result.error);
        } else {
          setNotice({ tone: 'error', text: result.error });
        }
      } catch {
        setNotice({ tone: 'error', text: 'That did not go through. Check your connection and try again.' });
      }
    });
  }

  const cta = listed ? 'Save changes' : reopening ? 'Send again' : status === 'pending' ? 'Update application' : 'Send application';
  const canSend = status === null || reopening || dirty;
  const idle = dirty
      ? 'You have changes that are not sent yet.'
      : status === null
        ? 'Ready when you are.'
        : reopening
          ? 'Sending again reopens your application.'
          : 'No changes yet.';

  return (
    <FieldErrorsContext.Provider value={errors}>
      <div ref={rootRef} className="flex flex-col gap-4">
        <SectionCard title={listed ? 'Your listing' : 'Your application'}>
          <FieldGroup legend="Days you are there" hint={listed ? 'Shown on the market page as soon as you save.' : 'Skip it if it changes week to week.'} path="days">
            <ChipGroup options={WEEKDAYS} labels={WEEKDAY_LONG} short={WEEKDAY_SHORT} value={values.days} onChange={(next) => set('days', next)} />
          </FieldGroup>
          {listed ? (
            <Field label="Where to find your stall" optional path="stall_note" hint="Shown on the market page.">
              {(control) => (
                <TextInput
                  {...control}
                  value={values.stallNote}
                  maxLength={MAX_STALL}
                  placeholder="Row B, near the fountain"
                  onChange={(event) => set('stallNote', event.target.value)}
                />
              )}
            </Field>
          ) : (
            <Field label="Note to the market" optional path="message" hint="Only the market sees this.">
              {(control) => (
                <TextArea
                  {...control}
                  value={values.message}
                  maxLength={MAX_MESSAGE}
                  rows={3}
                  className="min-h-20"
                  placeholder="We have sold nearby for three years and bring our own tent."
                  onChange={(event) => set('message', event.target.value)}
                />
              )}
            </Field>
          )}
          {!showDocuments && items.length > 0 ? (
            <p className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-zinc-400" />
              {owed > 0
                ? `This market asks for ${owed === 1 ? 'a document' : `${owed} documents`}, like a permit or insurance. You can add ${owed === 1 ? 'it' : 'them'} right after you apply.`
                : 'This market lists a few optional documents. You can add them after you apply.'}
            </p>
          ) : null}
        </SectionCard>

        {showDocuments ? (
          <SectionCard
            title="Documents"
            description={
              documentsEnabled
                ? 'What this market asks for. Only this market and our team can open what you send.'
                : 'What this market asks vendors for.'
            }
          >
            {!documentsEnabled ? (
              <Callout title="Document uploads are not available yet">
                Your application is in. We will let you know when you can add documents here.
              </Callout>
            ) : null}
            <ul className="flex flex-col gap-3">
              {items.map((item) => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  sent={sentByItem.get(item.id) ?? null}
                  chosen={values.chosen[item.id]}
                  locker={locker}
                  documentsEnabled={documentsEnabled}
                  limits={limits}
                  onChoose={(documentId) => choose(item.id, documentId)}
                  onUploaded={(document) => {
                    setUploaded((current) => [...current, document]);
                    choose(item.id, document.id);
                  }}
                />
              ))}
            </ul>
          </SectionCard>
        ) : null}

        <p className="flex items-start gap-2 px-1 text-sm text-zinc-600 dark:text-zinc-400">
          <Mail aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-zinc-400" />
          The market will see the email you sign in with, so they can reach you.
        </p>

        <StickyBar
          notice={notice}
          idle={idle}
          label={cta}
          busyLabel={listed ? 'Saving' : 'Sending'}
          busy={sending}
          disabled={!canSend}
          onSubmit={submit}
        />
      </div>
    </FieldErrorsContext.Provider>
  );
}

function ChecklistRow({
  item,
  sent,
  chosen,
  locker,
  documentsEnabled,
  limits,
  onChoose,
  onUploaded,
}: {
  item: ChecklistItem;
  sent: SentDocument | null;
  chosen: string | undefined;
  locker: LockerDocument[];
  documentsEnabled: boolean;
  limits: { maxDocumentBytes: number; documentTypes: string[] };
  onChoose: (documentId: string | undefined) => void;
  onUploaded: (document: LockerDocument) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const options = locker.map((document) => ({
    value: document.id,
    label: document.expired
      ? `${document.label} (expired)`
      : document.expiresOn
        ? `${document.label}, until ${formatDay(document.expiresOn)}`
        : document.label,
  }));
  const replacing = sent && chosen && chosen !== sent.documentId;
  const chosenDocument = locker.find((document) => document.id === chosen);

  return (
    <li
      className={cn(
        'rounded-lg border p-3 sm:p-4',
        sent?.status === 'rejected' && !replacing
          ? 'border-red-200 bg-red-50/50 dark:border-red-900/60 dark:bg-red-950/20'
          : 'border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-950/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 font-medium break-words text-zinc-900 dark:text-zinc-50">{item.label}</h3>
        {item.required ? <Pill tone="amber">Required</Pill> : <Pill tone="zinc">Optional</Pill>}
      </div>
      {item.description ? <p className="mt-1 text-sm break-words text-zinc-600 dark:text-zinc-400">{item.description}</p> : null}

      {sent ? (
        <div className="mt-3 space-y-1.5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 break-words text-zinc-700 dark:text-zinc-300">
              Sent: <span className="font-medium">{sent.documentLabel}</span>
            </span>
            <DocumentVerdictBadge status={sent.status} />
          </div>
          {sent.status === 'rejected' && sent.note ? (
            <p className="break-words whitespace-pre-line text-red-900 dark:text-red-200">{sent.note}</p>
          ) : null}
          {sent.status === 'rejected' && !replacing ? <p className="font-medium text-red-800 dark:text-red-300">Pick or upload a new one below.</p> : null}
        </div>
      ) : null}

      {documentsEnabled ? (
        <div className="mt-3 flex flex-col gap-3">
          {locker.length > 0 ? (
            <Field
              label={sent ? 'Send a different document' : 'Choose from your documents'}
              optional={!item.required || Boolean(sent)}
              path={`documents.${item.id}`}
              hint={replacing ? 'This replaces the one you sent when you send the form. The market checks it again.' : undefined}
            >
              {(control) => (
                <SelectInput
                  {...control}
                  value={chosen}
                  options={options}
                  placeholder="Choose a document"
                  emptyLabel={sent ? undefined : 'None'}
                  onChange={(value) => {
                    setJustAdded(null);
                    onChoose(value);
                  }}
                />
              )}
            </Field>
          ) : null}
          {chosenDocument?.expired ? <p className="text-sm font-medium text-amber-800 dark:text-amber-300">That document has expired. The market may ask for a current one.</p> : null}
          <p aria-live="polite" className="text-sm">
            {justAdded ? (
              <span className="flex items-start gap-2 font-medium text-green-800 dark:text-green-300">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0 break-words">Uploaded {justAdded} and picked it for this item.</span>
              </span>
            ) : null}
          </p>

          <div>
            <Button
              type="button"
              variant="outline"
              aria-expanded={uploading}
              onClick={() => setUploading((open) => !open)}
              className="h-11 w-full border-dashed text-green-800 hover:bg-green-50 hover:text-green-900 sm:w-auto dark:text-green-400 dark:hover:bg-green-950/30"
            >
              <Upload aria-hidden="true" />
              Upload a new document
              {uploading ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
            </Button>
            {uploading ? (
              <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <DocumentUpload
                  defaultLabel={item.label}
                  maxBytes={limits.maxDocumentBytes}
                  contentTypes={limits.documentTypes}
                  buttonLabel="Choose a file"
                  onUploaded={(document) => {
                    onUploaded(document);
                    setJustAdded(document.label);
                    setUploading(false);
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}
