/**
 * Vendor accounts: a business (a farm, a baker, a maker) with a reviewed
 * public profile, applications to the markets it sells at, and a private
 * document locker that market organizers check.
 *
 * Who decides what:
 * - An admin reviews the profile itself (text, links, photos), every time.
 * - A market's organizer decides that market's applications and documents;
 *   a market with no organizer falls to the admin. Admins can always decide.
 * - An application reaches an organizer only once the vendor's profile has
 *   been approved, so strangers cannot message organizers.
 *
 * Every function that takes ids from a form loads rows by id AND owner (or
 * managed market), never by id alone. Decisions start with a guarded
 * `UPDATE ... WHERE status = ... RETURNING`, because the neon-http driver
 * has no interactive transactions and two people may decide at once.
 */
import 'server-only';
import { cache } from 'react';
import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lt, ne, or } from 'drizzle-orm';
import { del, head, list } from '@vercel/blob';
import { dbSchema, getDb } from '@/db';
import type { FarmerMarket } from '@/app/api/markets/data';
import {
  canManageMarket,
  getMarketsByIds,
  getPublishedMarket,
  isAdmin,
  managedMarketIds,
  managersFor,
  revalidateMarket,
  type SessionUser,
} from './organizer';
import { adminEmails, sendOrganizerEmail } from './organizerEmails';
import { newsletterMailConfig } from './newsletter';
import { getPostHogServer } from './posthogServer';
import { absoluteUrl } from './site';
import {
  DOCUMENT_CONTENT_TYPES,
  MAX_DOCUMENTS_PER_VENDOR,
  MAX_DOCUMENT_BYTES,
  MAX_PENDING_APPLICATIONS,
  applicationDetailsSchema,
  checklistSchema,
  documentDetailsSchema,
  parseVendorProfile,
  readChecklist,
  readDays,
  readVendorDraft,
  readVendorProfile,
  uniqueVendorSlug,
  vendorFieldsThatDiffer,
  vendorSlugBase,
  vendorStartSchema,
  type ChecklistItem,
  type FieldIssue,
  type MarketChecklist,
  type VendorPhoto,
  type VendorProfile,
} from './vendorProfile';
import {
  applicationDecider,
  applicationVisibleToOrganizer,
  canReadDocument,
  checklistProgress,
  confirmedByMarket,
  resolveMarketId,
  toCsv,
  type ApplicationStatus,
} from './vendorRules';
import {
  announcementEmail,
  applicationAlertEmail,
  applicationDecisionEmail,
  documentDeniedEmail,
  vendorInviteEmail,
  vendorProfileAlertEmail,
  vendorProfileDecisionEmail,
  vendorSignInUrl,
} from './vendorEmails';
import mergedMarkets from '../../data/overrides/merged-markets.json';

const {
  user: userTable,
  marketManagers,
  vendors,
  vendorApplications,
  marketVendorChecklists,
  vendorDocuments,
  vendorDocumentSubmissions,
  vendorAnnouncements,
} = dbSchema;

export type VendorRow = typeof vendors.$inferSelect;
export type ApplicationRow = typeof vendorApplications.$inferSelect;
export type DocumentRow = typeof vendorDocuments.$inferSelect;
export type SubmissionRow = typeof vendorDocumentSubmissions.$inferSelect;

export type VendorActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: FieldIssue[] };

const UUID = /^[0-9a-f-]{36}$/;
const MERGES: { id: string; into: string }[] = mergedMarkets.merges.map(({ id, into }) => ({ id: String(id), into: String(into) }));

/** How long before a market's deciders are emailed about applications again. */
const NOTIFY_WINDOW_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ *
 * Documents live in a private Blob store with its own token
 * ------------------------------------------------------------------ */

export function documentsToken(): string | undefined {
  return process.env.VENDOR_DOCS_READ_WRITE_TOKEN || undefined;
}

/** False until the private store is connected; the document screens say so instead of failing. */
export function documentsEnabled(): boolean {
  return Boolean(documentsToken());
}

/** Blob pathname every document of a vendor must use. */
export function documentPathPrefix(vendorId: string): string {
  return `vendor-docs/${vendorId}/`;
}

/** Blob pathname every profile photo of a vendor must use (public store). */
export function vendorPhotoPathPrefix(vendorId: string): string {
  return `vendors/${vendorId}/`;
}

/* ------------------------------------------------------------------ *
 * The vendor behind an account
 * ------------------------------------------------------------------ */

/** One lookup per request, shared by layout, pages and actions. */
export const getVendorForUser = cache(async (userId: string): Promise<VendorRow | null> => {
  const [row] = await getDb().select().from(vendors).where(eq(vendors.userId, userId)).limit(1);
  return row ?? null;
});

/** The account's vendor row, created empty on first use. */
export async function ensureVendor(user: SessionUser, source: 'self' | 'outreach-bot' | 'admin-invite' = 'self'): Promise<VendorRow> {
  const existing = await getVendorForUser(user.id);
  if (existing) return existing;
  const db = getDb();
  const [created] = await db
    .insert(vendors)
    .values({
      userId: user.id,
      // A placeholder until the first approval gives the page its real address.
      slug: `vendor-${randomBytes(6).toString('hex')}`,
      name: '',
      source,
      unsubscribeToken: randomBytes(32).toString('base64url'),
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [row] = await db.select().from(vendors).where(eq(vendors.userId, user.id)).limit(1);
  return row;
}

export interface MarketRef {
  id: string;
  slug: string;
  name: string;
  city?: string;
  state?: string;
}

function marketRef(market: FarmerMarket): MarketRef {
  return { id: market.id, slug: market.slug, name: market.name, city: market.city || undefined, state: market.state || undefined };
}

/** Dataset markets for stored ids, following merges, keyed by the id that was stored. */
async function marketsByStoredId(ids: readonly string[]): Promise<Map<string, FarmerMarket>> {
  const resolved = new Map(ids.map((id) => [id, resolveMarketId(id, MERGES)]));
  const found = new Map((await getMarketsByIds([...new Set(resolved.values())])).map((market) => [market.id, market]));
  const result = new Map<string, FarmerMarket>();
  for (const [stored, current] of resolved) {
    const market = found.get(current);
    if (market) result.set(stored, market);
  }
  return result;
}

async function marketsWithOrganizers(marketIds: readonly string[]): Promise<Set<string>> {
  if (marketIds.length === 0) return new Set();
  const rows = await getDb()
    .selectDistinct({ marketId: marketManagers.marketId })
    .from(marketManagers)
    .where(inArray(marketManagers.marketId, [...marketIds]));
  return new Set(rows.map((row) => row.marketId));
}

export async function getChecklist(marketId: string): Promise<MarketChecklist> {
  const [row] = await getDb().select().from(marketVendorChecklists).where(eq(marketVendorChecklists.marketId, marketId)).limit(1);
  return readChecklist(row?.items, row?.settings);
}

async function checklistsFor(marketIds: readonly string[]): Promise<Map<string, MarketChecklist>> {
  if (marketIds.length === 0) return new Map();
  const rows = await getDb().select().from(marketVendorChecklists).where(inArray(marketVendorChecklists.marketId, [...marketIds]));
  return new Map(rows.map((row) => [row.marketId, readChecklist(row.items, row.settings)]));
}

/* ------------------------------------------------------------------ *
 * What the vendor sees
 * ------------------------------------------------------------------ */

export interface ChecklistLine {
  item: ChecklistItem;
  submission: {
    id: string;
    documentId: string;
    documentLabel: string;
    status: 'pending' | 'approved' | 'rejected';
    note: string | null;
  } | null;
}

export interface ApplicationProgress {
  active: number;
  missingRequired: number;
  rejected: number;
  waiting: number;
  approved: number;
  readyToSend: boolean;
}

export interface VendorApplicationView {
  id: string;
  /** Null when the market has left the dataset. */
  market: MarketRef | null;
  status: ApplicationStatus;
  days: string[];
  stallNote: string | null;
  message: string | null;
  decisionNote: string | null;
  /** Approved by one of the market's own organizers: shows the public badge. */
  confirmed: boolean;
  /** Who this application is waiting on. */
  decider: 'organizer' | 'admin';
  /** Sent, but held back until an admin has approved the vendor's profile. */
  waitingOnProfile: boolean;
  checklist: ChecklistLine[];
  progress: ApplicationProgress;
  createdAt: Date;
  decidedAt: Date | null;
}

export interface VendorDocumentView {
  id: string;
  label: string;
  contentType: string;
  size: number;
  expiresOn: string | null;
  expired: boolean;
  createdAt: Date;
  /** How many applications this document is attached to. */
  usedBy: number;
}

export type VendorProfileState = 'none' | 'draft' | 'pending' | 'approved' | 'rejected';

export interface VendorOverview {
  vendorId: string | null;
  /** The published profile, if an admin has approved one. */
  live: VendorProfile | null;
  /** What the editor opens with: the proposal if there is one, otherwise the live profile. */
  draft: VendorProfile;
  state: VendorProfileState;
  reviewNote: string | null;
  suspended: boolean;
  /** `/vendors/<slug>` once live. */
  publicPath: string | null;
  applications: VendorApplicationView[];
  documents: VendorDocumentView[];
  /** Markets an invite suggested that the vendor has not applied to yet. */
  suggestedMarkets: MarketRef[];
  documentsEnabled: boolean;
  announcementsOptOut: boolean;
}

function profileState(vendor: VendorRow | null): VendorProfileState {
  if (!vendor) return 'none';
  if (vendor.status === 'draft' && !vendor.proposed && !vendor.profile) return 'none';
  return vendor.status;
}

function liveProfile(vendor: VendorRow | null): VendorProfile | null {
  return vendor?.profile ? readVendorProfile(vendor.profile) : null;
}

function isLive(vendor: Pick<VendorRow, 'profile' | 'suspendedAt'>): { hasLiveProfile: boolean; suspended: boolean } {
  return { hasLiveProfile: vendor.profile !== null, suspended: vendor.suspendedAt !== null };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function documentView(row: DocumentRow, usedBy: number): VendorDocumentView {
  return {
    id: row.id,
    label: row.label,
    contentType: row.contentType,
    size: row.size,
    expiresOn: row.expiresOn,
    expired: Boolean(row.expiresOn && row.expiresOn < today()),
    createdAt: row.createdAt,
    usedBy,
  };
}

function progressOf(checklist: MarketChecklist, submissions: readonly SubmissionRow[]): ApplicationProgress {
  const progress = checklistProgress(
    checklist.items,
    submissions.map((row) => ({ requirementKey: row.requirementKey, status: row.status })),
  );
  return {
    active: progress.active.length,
    missingRequired: progress.missingRequired.length,
    rejected: progress.rejected.length,
    waiting: progress.waiting.length,
    approved: progress.approved.length,
    readyToSend: progress.readyToSend,
  };
}

function checklistLines(checklist: MarketChecklist, submissions: readonly SubmissionRow[], documents: ReadonlyMap<string, DocumentRow>): ChecklistLine[] {
  const byKey = new Map(submissions.map((row) => [row.requirementKey, row]));
  return checklist.items
    .filter((item) => !item.archived)
    .map((item) => {
      const submission = byKey.get(item.id);
      const document = submission ? documents.get(submission.documentId) : undefined;
      return {
        item,
        submission:
          submission && document
            ? { id: submission.id, documentId: document.id, documentLabel: document.label, status: submission.status, note: submission.note }
            : null,
      };
    });
}

async function applicationViews(vendor: VendorRow, rows: readonly ApplicationRow[]): Promise<VendorApplicationView[]> {
  if (rows.length === 0) return [];
  const db = getDb();
  const marketIds = rows.map((row) => row.marketId);
  const [markets, organizers, checklists, submissions, documents] = await Promise.all([
    marketsByStoredId(marketIds),
    marketsWithOrganizers(marketIds),
    checklistsFor(marketIds),
    db.select().from(vendorDocumentSubmissions).where(inArray(vendorDocumentSubmissions.applicationId, rows.map((row) => row.id))),
    db.select().from(vendorDocuments).where(eq(vendorDocuments.vendorId, vendor.id)),
  ]);
  const documentById = new Map(documents.map((row) => [row.id, row]));
  const live = isLive(vendor);
  return rows.map((row) => {
    const market = markets.get(row.marketId);
    const checklist = checklists.get(row.marketId) ?? readChecklist(undefined, undefined);
    const mine = submissions.filter((submission) => submission.applicationId === row.id);
    return {
      id: row.id,
      market: market ? marketRef(market) : null,
      status: row.status,
      days: readDays(row.days),
      stallNote: row.stallNote,
      message: row.message,
      decisionNote: row.decisionNote,
      confirmed: confirmedByMarket(row),
      decider: applicationDecider(organizers.has(row.marketId)),
      waitingOnProfile: row.status === 'pending' && !live.hasLiveProfile,
      checklist: checklistLines(checklist, mine, documentById),
      progress: progressOf(checklist, mine),
      createdAt: row.createdAt,
      decidedAt: row.decidedAt,
    };
  });
}

async function documentViews(vendorId: string): Promise<VendorDocumentView[]> {
  const db = getDb();
  const [rows, usage] = await Promise.all([
    db.select().from(vendorDocuments).where(eq(vendorDocuments.vendorId, vendorId)).orderBy(desc(vendorDocuments.createdAt)),
    db
      .select({ documentId: vendorDocumentSubmissions.documentId, n: count() })
      .from(vendorDocumentSubmissions)
      .innerJoin(vendorDocuments, eq(vendorDocuments.id, vendorDocumentSubmissions.documentId))
      .where(eq(vendorDocuments.vendorId, vendorId))
      .groupBy(vendorDocumentSubmissions.documentId),
  ]);
  const used = new Map(usage.map((row) => [row.documentId, row.n]));
  return rows.map((row) => documentView(row, used.get(row.id) ?? 0));
}

/** Everything the vendor area shows for this account. Creates nothing. */
export async function vendorOverview(user: SessionUser): Promise<VendorOverview> {
  const vendor = await getVendorForUser(user.id);
  if (!vendor) {
    return {
      vendorId: null,
      live: null,
      draft: readVendorDraft(null),
      state: 'none',
      reviewNote: null,
      suspended: false,
      publicPath: null,
      applications: [],
      documents: [],
      suggestedMarkets: [],
      documentsEnabled: documentsEnabled(),
      announcementsOptOut: false,
    };
  }
  const rows = await getDb()
    .select()
    .from(vendorApplications)
    .where(eq(vendorApplications.vendorId, vendor.id))
    .orderBy(desc(vendorApplications.createdAt));
  const invited = Array.isArray(vendor.invitedMarkets) ? vendor.invitedMarkets.filter((id): id is string => typeof id === 'string') : [];
  const applied = new Set(rows.filter((row) => row.status !== 'withdrawn').map((row) => row.marketId));
  const [applications, documents, suggested] = await Promise.all([
    applicationViews(vendor, rows),
    documentViews(vendor.id),
    marketsByStoredId(invited.filter((id) => !applied.has(id))),
  ]);
  const live = liveProfile(vendor);
  return {
    vendorId: vendor.id,
    live,
    draft: readVendorDraft(vendor.proposed ?? vendor.profile),
    state: profileState(vendor),
    reviewNote: vendor.status === 'rejected' ? vendor.reviewNote : null,
    suspended: vendor.suspendedAt !== null,
    publicPath: live && !vendor.suspendedAt ? `/vendors/${vendor.slug}` : null,
    applications,
    documents,
    suggestedMarkets: [...new Map([...suggested.values()].map((market) => [market.id, marketRef(market)])).values()],
    documentsEnabled: documentsEnabled(),
    announcementsOptOut: vendor.announcementsOptOut,
  };
}

/* ------------------------------------------------------------------ *
 * Profile: the vendor sends it, an admin decides
 * ------------------------------------------------------------------ */

/**
 * A blob pathname inside `prefix` and nowhere else: one file name, no
 * further folders, nothing a URL parser would resolve away (`..`), no
 * percent-encoding or backslashes to smuggle those in.
 */
function fileInFolder(pathname: string, prefix: string): boolean {
  if (!pathname.startsWith(prefix)) return false;
  const name = pathname.slice(prefix.length);
  return name.length > 0 && name.length <= 300 && !/[\/\\%]|\.\.|[\u0000-\u001f]/.test(name);
}

/**
 * The public host of this project's own photo store, read from the store id
 * inside `BLOB_READ_WRITE_TOKEN` (`vercel_blob_rw_<store id>_<secret>`).
 * Photos must live there: a vendor who pointed a profile at a store of
 * their own could swap the picture after it was approved.
 */
function photoStoreHost(): string | null {
  const storeId = /^vercel_blob_rw_([A-Za-z0-9]+)_/.exec(process.env.BLOB_READ_WRITE_TOKEN ?? '')?.[1];
  return storeId ? `${storeId.toLowerCase()}.public.blob.vercel-storage.com` : null;
}

function photoBelongsTo(vendorId: string, photo: VendorPhoto): boolean {
  if (!fileInFolder(photo.pathname, vendorPhotoPathPrefix(vendorId))) return false;
  const host = photoStoreHost();
  if (!host) return false;
  try {
    const url = new URL(photo.url);
    return url.protocol === 'https:' && url.hostname === host && !url.search && !url.hash && url.pathname === `/${encodeURI(photo.pathname)}`;
  } catch {
    return false;
  }
}

async function deleteBlobs(urls: readonly string[], token?: string) {
  if (urls.length === 0) return;
  try {
    await del([...urls], token ? { token } : undefined);
  } catch (error) {
    console.error('Blob delete failed:', error);
  }
}

/** Photos in `before` that no profile in `keep` uses any more. */
function unusedPhotoUrls(before: VendorProfile | null, keep: (VendorProfile | null)[]): string[] {
  const kept = new Set(keep.flatMap((profile) => profile?.photos.map((photo) => photo.url) ?? []));
  return (before?.photos ?? []).map((photo) => photo.url).filter((url) => !kept.has(url));
}

export async function submitVendorProfile(user: SessionUser, input: unknown): Promise<VendorActionResult> {
  const parsed = parseVendorProfile(input);
  if (!parsed.ok) return { ok: false, error: 'Some fields need a fix before you send this.', fieldErrors: parsed.errors };
  const vendor = await ensureVendor(user);
  const profile = parsed.profile;
  const strangers = profile.photos.findIndex((photo) => !photoBelongsTo(vendor.id, photo));
  if (strangers >= 0) {
    return { ok: false, error: 'One of the photos could not be saved. Remove it and upload it again.', fieldErrors: [{ path: `photos.${strangers}`, message: 'Upload this photo again' }] };
  }

  const live = liveProfile(vendor);
  const previousProposal = vendor.proposed ? readVendorProfile(vendor.proposed) : null;
  const db = getDb();
  const now = new Date();
  // Only if nothing was decided since this request read the row: an approval
  // landing in between has already made the old proposal the live profile,
  // and its photos must not be cleaned up as if they were abandoned.
  const unchangedSinceRead = and(
    eq(vendors.id, vendor.id),
    eq(vendors.status, vendor.status),
    vendor.submittedAt ? eq(vendors.submittedAt, vendor.submittedAt) : isNull(vendors.submittedAt),
  );
  const CHANGED: VendorActionResult = { ok: false, error: 'Your profile was just reviewed. Reload the page and try again.' };

  if (live && vendorFieldsThatDiffer(live, profile).length === 0) {
    // Back to what is already published: there is nothing to review.
    const updated = await db
      .update(vendors)
      .set({ proposed: null, status: 'approved', reviewNote: null, updatedAt: now })
      .where(unchangedSinceRead)
      .returning({ id: vendors.id });
    if (updated.length === 0) return CHANGED;
    await deleteBlobs(unusedPhotoUrls(previousProposal, [live]));
    return { ok: true, message: vendor.proposed ? 'Your changes were withdrawn. Your live profile is unchanged.' : 'Nothing has changed yet.' };
  }

  const wasWaiting = vendor.status === 'pending';
  // One alert an hour per vendor at most; the review queue shows the rest.
  const alertedRecently = Boolean(vendor.submittedAt && now.getTime() - vendor.submittedAt.getTime() < 60 * 60 * 1000);
  const updated = await db
    .update(vendors)
    .set({
      proposed: profile,
      status: 'pending',
      reviewNote: null,
      submittedAt: now,
      updatedAt: now,
      // Admin lists show the live name once there is one.
      ...(live ? {} : { name: profile.name }),
    })
    .where(unchangedSinceRead)
    .returning({ id: vendors.id });
  if (updated.length === 0) return CHANGED;
  await deleteBlobs(unusedPhotoUrls(previousProposal, [live, profile]));

  if (!wasWaiting && !alertedRecently && !isAdmin(user)) {
    const to = adminEmails();
    if (to.length) {
      await sendOrganizerEmail(
        to,
        vendorProfileAlertEmail({
          vendorName: profile.name,
          accountEmail: user.email,
          firstTime: !live,
          reviewUrl: absoluteUrl(`/admin/vendors/${vendor.id}`),
        }),
        user.email,
      );
    }
  }
  capture(vendor.id, 'Vendor Profile Submitted', { first_time: !live, photos: profile.photos.length });
  return {
    ok: true,
    message: live
      ? 'Sent for review. Your live profile stays up until the changes are approved.'
      : 'Sent for review. We will email you once it is live, usually within two business days.',
  };
}

async function takenSlugs(except: string): Promise<string[]> {
  const rows = await getDb().select({ slug: vendors.slug }).from(vendors).where(ne(vendors.id, except));
  return rows.map((row) => row.slug);
}

/** Refresh every public page that shows this vendor. */
async function revalidateVendor(vendorId: string, slug: string) {
  revalidatePath(`/vendors/${slug}`);
  const rows = await getDb()
    .select({ marketId: vendorApplications.marketId })
    .from(vendorApplications)
    .where(and(eq(vendorApplications.vendorId, vendorId), eq(vendorApplications.status, 'approved')));
  const markets = await marketsByStoredId(rows.map((row) => row.marketId));
  await Promise.all([...new Set([...markets.values()].map((market) => market.slug))].map((marketSlug) => revalidateMarket(marketSlug)));
}

/**
 * `reviewedSubmittedAt` is the submission time of the proposal the admin had
 * on screen. A vendor may resubmit while the admin reads; approving must
 * never publish a version nobody looked at.
 */
export async function decideVendorProfile(
  admin: SessionUser,
  vendorId: string,
  approve: boolean,
  note: string | undefined,
  reviewedSubmittedAt: string,
): Promise<VendorActionResult> {
  if (!isAdmin(admin)) return { ok: false, error: 'Not allowed.' };
  if (!UUID.test(vendorId)) return { ok: false, error: 'Unknown vendor.' };
  const db = getDb();
  const [row] = await db
    .select({ vendor: vendors, email: userTable.email })
    .from(vendors)
    .innerJoin(userTable, eq(userTable.id, vendors.userId))
    .where(eq(vendors.id, vendorId))
    .limit(1);
  if (!row || row.vendor.status !== 'pending' || !row.vendor.submittedAt) return { ok: false, error: 'This profile was already reviewed.' };
  if (row.vendor.submittedAt.toISOString() !== reviewedSubmittedAt) {
    return { ok: false, error: 'The vendor sent a newer version while you were reviewing. Reload and look again.' };
  }
  const vendor = row.vendor;
  const proposed = readVendorProfile(vendor.proposed);
  if (!proposed) return { ok: false, error: 'This profile no longer fits the form. Ask the vendor to send it again.' };
  const live = liveProfile(vendor);
  const now = new Date();
  // Only the proposal the admin was looking at: a newer one keeps waiting.
  const stillSame = and(eq(vendors.id, vendorId), eq(vendors.status, 'pending'), eq(vendors.submittedAt, vendor.submittedAt!));

  if (!approve) {
    const updated = await db
      .update(vendors)
      .set({ status: 'rejected', reviewNote: note || null, reviewedAt: now, reviewedBy: admin.id, updatedAt: now })
      .where(stillSame)
      .returning({ id: vendors.id });
    if (updated.length === 0) return { ok: false, error: 'This profile changed while you were reviewing it. Reload and look again.' };
    await sendOrganizerEmail(row.email, vendorProfileDecisionEmail({ approved: false, vendorName: proposed.name, slug: vendor.slug, note }));
    capture(vendor.id, 'Vendor Profile Rejected', {});
    return { ok: true, message: 'Rejected. The vendor was emailed your note.' };
  }

  // The page address is set once, at the first approval, and never moves.
  let slug = live ? vendor.slug : uniqueVendorSlug(vendorSlugBase(proposed.name), await takenSlugs(vendor.id));
  const publish = (address: string) =>
    db
      .update(vendors)
      .set({
        profile: proposed,
        proposed: null,
        name: proposed.name,
        slug: address,
        status: 'approved',
        reviewNote: note || null,
        reviewedAt: now,
        reviewedBy: admin.id,
        updatedAt: now,
      })
      .where(stillSame)
      .returning({ id: vendors.id });
  let updated;
  try {
    updated = await publish(slug);
  } catch (error) {
    // Two vendors with the same name approved at the same moment: the
    // second one takes a suffix instead of failing.
    if (live || !String((error as Error)?.message ?? error).includes('vendors_slug_idx')) throw error;
    slug = `${slug}-${randomBytes(2).toString('hex')}`;
    updated = await publish(slug);
  }
  if (updated.length === 0) return { ok: false, error: 'This profile changed while you were reviewing it. Reload and look again.' };

  await deleteBlobs(unusedPhotoUrls(live, [proposed]));
  await revalidateVendor(vendor.id, slug);
  await sendOrganizerEmail(row.email, vendorProfileDecisionEmail({ approved: true, vendorName: proposed.name, slug, note }));
  if (!live) await notifyHeldApplications({ ...vendor, profile: proposed, name: proposed.name, slug });
  capture(vendor.id, 'Vendor Profile Approved', { first_time: !live });
  return { ok: true, message: 'Published.' };
}

/** Take a vendor off the public site, or put them back. Applications and documents are kept. */
export async function setVendorSuspended(admin: SessionUser, vendorId: string, suspended: boolean): Promise<VendorActionResult> {
  if (!isAdmin(admin)) return { ok: false, error: 'Not allowed.' };
  if (!UUID.test(vendorId)) return { ok: false, error: 'Unknown vendor.' };
  const [vendor] = await getDb()
    .update(vendors)
    .set({ suspendedAt: suspended ? new Date() : null, updatedAt: new Date() })
    .where(eq(vendors.id, vendorId))
    .returning({ id: vendors.id, slug: vendors.slug });
  if (!vendor) return { ok: false, error: 'Unknown vendor.' };
  await revalidateVendor(vendor.id, vendor.slug);
  return { ok: true, message: suspended ? 'Taken down. The vendor no longer shows on any public page.' : 'Restored.' };
}

/** Removes the vendor, their applications, documents and files. The sign-in account stays. */
export async function deleteVendor(admin: SessionUser, vendorId: string): Promise<VendorActionResult> {
  if (!isAdmin(admin)) return { ok: false, error: 'Not allowed.' };
  if (!UUID.test(vendorId)) return { ok: false, error: 'Unknown vendor.' };
  const db = getDb();
  const [vendor] = await db.select().from(vendors).where(eq(vendors.id, vendorId)).limit(1);
  if (!vendor) return { ok: false, error: 'Unknown vendor.' };
  const [documents, approved] = await Promise.all([
    db.select({ pathname: vendorDocuments.pathname }).from(vendorDocuments).where(eq(vendorDocuments.vendorId, vendorId)),
    db
      .select({ marketId: vendorApplications.marketId })
      .from(vendorApplications)
      .where(and(eq(vendorApplications.vendorId, vendorId), eq(vendorApplications.status, 'approved'))),
  ]);
  // Files first, while the rows still say where they are.
  if (documents.length && documentsToken()) await deleteBlobs(documents.map((row) => row.pathname), documentsToken());
  try {
    const photos = await list({ prefix: vendorPhotoPathPrefix(vendorId), limit: 1000 });
    await deleteBlobs(photos.blobs.map((blob) => blob.url));
  } catch (error) {
    console.error('Could not list vendor photos for deletion:', error);
  }
  await db.delete(vendors).where(eq(vendors.id, vendorId));
  revalidatePath(`/vendors/${vendor.slug}`);
  const markets = await marketsByStoredId(approved.map((row) => row.marketId));
  await Promise.all([...markets.values()].map((market) => revalidateMarket(market.slug)));
  return { ok: true, message: 'Vendor deleted.' };
}

export async function setAnnouncementsOptOut(user: SessionUser, optOut: boolean): Promise<VendorActionResult> {
  const vendor = await ensureVendor(user);
  await getDb().update(vendors).set({ announcementsOptOut: optOut, updatedAt: new Date() }).where(eq(vendors.id, vendor.id));
  return { ok: true, message: optOut ? 'You will not get announcement emails.' : 'You will get announcement emails.' };
}

/** From the link in every announcement. Unknown tokens get the same answer as known ones. */
export async function unsubscribeVendorByToken(token: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return;
  await getDb().update(vendors).set({ announcementsOptOut: true, updatedAt: new Date() }).where(eq(vendors.unsubscribeToken, token));
}

/* ------------------------------------------------------------------ *
 * Applications: the vendor picks a market
 * ------------------------------------------------------------------ */

export interface ApplicationForm {
  market: MarketRef;
  checklist: MarketChecklist;
  /** The market's organizers are on the site and will decide. */
  hasOrganizer: boolean;
  application: VendorApplicationView | null;
  documents: VendorDocumentView[];
  documentsEnabled: boolean;
  profileState: VendorProfileState;
}

/** What the apply page needs for one market. Creates nothing. */
export async function applicationFormFor(user: SessionUser, market: FarmerMarket): Promise<ApplicationForm> {
  const vendor = await getVendorForUser(user.id);
  const [checklist, organizers] = await Promise.all([getChecklist(market.id), marketsWithOrganizers([market.id])]);
  let application: VendorApplicationView | null = null;
  let documents: VendorDocumentView[] = [];
  if (vendor) {
    const rows = await getDb()
      .select()
      .from(vendorApplications)
      .where(and(eq(vendorApplications.vendorId, vendor.id), eq(vendorApplications.marketId, market.id)))
      .limit(1);
    [application] = await applicationViews(vendor, rows);
    documents = await documentViews(vendor.id);
  }
  return {
    market: marketRef(market),
    checklist: { ...checklist, items: checklist.items.filter((item) => !item.archived) },
    hasOrganizer: organizers.has(market.id),
    application: application ?? null,
    documents,
    documentsEnabled: documentsEnabled(),
    profileState: profileState(vendor),
  };
}

export interface ApplicationInput {
  days: string[];
  stall_note?: string;
  message?: string;
  /** Checklist item id to the vendor's document id. */
  documents?: Record<string, string>;
}

/**
 * Tell the people who decide (the market's organizers, or the admins) that
 * an application is waiting. At most one email per market per day.
 */
async function notifyDeciders(vendor: Pick<VendorRow, 'id' | 'name'>, market: FarmerMarket, applicationId: string) {
  const db = getDb();
  const since = new Date(Date.now() - NOTIFY_WINDOW_MS);
  const [recent] = await db
    .select({ id: vendorApplications.id })
    .from(vendorApplications)
    .where(and(eq(vendorApplications.marketId, market.id), gt(vendorApplications.notifiedAt, since)))
    .limit(1);
  if (recent) return;
  const managers = await managersFor(market.id);
  const audience = applicationDecider(managers.length > 0);
  const to = audience === 'organizer' ? managers.map((manager) => manager.email) : adminEmails();
  if (to.length === 0) return;
  const [waiting] = await db
    .select({ n: count() })
    .from(vendorApplications)
    .innerJoin(vendors, eq(vendors.id, vendorApplications.vendorId))
    .where(and(eq(vendorApplications.marketId, market.id), eq(vendorApplications.status, 'pending'), isNotNull(vendors.profile), isNull(vendors.suspendedAt)));
  const reviewUrl =
    audience === 'organizer'
      ? absoluteUrl(`/dashboard/markets/${market.slug}/vendors/${applicationId}`)
      : absoluteUrl(`/admin/vendors/${vendor.id}`);
  const sent = await sendOrganizerEmail(
    to,
    applicationAlertEmail({ audience, vendorName: vendor.name, marketName: market.name, waiting: waiting?.n ?? 1, reviewUrl }),
  );
  if (sent) await db.update(vendorApplications).set({ notifiedAt: new Date() }).where(eq(vendorApplications.id, applicationId));
}

/** After a first approval: applications sent earlier can now reach their deciders. */
async function notifyHeldApplications(vendor: VendorRow) {
  const rows = await getDb()
    .select()
    .from(vendorApplications)
    .where(and(eq(vendorApplications.vendorId, vendor.id), eq(vendorApplications.status, 'pending'), isNull(vendorApplications.notifiedAt)));
  if (rows.length === 0) return;
  const markets = await marketsByStoredId(rows.map((row) => row.marketId));
  for (const row of rows) {
    const market = markets.get(row.marketId);
    if (market) await notifyDeciders(vendor, market, row.id);
  }
}

export async function submitApplication(user: SessionUser, market: FarmerMarket, input: ApplicationInput): Promise<VendorActionResult> {
  const parsed = applicationDetailsSchema.safeParse({ days: input.days, stall_note: input.stall_note ?? '', message: input.message ?? '' });
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Some fields need a fix before you send this.',
      fieldErrors: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    };
  }
  const details = parsed.data;
  const vendor = await ensureVendor(user);
  const db = getDb();
  const [checklist, [existing], mine] = await Promise.all([
    getChecklist(market.id),
    db
      .select()
      .from(vendorApplications)
      .where(and(eq(vendorApplications.vendorId, vendor.id), eq(vendorApplications.marketId, market.id)))
      .limit(1),
    db.select().from(vendorDocuments).where(eq(vendorDocuments.vendorId, vendor.id)),
  ]);
  const listed = existing?.status === 'approved';
  if (!checklist.settings.accepting && !listed) {
    return { ok: false, error: 'This market is not taking vendor applications right now.' };
  }

  // Only this vendor's own documents, only for items the market still asks for.
  const active = checklist.items.filter((item) => !item.archived);
  const ownDocuments = new Map(mine.map((row) => [row.id, row]));
  const chosen = new Map<string, string>();
  for (const item of active) {
    const documentId = input.documents?.[item.id];
    if (!documentId) continue;
    if (!ownDocuments.has(documentId)) return { ok: false, error: 'One of the documents is no longer in your locker. Pick it again.' };
    chosen.set(item.id, documentId);
  }
  const current = existing
    ? await db.select().from(vendorDocumentSubmissions).where(eq(vendorDocumentSubmissions.applicationId, existing.id))
    : [];
  const currentByKey = new Map(current.map((row) => [row.requirementKey, row]));
  // Required documents never hold an application back: the vendor applies
  // first and adds what the market asks for afterwards. The market sees what
  // is still missing when it decides.

  const now = new Date();
  let applicationId = existing?.id;
  let newlyWaiting = false;
  const reopening = existing?.status === 'denied' || existing?.status === 'withdrawn';
  if (!existing || reopening) {
    const [pending] = await db
      .select({ n: count() })
      .from(vendorApplications)
      .where(and(eq(vendorApplications.vendorId, vendor.id), eq(vendorApplications.status, 'pending')));
    if ((pending?.n ?? 0) >= MAX_PENDING_APPLICATIONS) {
      return { ok: false, error: `You can have up to ${MAX_PENDING_APPLICATIONS} applications waiting at once. Try again once some are decided.` };
    }
  }
  if (!existing) {
    const [created] = await db
      .insert(vendorApplications)
      .values({ vendorId: vendor.id, marketId: market.id, days: details.days, stallNote: details.stall_note ?? null, message: details.message ?? null })
      .onConflictDoNothing()
      .returning({ id: vendorApplications.id });
    if (!created) return { ok: false, error: 'You already applied to this market. Reload the page to see it.' };
    applicationId = created.id;
    newlyWaiting = true;
  } else {
    await db
      .update(vendorApplications)
      .set({
        days: details.days,
        stallNote: details.stall_note ?? null,
        message: details.message ?? null,
        updatedAt: now,
        ...(reopening
          ? { status: 'pending' as const, decidedBy: null, decidedRole: null, decisionNote: null, decidedAt: null, notifiedAt: null, createdAt: now }
          : {}),
      })
      .where(and(eq(vendorApplications.id, existing.id), eq(vendorApplications.vendorId, vendor.id)));
    newlyWaiting = reopening;
  }

  // A new or swapped document starts over as "waiting"; an unchanged one keeps its verdict.
  const changed = [...chosen].filter(([key, documentId]) => currentByKey.get(key)?.documentId !== documentId);
  if (changed.length) {
    const upserts = changed.map(([requirementKey, documentId]) =>
      db
        .insert(vendorDocumentSubmissions)
        .values({ applicationId: applicationId!, requirementKey, documentId })
        .onConflictDoUpdate({
          target: [vendorDocumentSubmissions.applicationId, vendorDocumentSubmissions.requirementKey],
          set: { documentId, status: 'pending', note: null, decidedBy: null, decidedAt: null, createdAt: now },
        }),
    );
    await db.batch(upserts as [(typeof upserts)[number], ...(typeof upserts)[number][]]);
  }

  const live = isLive(vendor);
  if (listed) {
    // Days and stall note of a listed vendor publish right away.
    await revalidateMarket(market.slug);
    revalidatePath(`/vendors/${vendor.slug}`);
  } else if (newlyWaiting && live.hasLiveProfile && !live.suspended) {
    await notifyDeciders(vendor, market, applicationId!);
  }
  capture(vendor.id, listed ? 'Vendor Application Updated' : 'Vendor Application Submitted', { market_id: market.id, documents: chosen.size });
  if (listed) return { ok: true, message: 'Saved. Your listing at this market is updated.' };
  const owed = active.filter((item) => item.required && !chosen.has(item.id) && !currentByKey.has(item.id)).length;
  const next = owed ? ` This market asks for ${owed === 1 ? 'a document' : `${owed} documents`}. Add ${owed === 1 ? 'it' : 'them'} when you can.` : '';
  return {
    ok: true,
    message: `${live.hasLiveProfile ? 'Application sent. We will email you when it is decided.' : 'Application saved. The market will see it once your profile is approved.'}${next}`,
  };
}

/**
 * The first screen in one go: the profile goes to review with a name and what
 * the vendor sells, and an application is opened at each market they picked.
 * Only for an account that has never sent a profile; after that the profile
 * editor and the markets page take over.
 */
export async function startVendor(user: SessionUser, input: unknown): Promise<VendorActionResult> {
  const parsed = vendorStartSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Add your business name and what you sell.',
      fieldErrors: parsed.error.issues.map((issue) => ({ path: String(issue.path[0] ?? ''), message: issue.message })),
    };
  }
  const start = parsed.data;
  const vendor = await getVendorForUser(user.id);
  if (vendor && (vendor.status !== 'draft' || vendor.profile)) {
    return { ok: false, error: 'You already sent your profile. Reload the page to see it.' };
  }
  // An invite may have left a draft (a description, a website): keep it.
  const profile = { ...readVendorDraft(vendor?.proposed ?? null), name: start.name, products: start.products };
  const sent = await submitVendorProfile(user, profile);
  if (!sent.ok) return sent;

  const skipped: string[] = [];
  let applied = 0;
  for (const slug of [...new Set(start.markets)]) {
    const market = await getPublishedMarket(slug);
    const result = market ? await submitApplication(user, market, { days: [] }) : null;
    if (result?.ok) applied += 1;
    else skipped.push(market?.name ?? slug);
  }
  const where = applied === 0 ? '' : applied === 1 ? ' and applied to 1 market' : ` and applied to ${applied} markets`;
  const problems = skipped.length ? ` We could not add ${skipped.join(', ')}; try from Markets.` : '';
  return { ok: true, message: `Sent for review${where}. We will email you, usually within two business days.${problems}` };
}

export async function withdrawApplication(user: SessionUser, applicationId: string): Promise<VendorActionResult> {
  if (!UUID.test(applicationId)) return { ok: false, error: 'Unknown application.' };
  const vendor = await getVendorForUser(user.id);
  if (!vendor) return { ok: false, error: 'Unknown application.' };
  const [row] = await getDb()
    .update(vendorApplications)
    .set({ status: 'withdrawn', updatedAt: new Date() })
    .where(and(eq(vendorApplications.id, applicationId), eq(vendorApplications.vendorId, vendor.id), inArray(vendorApplications.status, ['pending', 'approved'])))
    .returning({ marketId: vendorApplications.marketId });
  if (!row) return { ok: false, error: 'This application was already closed.' };
  const market = (await marketsByStoredId([row.marketId])).get(row.marketId);
  if (market) await revalidateMarket(market.slug);
  revalidatePath(`/vendors/${vendor.slug}`);
  return { ok: true, message: 'You are no longer listed at this market.' };
}

/* ------------------------------------------------------------------ *
 * Documents: the vendor's locker
 * ------------------------------------------------------------------ */

export async function registerDocument(
  user: SessionUser,
  input: { pathname: string; contentType: string; size: number; label: string; expires_on?: string },
): Promise<VendorActionResult & { documentId?: string }> {
  if (!documentsEnabled()) return { ok: false, error: 'Document uploads are not available yet.' };
  const details = documentDetailsSchema.safeParse({ label: input.label, expires_on: input.expires_on ?? '' });
  if (!details.success) {
    return {
      ok: false,
      error: 'Some fields need a fix.',
      fieldErrors: details.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    };
  }
  const vendor = await ensureVendor(user);
  if (!fileInFolder(input.pathname, documentPathPrefix(vendor.id))) return { ok: false, error: 'That upload does not belong to your account.' };
  // What the store itself says about the file, not what the browser claims.
  let stored;
  try {
    stored = await head(input.pathname, { token: documentsToken() });
  } catch {
    return { ok: false, error: 'We could not find that upload. Try uploading it again.' };
  }
  if (stored.pathname !== input.pathname) return { ok: false, error: 'That upload does not belong to your account.' };
  input = { ...input, contentType: stored.contentType, size: stored.size };
  if (!DOCUMENT_CONTENT_TYPES.includes(input.contentType)) return { ok: false, error: 'Upload a PDF, JPEG or PNG.' };
  if (!Number.isFinite(input.size) || input.size <= 0 || input.size > MAX_DOCUMENT_BYTES) return { ok: false, error: 'That file is too large.' };
  const db = getDb();
  const [held] = await db.select({ n: count() }).from(vendorDocuments).where(eq(vendorDocuments.vendorId, vendor.id));
  if ((held?.n ?? 0) >= MAX_DOCUMENTS_PER_VENDOR) return { ok: false, error: `You can keep up to ${MAX_DOCUMENTS_PER_VENDOR} documents. Remove one first.` };
  const [created] = await db
    .insert(vendorDocuments)
    .values({
      vendorId: vendor.id,
      label: details.data.label,
      pathname: input.pathname,
      contentType: input.contentType,
      size: Math.round(input.size),
      expiresOn: details.data.expires_on ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: vendorDocuments.id });
  if (!created) return { ok: false, error: 'That file was already saved.' };
  capture(vendor.id, 'Vendor Document Uploaded', {});
  return { ok: true, message: 'Saved to your documents.', documentId: created.id };
}

export async function updateDocument(user: SessionUser, documentId: string, input: { label: string; expires_on?: string }): Promise<VendorActionResult> {
  if (!UUID.test(documentId)) return { ok: false, error: 'Unknown document.' };
  const details = documentDetailsSchema.safeParse({ label: input.label, expires_on: input.expires_on ?? '' });
  if (!details.success) {
    return {
      ok: false,
      error: 'Some fields need a fix.',
      fieldErrors: details.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    };
  }
  const vendor = await getVendorForUser(user.id);
  if (!vendor) return { ok: false, error: 'Unknown document.' };
  const updated = await getDb()
    .update(vendorDocuments)
    .set({ label: details.data.label, expiresOn: details.data.expires_on ?? null })
    .where(and(eq(vendorDocuments.id, documentId), eq(vendorDocuments.vendorId, vendor.id)))
    .returning({ id: vendorDocuments.id });
  return updated.length ? { ok: true, message: 'Saved.' } : { ok: false, error: 'Unknown document.' };
}

/** Deletes the file for good, and with it every copy attached to an application. */
export async function removeDocument(user: SessionUser, documentId: string): Promise<VendorActionResult> {
  if (!UUID.test(documentId)) return { ok: false, error: 'Unknown document.' };
  const vendor = await getVendorForUser(user.id);
  if (!vendor) return { ok: false, error: 'Unknown document.' };
  const [removed] = await getDb()
    .delete(vendorDocuments)
    .where(and(eq(vendorDocuments.id, documentId), eq(vendorDocuments.vendorId, vendor.id)))
    .returning({ pathname: vendorDocuments.pathname });
  if (!removed) return { ok: false, error: 'Unknown document.' };
  await deleteBlobs([removed.pathname], documentsToken());
  return { ok: true, message: 'Document deleted.' };
}

/** The file behind a document, if this account may open it; null means 404. */
export async function documentForDownload(user: SessionUser, documentId: string): Promise<{ pathname: string; contentType: string; label: string } | null> {
  if (!UUID.test(documentId)) return null;
  const db = getDb();
  const [document] = await db.select().from(vendorDocuments).where(eq(vendorDocuments.id, documentId)).limit(1);
  if (!document) return null;
  const [own, attached, managed] = await Promise.all([
    getVendorForUser(user.id),
    db
      .select({ marketId: vendorApplications.marketId })
      .from(vendorDocumentSubmissions)
      .innerJoin(vendorApplications, eq(vendorApplications.id, vendorDocumentSubmissions.applicationId))
      .where(and(eq(vendorDocumentSubmissions.documentId, documentId), ne(vendorApplications.status, 'withdrawn'))),
    isAdmin(user) ? Promise.resolve([]) : managedMarketIds(user.id),
  ]);
  const allowed = canReadDocument(
    { isAdmin: isAdmin(user), vendorId: own?.id ?? null, managedMarketIds: managed },
    { vendorId: document.vendorId, attachedMarketIds: attached.map((row) => row.marketId) },
  );
  return allowed ? { pathname: document.pathname, contentType: document.contentType, label: document.label } : null;
}

/* ------------------------------------------------------------------ *
 * The organizer's side: checklist, applications, documents
 * ------------------------------------------------------------------ */

export async function saveChecklist(user: SessionUser, market: FarmerMarket, input: unknown): Promise<VendorActionResult> {
  if (!(await canManageMarket(user, market.id))) return { ok: false, error: 'You do not manage this market.' };
  const parsed = checklistSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Some fields need a fix before you save.',
      fieldErrors: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    };
  }
  const db = getDb();
  const previous = await getChecklist(market.id);
  // An item vendors already answered is kept as archived when the organizer
  // drops it, so the documents sent for it stay on record.
  const kept = new Set(parsed.data.items.map((item) => item.id));
  const dropped = previous.items.filter((item) => !kept.has(item.id));
  let archived: ChecklistItem[] = [];
  if (dropped.length) {
    const answered = await db
      .selectDistinct({ key: vendorDocumentSubmissions.requirementKey })
      .from(vendorDocumentSubmissions)
      .innerJoin(vendorApplications, eq(vendorApplications.id, vendorDocumentSubmissions.applicationId))
      .where(and(eq(vendorApplications.marketId, market.id), inArray(vendorDocumentSubmissions.requirementKey, dropped.map((item) => item.id))));
    const used = new Set(answered.map((row) => row.key));
    archived = dropped.filter((item) => used.has(item.id)).map((item) => ({ ...item, archived: true }));
  }
  const items = [...parsed.data.items, ...archived];
  const now = new Date();
  await db
    .insert(marketVendorChecklists)
    .values({ marketId: market.id, items, settings: parsed.data.settings, updatedAt: now, updatedBy: user.id })
    .onConflictDoUpdate({ target: marketVendorChecklists.marketId, set: { items, settings: parsed.data.settings, updatedAt: now, updatedBy: user.id } });
  return { ok: true, message: 'Checklist saved.' };
}

export interface DeskApplication {
  id: string;
  status: ApplicationStatus;
  vendor: { id: string; name: string; slug: string; live: boolean; products: string[]; cover?: { url: string; alt?: string } };
  days: string[];
  stallNote: string | null;
  confirmed: boolean;
  progress: ApplicationProgress;
  createdAt: Date;
  decidedAt: Date | null;
}

export interface VendorDesk {
  checklist: MarketChecklist;
  applyUrl: string;
  hasOrganizer: boolean;
  applications: DeskApplication[];
  counts: { pending: number; approved: number; denied: number };
}

/** The organizer's vendor page for one market. Admins see held applications too. */
export async function marketVendorDesk(user: SessionUser, market: FarmerMarket): Promise<VendorDesk | null> {
  if (!(await canManageMarket(user, market.id))) return null;
  const db = getDb();
  const [checklist, organizers, rows] = await Promise.all([
    getChecklist(market.id),
    marketsWithOrganizers([market.id]),
    db
      .select({ application: vendorApplications, vendor: vendors })
      .from(vendorApplications)
      .innerJoin(vendors, eq(vendors.id, vendorApplications.vendorId))
      .where(and(eq(vendorApplications.marketId, market.id), ne(vendorApplications.status, 'withdrawn')))
      .orderBy(asc(vendorApplications.createdAt)),
  ]);
  const visible = rows.filter((row) => isAdmin(user) || applicationVisibleToOrganizer(isLive(row.vendor), row.application.status));
  const submissions = visible.length
    ? await db.select().from(vendorDocumentSubmissions).where(inArray(vendorDocumentSubmissions.applicationId, visible.map((row) => row.application.id)))
    : [];
  const applications = visible.map(({ application, vendor }): DeskApplication => {
    const profile = liveProfile(vendor) ?? readVendorDraft(vendor.proposed);
    const cover = profile.photos[0];
    return {
      id: application.id,
      status: application.status,
      vendor: {
        id: vendor.id,
        name: profile.name || vendor.name || 'Unnamed vendor',
        slug: vendor.slug,
        live: vendor.profile !== null && vendor.suspendedAt === null,
        products: profile.products,
        cover: cover ? { url: cover.url, alt: cover.alt } : undefined,
      },
      days: readDays(application.days),
      stallNote: application.stallNote,
      confirmed: confirmedByMarket(application),
      progress: progressOf(checklist, submissions.filter((row) => row.applicationId === application.id)),
      createdAt: application.createdAt,
      decidedAt: application.decidedAt,
    };
  });
  const countOf = (status: ApplicationStatus) => applications.filter((row) => row.status === status).length;
  return {
    checklist,
    applyUrl: absoluteUrl(`/markets/${market.slug}/apply`),
    hasOrganizer: organizers.has(market.id),
    applications,
    counts: { pending: countOf('pending'), approved: countOf('approved'), denied: countOf('denied') },
  };
}

export interface DeskApplicationDetail extends DeskApplication {
  profile: VendorProfile;
  /** The vendor's sign-in email: shared with the markets they apply to so organizers can reach them. */
  accountEmail: string;
  message: string | null;
  decisionNote: string | null;
  checklist: ChecklistLine[];
}

export async function deskApplication(user: SessionUser, market: FarmerMarket, applicationId: string): Promise<DeskApplicationDetail | null> {
  if (!UUID.test(applicationId)) return null;
  if (!(await canManageMarket(user, market.id))) return null;
  const db = getDb();
  const [row] = await db
    .select({ application: vendorApplications, vendor: vendors, email: userTable.email })
    .from(vendorApplications)
    .innerJoin(vendors, eq(vendors.id, vendorApplications.vendorId))
    .innerJoin(userTable, eq(userTable.id, vendors.userId))
    .where(and(eq(vendorApplications.id, applicationId), eq(vendorApplications.marketId, market.id)))
    .limit(1);
  if (!row) return null;
  if (!isAdmin(user) && !applicationVisibleToOrganizer(isLive(row.vendor), row.application.status)) return null;
  const [checklist, submissions, documents] = await Promise.all([
    getChecklist(market.id),
    db.select().from(vendorDocumentSubmissions).where(eq(vendorDocumentSubmissions.applicationId, applicationId)),
    db.select().from(vendorDocuments).where(eq(vendorDocuments.vendorId, row.vendor.id)),
  ]);
  const profile = liveProfile(row.vendor) ?? readVendorDraft(row.vendor.proposed);
  const cover = profile.photos[0];
  return {
    id: row.application.id,
    status: row.application.status,
    vendor: {
      id: row.vendor.id,
      name: profile.name || row.vendor.name || 'Unnamed vendor',
      slug: row.vendor.slug,
      live: row.vendor.profile !== null && row.vendor.suspendedAt === null,
      products: profile.products,
      cover: cover ? { url: cover.url, alt: cover.alt } : undefined,
    },
    days: readDays(row.application.days),
    stallNote: row.application.stallNote,
    confirmed: confirmedByMarket(row.application),
    progress: progressOf(checklist, submissions),
    createdAt: row.application.createdAt,
    decidedAt: row.application.decidedAt,
    profile,
    accountEmail: row.email,
    message: row.application.message,
    decisionNote: row.application.decisionNote,
    checklist: checklistLines(checklist, submissions, new Map(documents.map((document) => [document.id, document]))),
  };
}

/**
 * Approve or deny an application. `pending` can go either way; an approved
 * vendor can later be removed (denied). The decider is recorded as
 * `organizer` only when the account really manages the market, which is what
 * earns the public badge.
 */
export async function decideApplication(
  user: SessionUser,
  applicationId: string,
  approve: boolean,
  note?: string,
  /** When given, the application must belong to this market (organizer pages). */
  expectedMarketId?: string,
): Promise<VendorActionResult> {
  if (!UUID.test(applicationId)) return { ok: false, error: 'Unknown application.' };
  const db = getDb();
  const [row] = await db
    .select({ application: vendorApplications, vendor: vendors, email: userTable.email })
    .from(vendorApplications)
    .innerJoin(vendors, eq(vendors.id, vendorApplications.vendorId))
    .innerJoin(userTable, eq(userTable.id, vendors.userId))
    .where(eq(vendorApplications.id, applicationId))
    .limit(1);
  if (!row || (expectedMarketId && row.application.marketId !== expectedMarketId)) return { ok: false, error: 'Unknown application.' };
  if (!(await canManageMarket(user, row.application.marketId))) return { ok: false, error: 'You do not manage this market.' };
  const live = isLive(row.vendor);
  if (!isAdmin(user) && !applicationVisibleToOrganizer(live, row.application.status)) return { ok: false, error: 'Unknown application.' };
  if (approve && !live.hasLiveProfile) return { ok: false, error: 'Approve the vendor profile first; then this application can be approved.' };

  const from: ApplicationStatus[] = approve ? ['pending'] : ['pending', 'approved'];
  const removing = !approve && row.application.status === 'approved';
  const manages = (await managedMarketIds(user.id)).includes(row.application.marketId);
  const now = new Date();
  const [decided] = await db
    .update(vendorApplications)
    .set({
      status: approve ? 'approved' : 'denied',
      decidedBy: user.id,
      decidedRole: manages ? 'organizer' : 'admin',
      decisionNote: note || null,
      decidedAt: now,
      updatedAt: now,
    })
    .where(and(eq(vendorApplications.id, applicationId), inArray(vendorApplications.status, from)))
    .returning({ id: vendorApplications.id });
  if (!decided) return { ok: false, error: 'This application was already decided.' };

  const market = (await marketsByStoredId([row.application.marketId])).get(row.application.marketId);
  if (market) {
    await revalidateMarket(market.slug);
    await sendOrganizerEmail(
      row.email,
      applicationDecisionEmail({ approved: approve, removed: removing, marketName: market.name, marketSlug: market.slug, note }),
    );
  }
  revalidatePath(`/vendors/${row.vendor.slug}`);
  capture(row.vendor.id, approve ? 'Vendor Application Approved' : removing ? 'Vendor Removed From Market' : 'Vendor Application Denied', {
    market_id: row.application.marketId,
    decided_role: manages ? 'organizer' : 'admin',
  });
  return { ok: true, message: approve ? 'Approved. The vendor now shows on the market page.' : removing ? 'Removed from this market.' : 'Denied.' };
}

/** The organizer's verdict on one attached document. Can be changed later. */
export async function decideDocument(
  user: SessionUser,
  submissionId: string,
  approve: boolean,
  note?: string,
  expectedMarketId?: string,
): Promise<VendorActionResult> {
  if (!UUID.test(submissionId)) return { ok: false, error: 'Unknown document.' };
  const db = getDb();
  const [row] = await db
    .select({ submission: vendorDocumentSubmissions, application: vendorApplications, document: vendorDocuments, email: userTable.email, vendor: vendors })
    .from(vendorDocumentSubmissions)
    .innerJoin(vendorApplications, eq(vendorApplications.id, vendorDocumentSubmissions.applicationId))
    .innerJoin(vendorDocuments, eq(vendorDocuments.id, vendorDocumentSubmissions.documentId))
    .innerJoin(vendors, eq(vendors.id, vendorApplications.vendorId))
    .innerJoin(userTable, eq(userTable.id, vendors.userId))
    .where(eq(vendorDocumentSubmissions.id, submissionId))
    .limit(1);
  if (!row || (expectedMarketId && row.application.marketId !== expectedMarketId)) return { ok: false, error: 'Unknown document.' };
  if (!(await canManageMarket(user, row.application.marketId))) return { ok: false, error: 'You do not manage this market.' };
  if (!isAdmin(user) && !applicationVisibleToOrganizer(isLive(row.vendor), row.application.status)) return { ok: false, error: 'Unknown document.' };
  if (row.application.status === 'withdrawn') return { ok: false, error: 'The vendor withdrew this application.' };
  if (!approve && !note?.trim()) return { ok: false, error: 'Say what is wrong so the vendor can fix it.' };
  const status = approve ? 'approved' : 'rejected';
  const [updated] = await db
    .update(vendorDocumentSubmissions)
    .set({ status, note: note?.trim() || null, decidedBy: user.id, decidedAt: new Date() })
    // Only the document the organizer was looking at, not one swapped in since.
    .where(and(eq(vendorDocumentSubmissions.id, submissionId), eq(vendorDocumentSubmissions.documentId, row.document.id)))
    .returning({ id: vendorDocumentSubmissions.id });
  if (!updated) return { ok: false, error: 'The vendor replaced this document. Reload and look again.' };
  if (!approve && row.submission.status !== 'rejected') {
    const market = (await marketsByStoredId([row.application.marketId])).get(row.application.marketId);
    if (market) await sendOrganizerEmail(row.email, documentDeniedEmail({ documentLabel: row.document.label, marketName: market.name, note }));
  }
  capture(row.vendor.id, approve ? 'Vendor Document Approved' : 'Vendor Document Denied', { market_id: row.application.marketId });
  return { ok: true, message: approve ? 'Document approved.' : 'Document denied. The vendor was emailed your note.' };
}

/** Applications waiting on each market's organizers, for the dashboard nav. */
export async function pendingApplicationCounts(marketIds: readonly string[]): Promise<Map<string, number>> {
  if (marketIds.length === 0) return new Map();
  const rows = await getDb()
    .select({ marketId: vendorApplications.marketId, n: count() })
    .from(vendorApplications)
    .innerJoin(vendors, eq(vendors.id, vendorApplications.vendorId))
    .where(
      and(
        inArray(vendorApplications.marketId, [...marketIds]),
        eq(vendorApplications.status, 'pending'),
        isNotNull(vendors.profile),
        isNull(vendors.suspendedAt),
      ),
    )
    .groupBy(vendorApplications.marketId);
  return new Map(rows.map((row) => [row.marketId, row.n]));
}

/* ------------------------------------------------------------------ *
 * Admin: every vendor, the review queue, invites, announcements
 * ------------------------------------------------------------------ */

export interface AdminVendorRow {
  id: string;
  name: string;
  slug: string;
  email: string;
  accountName: string;
  state: VendorProfileState;
  live: boolean;
  suspended: boolean;
  source: string;
  createdAt: Date;
  submittedAt: Date | null;
  announcementsOptOut: boolean;
  markets: { approved: MarketRef[]; pending: MarketRef[] };
  documents: number;
}

export async function adminVendors(): Promise<AdminVendorRow[]> {
  const db = getDb();
  const [rows, applications, documents] = await Promise.all([
    db
      .select({ vendor: vendors, email: userTable.email, accountName: userTable.name })
      .from(vendors)
      .innerJoin(userTable, eq(userTable.id, vendors.userId))
      .orderBy(desc(vendors.createdAt))
      .limit(2000),
    db
      .select({ vendorId: vendorApplications.vendorId, marketId: vendorApplications.marketId, status: vendorApplications.status })
      .from(vendorApplications)
      .where(inArray(vendorApplications.status, ['pending', 'approved'])),
    db.select({ vendorId: vendorDocuments.vendorId, n: count() }).from(vendorDocuments).groupBy(vendorDocuments.vendorId),
  ]);
  const markets = await marketsByStoredId([...new Set(applications.map((row) => row.marketId))]);
  const documentCount = new Map(documents.map((row) => [row.vendorId, row.n]));
  return rows.map(({ vendor, email, accountName }) => {
    const mine = applications.filter((row) => row.vendorId === vendor.id);
    const refs = (status: 'pending' | 'approved') =>
      mine.filter((row) => row.status === status).flatMap((row) => {
        const market = markets.get(row.marketId);
        return market ? [marketRef(market)] : [];
      });
    return {
      id: vendor.id,
      name: vendor.name || readVendorDraft(vendor.proposed).name || '(no name yet)',
      slug: vendor.slug,
      email,
      accountName,
      state: profileState(vendor),
      live: vendor.profile !== null && vendor.suspendedAt === null,
      suspended: vendor.suspendedAt !== null,
      source: vendor.source,
      createdAt: vendor.createdAt,
      submittedAt: vendor.submittedAt,
      announcementsOptOut: vendor.announcementsOptOut,
      markets: { approved: refs('approved'), pending: refs('pending') },
      documents: documentCount.get(vendor.id) ?? 0,
    };
  });
}

/** Every vendor as a spreadsheet, for the admin's own mailings. */
export async function vendorsCsv(): Promise<string> {
  const rows = await adminVendors();
  const date = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : '');
  return toCsv([
    ['Business', 'Email', 'Account name', 'Profile', 'Public page', 'Source', 'Joined', 'Markets listed', 'Markets waiting', 'Announcements'],
    ...rows.map((row) => [
      row.name,
      row.email,
      row.accountName,
      row.suspended ? 'taken down' : row.live ? (row.state === 'pending' ? 'live, update waiting' : 'live') : row.state,
      row.live ? absoluteUrl(`/vendors/${row.slug}`) : '',
      row.source,
      date(row.createdAt),
      row.markets.approved.map((market) => market.name).join('; '),
      row.markets.pending.map((market) => market.name).join('; '),
      row.announcementsOptOut ? 'opted out' : 'yes',
    ]),
  ]);
}

export interface AdminVendorDetail {
  id: string;
  slug: string;
  email: string;
  accountName: string;
  state: VendorProfileState;
  suspended: boolean;
  source: string;
  createdAt: Date;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  live: VendorProfile | null;
  /** The proposal waiting for review (or last rejected), if any. */
  proposed: VendorProfile | null;
  changedFields: (keyof VendorProfile)[];
  applications: VendorApplicationView[];
  documents: VendorDocumentView[];
  announcementsOptOut: boolean;
}

export async function adminVendor(vendorId: string): Promise<AdminVendorDetail | null> {
  if (!UUID.test(vendorId)) return null;
  const db = getDb();
  const [row] = await db
    .select({ vendor: vendors, email: userTable.email, accountName: userTable.name })
    .from(vendors)
    .innerJoin(userTable, eq(userTable.id, vendors.userId))
    .where(eq(vendors.id, vendorId))
    .limit(1);
  if (!row) return null;
  const { vendor } = row;
  const rows = await db
    .select()
    .from(vendorApplications)
    .where(eq(vendorApplications.vendorId, vendor.id))
    .orderBy(desc(vendorApplications.createdAt));
  const [applications, documents] = await Promise.all([applicationViews(vendor, rows), documentViews(vendor.id)]);
  const live = liveProfile(vendor);
  const proposed = vendor.proposed ? readVendorDraft(vendor.proposed) : null;
  return {
    id: vendor.id,
    slug: vendor.slug,
    email: row.email,
    accountName: row.accountName,
    state: profileState(vendor),
    suspended: vendor.suspendedAt !== null,
    source: vendor.source,
    createdAt: vendor.createdAt,
    submittedAt: vendor.submittedAt,
    reviewedAt: vendor.reviewedAt,
    reviewNote: vendor.reviewNote,
    live,
    proposed,
    changedFields: proposed ? vendorFieldsThatDiffer(live, proposed) : [],
    applications,
    documents,
    announcementsOptOut: vendor.announcementsOptOut,
  };
}

export interface VendorQueue {
  /** Profiles waiting for the admin. */
  profiles: { id: string; name: string; email: string; firstTime: boolean; submittedAt: Date | null }[];
  /** Applications only the admin can decide: the market has no organizer. */
  applications: { id: string; vendorId: string; vendorName: string; market: MarketRef | null; createdAt: Date }[];
}

export async function vendorReviewQueue(): Promise<VendorQueue> {
  const db = getDb();
  const [profiles, pending] = await Promise.all([
    db
      .select({ vendor: vendors, email: userTable.email })
      .from(vendors)
      .innerJoin(userTable, eq(userTable.id, vendors.userId))
      .where(eq(vendors.status, 'pending'))
      .orderBy(asc(vendors.submittedAt)),
    db
      .select({ application: vendorApplications, vendorName: vendors.name })
      .from(vendorApplications)
      .innerJoin(vendors, eq(vendors.id, vendorApplications.vendorId))
      .where(and(eq(vendorApplications.status, 'pending'), isNotNull(vendors.profile), isNull(vendors.suspendedAt)))
      .orderBy(asc(vendorApplications.createdAt)),
  ]);
  const marketIds = pending.map((row) => row.application.marketId);
  const [organizers, markets] = await Promise.all([marketsWithOrganizers(marketIds), marketsByStoredId(marketIds)]);
  return {
    profiles: profiles.map(({ vendor, email }) => ({
      id: vendor.id,
      name: readVendorDraft(vendor.proposed).name || vendor.name || '(no name yet)',
      email,
      firstTime: vendor.profile === null,
      submittedAt: vendor.submittedAt,
    })),
    applications: pending
      .filter((row) => !organizers.has(row.application.marketId))
      .map((row) => {
        const market = markets.get(row.application.marketId);
        return {
          id: row.application.id,
          vendorId: row.application.vendorId,
          vendorName: row.vendorName,
          market: market ? marketRef(market) : null,
          createdAt: row.application.createdAt,
        };
      }),
  };
}

export interface VendorInviteInput {
  email: string;
  businessName?: string;
  website?: string;
  /** Markets the vendor is known to sell at, offered as one-tap picks. */
  markets?: FarmerMarket[];
  /** Also send our own invite email. */
  notify?: boolean;
  source: 'outreach-bot' | 'admin-invite';
}

export type VendorInviteResult =
  | { ok: true; inviteUrl: string; createdAccount: boolean; alreadyVendor: boolean; notified: boolean; vendorId: string }
  | { ok: false; status: 400 | 403; error: string };

/**
 * Set up a vendor account for someone the admin or the outreach bot is in
 * touch with: an account for their email if they have none, and a draft
 * with what is already known. Nothing is public: the vendor signs in with a
 * code sent to that inbox, finishes the profile, and it is reviewed like
 * any other. A new account starts verified because it has no password.
 */
export async function inviteVendor(input: VendorInviteInput): Promise<VendorInviteResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { ok: false, status: 400, error: 'Enter a valid email address.' };
  if (adminEmails().includes(email)) return { ok: false, status: 403, error: 'Admin accounts cannot be invited as vendors.' };
  const db = getDb();
  const businessName = input.businessName?.trim().replace(/\s+/g, ' ').slice(0, 120) || '';

  let [account] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, email)).limit(1);
  let createdAccount = false;
  if (!account) {
    [account] = await db
      .insert(userTable)
      .values({ id: crypto.randomUUID(), email, name: businessName, emailVerified: true })
      .onConflictDoNothing()
      .returning({ id: userTable.id });
    if (account) {
      createdAccount = true;
    } else {
      [account] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, email)).limit(1);
    }
  }

  const [existing] = await db.select().from(vendors).where(eq(vendors.userId, account.id)).limit(1);
  const marketIds = (input.markets ?? []).map((market) => market.id);
  let vendorId = existing?.id;
  if (!existing) {
    const draft = readVendorDraft({ name: businessName, website: input.website });
    const [created] = await db
      .insert(vendors)
      .values({
        userId: account.id,
        slug: `vendor-${randomBytes(6).toString('hex')}`,
        name: businessName,
        proposed: businessName || draft.website ? draft : null,
        source: input.source,
        invitedMarkets: marketIds,
        unsubscribeToken: randomBytes(32).toString('base64url'),
      })
      .onConflictDoNothing()
      .returning({ id: vendors.id });
    vendorId = created?.id ?? (await db.select({ id: vendors.id }).from(vendors).where(eq(vendors.userId, account.id)).limit(1))[0].id;
    capture(vendorId, 'Vendor Invited', { source: input.source, created_account: createdAccount, markets: marketIds.length });
  } else if (marketIds.length) {
    const before = Array.isArray(existing.invitedMarkets) ? existing.invitedMarkets.filter((id): id is string => typeof id === 'string') : [];
    await db
      .update(vendors)
      .set({ invitedMarkets: [...new Set([...before, ...marketIds])].slice(0, 50), updatedAt: new Date() })
      .where(eq(vendors.id, existing.id));
  }

  const notified = input.notify
    ? await sendOrganizerEmail(email, vendorInviteEmail({ businessName, marketNames: (input.markets ?? []).map((market) => market.name) }))
    : false;
  return { ok: true, inviteUrl: vendorSignInUrl(), createdAccount, alreadyVendor: Boolean(existing), notified, vendorId: vendorId! };
}

export type AnnouncementAudience = 'live' | 'all';

async function announcementRecipients(audience: AnnouncementAudience) {
  return getDb()
    .select({ email: userTable.email, token: vendors.unsubscribeToken })
    .from(vendors)
    .innerJoin(userTable, eq(userTable.id, vendors.userId))
    .where(
      and(
        eq(vendors.announcementsOptOut, false),
        eq(userTable.emailVerified, true),
        // `all` still means people who used their account: someone who was
        // only invited and never sent a profile gets no announcements.
        ...(audience === 'live'
          ? [isNotNull(vendors.profile), isNull(vendors.suspendedAt)]
          : [or(isNotNull(vendors.profile), isNotNull(vendors.submittedAt))]),
      ),
    );
}

/** How many vendors each audience reaches right now (opted out excluded). */
export async function announcementAudienceCounts(): Promise<Record<AnnouncementAudience, number>> {
  const [live, all] = await Promise.all([announcementRecipients('live'), announcementRecipients('all')]);
  return { live: live.length, all: all.length };
}

export async function sentAnnouncements() {
  return getDb().select().from(vendorAnnouncements).orderBy(desc(vendorAnnouncements.sentAt)).limit(50);
}

/** One-click target for mail clients (RFC 8058): a POST here opts out. */
function unsubscribeLink(token: string): string {
  return absoluteUrl(`/api/vendor/unsubscribe?token=${token}`);
}

/**
 * The link people click: a page with a button. Opening it changes nothing,
 * so a mail scanner that follows every link does not unsubscribe anyone.
 */
function unsubscribePage(token: string): string {
  return absoluteUrl(`/vendor-emails?token=${token}`);
}

/**
 * One message to every vendor in the audience who has not opted out. Each
 * email carries its own one-click unsubscribe link. The same subject and
 * message cannot be sent twice within ten minutes.
 */
export async function sendVendorAnnouncement(
  admin: SessionUser,
  input: { subject: string; body: string; audience: AnnouncementAudience },
): Promise<VendorActionResult> {
  if (!isAdmin(admin)) return { ok: false, error: 'Not allowed.' };
  const subject = input.subject.trim().replace(/\s+/g, ' ');
  const body = input.body.replace(/\r\n?/g, '\n').trim();
  const fieldErrors: FieldIssue[] = [];
  if (subject.length < 3 || subject.length > 120) fieldErrors.push({ path: 'subject', message: 'Write a subject of 3 to 120 characters' });
  if (body.length < 10 || body.length > 5000) fieldErrors.push({ path: 'body', message: 'Write a message of 10 to 5,000 characters' });
  if (input.audience !== 'live' && input.audience !== 'all') fieldErrors.push({ path: 'audience', message: 'Pick who gets this' });
  if (fieldErrors.length) return { ok: false, error: 'Some fields need a fix before you send.', fieldErrors };

  const config = newsletterMailConfig();
  const logOnly = !config || process.env.ORGANIZER_EMAIL_LOG_ONLY === '1';
  if (logOnly && process.env.NODE_ENV === 'production') return { ok: false, error: 'Email is not configured, so nothing was sent.' };

  const db = getDb();
  const recipients = await announcementRecipients(input.audience);
  if (recipients.length === 0) return { ok: false, error: 'Nobody in that audience can receive announcements yet.' };

  // The record goes in first and is the claim on this send. If the same
  // subject and message were recorded in the last ten minutes (a double
  // click, a retry), the later record backs out, so exactly one send runs.
  const sentAt = new Date();
  const [record] = await db
    .insert(vendorAnnouncements)
    .values({ subject, body, audience: input.audience, recipientCount: 0, sentBy: admin.id, sentAt })
    .returning({ id: vendorAnnouncements.id });
  const [earlier] = await db
    .select({ id: vendorAnnouncements.id })
    .from(vendorAnnouncements)
    .where(
      and(
        eq(vendorAnnouncements.subject, subject),
        eq(vendorAnnouncements.body, body),
        ne(vendorAnnouncements.id, record.id),
        gt(vendorAnnouncements.sentAt, new Date(sentAt.getTime() - 10 * 60 * 1000)),
        or(lt(vendorAnnouncements.sentAt, sentAt), and(eq(vendorAnnouncements.sentAt, sentAt), lt(vendorAnnouncements.id, record.id))),
      ),
    )
    .limit(1);
  if (earlier) {
    await db.delete(vendorAnnouncements).where(eq(vendorAnnouncements.id, record.id));
    return { ok: false, error: 'This exact message was sent a few minutes ago. It was not sent again.' };
  }

  let delivered = 0;
  if (logOnly) {
    for (const recipient of recipients) {
      const content = announcementEmail({ subject, body, unsubscribeUrl: unsubscribePage(recipient.token) });
      console.info(`[vendor announcement] to=${recipient.email} subject="${content.subject}"\n${content.text}`);
      delivered += 1;
    }
  } else {
    for (let start = 0; start < recipients.length; start += 100) {
      const chunk = recipients.slice(start, start + 100);
      const { error } = await config!.resend.batch.send(
        chunk.map((recipient) => ({
          from: config!.from,
          to: recipient.email,
          ...announcementEmail({ subject, body, unsubscribeUrl: unsubscribePage(recipient.token) }),
          // One-click unsubscribe in Gmail and Apple Mail (RFC 8058).
          headers: {
            'List-Unsubscribe': `<${unsubscribeLink(recipient.token)}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        })),
        { idempotencyKey: `vendor-announcement-${record.id}-${start}` },
      );
      if (error) {
        console.error('Vendor announcement batch failed:', error.name);
        break;
      }
      delivered += chunk.length;
    }
  }
  await db.update(vendorAnnouncements).set({ recipientCount: delivered }).where(eq(vendorAnnouncements.id, record.id));
  if (delivered === 0) return { ok: false, error: 'The email service refused the message. Nothing was sent.' };
  return {
    ok: true,
    message:
      delivered === recipients.length
        ? `Sent to ${delivered} ${delivered === 1 ? 'vendor' : 'vendors'}.`
        : `Sent to ${delivered} of ${recipients.length} vendors. The rest failed; check the email service before sending again.`,
  };
}

/** Counts for the admin overview and nav. */
export async function vendorCounts(): Promise<{ total: number; live: number; profilesWaiting: number; applicationsForAdmin: number }> {
  const db = getDb();
  const [[total], [live], queue] = await Promise.all([
    db.select({ n: count() }).from(vendors),
    db.select({ n: count() }).from(vendors).where(and(isNotNull(vendors.profile), isNull(vendors.suspendedAt))),
    vendorReviewQueue(),
  ]);
  return { total: total.n, live: live.n, profilesWaiting: queue.profiles.length, applicationsForAdmin: queue.applications.length };
}

/* ------------------------------------------------------------------ *
 * Shared plumbing
 * ------------------------------------------------------------------ */

/** Product analytics without personal data: vendor ids are opaque, no emails or text. */
function capture(vendorId: string, event: string, properties: Record<string, unknown>) {
  try {
    getPostHogServer()?.capture({ distinctId: `vendor:${vendorId}`, event, properties: { ...properties, $process_person_profile: false } });
  } catch {
    // Analytics never fails a request.
  }
}
