/**
 * What a vendor (a farm, a baker, a maker) may say about themselves, what
 * they send with a market application, and what an organizer may ask for.
 *
 * One set of schemas serves the vendor forms, the server actions, the admin
 * review and the public pages. All text is plain text and is always rendered
 * escaped. Pure module (no server-only imports) so node tests and client
 * components can use it.
 */
import { z } from 'zod';
import {
  PRODUCT_CODES,
  WEEKDAYS,
  emailSchema,
  line,
  optionalUrl,
  paragraph,
  phoneSchema,
  socialProfileSchema,
} from './listingEdits.ts';
import { UPLOAD_PHOTO_TYPES, isHeicPathname } from './photoTypes.ts';

export const MAX_VENDOR_PHOTOS = 7;
export const MAX_VENDOR_PHOTO_BYTES = 8 * 1024 * 1024;
/** HEIC/HEIF uploads are converted to JPEG by `/api/vendor/photos/convert` before they join a profile. */
export const VENDOR_PHOTO_CONTENT_TYPES = UPLOAD_PHOTO_TYPES;

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_CONTENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export const MAX_DOCUMENTS_PER_VENDOR = 30;

/** A vendor can have this many applications waiting at once. */
export const MAX_PENDING_APPLICATIONS = 25;
export const MAX_CHECKLIST_ITEMS = 20;

const optionalPhone = z
  .union([phoneSchema, z.literal('')])
  .transform((value) => value || undefined)
  .optional();

const optionalEmail = z
  .union([emailSchema, z.literal('')])
  .transform((value) => value || undefined)
  .optional();

/** A photo already uploaded to the public Blob store, under `vendors/<vendor id>/`. */
export const vendorPhotoSchema = z
  .object({
    url: z.string().url().max(1000),
    pathname: z.string().min(1).max(500),
    width: z.number().int().positive().max(20000).optional(),
    height: z.number().int().positive().max(20000).optional(),
    alt: line(200),
  })
  // An unconverted HEIC original: browsers cannot show it, so it never joins a profile.
  .refine((photo) => !isHeicPathname(photo.pathname), { message: 'Upload this photo again' });

export const vendorProfileSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your business name').max(120),
    /** Broad categories, the same codes markets use for "what you can buy". */
    products: z.array(z.enum(PRODUCT_CODES)).max(PRODUCT_CODES.length),
    /** Specific things in the vendor's own words: "sourdough", "heirloom tomatoes". */
    items: z.array(z.string().trim().min(1).max(60)).max(20),
    description: paragraph(1200),
    website: optionalUrl,
    social_profiles: z.array(socialProfileSchema).max(6),
    /** Shown publicly on the vendor's own page. The sign-in email never is. */
    phone: optionalPhone,
    email: optionalEmail,
    /** The first photo is the cover. */
    photos: z.array(vendorPhotoSchema).max(MAX_VENDOR_PHOTOS),
  })
  .strict();

export type VendorProfile = z.infer<typeof vendorProfileSchema>;
export type VendorPhoto = z.infer<typeof vendorPhotoSchema>;

export const EMPTY_VENDOR_PROFILE: VendorProfile = {
  name: '',
  products: [],
  items: [],
  description: undefined,
  website: undefined,
  social_profiles: [],
  phone: undefined,
  email: undefined,
  photos: [],
};

export type FieldIssue = { path: string; message: string };

function issues(error: z.ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

export function parseVendorProfile(input: unknown): { ok: true; profile: VendorProfile } | { ok: false; errors: FieldIssue[] } {
  const parsed = vendorProfileSchema.safeParse(input);
  return parsed.success ? { ok: true, profile: parsed.data } : { ok: false, errors: issues(parsed.error) };
}

/** A stored profile, or null when it no longer fits the schema (never trusted onto a public page). */
export function readVendorProfile(stored: unknown): VendorProfile | null {
  const parsed = vendorProfileSchema.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

/** A stored draft: as much as still parses, so a half-filled form reopens. */
export function readVendorDraft(stored: unknown): VendorProfile {
  const full = readVendorProfile(stored);
  if (full) return full;
  const source = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
  const draft: VendorProfile = { ...EMPTY_VENDOR_PROFILE };
  const shape = vendorProfileSchema.shape;
  for (const key of Object.keys(shape) as (keyof VendorProfile)[]) {
    if (key === 'name') {
      draft.name = typeof source.name === 'string' ? source.name.trim().slice(0, 120) : '';
      continue;
    }
    const parsed = shape[key].safeParse(source[key]);
    if (parsed.success && parsed.data !== undefined) (draft as Record<string, unknown>)[key] = parsed.data;
  }
  return draft;
}

/* ------------------------------------------------------------------ *
 * The first screen: enough to get started, nothing more
 * ------------------------------------------------------------------ */

/** Markets a new vendor can pick on the first screen. More can be added later. */
export const MAX_START_MARKETS = 10;

/**
 * What a vendor needs to begin: a name, what they sell, and the markets they
 * sell at. Photos, a description, links and documents all come later.
 */
export const vendorStartSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your business name').max(120),
    products: z.array(z.enum(PRODUCT_CODES)).min(1, 'Pick at least one').max(PRODUCT_CODES.length),
    /** Market slugs. */
    markets: z.array(z.string().regex(/^[a-z0-9-]{1,200}$/)).max(MAX_START_MARKETS),
  })
  .strict();

export type VendorStart = z.infer<typeof vendorStartSchema>;

/** Which profile fields differ, for the admin's before and after. */
export const VENDOR_PROFILE_FIELDS = [
  'name', 'products', 'items', 'description', 'website', 'social_profiles', 'phone', 'email', 'photos',
] as const satisfies readonly (keyof VendorProfile)[];

export const VENDOR_FIELD_LABELS: Record<keyof VendorProfile, string> = {
  name: 'Business name',
  products: 'What they sell',
  items: 'Specialties',
  description: 'About',
  website: 'Website',
  social_profiles: 'Social profiles',
  phone: 'Public phone',
  email: 'Public email',
  photos: 'Photos',
};

export function vendorFieldsThatDiffer(live: VendorProfile | null, proposed: VendorProfile): (keyof VendorProfile)[] {
  return VENDOR_PROFILE_FIELDS.filter((field) => JSON.stringify(live?.[field] ?? null) !== JSON.stringify(proposed[field] ?? null));
}

/* ------------------------------------------------------------------ *
 * Market applications
 * ------------------------------------------------------------------ */

export const applicationDetailsSchema = z
  .object({
    days: z.array(z.enum(WEEKDAYS)).max(7),
    stall_note: line(140),
    /** Private, for whoever reviews the application. */
    message: paragraph(600),
  })
  .strict();

export type ApplicationDetails = z.infer<typeof applicationDetailsSchema>;

/** Stored `days` re-read defensively: unknown codes are dropped. */
export function readDays(stored: unknown): ApplicationDetails['days'] {
  const parsed = z.array(z.enum(WEEKDAYS)).safeParse(stored);
  if (parsed.success) return WEEKDAYS.filter((day) => parsed.data.includes(day));
  return Array.isArray(stored) ? WEEKDAYS.filter((day) => stored.includes(day)) : [];
}

/* ------------------------------------------------------------------ *
 * Organizer checklists
 * ------------------------------------------------------------------ */

export const checklistItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  label: z.string().trim().min(2, 'Name this document').max(80),
  description: line(300),
  required: z.boolean(),
  archived: z.boolean().optional(),
});

export const checklistSettingsSchema = z.object({
  accepting: z.boolean().default(true),
  /** A note from the organizer shown to vendors above the application. */
  intro: paragraph(600),
});

export const checklistSchema = z
  .object({
    items: z.array(checklistItemSchema).max(MAX_CHECKLIST_ITEMS + 40),
    settings: checklistSettingsSchema,
  })
  .refine((value) => new Set(value.items.map((item) => item.id)).size === value.items.length, {
    message: 'Two documents share an id',
    path: ['items'],
  })
  .refine((value) => value.items.filter((item) => !item.archived).length <= MAX_CHECKLIST_ITEMS, {
    message: `A checklist can have up to ${MAX_CHECKLIST_ITEMS} documents`,
    path: ['items'],
  });

export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export type ChecklistSettings = z.infer<typeof checklistSettingsSchema>;
export type MarketChecklist = { items: ChecklistItem[]; settings: ChecklistSettings };

export const EMPTY_CHECKLIST: MarketChecklist = { items: [], settings: { accepting: true, intro: undefined } };

/** A stored checklist, tolerant of anything malformed. */
export function readChecklist(items: unknown, settings: unknown): MarketChecklist {
  const parsedItems = z.array(checklistItemSchema).safeParse(items);
  const parsedSettings = checklistSettingsSchema.safeParse(settings ?? {});
  return {
    items: parsedItems.success ? parsedItems.data : [],
    settings: parsedSettings.success ? parsedSettings.data : { accepting: true, intro: undefined },
  };
}

/** One-tap starting points for an organizer's checklist. */
export const CHECKLIST_PRESETS: { id: string; label: string; description: string }[] = [
  { id: 'liability-insurance', label: 'Liability insurance', description: 'Certificate of insurance naming the market as additional insured.' },
  { id: 'sellers-permit', label: "Seller's permit", description: 'State or city permit to collect sales tax.' },
  { id: 'health-permit', label: 'Health permit', description: 'County health permit for prepared or sampled food.' },
  { id: 'producer-certificate', label: 'Certified producer certificate', description: 'Proof that you grow what you sell.' },
  { id: 'organic-certificate', label: 'Organic certificate', description: 'Only if you sell products labeled organic.' },
  { id: 'cottage-food-permit', label: 'Cottage food permit', description: 'For food made in a home kitchen.' },
  { id: 'business-license', label: 'Business license', description: 'City or county business license.' },
];

/** A fresh id for a custom checklist item, unique within the checklist. */
export function checklistItemId(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slugify(label).slice(0, 32) || 'document';
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`.slice(0, 40);
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`.slice(0, 40);
}

/* ------------------------------------------------------------------ *
 * Documents
 * ------------------------------------------------------------------ */

export const documentDetailsSchema = z.object({
  label: z.string().trim().min(2, 'Name this document').max(80),
  expires_on: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2027-05-01'), z.literal('')])
    .transform((value) => value || undefined)
    .optional(),
});

/* ------------------------------------------------------------------ *
 * Slugs
 * ------------------------------------------------------------------ */

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The public page slug for a business name: "Green & Gold Farm" gives "green-and-gold-farm". */
export function vendorSlugBase(name: string): string {
  return slugify(name).slice(0, 60).replace(/-+$/g, '') || 'vendor';
}

/** `base`, or `base-2`, `base-3` and so on until one is free. */
export function uniqueVendorSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; n < 10000; n += 1) {
    if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}
