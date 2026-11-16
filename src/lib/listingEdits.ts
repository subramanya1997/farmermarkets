/**
 * What a verified market organizer may change on their listing.
 *
 * One schema serves the editor form, the server action that stores a change
 * request, the admin diff and the published overlay
 * (src/lib/marketOverrides.ts). Every section is optional: a section that is
 * present replaces that whole section of the listing, a missing one leaves it
 * alone. All text is plain text and is always rendered escaped.
 *
 * Pure module (no server-only imports) so node tests and client components
 * can use it.
 */
import { z } from 'zod';

export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const MARKET_STATUSES = ['active', 'seasonal_break', 'temporarily_closed', 'permanently_closed'] as const;
export const PAYMENT_CODES = ['cash', 'credit_card', 'debit_card', 'check', 'mobile_wallet', 'contactless', 'market_token'] as const;
export const ASSISTANCE_CODES = ['snap_ebt', 'wic', 'fmnp', 'sfmnp'] as const;
export const INCENTIVE_KINDS = ['match', 'bonus', 'discount', 'voucher'] as const;
export const PRODUCT_CODES = [
  'fresh_produce', 'meat', 'dairy', 'eggs', 'herbs', 'crafts', 'prepared_food',
  'baked_goods', 'flowers', 'honey', 'preserves', 'wine',
] as const;
export const AMENITY_CODES = [
  'restrooms', 'seating', 'picnic_area', 'shade', 'drinking_water', 'atm', 'wifi',
  'live_music', 'kids_activities', 'information_booth',
] as const;
export const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'linkedin', 'tiktok', 'x', 'youtube', 'other'] as const;
export const EVENT_KINDS = ['music', 'workshop', 'kids', 'festival', 'special_market', 'other'] as const;
export const PROGRAM_KINDS = ['nutrition', 'kids_club', 'food_access', 'composting', 'community', 'education', 'other'] as const;
export const AVAILABILITY = ['yes', 'no', 'limited'] as const;
export const PET_RULES = ['allowed', 'not_allowed', 'service_animals_only'] as const;

/** Trimmed single-line text; empty becomes undefined. */
const line = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value.replace(/\s+/g, ' ') || undefined)
    .optional();

/** Trimmed multi-line text; keeps paragraph breaks, drops control characters. */
const paragraph = (max: number) =>
  z
    .string()
    .max(max)
    .transform(
      (value) =>
        value
          .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
          .replace(/\r\n?/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim() || undefined,
    )
    .optional();

/** http(s) URL only, so nothing like `javascript:` ever reaches an href. */
export const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname.includes('.'));
    } catch {
      return false;
    }
  }, 'Enter a full web address starting with https://');

const optionalUrl = z
  .union([httpUrl, z.literal('')])
  .transform((value) => value || undefined)
  .optional();

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time like 08:00');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2027-05-01');
const month = z.number().int().min(1).max(12);
const day = z.number().int().min(1).max(31).optional();

export const phoneSchema = z
  .string()
  .trim()
  .max(40)
  .refine((value) => value.replace(/\D/g, '').length >= 7, 'Enter a phone number with area code');

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const socialProfileSchema = z.object({ platform: z.enum(SOCIAL_PLATFORMS), url: httpUrl });

export const incentiveSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(INCENTIVE_KINDS),
  note: line(300),
  url: optionalUrl,
});

export const vendorSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: line(60),
  website: optionalUrl,
});

export const eventSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    kind: z.enum(EVENT_KINDS),
    start: isoDate,
    end: isoDate.optional(),
    opens: time.optional(),
    closes: time.optional(),
    description: line(400),
    url: optionalUrl,
  })
  .refine((value) => !value.end || value.end >= value.start, { message: 'End date is before start date', path: ['end'] });

export const programSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(PROGRAM_KINDS),
  description: line(400),
  url: optionalUrl,
});

export const scheduleSchema = z
  .object({
    weekdays: z.array(z.enum(WEEKDAYS)).min(1, 'Pick at least one day').max(7),
    opens: time,
    closes: time,
    label: line(80),
  })
  .refine((value) => value.opens < value.closes, { message: 'Closing time must be after opening time', path: ['closes'] });

export const seasonSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('year_round') }),
  z.object({
    kind: z.literal('annual_range'),
    start: z.object({ month, day }),
    end: z.object({ month, day }),
  }),
]);

/** What a verified organizer may send. */
export const organizerEditsSchema = z
  .object({
    status: z
      .object({
        value: z.enum(MARKET_STATUSES),
        effective_date: isoDate.optional(),
        note: line(200),
      })
      .optional(),
    season: seasonSchema.optional(),
    schedules: z.array(scheduleSchema).max(14).optional(),
    about: z
      .object({
        description: paragraph(1500),
        visitor_note: paragraph(400),
      })
      .optional(),
    contact: z
      .object({
        websites: z.array(httpUrl).max(3),
        phone_numbers: z.array(phoneSchema).max(3),
        emails: z.array(emailSchema).max(3),
        social_profiles: z.array(socialProfileSchema).max(8),
        newsletter_url: optionalUrl,
        online_ordering_url: optionalUrl,
      })
      .optional(),
    payments: z
      .object({
        methods: z.array(z.enum(PAYMENT_CODES)).max(PAYMENT_CODES.length),
        assistance: z.array(z.enum(ASSISTANCE_CODES)).max(ASSISTANCE_CODES.length),
        incentives: z.array(incentiveSchema).max(5),
      })
      .optional(),
    products: z
      .object({
        categories: z.array(z.enum(PRODUCT_CODES)).max(PRODUCT_CODES.length),
        items: z.array(z.string().trim().min(1).max(60)).max(40),
      })
      .optional(),
    amenities: z
      .object({
        available: z.array(z.enum(AMENITY_CODES)).max(AMENITY_CODES.length),
        parking: z.enum(AVAILABILITY).optional(),
        parking_note: line(200),
        accessibility_note: line(300),
        pets: z.enum(PET_RULES).optional(),
      })
      .optional(),
    vendors: z
      .object({
        count: z.number().int().min(0).max(2000).optional(),
        directory_url: optionalUrl,
        roster: z.array(vendorSchema).max(100),
      })
      .optional(),
    events: z.array(eventSchema).max(30).optional(),
    programs: z.array(programSchema).max(15).optional(),
  })
  .strict();

/**
 * Admin-only sections on top of the organizer ones: the market's name and
 * where it is. City and state are not editable here because they decide
 * which city page a market belongs on (the geo index is built at deploy).
 */
export const listingEditsSchema = organizerEditsSchema
  .extend({
    identity: z.object({ name: z.string().trim().min(2, 'Enter the market name').max(150) }).optional(),
    location: z
      .object({
        address: line(200),
        zip_code: line(20),
        location_description: line(400),
        coordinates: z
          .object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) })
          .optional(),
        suppress_map: z.boolean().optional(),
      })
      .optional(),
  })
  .strict();

export type ListingEdits = z.infer<typeof listingEditsSchema>;
export type ListingSection = keyof ListingEdits;

export const ADMIN_ONLY_SECTIONS = ['identity', 'location'] as const satisfies readonly ListingSection[];

export const ORGANIZER_SECTIONS = [
  'status', 'season', 'schedules', 'about', 'contact', 'payments',
  'products', 'amenities', 'vendors', 'events', 'programs',
] as const satisfies readonly ListingSection[];

/** Every section in display order: admin-only ones first. */
export const LISTING_SECTIONS = [...ADMIN_ONLY_SECTIONS, ...ORGANIZER_SECTIONS] as const;

/** Drops admin-only sections, for anything an organizer sees or sends. */
export function withoutAdminSections(edits: ListingEdits): ListingEdits {
  const rest = { ...edits };
  for (const section of ADMIN_ONLY_SECTIONS) delete rest[section];
  return rest;
}

export const SECTION_LABELS: Record<ListingSection, string> = {
  identity: 'Market name',
  location: 'Address and map pin',
  status: 'Market status',
  season: 'Season',
  schedules: 'Days and hours',
  about: 'About the market',
  contact: 'Links and contact',
  payments: 'Payments and food assistance',
  products: 'What you can buy',
  amenities: 'Amenities and access',
  vendors: 'Vendors',
  events: 'Events',
  programs: 'Programs',
};

/**
 * Parse untrusted input. Returns the cleaned edits or a list of messages.
 * Organizers may not send the admin-only sections; `{ admin: true }` allows them.
 */
export function parseListingEdits(input: unknown, options: { admin?: boolean } = {}):
  | { ok: true; edits: ListingEdits }
  | { ok: false; errors: { path: string; message: string }[] } {
  const parsed = (options.admin ? listingEditsSchema : organizerEditsSchema).safeParse(input);
  if (parsed.success) return { ok: true, edits: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  };
}

/**
 * Merge a newly approved change into the already published edits. Sections
 * in `next` replace the same sections in `current`; others are kept.
 */
export function mergeListingEdits(current: ListingEdits | undefined, next: ListingEdits): ListingEdits {
  return { ...(current ?? {}), ...next };
}

/** Which sections a change request touches, in display order. */
export function changedSections(edits: ListingEdits): ListingSection[] {
  return LISTING_SECTIONS.filter((section) => edits[section] !== undefined);
}

/**
 * Sections whose proposed value differs from what is published. Used to
 * drop no-op sections before storing, and to build the admin diff.
 */
export function sectionsThatDiffer(published: ListingEdits, proposed: ListingEdits): ListingSection[] {
  return changedSections(proposed).filter(
    (section) => stableStringify(published[section]) !== stableStringify(proposed[section]),
  );
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, inner) =>
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  ) ?? 'undefined';
}
