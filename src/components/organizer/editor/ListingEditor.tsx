'use client';

import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { submitListingChangesAction } from '@/app/dashboard/actions';
import {
  SECTION_LABELS,
  parseListingEdits,
  type ListingEdits,
  type ListingSection,
} from '@/lib/listingEdits';
import { cn } from '@/lib/utils';
import { FieldErrorsContext } from './fields';
import { compactRows, dropUntouchedEmptySections, friendlyMessage, payloadFingerprint, sectionOf } from './editState';
import { SchedulesSection, SeasonSection, StatusSection } from './sections/StatusAndHours';
import { AboutSection, ContactSection } from './sections/AboutAndLinks';
import { AmenitiesSection, PaymentsSection, ProductsSection } from './sections/PaymentsAndProducts';
import { EventsSection, ProgramsSection, VendorsSection } from './sections/VendorsAndEvents';

type TabId = 'hours' | 'about' | 'payments' | 'vendors' | 'photos';

const TABS: { id: TabId; label: string; sections: ListingSection[] }[] = [
  { id: 'hours', label: 'Status and hours', sections: ['status', 'season', 'schedules'] },
  { id: 'about', label: 'About and links', sections: ['about', 'contact'] },
  { id: 'payments', label: 'Payments and products', sections: ['payments', 'products', 'amenities'] },
  { id: 'vendors', label: 'Vendors and events', sections: ['vendors', 'events', 'programs'] },
  { id: 'photos', label: 'Photos', sections: [] },
];

function tabFor(section: ListingSection | null): TabId {
  return TABS.find((tab) => section && tab.sections.includes(section))?.id ?? 'hours';
}

type FieldErrors = { path: string; message: string }[];
type Notice = { tone: 'success' | 'error'; text: string } | null;

function toErrorMap(errors: FieldErrors): Record<string, string> {
  const map: Record<string, string> = {};
  for (const { path, message } of errors) {
    if (!(path in map)) map[path] = friendlyMessage(path, message);
  }
  return map;
}

export interface ListingEditorProps {
  slug: string;
  /** Published values, with any pending request merged over them. */
  initialValues: ListingEdits;
  /** True when this organizer already has an update waiting for review. */
  hasPending: boolean;
  /** The photo manager, rendered by the page; it saves on its own. */
  photos: ReactNode;
}

export function ListingEditor({ slug, initialValues, hasPending, photos }: ListingEditorProps) {
  const router = useRouter();
  const [edits, setEdits] = useState<ListingEdits>(initialValues);
  const [baseline, setBaseline] = useState<ListingEdits>(initialValues);
  const [tab, setTab] = useState<TabId>('hours');
  const [submittedErrors, setSubmittedErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [sending, startSending] = useTransition();

  const payloadKey = useMemo(() => payloadFingerprint(edits, initialValues), [edits, initialValues]);
  const baselineKey = useMemo(() => payloadFingerprint(baseline, initialValues), [baseline, initialValues]);
  const dirty = payloadKey !== baselineKey;

  // After a failed submit, errors fade out as they are fixed. New problems
  // only show on the next submit, so nobody is scolded mid-typing.
  const errors = useMemo(() => {
    const submitted = Object.keys(submittedErrors);
    if (submitted.length === 0) return submittedErrors;
    const check = parseListingEdits(dropUntouchedEmptySections(edits, initialValues));
    if (check.ok) return {};
    const current = toErrorMap(check.errors);
    return Object.fromEntries(submitted.filter((path) => path in current).map((path) => [path, current[path]]));
  }, [submittedErrors, edits, initialValues]);
  const errorList = Object.entries(errors);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older Safari only shows the prompt when returnValue is set.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function setSection<S extends ListingSection>(section: S, value: ListingEdits[S]) {
    setEdits((current) => ({ ...current, [section]: value }));
    setNotice(null);
  }

  function showErrors(fieldErrors: FieldErrors) {
    const map = toErrorMap(fieldErrors);
    setSubmittedErrors(map);
    const first = Object.keys(map)[0];
    if (first) goToSection(sectionOf(first));
  }

  function goToSection(section: ListingSection | null) {
    setTab(tabFor(section));
    if (!section) return;
    // Wait for the tab to render before scrolling to the section.
    requestAnimationFrame(() => {
      document.getElementById(`section-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function submit() {
    if (sending) return;
    const compacted = compactRows(edits);
    setEdits(compacted);
    const payload = dropUntouchedEmptySections(compacted, initialValues);

    const parsed = parseListingEdits(payload);
    if (!parsed.ok) {
      showErrors(parsed.errors);
      setNotice({ tone: 'error', text: 'A few fields need a fix before you send.' });
      return;
    }
    setSubmittedErrors({});
    setNotice(null);

    startSending(async () => {
      try {
        const result = await submitListingChangesAction(slug, payload);
        if (result.ok) {
          setBaseline(compacted);
          setNotice({ tone: 'success', text: result.message ?? 'Sent for review.' });
          router.refresh();
        } else {
          if ('fieldErrors' in result && result.fieldErrors.length) showErrors(result.fieldErrors);
          setNotice({ tone: 'error', text: result.error });
        }
      } catch {
        setNotice({ tone: 'error', text: 'That did not go through. Check your connection and try again.' });
      }
    });
  }

  const errorTabs = new Set(errorList.map(([path]) => tabFor(sectionOf(path))));
  const showBar = tab !== 'photos' || dirty;

  return (
    <FieldErrorsContext.Provider value={errors}>
      {/* Not a <form>: Enter in a field should never send the whole listing,
          and the photo tab saves on its own. */}
      <div>
        <Tabs value={tab} onValueChange={(value) => setTab(value as TabId)}>
          <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
            <TabsList className="w-max gap-1 group-data-[orientation=horizontal]/tabs:h-auto sm:w-full">
              {TABS.map((item) => (
                <TabsTrigger key={item.id} value={item.id} className="h-10 flex-none px-3 sm:flex-1">
                  {item.label}
                  {errorTabs.has(item.id) ? (
                    <>
                      <span aria-hidden="true" className="size-2 rounded-full bg-red-600" />
                      <span className="sr-only"> (needs a fix)</span>
                    </>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {errorList.length > 0 ? <ErrorSummary errors={errorList} onJump={goToSection} /> : null}

          <TabsContent value="hours" className="mt-4 flex flex-col gap-4">
            <StatusSection value={edits.status} onChange={(value) => setSection('status', value)} />
            <SeasonSection value={edits.season} onChange={(value) => setSection('season', value)} />
            <SchedulesSection value={edits.schedules} onChange={(value) => setSection('schedules', value)} />
          </TabsContent>
          <TabsContent value="about" className="mt-4 flex flex-col gap-4">
            <AboutSection value={edits.about} onChange={(value) => setSection('about', value)} />
            <ContactSection value={edits.contact} onChange={(value) => setSection('contact', value)} />
          </TabsContent>
          <TabsContent value="payments" className="mt-4 flex flex-col gap-4">
            <PaymentsSection value={edits.payments} onChange={(value) => setSection('payments', value)} />
            <ProductsSection value={edits.products} onChange={(value) => setSection('products', value)} />
            <AmenitiesSection value={edits.amenities} onChange={(value) => setSection('amenities', value)} />
          </TabsContent>
          <TabsContent value="vendors" className="mt-4 flex flex-col gap-4">
            <VendorsSection value={edits.vendors} onChange={(value) => setSection('vendors', value)} />
            <EventsSection value={edits.events} onChange={(value) => setSection('events', value)} />
            <ProgramsSection value={edits.programs} onChange={(value) => setSection('programs', value)} />
          </TabsContent>
          {/* Kept mounted so uploads in progress survive a tab switch. */}
          <TabsContent value="photos" forceMount className="mt-4 data-[state=inactive]:hidden">
            {photos}
          </TabsContent>
        </Tabs>

        {showBar ? (
          <SubmitBar
            dirty={dirty}
            hasPending={hasPending}
            sending={sending}
            notice={notice}
            onSubmit={submit}
          />
        ) : null}
      </div>
    </FieldErrorsContext.Provider>
  );
}

function ErrorSummary({
  errors,
  onJump,
}: {
  errors: [string, string][];
  onJump: (section: ListingSection | null) => void;
}) {
  const bySection = new Map<ListingSection | null, string[]>();
  for (const [path, message] of errors) {
    const section = sectionOf(path);
    bySection.set(section, [...(bySection.get(section) ?? []), message]);
  }
  return (
    <div
      role="alert"
      className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
    >
      <p className="flex items-center gap-2 font-semibold">
        <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
        {errors.length === 1 ? '1 field needs a fix' : `${errors.length} fields need a fix`}
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {[...bySection.entries()].map(([section, messages]) => (
          <li key={section ?? 'other'}>
            <button
              type="button"
              onClick={() => onJump(section)}
              className="min-h-9 text-left underline decoration-red-300 underline-offset-4 hover:decoration-red-700"
            >
              {section ? SECTION_LABELS[section] : 'Listing'}: {[...new Set(messages)].join('. ')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SubmitBar({
  dirty,
  hasPending,
  sending,
  notice,
  onSubmit,
}: {
  dirty: boolean;
  hasPending: boolean;
  sending: boolean;
  notice: Notice;
  onSubmit: () => void;
}) {
  const status = notice
    ? null
    : dirty
      ? 'You have changes that are not sent yet.'
      : hasPending
        ? 'Your last update is waiting for review.'
        : 'No changes yet.';

  return (
    <div className="sticky bottom-0 z-30 -mx-4 mt-6 border-t border-zinc-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-white/80 sm:mx-0 sm:rounded-xl sm:border sm:px-4 sm:shadow-sm dark:border-zinc-800 dark:bg-zinc-900/95 dark:supports-[backdrop-filter]:bg-zinc-900/80">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite" className="min-h-5 text-sm">
          {notice ? (
            <p
              className={cn(
                'flex items-start gap-2 font-medium',
                notice.tone === 'success' ? 'text-green-800 dark:text-green-300' : 'text-red-700 dark:text-red-400',
              )}
            >
              {notice.tone === 'success' ? (
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              ) : (
                <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              )}
              {notice.text}
            </p>
          ) : (
            <p className="text-zinc-600 dark:text-zinc-400">
              {status} <span className="hidden sm:inline">Changes go live after a quick review.</span>
            </p>
          )}
        </div>
        <Button
          type="button"
          onClick={onSubmit}
          disabled={sending || !dirty}
          className="h-12 w-full bg-green-700 px-6 text-base text-white hover:bg-green-800 sm:h-11 sm:w-auto sm:text-sm dark:bg-green-700 dark:hover:bg-green-600"
        >
          {sending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Send aria-hidden="true" />}
          {sending ? 'Sending' : 'Send for review'}
        </Button>
      </div>
    </div>
  );
}
