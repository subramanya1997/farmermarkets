/**
 * The rules of vendor accounts as small pure functions: who decides an
 * application, when a vendor is public, who may open a document, how a
 * checklist adds up, and how account vendors merge with the vendor names an
 * organizer typed. Kept free of database and framework imports so node tests
 * cover them directly.
 */
import type { ChecklistItem } from './vendorProfile.ts';

export type ApplicationStatus = 'pending' | 'approved' | 'denied' | 'withdrawn';
export type DocumentVerdict = 'pending' | 'approved' | 'rejected';

/** A market with an organizer on the site decides its own vendors; otherwise an admin does. */
export function applicationDecider(marketHasOrganizer: boolean): 'organizer' | 'admin' {
  return marketHasOrganizer ? 'organizer' : 'admin';
}

/** Public at a market: an approved profile that is not taken down, and an approved application. */
export function vendorPubliclyListed(
  vendor: { hasLiveProfile: boolean; suspended: boolean },
  applicationStatus: ApplicationStatus,
): boolean {
  return vendor.hasLiveProfile && !vendor.suspended && applicationStatus === 'approved';
}

/** The vendor's own public page: an approved profile that is not taken down. */
export function vendorPagePublic(vendor: { hasLiveProfile: boolean; suspended: boolean }): boolean {
  return vendor.hasLiveProfile && !vendor.suspended;
}

/**
 * An organizer hears about an application only once an admin has approved
 * the vendor's profile at least once, so strangers cannot reach organizers.
 */
export function applicationVisibleToOrganizer(vendor: { hasLiveProfile: boolean; suspended: boolean }, status: ApplicationStatus): boolean {
  return vendor.hasLiveProfile && !vendor.suspended && status !== 'withdrawn';
}

/** The badge is earned only when one of the market's own organizers said yes. */
export function confirmedByMarket(application: { status: ApplicationStatus; decidedRole: string | null }): boolean {
  return application.status === 'approved' && application.decidedRole === 'organizer';
}

export interface DocumentViewer {
  isAdmin: boolean;
  /** The viewer's own vendor id, if they have a vendor account. */
  vendorId: string | null;
  managedMarketIds: readonly string[];
}

export interface DocumentAccess {
  vendorId: string;
  /** Markets where this document is attached to an application that is not withdrawn. */
  attachedMarketIds: readonly string[];
}

/**
 * A document is private to its vendor, the admin, and the organizers of a
 * market it was actually sent to. Applying to a market without attaching
 * the document gives that market's organizers nothing.
 */
export function canReadDocument(viewer: DocumentViewer, document: DocumentAccess): boolean {
  if (viewer.isAdmin) return true;
  if (viewer.vendorId && viewer.vendorId === document.vendorId) return true;
  return document.attachedMarketIds.some((marketId) => viewer.managedMarketIds.includes(marketId));
}

export interface ChecklistProgress {
  /** Items the organizer still asks for (archived ones do not count). */
  active: ChecklistItem[];
  missingRequired: ChecklistItem[];
  rejected: ChecklistItem[];
  waiting: ChecklistItem[];
  approved: ChecklistItem[];
  /** Every required item has a document attached that was not turned down. */
  readyToSend: boolean;
  /** Every required item is approved. */
  complete: boolean;
}

/** How an application stands against the market's checklist. */
export function checklistProgress(
  items: readonly ChecklistItem[],
  submissions: readonly { requirementKey: string; status: DocumentVerdict; withdrawn?: boolean }[],
): ChecklistProgress {
  const active = items.filter((item) => !item.archived);
  const byKey = new Map(submissions.filter((row) => !row.withdrawn).map((row) => [row.requirementKey, row.status]));
  const withStatus = (status: DocumentVerdict) => active.filter((item) => byKey.get(item.id) === status);
  const missingRequired = active.filter((item) => item.required && !byKey.has(item.id));
  const rejected = withStatus('rejected');
  const approved = withStatus('approved');
  const required = active.filter((item) => item.required);
  return {
    active,
    missingRequired,
    rejected,
    waiting: withStatus('pending'),
    approved,
    readyToSend: missingRequired.length === 0 && !rejected.some((item) => item.required),
    complete: required.every((item) => byKey.get(item.id) === 'approved'),
  };
}

/* ------------------------------------------------------------------ *
 * One vendor list per market
 * ------------------------------------------------------------------ */

const NAME_NOISE = new Set(['the', 'llc', 'inc', 'co', 'company', 'ltd']);

/** "The Green & Gold Farms, LLC" and "green and gold farm" compare equal. */
export function normalizeVendorName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word && !NAME_NOISE.has(word))
    .map((word) => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word))
    .join(' ');
}

/**
 * Account vendors come first; a typed roster entry with the same name is the
 * same business and is dropped, so nobody appears twice.
 */
export function mergeVendorRoster<A extends { name: string }, R>(
  accounts: readonly A[],
  roster: readonly R[],
  rosterName: (item: R) => string,
): { accounts: A[]; roster: R[] } {
  const seen = new Set<string>();
  const unique: A[] = [];
  for (const account of accounts) {
    const key = normalizeVendorName(account.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(account);
  }
  return { accounts: unique, roster: roster.filter((item) => !seen.has(normalizeVendorName(rosterName(item)))) };
}

/* ------------------------------------------------------------------ *
 * Markets that moved
 * ------------------------------------------------------------------ */

/** Follows "this duplicate row was merged into that market" so an old id still lands somewhere. */
export function resolveMarketId(id: string, merges: readonly { id: string; into: string }[]): string {
  const into = new Map(merges.map((merge) => [merge.id, merge.into]));
  let current = id;
  for (let hops = 0; hops < 5 && into.has(current); hops += 1) current = into.get(current)!;
  return current;
}

/**
 * A market slug from whatever someone pasted: a full URL, `/markets/<slug>`,
 * `/markets/<slug>/claim` or `/apply`, or the bare slug. Old slugs follow
 * `data/slug-redirects.json`. Null when it cannot be a slug.
 */
export function marketSlugFrom(value: string, redirects: Record<string, string>): string | null {
  let path = value.trim();
  try {
    path = new URL(path).pathname;
  } catch {
    // Not a URL: treat it as a path or a bare slug.
  }
  const slug = path
    .replace(/^\/?(markets\/)?/, '')
    .replace(/\/(claim|apply)?\/?$/, '')
    .toLowerCase();
  if (!/^[a-z0-9-]{1,200}$/.test(slug)) return null;
  const moved = redirects[slug];
  return moved?.startsWith('/markets/') ? moved.slice('/markets/'.length) : slug;
}

/* ------------------------------------------------------------------ *
 * CSV export
 * ------------------------------------------------------------------ */

/**
 * RFC 4180 CSV. A cell that a spreadsheet would run as a formula (it starts
 * with =, +, - or @) gets a leading apostrophe so it stays text.
 */
export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  const cell = (value: string | number | null | undefined) => {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

/* ------------------------------------------------------------------ *
 * Small display helpers shared by dashboards and public pages
 * ------------------------------------------------------------------ */

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_PLURAL: Record<string, string> = {
  monday: 'Mondays',
  tuesday: 'Tuesdays',
  wednesday: 'Wednesdays',
  thursday: 'Thursdays',
  friday: 'Fridays',
  saturday: 'Saturdays',
  sunday: 'Sundays',
};

/** "Saturdays", "Saturdays and Sundays", "Wednesdays, Saturdays and Sundays", "Every market day". */
export function attendanceLabel(days: readonly string[]): string {
  const known = DAY_ORDER.filter((day) => days.includes(day)).map((day) => DAY_PLURAL[day]);
  if (known.length === 0) return '';
  if (known.length === 7) return 'Every day';
  if (known.length === 1) return known[0];
  return `${known.slice(0, -1).join(', ')} and ${known[known.length - 1]}`;
}
