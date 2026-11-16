import {
  LISTING_SECTIONS,
  listingEditsSchema,
  stableStringify,
  type ListingEdits,
  type ListingSection,
} from '@/lib/listingEdits';

/**
 * Pure helpers between the editor's working state and what gets sent.
 * Client-safe: no React, no server imports.
 */

const blank = (value: string | undefined | null) => !value || value.trim() === '';

/**
 * Drop rows the organizer added and left empty, so a stray "Add" tap never
 * blocks a submit. Rows with anything typed in stay and get validated.
 */
export function compactRows(edits: ListingEdits): ListingEdits {
  const next: ListingEdits = { ...edits };
  if (next.contact) {
    next.contact = {
      ...next.contact,
      websites: next.contact.websites.filter((value) => !blank(value)),
      phone_numbers: next.contact.phone_numbers.filter((value) => !blank(value)),
      emails: next.contact.emails.filter((value) => !blank(value)),
      social_profiles: next.contact.social_profiles.filter((row) => !blank(row.url)),
    };
  }
  if (next.products) {
    next.products = { ...next.products, items: next.products.items.filter((value) => !blank(value)) };
  }
  if (next.payments) {
    next.payments = {
      ...next.payments,
      incentives: next.payments.incentives.filter((row) => !(blank(row.name) && blank(row.note) && blank(row.url))),
    };
  }
  if (next.vendors) {
    next.vendors = {
      ...next.vendors,
      roster: next.vendors.roster.filter((row) => !(blank(row.name) && blank(row.category) && blank(row.website))),
    };
  }
  if (next.events) {
    next.events = next.events.filter(
      (row) => !(blank(row.name) && blank(row.start) && blank(row.description) && blank(row.url)),
    );
  }
  if (next.programs) {
    next.programs = next.programs.filter((row) => !(blank(row.name) && blank(row.description) && blank(row.url)));
  }
  return next;
}

function deepEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.values(value).every(deepEmpty);
  return false;
}

/**
 * A section the listing did not have, still empty after editing, is left out
 * entirely: sending `schedules: []` would read as "remove all hours".
 */
export function dropUntouchedEmptySections(edits: ListingEdits, initial: ListingEdits): ListingEdits {
  const result: Record<string, unknown> = {};
  for (const section of LISTING_SECTIONS) {
    const value = edits[section];
    if (value === undefined) continue;
    if (initial[section] === undefined && deepEmpty(value)) continue;
    result[section] = value;
  }
  return result as ListingEdits;
}

/** What "Send for review" sends for the given working state. */
export function toPayload(edits: ListingEdits, initial: ListingEdits): ListingEdits {
  return dropUntouchedEmptySections(compactRows(edits), initial);
}

/**
 * A comparable fingerprint of what would be sent, after the schema's own
 * cleanup (trimming, "" to undefined), so typing and then deleting a
 * character does not count as a change.
 */
export function payloadFingerprint(edits: ListingEdits, initial: ListingEdits): string {
  const payload = toPayload(edits, initial);
  const parsed = listingEditsSchema.safeParse(payload);
  return stableStringify(parsed.success ? parsed.data : payload);
}

/** Which section a field error path belongs to ("schedules.0.closes" is schedules). */
export function sectionOf(path: string): ListingSection | null {
  const head = path.split('.')[0];
  return (LISTING_SECTIONS as readonly string[]).includes(head) ? (head as ListingSection) : null;
}

/** Plainer wording for the schema's generic messages. */
export function friendlyMessage(path: string, message: string): string {
  const field = path.split('.').pop() ?? '';
  if (/^Too small: expected string/.test(message)) return field === 'name' ? 'Add a name' : 'Fill this in';
  if (/^Too big: expected string/.test(message)) return 'That is too long';
  if (/^Too big: expected array/.test(message)) return 'That is more than a listing can show';
  if (/^Too (small|big): expected number/.test(message)) return 'Enter a number from 0 to 2000';
  if (/expected number/.test(message)) return 'Enter a number';
  if (/^Invalid email/.test(message)) return 'Enter an email like hello@yourmarket.org';
  if (/24-hour time/.test(message)) return 'Pick a time';
  if (/date like/.test(message)) return field === 'start' ? 'Pick the event date' : 'Pick a date';
  if (/^Invalid (input|option)/.test(message)) return 'Pick one of the options';
  return message;
}
