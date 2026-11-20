/**
 * The listing bot's request contract (docs/listing-bot.md): body schemas,
 * how a request becomes listing edits, and the field-level diff every write
 * returns and logs. Pure module (no server-only imports) so node tests can
 * use it; src/lib/listingBot.ts does the database work.
 */
import { z } from 'zod';
import {
  ASSISTANCE_CODES,
  PAYMENT_CODES,
  WEEKDAYS,
  httpUrl,
  incentiveSchema,
  phoneSchema,
  seasonSchema,
  stableStringify,
  type ListingEdits,
  type ListingSection,
  type Weekday,
} from './listingEdits.ts';

/* ------------------------------------------------------------------ *
 * Shared fields
 * ------------------------------------------------------------------ */

/** Where the change came from: "operator email from Pat Lee on Nov 18, 2026". Logged with every write. */
export const sourceNote = z.string().trim().min(10, 'Say who asked for this, when, and how (at least 10 characters)').max(1000);
const operatorEmail = z.string().trim().toLowerCase().email().max(254).optional();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time like 08:00');
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-25')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value), 'Not a real date');
const text = (max: number) => z.string().trim().min(1).max(max);
/** A text field the bot may also clear with `null`. */
const clearable = (max: number) => z.union([z.string().trim().max(max), z.null()]).optional();

/** `?dry_run=true` (or `1`): compute and return the diff, change nothing. */
export function isDryRun(url: string): boolean {
  const value = new URL(url).searchParams.get('dry_run')?.toLowerCase();
  return value === 'true' || value === '1';
}

/** Zod issues in the shape every bot error response uses. */
export function issuesOf(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

/* ------------------------------------------------------------------ *
 * PATCH /api/bot/markets/:slug
 * ------------------------------------------------------------------ */

const paymentsPatch = z
  .object({
    methods: z.array(z.enum(PAYMENT_CODES)).max(PAYMENT_CODES.length).optional(),
    assistance: z.array(z.enum(ASSISTANCE_CODES)).max(ASSISTANCE_CODES.length).optional(),
    incentives: z.array(incentiveSchema).max(5).optional(),
  })
  .strict();

export const patchBody = z
  .object({
    source_note: sourceNote,
    operator_email: operatorEmail,
    name: text(150).optional(),
    operator_name: clearable(150),
    address: clearable(200),
    zip_code: clearable(20),
    location_description: clearable(400),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    /** The main phone number; other numbers on the listing are kept. `null` removes it. */
    phone: z.union([phoneSchema, z.null()]).optional(),
    /** Every phone number, replacing the list. */
    phone_numbers: z.array(phoneSchema).max(3).optional(),
    /** The main website; other links are kept. `null` removes it. */
    website: z.union([httpUrl, z.null()]).optional(),
    /** Every website, replacing the list. */
    websites: z.array(httpUrl).max(3).optional(),
    /** Payment codes; each list sent replaces that list, lists not sent stay. */
    payments: paymentsPatch.optional(),
    description: clearable(1500),
    visitor_note: clearable(400),
  })
  .strict()
  .refine((body) => (body.lat === undefined) === (body.lng === undefined), {
    message: 'Send lat and lng together',
    path: ['lat'],
  })
  .refine((body) => !(body.phone !== undefined && body.phone_numbers), { message: 'Send phone or phone_numbers, not both', path: ['phone'] })
  .refine((body) => !(body.website !== undefined && body.websites), { message: 'Send website or websites, not both', path: ['website'] });

export type PatchBody = z.infer<typeof patchBody>;

/** The listing fields a PATCH may set (everything but the note and email). */
export const PATCH_FIELDS = [
  'name', 'operator_name', 'address', 'zip_code', 'location_description', 'lat', 'lng', 'phone', 'phone_numbers',
  'website', 'websites', 'payments', 'description', 'visitor_note',
] as const;

function primaryFirst(list: string[] | undefined, value: string | null): string[] {
  const rest = (list ?? []).slice(1).filter((item) => item !== value);
  return value === null ? rest : [value, ...rest];
}

/**
 * The sections a PATCH changes, each filled from the live section so only
 * the fields sent move. Validate the result with `parseListingEdits(..., { admin: true })`.
 */
export type PatchFields = Omit<PatchBody, 'source_note' | 'operator_email'>;

export function patchToEdits(live: ListingEdits, body: PatchFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const has = (key: keyof PatchFields) => body[key] !== undefined;
  const orUndefined = (value: string | null | undefined) => (value === null ? undefined : value);

  if (has('name') || has('operator_name')) {
    out.identity = {
      ...live.identity,
      name: body.name ?? live.identity?.name,
      ...(has('operator_name') ? { operator_name: orUndefined(body.operator_name) } : {}),
    };
  }
  if (has('address') || has('zip_code') || has('location_description') || has('lat')) {
    out.location = {
      ...live.location,
      ...(has('address') ? { address: orUndefined(body.address) } : {}),
      ...(has('zip_code') ? { zip_code: orUndefined(body.zip_code) } : {}),
      ...(has('location_description') ? { location_description: orUndefined(body.location_description) } : {}),
      ...(body.lat !== undefined && body.lng !== undefined ? { coordinates: { lat: body.lat, lon: body.lng } } : {}),
    };
  }
  if (has('phone') || has('phone_numbers') || has('website') || has('websites')) {
    const contact = live.contact ?? { websites: [], phone_numbers: [], emails: [], social_profiles: [] };
    out.contact = {
      ...contact,
      phone_numbers: body.phone_numbers ?? (body.phone !== undefined ? primaryFirst(contact.phone_numbers, body.phone) : contact.phone_numbers),
      websites: body.websites ?? (body.website !== undefined ? primaryFirst(contact.websites, body.website) : contact.websites),
    };
  }
  if (body.payments) {
    const payments = live.payments ?? { methods: [], assistance: [], incentives: [] };
    out.payments = {
      methods: body.payments.methods ?? payments.methods,
      assistance: body.payments.assistance ?? payments.assistance,
      incentives: body.payments.incentives ?? payments.incentives,
    };
  }
  if (has('description') || has('visitor_note')) {
    out.about = {
      ...live.about,
      ...(has('description') ? { description: orUndefined(body.description) ?? '' } : {}),
      ...(has('visitor_note') ? { visitor_note: orUndefined(body.visitor_note) ?? '' } : {}),
    };
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * PUT /api/bot/markets/:slug/schedule
 * ------------------------------------------------------------------ */

const windowSchema = z
  .object({ opens: time, closes: time, label: z.string().trim().max(80).optional() })
  .strict()
  .refine((value) => value.opens < value.closes, { message: 'Closing time must be after opening time', path: ['closes'] });

/** `{ "saturday": [{ "opens": "08:00", "closes": "13:00" }], ... }` */
const hoursByDay = z
  .object(Object.fromEntries(WEEKDAYS.map((day) => [day, z.array(windowSchema).max(3).optional()])) as Record<Weekday, z.ZodOptional<z.ZodArray<typeof windowSchema>>>)
  .strict();

export type HoursByDay = Partial<Record<Weekday, { opens: string; closes: string; label?: string }[]>>;

const seasonalSchema = z
  .object({
    start_date: isoDate,
    end_date: isoDate,
    hours: hoursByDay,
    label: z.string().trim().max(80).optional(),
  })
  .strict()
  .refine((value) => value.end_date >= value.start_date, { message: 'End date is before start date', path: ['end_date'] });

const specialDateSchema = z
  .object({
    date: isoDate,
    end_date: isoDate.optional(),
    opens: time,
    closes: time,
    /** `extra_day` (default): a market on a day it is not usually open. `different_hours`: a usual day with other hours. */
    kind: z.enum(['extra_day', 'different_hours']).optional(),
    note: z.string().trim().max(200).optional(),
  })
  .strict()
  .refine((value) => value.opens < value.closes, { message: 'Closing time must be after opening time', path: ['closes'] })
  .refine((value) => !value.end_date || value.end_date >= value.date, { message: 'End date is before start date', path: ['end_date'] });

const closureSchema = z
  .object({ date: isoDate, end_date: isoDate.optional(), note: z.string().trim().max(200).optional() })
  .strict()
  .refine((value) => !value.end_date || value.end_date >= value.date, { message: 'End date is before start date', path: ['end_date'] });

/** The schedule fields, shared by the PUT and by POST /api/bot/markets. */
export const scheduleFields = {
  /** Every week, by day. Omit or send `{}` for a market with no regular weekly hours. */
  weekly: hoursByDay.optional(),
  /** Date ranges with their own hours (winter Saturdays, a holiday run). */
  seasonal: z.array(seasonalSchema).max(6).optional(),
  /** One-off market days or different hours on a date. */
  special_dates: z.array(specialDateSchema).max(30).optional(),
  /** Dates the market is closed. */
  closures: z.array(closureSchema).max(30).optional(),
  /** The market's season. Not sent: the season stays as it is. */
  season: seasonSchema.optional(),
};

export const scheduleBody = z
  .object({ source_note: sourceNote, operator_email: operatorEmail, ...scheduleFields })
  .strict();

export type ScheduleBody = z.infer<typeof scheduleBody>;
export type ScheduleInput = Pick<ScheduleBody, 'weekly' | 'seasonal' | 'special_dates' | 'closures' | 'season'>;

/**
 * Rows of `{ weekdays, opens, closes, label }` from hours keyed by day: days
 * that share a window become one row, in week order.
 */
function rowsFromHours(hours: HoursByDay | undefined, range?: { start_date: string; end_date: string; label?: string }) {
  const rows = new Map<string, { weekdays: Weekday[]; opens: string; closes: string; label?: string; start_date?: string; end_date?: string }>();
  for (const day of WEEKDAYS) {
    for (const window of hours?.[day] ?? []) {
      const label = window.label || range?.label || undefined;
      const key = `${window.opens}|${window.closes}|${label ?? ''}`;
      const row = rows.get(key) ?? {
        weekdays: [],
        opens: window.opens,
        closes: window.closes,
        ...(label ? { label } : {}),
        ...(range ? { start_date: range.start_date, end_date: range.end_date } : {}),
      };
      if (!row.weekdays.includes(day)) row.weekdays.push(day);
      rows.set(key, row);
    }
  }
  return [...rows.values()];
}

/** Dates in the past are refused: a wrong year is the usual cause. */
export function pastDateIssues(input: ScheduleInput, today: string): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  input.special_dates?.forEach((item, index) => {
    if ((item.end_date ?? item.date) < today) issues.push({ path: `special_dates.${index}.date`, message: `${item.date} is in the past` });
  });
  input.closures?.forEach((item, index) => {
    if ((item.end_date ?? item.date) < today) issues.push({ path: `closures.${index}.date`, message: `${item.date} is in the past` });
  });
  input.seasonal?.forEach((item, index) => {
    if (item.end_date < today) issues.push({ path: `seasonal.${index}.end_date`, message: `${item.end_date} is in the past` });
  });
  return issues;
}

/** The `schedules`, `exceptions` (and `season`, when sent) sections a schedule replaces. */
export function scheduleToEdits(input: ScheduleInput): Pick<ListingEdits, 'schedules' | 'exceptions' | 'season'> {
  const schedules = [
    ...rowsFromHours(input.weekly),
    ...(input.seasonal ?? []).flatMap((range) => rowsFromHours(range.hours, range)),
  ];
  const exceptions = [
    ...(input.special_dates ?? []).map((item) => ({
      status: item.kind === 'different_hours' ? ('modified_hours' as const) : ('special_opening' as const),
      start_date: item.date,
      ...(item.end_date && item.end_date !== item.date ? { end_date: item.end_date } : {}),
      opens: item.opens,
      closes: item.closes,
      ...(item.note ? { note: item.note } : {}),
    })),
    ...(input.closures ?? []).map((item) => ({
      status: 'closed' as const,
      start_date: item.date,
      ...(item.end_date && item.end_date !== item.date ? { end_date: item.end_date } : {}),
      ...(item.note ? { note: item.note } : {}),
    })),
  ].sort((left, right) => left.start_date.localeCompare(right.start_date) || left.status.localeCompare(right.status));
  return { schedules, exceptions, ...(input.season ? { season: input.season } : {}) };
}

/** Overlapping dates would make the page say two things about one day. */
export function overlappingExceptionIssues(exceptions: NonNullable<ListingEdits['exceptions']>): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  const sorted = [...exceptions].sort((a, b) => a.start_date.localeCompare(b.start_date));
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (current.start_date <= (previous.end_date ?? previous.start_date)) {
      issues.push({ path: 'special_dates', message: `${current.start_date} is listed twice (special dates and closures cannot overlap)` });
    }
  }
  return issues;
}

/** The schedule as the bot reads and sends it, from the published sections. */
export function scheduleFromEdits(edits: ListingEdits): Required<Pick<ScheduleInput, 'weekly' | 'seasonal' | 'special_dates' | 'closures'>> & {
  season?: ListingEdits['season'];
} {
  const weekly: HoursByDay = {};
  const seasonal = new Map<string, { start_date: string; end_date: string; hours: HoursByDay; label?: string }>();
  for (const row of edits.schedules ?? []) {
    let target = weekly;
    let label = row.label;
    if (row.start_date || row.end_date) {
      const start = row.start_date ?? row.end_date!;
      const end = row.end_date ?? row.start_date!;
      const key = `${start}|${end}`;
      const range = seasonal.get(key) ?? { start_date: start, end_date: end, hours: {}, ...(row.label ? { label: row.label } : {}) };
      seasonal.set(key, range);
      target = range.hours;
      // The range's own label ("Holiday market") is not repeated on each window.
      if (label === range.label) label = undefined;
    }
    const window = { opens: row.opens, closes: row.closes, ...(label ? { label } : {}) };
    for (const day of row.weekdays) (target[day] ??= []).push(window);
  }
  const ordered = (hours: HoursByDay) =>
    Object.fromEntries(WEEKDAYS.filter((day) => hours[day]?.length).map((day) => [day, hours[day]])) as HoursByDay;
  const exceptions = edits.exceptions ?? [];
  return {
    weekly: ordered(weekly),
    seasonal: [...seasonal.values()].map((range) => ({ ...range, hours: ordered(range.hours) })),
    special_dates: exceptions
      .filter((item) => item.status !== 'closed')
      .map((item) => ({
        date: item.start_date,
        ...(item.end_date ? { end_date: item.end_date } : {}),
        opens: item.opens!,
        closes: item.closes!,
        kind: item.status === 'modified_hours' ? ('different_hours' as const) : ('extra_day' as const),
        ...(item.note ? { note: item.note } : {}),
      })),
    closures: exceptions
      .filter((item) => item.status === 'closed')
      .map((item) => ({ date: item.start_date, ...(item.end_date ? { end_date: item.end_date } : {}), ...(item.note ? { note: item.note } : {}) })),
    ...(edits.season ? { season: edits.season } : {}),
  };
}

/* ------------------------------------------------------------------ *
 * Photos
 * ------------------------------------------------------------------ */

/** The text fields of POST /api/bot/markets/:slug/photos (multipart fields or JSON). */
export const photoFields = z
  .object({
    source_note: sourceNote,
    operator_email: operatorEmail,
    /** Instead of a file: an https image URL to fetch. */
    url: httpUrl.refine((value) => value.startsWith('https://'), 'Use an https:// image URL').optional(),
    caption: z.string().trim().max(160).optional(),
    credit: z.string().trim().max(120).optional(),
    alt: z.string().trim().max(200).optional(),
    /** Make it the cover photo (first in the gallery and on cards). */
    cover: z.boolean().optional(),
  })
  .strict();

/** PATCH /api/bot/markets/:slug/photos: a new order, or a new cover. */
export const photoOrderBody = z
  .object({
    source_note: sourceNote,
    operator_email: operatorEmail,
    /** Every published photo id in the new order (ids not listed keep their place after these). */
    order: z.array(z.string().uuid()).min(1).max(50).optional(),
    /** The photo to show first. */
    cover: z.string().uuid().optional(),
  })
  .strict()
  .refine((body) => Boolean(body.order) !== Boolean(body.cover), { message: 'Send order or cover, not both', path: ['order'] });

/** PATCH /api/bot/markets/:slug/photos/:id: caption, credit, alt text. */
export const photoDetailsBody = z
  .object({
    source_note: sourceNote,
    operator_email: operatorEmail,
    caption: clearable(160),
    credit: clearable(120),
    alt: clearable(200),
  })
  .strict();

/** DELETE /api/bot/markets/:slug/photos/:id (JSON body, or `?source_note=`). */
export const photoRemovalBody = z.object({ source_note: sourceNote, operator_email: operatorEmail }).strict();

/** The caption shown under the photo: the caption, then "Photo: <credit>". */
export function displayCaption(caption?: string | null, credit?: string | null): string | null {
  const parts = [caption?.trim().replace(/\.$/, ''), credit?.trim() ? `Photo: ${credit.trim()}` : undefined].filter(Boolean);
  return parts.length ? parts.join('. ').slice(0, 200) : null;
}

/** A new photo order: `wanted` first, then the rest as they were. Ids that are not published are ignored. */
export function reorder(current: string[], wanted: string[]): string[] {
  const known = new Set(current);
  const first = [...new Set(wanted)].filter((id) => known.has(id));
  return [...first, ...current.filter((id) => !first.includes(id))];
}

/* ------------------------------------------------------------------ *
 * POST /api/bot/markets
 * ------------------------------------------------------------------ */

export const createBody = z
  .object({
    source_note: sourceNote,
    operator_email: operatorEmail,
    name: text(150),
    city: text(80),
    /** Full name or 2-letter code ("California" or "CA"). */
    state: text(60),
    country_code: z.enum(['US', 'CA']).optional(),
    address: z.string().trim().max(200).optional(),
    zip_code: z.string().trim().max(20).optional(),
    location_description: z.string().trim().max(400).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    operator_name: z.string().trim().max(150).optional(),
    phone: phoneSchema.optional(),
    website: httpUrl.optional(),
    description: z.string().trim().max(1500).optional(),
    payments: paymentsPatch.optional(),
    /** IANA timezone ("America/Los_Angeles"), so the page can say "Open now". */
    timezone: z.string().trim().regex(/^[A-Za-z_]+\/[A-Za-z_\/-]+$/, 'Use an IANA timezone like America/Los_Angeles').optional(),
    schedule: z.object(scheduleFields).strict().optional(),
    /** Create it even though a market with a similar name is listed in the same city. */
    confirm_not_duplicate: z.boolean().optional(),
  })
  .strict()
  .refine((body) => (body.lat === undefined) === (body.lng === undefined), { message: 'Send lat and lng together', path: ['lat'] });

export type CreateBody = z.infer<typeof createBody>;

/* ------------------------------------------------------------------ *
 * POST /api/bot/markets/:slug/redirect
 * ------------------------------------------------------------------ */

export const redirectBody = z
  .object({
    source_note: sourceNote,
    operator_email: operatorEmail,
    /** The page we keep. */
    to_slug: z.string().trim().min(1).max(500),
    /** Who signed off on the merge. Required to publish it; without it the merge waits for an admin. */
    approved_by: z.string().trim().min(2).max(120).optional(),
  })
  .strict();

/* ------------------------------------------------------------------ *
 * Slugs
 * ------------------------------------------------------------------ */

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

/** `<name>-<city>` like the dataset's slugs, with `-2`, `-3`... when taken. */
export function newMarketSlug(name: string, city: string, taken: (slug: string) => boolean): string {
  const nameSlug = slugify(name) || 'market';
  const citySlug = slugify(city);
  const base = citySlug && !nameSlug.endsWith(citySlug) ? `${nameSlug}-${citySlug}` : nameSlug;
  if (!taken(base)) return base;
  for (let n = 2; n < 100; n += 1) if (!taken(`${base}-${n}`)) return `${base}-${n}`;
  throw new Error('No free slug');
}

/* ------------------------------------------------------------------ *
 * Diff
 * ------------------------------------------------------------------ */

export interface FieldChange {
  path: string;
  old: unknown;
  new: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Empty strings, empty lists and missing values all mean "nothing". */
function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

/**
 * Leaf-level changes between two values. Objects are walked key by key;
 * lists and scalars are compared whole. Empty and missing count as equal.
 */
export function diffValues(before: unknown, after: unknown, path = ''): FieldChange[] {
  if (isPlainObject(before) || isPlainObject(after)) {
    const left = isPlainObject(before) ? before : {};
    const right = isPlainObject(after) ? after : {};
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    return keys.flatMap((key) => diffValues(left[key], right[key], path ? `${path}.${key}` : key));
  }
  if (isEmpty(before) && isEmpty(after)) return [];
  if (stableStringify(before) === stableStringify(after)) return [];
  return [{ path, old: before ?? null, new: after ?? null }];
}

/** Changes per section, for the sections that differ. */
export function diffSections(before: ListingEdits, after: ListingEdits, sections: readonly ListingSection[]): FieldChange[] {
  return sections.flatMap((section) => diffValues(before[section], after[section], section));
}

/** Sections whose content differs, ignoring empty-vs-missing noise. */
export function sectionsChanged(before: ListingEdits, after: ListingEdits, sections: readonly ListingSection[]): ListingSection[] {
  return sections.filter((section) => after[section] !== undefined && diffValues(before[section], after[section]).length > 0);
}
