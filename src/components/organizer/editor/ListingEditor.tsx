'use client';

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Info, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { submitListingChangesAction } from '@/app/(app)/dashboard/actions';
import { adminPublishAction } from '@/app/(app)/admin/actions';
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
import { IdentitySection, LocationSection } from './sections/NameAndLocation';

type TabId = 'place' | 'hours' | 'about' | 'payments' | 'vendors' | 'photos';
type Tab = { id: TabId; label: string; sections: ListingSection[] };

const PLACE_TAB: Tab = { id: 'place', label: 'Basics', sections: ['identity', 'location'] };
const HOURS_TAB: Tab = { id: 'hours', label: 'Hours', sections: ['status', 'season', 'schedules'] };
const ABOUT_TAB: Tab = { id: 'about', label: 'About', sections: ['about', 'contact'] };
const PAYMENTS_TAB: Tab = { id: 'payments', label: 'Shopping', sections: ['payments', 'products', 'amenities'] };
const VENDORS_TAB: Tab = { id: 'vendors', label: 'Vendors', sections: ['vendors', 'events', 'programs'] };
const PHOTOS_TAB: Tab = { id: 'photos', label: 'Photos', sections: [] };

export type EditorMode = 'organizer' | 'admin';

/**
 * Everything that differs between an organizer sending an update for review
 * and an admin publishing directly. The editing itself is the same.
 */
const MODES = {
  organizer: {
    // Organizers mostly change hours, so those come first; name and location
    // are rarer and always get a closer look.
    tabs: [HOURS_TAB, ABOUT_TAB, PAYMENTS_TAB, VENDORS_TAB, PLACE_TAB, PHOTOS_TAB] as Tab[],
    admin: false,
    submit: submitListingChangesAction,
    cta: 'Send for review',
    busy: 'Sending',
    fixFirst: 'A few fields need a fix before you send.',
    done: 'Sent for review.',
    unsent: 'You have changes that are not sent yet.',
    footnote: 'Changes go live after a quick review.',
    placeHint: 'Name and address changes are always checked by our team before they go live.',
    cityNote: "City and state can't be changed here. Email us if the market moved.",
  },
  admin: {
    tabs: [PLACE_TAB, HOURS_TAB, ABOUT_TAB, PAYMENTS_TAB, VENDORS_TAB, PHOTOS_TAB] as Tab[],
    admin: true,
    submit: adminPublishAction,
    cta: 'Publish now',
    busy: 'Publishing',
    fixFirst: 'A few fields need a fix before you publish.',
    done: 'Published.',
    unsent: 'You have changes that are not published yet.',
    footnote: 'Changes go live as soon as you publish.',
    placeHint: null,
    cityNote: 'City and state decide which city page lists this market, so they cannot be changed here.',
  },
} as const;

type ModeConfig = (typeof MODES)[EditorMode];

function tabFor(section: ListingSection | null, tabs: readonly Tab[]): TabId {
  return tabs.find((tab) => section && tab.sections.includes(section))?.id ?? tabs[0].id;
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
  /**
   * Organizer: published values, with any pending request merged over them.
   * Admin: published values. Both include the name and location sections.
   */
  initialValues: ListingEdits;
  /** True when this organizer already has an update waiting for review. Organizer mode only. */
  hasPending?: boolean;
  /** The photo manager, rendered by the page; it saves on its own. */
  photos: ReactNode;
  /**
   * 'organizer' (default) sends the update for review, name and location
   * included. 'admin' publishes straight away.
   */
  mode?: EditorMode;
  /** City and state, shown read-only next to the address. */
  place?: { city?: string; state?: string };
  /** Admin mode: photos waiting for review, counted on the Photos tab. */
  photosWaiting?: number;
}

export function ListingEditor({
  slug,
  initialValues,
  hasPending = false,
  photos,
  mode = 'organizer',
  place,
  photosWaiting = 0,
}: ListingEditorProps) {
  const config: ModeConfig = MODES[mode];
  const tabs = config.tabs;
  const router = useRouter();
  const [edits, setEdits] = useState<ListingEdits>(initialValues);
  const [baseline, setBaseline] = useState<ListingEdits>(initialValues);
  const [syncedInitial, setSyncedInitial] = useState<ListingEdits>(initialValues);
  const [tab, setTab] = useState<TabId>(tabs[0].id);
  const [submittedErrors, setSubmittedErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [sending, startSending] = useTransition();
  const tabStrip = useRef<HTMLDivElement>(null);

  // On a narrow screen the tab strip scrolls sideways. Keep the open tab in
  // view, without moving the page itself.
  useEffect(() => {
    const strip = tabStrip.current;
    const active = strip?.querySelector<HTMLElement>('[data-state="active"]');
    if (!strip || !active) return;
    const stripBox = strip.getBoundingClientRect();
    const tabBox = active.getBoundingClientRect();
    // Not smooth: a second scroll (the page, below) would cut a smooth one short.
    if (tabBox.left < stripBox.left) strip.scrollLeft += tabBox.left - stripBox.left - 16;
    else if (tabBox.right > stripBox.right) strip.scrollLeft += tabBox.right - stripBox.right + 16;
    // The strip sticks to the top on a phone. Opened from far down a long
    // tab, the next one starts from its own top.
    const tabsRoot = strip.parentElement;
    const scroller = strip.closest('main');
    if (tabsRoot && scroller && tabsRoot.getBoundingClientRect().top < scroller.getBoundingClientRect().top) {
      tabsRoot.scrollIntoView({ block: 'start' });
    }
  }, [tab]);

  const payloadKey = useMemo(() => payloadFingerprint(edits, initialValues), [edits, initialValues]);
  const baselineKey = useMemo(() => payloadFingerprint(baseline, initialValues), [baseline, initialValues]);
  const dirty = payloadKey !== baselineKey;

  // Admin mode: after a publish or a section reset the page sends fresh
  // published values. Pick them up unless there is unsent work in the form.
  if (config.admin && initialValues !== syncedInitial) {
    setSyncedInitial(initialValues);
    if (!dirty) {
      setEdits(initialValues);
      setBaseline(initialValues);
    }
  }

  // After a failed submit, errors fade out as they are fixed. New problems
  // only show on the next submit, so nobody is scolded mid-typing.
  const errors = useMemo(() => {
    const submitted = Object.keys(submittedErrors);
    if (submitted.length === 0) return submittedErrors;
    const check = parseListingEdits(dropUntouchedEmptySections(edits, initialValues), { admin: true });
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
    setTab(tabFor(section, tabs));
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

    // Both modes may send every section; the server decides what waits for review.
    const parsed = parseListingEdits(payload, { admin: true });
    if (!parsed.ok) {
      showErrors(parsed.errors);
      setNotice({ tone: 'error', text: config.fixFirst });
      return;
    }
    setSubmittedErrors({});
    setNotice(null);

    startSending(async () => {
      try {
        const result = await config.submit(slug, payload);
        if (result.ok) {
          setBaseline(compacted);
          setNotice({ tone: 'success', text: result.message ?? config.done });
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

  const errorTabs = new Set(errorList.map(([path]) => tabFor(sectionOf(path), tabs)));
  const showBar = tab !== 'photos' || dirty;
  // On a phone the bar costs an eighth of the screen, so it waits until there
  // is something to send or to say.
  const quietBar = !dirty && !notice && !sending;

  return (
    <FieldErrorsContext.Provider value={errors}>
      {/* Not a <form>: Enter in a field should never send the whole listing,
          and the photo tab saves on its own. */}
      <div>
        <Tabs value={tab} onValueChange={(value) => setTab(value as TabId)}>
          {/* Underline tabs, left aligned. The strip scrolls sideways when it
              does not fit, so no tab is ever cut off out of reach. */}
          <div
            ref={tabStrip}
            className="sticky top-0 z-20 -mx-4 overflow-x-auto bg-white px-4 [scrollbar-width:none] sm:static sm:z-auto sm:mx-0 sm:bg-transparent sm:px-0 dark:bg-zinc-900 sm:dark:bg-transparent [&::-webkit-scrollbar]:hidden"
          >
            <TabsList
              variant="line"
              className="w-max min-w-full justify-start gap-1 border-b border-zinc-200 p-0 group-data-[orientation=horizontal]/tabs:h-auto dark:border-zinc-800"
            >
              {tabs.map((item) => (
                <TabsTrigger
                  key={item.id}
                  value={item.id}
                  className="h-11 flex-none px-3 text-zinc-600 after:bg-green-700 focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-green-700/40 focus-visible:outline-none focus-visible:ring-inset hover:text-zinc-900 data-[state=active]:text-green-800 group-data-[orientation=horizontal]/tabs:after:-bottom-px dark:text-zinc-400 dark:after:bg-green-500 dark:hover:text-zinc-100 dark:data-[state=active]:text-green-300"
                >
                  {item.label}
                  {item.id === 'photos' && photosWaiting > 0 ? (
                    <span className="rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-900 tabular-nums dark:bg-amber-900/40 dark:text-amber-200">
                      {photosWaiting}
                      <span className="sr-only"> waiting for review</span>
                    </span>
                  ) : null}
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

          <TabsContent value="place" className="mt-4 flex flex-col gap-4">
            {config.placeHint ? (
              <p className="flex items-start gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-green-700 dark:text-green-400" />
                {config.placeHint}
              </p>
            ) : null}
            <IdentitySection value={edits.identity} onChange={(value) => setSection('identity', value)} />
            <LocationSection
              value={edits.location}
              onChange={(value) => setSection('location', value)}
              city={place?.city}
              state={place?.state}
              cityNote={config.cityNote}
            />
          </TabsContent>

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
            config={config}
            dirty={dirty}
            hasPending={hasPending}
            sending={sending}
            notice={notice}
            quiet={quietBar}
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
            <Button
              type="button"
              variant="link"
              onClick={() => onJump(section)}
              className="h-auto min-h-9 justify-start p-0 text-left font-normal whitespace-normal text-current underline decoration-red-300 underline-offset-4 hover:decoration-red-700"
            >
              {section ? SECTION_LABELS[section] : 'Listing'}: {[...new Set(messages)].join('. ')}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SubmitBar({
  config,
  dirty,
  hasPending,
  sending,
  notice,
  quiet,
  onSubmit,
}: {
  config: ModeConfig;
  dirty: boolean;
  hasPending: boolean;
  sending: boolean;
  notice: Notice;
  /** Nothing to send or say: hidden on phones. */
  quiet: boolean;
  onSubmit: () => void;
}) {
  const status = notice
    ? null
    : dirty
      ? config.unsent
      : hasPending
        ? 'Your last update is waiting for review.'
        : 'No changes yet.';

  return (
    <div className={cn(quiet && 'hidden sm:block', 'sticky bottom-0 z-30 -mx-4 mt-6 border-t border-zinc-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-white/80 sm:mx-0 sm:rounded-xl sm:border sm:px-4 sm:shadow-sm dark:border-zinc-800 dark:bg-zinc-900/95 dark:supports-[backdrop-filter]:bg-zinc-900/80')}>
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
              {status} <span className="hidden sm:inline">{config.footnote}</span>
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
          {sending ? config.busy : config.cta}
        </Button>
      </div>
    </div>
  );
}
