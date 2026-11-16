/**
 * Before and after for one section of a listing change request.
 *
 * Every section is broken into named parts. A scalar part (status, a note,
 * a URL) shows the live value next to the proposed one. A list part (days,
 * payment methods, vendors, events) shows the proposed list with added items
 * in green and removed items struck through in red. Parts that did not change
 * collapse into one "Unchanged" line so the eye lands on what moved.
 */
import { Minus, Plus } from 'lucide-react';
import { SECTION_LABELS, type ListingEdits, type ListingSection } from '@/lib/listingEdits';
import { cn } from '@/lib/utils';
import {
  AMENITY_LABELS,
  ASSISTANCE_LABELS,
  AVAILABILITY_LABELS,
  EVENT_LABELS,
  INCENTIVE_LABELS,
  PAYMENT_LABELS,
  PET_LABELS,
  PRODUCT_LABELS,
  PROGRAM_LABELS,
  SOCIAL_LABELS,
  STATUS_LABELS,
  formatDay,
  formatMonthDay,
  formatTime,
  safeHttpUrl,
  shortUrl,
  weekdayLabel,
} from './format';

interface Item {
  main: string;
  detail?: string;
  href?: string;
}

type Part =
  | { kind: 'scalar'; label: string; before?: string; after?: string; multiline?: boolean; href?: boolean }
  | { kind: 'list'; label: string; before: Item[]; after: Item[]; chips?: boolean };

const scalar = (label: string, before?: string, after?: string, extra: { multiline?: boolean; href?: boolean } = {}): Part => ({
  kind: 'scalar',
  label,
  before: before || undefined,
  after: after || undefined,
  ...extra,
});

const list = (label: string, before: Item[] = [], after: Item[] = [], chips = false): Part => ({
  kind: 'list',
  label,
  before,
  after,
  chips,
});

const codes = <T extends string>(labels: Record<T, string>, values?: readonly T[]): Item[] =>
  (values ?? []).map((code) => ({ main: labels[code] ?? code }));

const texts = (values?: readonly string[], links = false): Item[] =>
  (values ?? []).map((value) => ({ main: links ? shortUrl(value) : value, href: links ? value : undefined }));

const span = (start?: string, end?: string, format: (value: string) => string = formatTime) =>
  start ? (end ? `${format(start)} to ${format(end)}` : format(start)) : '';

type Section<K extends ListingSection> = NonNullable<ListingEdits[K]>;

function scheduleItems(value?: Section<'schedules'>): Item[] {
  return (value ?? []).map((schedule) => ({
    main: `${schedule.weekdays.map(weekdayLabel).join(', ')}, ${span(schedule.opens, schedule.closes)}`,
    detail: schedule.label,
  }));
}

function seasonText(value?: Section<'season'>): string | undefined {
  if (!value) return undefined;
  if (value.kind === 'year_round') return 'Year-round';
  return `${formatMonthDay(value.start)} to ${formatMonthDay(value.end)}`;
}

function partsFor(section: ListingSection, before: ListingEdits, after: ListingEdits): Part[] {
  switch (section) {
    case 'identity':
      return [scalar('Name', before.identity?.name, after.identity?.name)];
    case 'location': {
      const pin = (value?: { lat: number; lon: number }) => (value ? `${value.lat.toFixed(5)}, ${value.lon.toFixed(5)}` : undefined);
      const hidden = (value?: boolean) => (value === undefined ? undefined : value ? 'Hidden' : 'Shown');
      return [
        scalar('Street address', before.location?.address, after.location?.address),
        scalar('ZIP or postal code', before.location?.zip_code, after.location?.zip_code),
        scalar('Location note', before.location?.location_description, after.location?.location_description),
        scalar('Map pin', pin(before.location?.coordinates), pin(after.location?.coordinates)),
        scalar('Map', hidden(before.location?.suppress_map), hidden(after.location?.suppress_map)),
      ];
    }
    case 'status': {
      const a = before.status;
      const b = after.status;
      return [
        scalar('Status', a ? STATUS_LABELS[a.value] : undefined, b ? STATUS_LABELS[b.value] : undefined),
        scalar('Effective from', a?.effective_date && formatDay(a.effective_date), b?.effective_date && formatDay(b.effective_date)),
        scalar('Note', a?.note, b?.note),
      ];
    }
    case 'season':
      return [scalar('Season', seasonText(before.season), seasonText(after.season))];
    case 'schedules':
      return [list('Days and hours', scheduleItems(before.schedules), scheduleItems(after.schedules))];
    case 'about':
      return [
        scalar('Description', before.about?.description, after.about?.description, { multiline: true }),
        scalar('Visitor note', before.about?.visitor_note, after.about?.visitor_note, { multiline: true }),
      ];
    case 'contact': {
      const a = before.contact;
      const b = after.contact;
      const social = (value?: Section<'contact'>['social_profiles']): Item[] =>
        (value ?? []).map((profile) => ({ main: `${SOCIAL_LABELS[profile.platform]}: ${shortUrl(profile.url)}`, href: profile.url }));
      return [
        list('Websites', texts(a?.websites, true), texts(b?.websites, true)),
        list('Phone numbers', texts(a?.phone_numbers), texts(b?.phone_numbers)),
        list('Emails', texts(a?.emails), texts(b?.emails)),
        list('Social profiles', social(a?.social_profiles), social(b?.social_profiles)),
        scalar('Newsletter', a?.newsletter_url, b?.newsletter_url, { href: true }),
        scalar('Online ordering', a?.online_ordering_url, b?.online_ordering_url, { href: true }),
      ];
    }
    case 'payments': {
      const incentives = (value?: Section<'payments'>['incentives']): Item[] =>
        (value ?? []).map((incentive) => ({
          main: `${incentive.name} (${INCENTIVE_LABELS[incentive.kind]})`,
          detail: [incentive.note, incentive.url && shortUrl(incentive.url)].filter(Boolean).join(' · ') || undefined,
        }));
      return [
        list('Payment methods', codes(PAYMENT_LABELS, before.payments?.methods), codes(PAYMENT_LABELS, after.payments?.methods), true),
        list('Food assistance', codes(ASSISTANCE_LABELS, before.payments?.assistance), codes(ASSISTANCE_LABELS, after.payments?.assistance), true),
        list('Incentives', incentives(before.payments?.incentives), incentives(after.payments?.incentives)),
      ];
    }
    case 'products':
      return [
        list('Categories', codes(PRODUCT_LABELS, before.products?.categories), codes(PRODUCT_LABELS, after.products?.categories), true),
        list('Items', texts(before.products?.items), texts(after.products?.items), true),
      ];
    case 'amenities': {
      const a = before.amenities;
      const b = after.amenities;
      return [
        list('Available', codes(AMENITY_LABELS, a?.available), codes(AMENITY_LABELS, b?.available), true),
        scalar('Parking', a?.parking && AVAILABILITY_LABELS[a.parking], b?.parking && AVAILABILITY_LABELS[b.parking]),
        scalar('Parking note', a?.parking_note, b?.parking_note),
        scalar('Accessibility', a?.accessibility_note, b?.accessibility_note),
        scalar('Pets', a?.pets && PET_LABELS[a.pets], b?.pets && PET_LABELS[b.pets]),
      ];
    }
    case 'vendors': {
      const a = before.vendors;
      const b = after.vendors;
      const roster = (value?: Section<'vendors'>['roster']): Item[] =>
        (value ?? []).map((vendor) => ({
          main: vendor.category ? `${vendor.name} (${vendor.category})` : vendor.name,
          detail: vendor.website ? shortUrl(vendor.website) : undefined,
        }));
      return [
        scalar('Vendor count', a?.count?.toString(), b?.count?.toString()),
        scalar('Directory link', a?.directory_url, b?.directory_url, { href: true }),
        list('Roster', roster(a?.roster), roster(b?.roster)),
      ];
    }
    case 'events': {
      const events = (value?: Section<'events'>): Item[] =>
        (value ?? []).map((event) => {
          const dates = event.end && event.end !== event.start ? span(event.start, event.end, formatDay) : formatDay(event.start);
          const hours = span(event.opens, event.closes);
          return {
            main: `${event.name} (${EVENT_LABELS[event.kind]}), ${dates}${hours ? `, ${hours}` : ''}`,
            detail: [event.description, event.url && shortUrl(event.url)].filter(Boolean).join(' · ') || undefined,
          };
        });
      return [list('Events', events(before.events), events(after.events))];
    }
    case 'programs': {
      const programs = (value?: Section<'programs'>): Item[] =>
        (value ?? []).map((program) => ({
          main: `${program.name} (${PROGRAM_LABELS[program.kind]})`,
          detail: [program.description, program.url && shortUrl(program.url)].filter(Boolean).join(' · ') || undefined,
        }));
      return [list('Programs', programs(before.programs), programs(after.programs))];
    }
  }
}

const itemKey = (item: Item) => `${item.main}\u0000${item.detail ?? ''}`;

function partChanged(part: Part): boolean {
  if (part.kind === 'scalar') return (part.before ?? '') !== (part.after ?? '');
  return part.before.map(itemKey).join('\u0001') !== part.after.map(itemKey).join('\u0001');
}

export function SectionDiff({
  section,
  before,
  after,
}: {
  section: ListingSection;
  before: ListingEdits;
  after: ListingEdits;
}) {
  const parts = partsFor(section, before, after);
  const changed = parts.filter(partChanged);
  const unchanged = parts.filter((part) => !partChanged(part));

  return (
    <section className="rounded-lg border bg-white dark:bg-zinc-900" aria-labelledby={`diff-${section}`}>
      <h2 id={`diff-${section}`} className="border-b px-4 py-2.5 text-sm font-semibold">
        {SECTION_LABELS[section]}
      </h2>
      {changed.length === 0 ? (
        <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
          Same as the live listing now. Approving changes nothing here.
        </p>
      ) : (
        <div className="divide-y">
          {changed.map((part) =>
            part.kind === 'scalar' ? <ScalarDiff key={part.label} part={part} /> : <ListDiff key={part.label} part={part} />,
          )}
        </div>
      )}
      {changed.length > 0 && unchanged.length > 0 ? (
        <p className="border-t px-4 py-2 text-xs text-zinc-500 dark:text-zinc-400">
          Unchanged: {unchanged.map((part) => part.label).join(', ')}
        </p>
      ) : null}
    </section>
  );
}

function ScalarValue({ value, multiline, href }: { value?: string; multiline?: boolean; href?: boolean }) {
  if (!value) return <span className="text-zinc-400 italic dark:text-zinc-500">Not set</span>;
  const link = href ? safeHttpUrl(value) : null;
  if (link) {
    return (
      <a href={link} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline-offset-2 hover:underline">
        {shortUrl(value)}
      </a>
    );
  }
  return <span className={cn(multiline && 'whitespace-pre-line')}>{value}</span>;
}

function ScalarDiff({ part }: { part: Extract<Part, { kind: 'scalar' }> }) {
  return (
    <div className="grid gap-2 px-4 py-3 text-sm lg:grid-cols-[10rem_1fr_1fr] lg:gap-4">
      <div className="font-medium text-zinc-700 dark:text-zinc-300">{part.label}</div>
      <div className="min-w-0 rounded-md border-l-2 border-red-300 bg-red-50/60 px-3 py-2 break-words dark:border-red-800 dark:bg-red-950/30">
        <div className="mb-0.5 text-xs text-zinc-500 dark:text-zinc-400">Live now</div>
        <ScalarValue value={part.before} multiline={part.multiline} href={part.href} />
      </div>
      <div className="min-w-0 rounded-md border-l-2 border-green-400 bg-green-50/70 px-3 py-2 break-words dark:border-green-700 dark:bg-green-950/30">
        <div className="mb-0.5 text-xs text-zinc-500 dark:text-zinc-400">Proposed</div>
        <ScalarValue value={part.after} multiline={part.multiline} href={part.href} />
      </div>
    </div>
  );
}

type Marked = Item & { mark: 'added' | 'removed' | 'kept' };

function ListDiff({ part }: { part: Extract<Part, { kind: 'list' }> }) {
  const beforeKeys = new Set(part.before.map(itemKey));
  const afterKeys = new Set(part.after.map(itemKey));
  const rows: Marked[] = [
    ...part.after.map((item) => ({ ...item, mark: beforeKeys.has(itemKey(item)) ? ('kept' as const) : ('added' as const) })),
    ...part.before.filter((item) => !afterKeys.has(itemKey(item))).map((item) => ({ ...item, mark: 'removed' as const })),
  ];
  const added = rows.filter((row) => row.mark === 'added').length;
  const removed = rows.filter((row) => row.mark === 'removed').length;

  return (
    <div className="grid gap-2 px-4 py-3 text-sm lg:grid-cols-[10rem_1fr] lg:gap-4">
      <div>
        <div className="font-medium text-zinc-700 dark:text-zinc-300">{part.label}</div>
        <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          {added || removed
            ? [added && `${added} added`, removed && `${removed} removed`].filter(Boolean).join(', ')
            : 'Same items, new order'}
        </div>
      </div>
      {rows.length === 0 ? (
        <span className="text-zinc-400 italic dark:text-zinc-500">None</span>
      ) : part.chips ? (
        <ul className="flex flex-wrap gap-1.5">
          {rows.map((row) => (
            <li key={`${row.mark}-${itemKey(row)}`} className={chipTone(row.mark)}>
              <MarkIcon mark={row.mark} />
              {row.main}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-y rounded-md border">
          {rows.map((row, index) => (
            <li key={`${row.mark}-${index}-${itemKey(row)}`} className={cn('flex gap-2 px-3 py-1.5', rowTone(row.mark))}>
              <span className="mt-0.5 w-4 shrink-0">
                <MarkIcon mark={row.mark} />
              </span>
              <span className="min-w-0 break-words">
                <span className={cn(row.mark === 'removed' && 'line-through decoration-red-500/70')}>
                  {row.href && safeHttpUrl(row.href) && row.mark !== 'removed' ? (
                    <a href={row.href} target="_blank" rel="noopener noreferrer nofollow" className="underline-offset-2 hover:underline">
                      {row.main}
                    </a>
                  ) : (
                    row.main
                  )}
                </span>
                {row.detail ? (
                  <span
                    className={cn(
                      'block text-xs text-zinc-500 dark:text-zinc-400',
                      row.mark === 'removed' && 'line-through decoration-red-500/50',
                    )}
                  >
                    {row.detail}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MarkIcon({ mark }: { mark: Marked['mark'] }) {
  if (mark === 'added') {
    return (
      <>
        <Plus className="size-3.5 text-green-700 dark:text-green-400" aria-hidden="true" />
        <span className="sr-only">Added: </span>
      </>
    );
  }
  if (mark === 'removed') {
    return (
      <>
        <Minus className="size-3.5 text-red-700 dark:text-red-400" aria-hidden="true" />
        <span className="sr-only">Removed: </span>
      </>
    );
  }
  return null;
}

function chipTone(mark: Marked['mark']) {
  return cn(
    'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs',
    mark === 'added' && 'border-green-300 bg-green-50 font-medium text-green-800 dark:border-green-700/60 dark:bg-green-900/30 dark:text-green-200',
    mark === 'removed' &&
      'border-red-300 bg-red-50 text-red-800 line-through decoration-red-500/70 dark:border-red-700/60 dark:bg-red-900/30 dark:text-red-200',
    mark === 'kept' && 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  );
}

function rowTone(mark: Marked['mark']) {
  return cn(
    mark === 'added' && 'bg-green-50 text-green-900 dark:bg-green-950/40 dark:text-green-100',
    mark === 'removed' && 'bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100',
    mark === 'kept' && 'text-zinc-700 dark:text-zinc-300',
  );
}
