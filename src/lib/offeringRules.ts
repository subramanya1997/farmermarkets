/**
 * Weekly offerings ("this week I'm bringing..."): what a vendor may post
 * and who may post it. Days and "which post is current" live in
 * src/lib/offeringDays.ts and are re-exported here. Pure module (no
 * server-only or framework imports) so node tests and server code share
 * one set of rules.
 */
import { z } from 'zod';
import type { ApplicationStatus } from './vendorRules.ts';
import { MAX_DAYS_AHEAD, daysBetween, isoDay } from './offeringDays.ts';

export * from './offeringDays.ts';

export const MAX_OFFERING_ITEMS = 30;
export const MAX_ITEM_NAME = 80;
export const MAX_ITEM_NOTE = 120;
export const MAX_OFFERING_NOTE = 280;
/** A post covers at most this many days (a long weekend, a two week run). */
export const MAX_OFFERING_DAYS = 14;
/** Posts a vendor can have open (not withdrawn, not over) at once, across markets. */
export const MAX_OPEN_OFFERINGS = 40;

/* ------------------------------------------------------------------ *
 * What a vendor sends
 * ------------------------------------------------------------------ */

/** Plain text on one line: no control characters, single spaces. */
function plainLine(max: number, label: string) {
  return z
    .string()
    .transform((value) => value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(max, `${label} can be up to ${max} characters`));
}

export const offeringItemSchema = z
  .object({
    name: plainLine(MAX_ITEM_NAME, 'An item').pipe(z.string().min(1, 'Name the item')),
    note: plainLine(MAX_ITEM_NOTE, 'A note')
      .optional()
      .transform((value) => value || undefined),
  })
  .strict();

export interface OfferingItem {
  name: string;
  note?: string;
}

/** No `note` key at all when there is no note, so stored JSON stays tidy. */
function tidy(item: { name: string; note?: string }): OfferingItem {
  return item.note ? { name: item.name, note: item.note } : { name: item.name };
}

export const offeringInputSchema = z
  .object({
    /** The market's slug, as the vendor desk lists it. */
    market: z.string().regex(/^[a-z0-9-]{1,200}$/, 'Pick a market'),
    starts_on: z.string().refine((value) => isoDay(value) !== null, 'Pick a day'),
    ends_on: z
      .string()
      .optional()
      .transform((value) => value || undefined)
      .refine((value) => value === undefined || isoDay(value) !== null, 'Pick a day'),
    items: z
      .array(z.unknown())
      // Rows the vendor left blank are not mistakes; drop them before checking.
      .transform((rows) =>
        rows.filter((row) => !(row && typeof row === 'object' && !String((row as { name?: unknown }).name ?? '').trim() && !String((row as { note?: unknown }).note ?? '').trim())),
      )
      .pipe(
        z
          .array(offeringItemSchema)
          .min(1, 'Add at least one item')
          .max(MAX_OFFERING_ITEMS, `Up to ${MAX_OFFERING_ITEMS} items`),
      ),
    note: z
      .string()
      .optional()
      .transform((value) =>
        (value ?? '')
          .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
          .replace(/[–—]/g, '-')
          .replace(/\r\n?/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim(),
      )
      .pipe(z.string().max(MAX_OFFERING_NOTE, `The note can be up to ${MAX_OFFERING_NOTE} characters`))
      .transform((value) => value || undefined),
  })
  .strict();

export interface OfferingInput {
  market: string;
  startsOn: string;
  endsOn: string;
  items: OfferingItem[];
  note?: string;
}

export type OfferingIssue = { path: string; message: string };

/**
 * A vendor's post, checked. `today` is the earliest date anywhere in the US
 * right now, so a vendor on the West Coast can still post for today.
 */
export function parseOfferingInput(input: unknown, today: string): { ok: true; offering: OfferingInput } | { ok: false; errors: OfferingIssue[] } {
  const parsed = offeringInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) };
  }
  const { market, starts_on: startsOn, items, note } = parsed.data;
  const endsOn = parsed.data.ends_on ?? startsOn;
  const errors: OfferingIssue[] = [];
  if (endsOn < startsOn) errors.push({ path: 'ends_on', message: 'The last day comes after the first' });
  else if (daysBetween(startsOn, endsOn) + 1 > MAX_OFFERING_DAYS) errors.push({ path: 'ends_on', message: `A post covers up to ${MAX_OFFERING_DAYS} days` });
  if (endsOn < today) errors.push({ path: 'starts_on', message: 'Pick today or a day ahead' });
  if (daysBetween(today, startsOn) > MAX_DAYS_AHEAD) errors.push({ path: 'starts_on', message: `Post up to ${MAX_DAYS_AHEAD} days ahead` });
  if (errors.length) return { ok: false, errors };
  return { ok: true, offering: { market, startsOn, endsOn, items: items.map(tidy), note } };
}

/** Stored items re-read defensively for public pages: malformed rows are dropped. */
export function readOfferingItems(stored: unknown): OfferingItem[] {
  if (!Array.isArray(stored)) return [];
  return stored.flatMap((row) => {
    const parsed = offeringItemSchema.safeParse(row);
    return parsed.success ? [tidy(parsed.data)] : [];
  }).slice(0, MAX_OFFERING_ITEMS);
}

/* ------------------------------------------------------------------ *
 * Who may post
 * ------------------------------------------------------------------ */

/**
 * Why a vendor may not post for a market, or null when they may. The
 * vendor is always the signed-in account's own (looked up by user id), so
 * "someone else posting for this vendor" never reaches this far; the
 * caller passes `ownVendor: false` when the ids disagree.
 */
export function offeringRefusal(input: { ownVendor: boolean; applicationStatus: ApplicationStatus | null }): string | null {
  if (!input.ownVendor) return 'You can only post for your own business.';
  switch (input.applicationStatus) {
    case 'approved':
      return null;
    case 'pending':
      return 'You can post once this market approves you.';
    case 'denied':
      return 'This market did not approve your application.';
    case 'withdrawn':
      return 'You withdrew from this market. Apply again to post here.';
    default:
      return 'Apply to this market first.';
  }
}
