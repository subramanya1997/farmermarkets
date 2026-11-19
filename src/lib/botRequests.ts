/**
 * The outreach bot's request contract (docs/organizer-bot.md): body
 * schemas, the bearer token check, which edits must wait for an admin, and
 * image type sniffing. Pure module (no server-only imports) so node tests
 * can use it; the routes and src/lib/botActions.ts do the database work.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { ListingEdits } from './listingEdits.ts';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * `Authorization: Bearer <token>` against the configured token. A missing
 * or short (< 32 characters) configured token refuses everything. Both
 * sides are hashed so the comparison takes the same time whatever is sent.
 */
export function bearerTokenMatches(header: string | null | undefined, expected: string | undefined): boolean {
  const configured = expected?.trim();
  if (!configured || configured.length < 32) return false;
  const match = /^Bearer\s+(.+)$/i.exec((header ?? '').trim());
  if (!match) return false;
  return timingSafeEqual(digest(match[1].trim()), digest(configured));
}

/** Why the bot did it: who asked, when, and how (email date, source). */
const note = z.string().trim().min(10, 'Say who asked for this and when').max(1000);
const market = z.string().trim().min(1).max(500);
const operatorEmail = z.string().trim().toLowerCase().email().max(254).optional();

/** `POST /api/bot/listing-edits`: either `changes` to publish, or `remove_listing` to ask an admin. */
export const botListingEditsBody = z
  .object({
    market,
    note,
    email: operatorEmail,
    /** A `ListingEdits` object; validated separately with `parseListingEdits(changes, { admin: true })`. */
    changes: z.record(z.string(), z.unknown()).optional(),
    /** The operator wants the listing taken down. Never published by the bot. */
    remove_listing: z.literal(true).optional(),
  })
  .strict()
  .refine((body) => Boolean(body.changes) !== Boolean(body.remove_listing), {
    message: 'Send either changes or remove_listing, not both.',
    path: ['changes'],
  });

/** `POST /api/bot/photo-removals`: ask an admin to take photos down. */
export const botPhotoRemovalBody = z
  .object({
    market,
    note,
    email: operatorEmail,
    /** Photo ids from `POST /api/bot/photos`, or the image URLs shown on the market page. */
    photos: z.array(z.string().trim().min(1).max(1000)).min(1).max(50),
  })
  .strict();

/** The text fields of the multipart `POST /api/bot/photos`. */
export const botPhotoFields = z.object({
  market,
  note,
  email: operatorEmail,
  alt: z.string().trim().max(200).optional(),
  caption: z.string().trim().max(200).optional(),
  credit: z.string().trim().max(120).optional(),
});

/** Photos one bot call may send. A Vercel function body is capped at 4.5 MB in total anyway. */
export const MAX_BOT_PHOTOS_PER_REQUEST = 6;

/** The caption stored on the photo: the caption, then the credit. */
export function photoCaption(caption?: string, credit?: string): string | null {
  const parts = [caption?.trim(), credit?.trim() ? `Photo: ${credit.trim()}` : undefined].filter(Boolean);
  return parts.length ? parts.join('. ').slice(0, 200) : null;
}

/** Sections that are lists or a single choice: whatever the bot sends replaces them whole. */
const REPLACED_WHOLE = new Set(['schedules', 'events', 'programs', 'season']);

/**
 * The bot sends only the fields an operator corrected ("new address",
 * "add SNAP"), while a stored section replaces the whole section. So each
 * object section it sends is laid over the live section field by field
 * first; list sections (schedules, events, programs) and the season are
 * taken as sent. Unknown sections pass through for the schema to reject.
 */
export function fillFromLive(live: ListingEdits, changes: Record<string, unknown>): Record<string, unknown> {
  const filled: Record<string, unknown> = {};
  for (const [section, value] of Object.entries(changes)) {
    const current = (live as Record<string, unknown>)[section];
    const isObject = (input: unknown) => Boolean(input) && typeof input === 'object' && !Array.isArray(input);
    filled[section] =
      !REPLACED_WHOLE.has(section) && isObject(value) && isObject(current)
        ? { ...(current as Record<string, unknown>), ...(value as Record<string, unknown>) }
        : value;
  }
  return filled;
}

/**
 * Splits validated edits into what the bot may publish and what must wait
 * for an admin. Marking a market permanently closed hides it from shoppers
 * as surely as deleting it, so that status is held; every other section
 * (hours, address, name, map pin, SNAP, links) publishes.
 */
export function splitBotEdits(edits: ListingEdits): { publish: ListingEdits; held: ListingEdits } {
  const publish: ListingEdits = { ...edits };
  const held: ListingEdits = {};
  if (edits.status?.value === 'permanently_closed') {
    held.status = edits.status;
    delete publish.status;
  }
  return { publish, held };
}

export type SniffedImage = 'jpeg' | 'png' | 'webp' | 'heic' | null;

const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1', 'avif', 'avis']);

/** What the first bytes say the file is, whatever its name or declared type claims. */
export function sniffImage(bytes: Uint8Array): SniffedImage {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
  ) {
    return 'png';
  }
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (bytes.length >= 12 && ascii(4, 8) === 'ftyp' && HEIF_BRANDS.has(ascii(8, 12))) return 'heic';
  return null;
}

export const IMAGE_CONTENT_TYPES: Record<Exclude<SniffedImage, 'heic' | null>, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Zod issues in the shape every bot error response uses. */
export function issuesOf(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}
