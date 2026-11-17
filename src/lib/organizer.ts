/**
 * Market organizer accounts: who is signed in, what they manage, and the
 * review workflow (claims, listing change requests, photos).
 *
 * Every page, server action and route that touches this data authorizes
 * through `requireOrganizer()` / `requireAdmin()` here. `src/proxy.ts` only
 * redirects visitors with no session cookie at all and is never relied on.
 */
import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { del } from '@vercel/blob';
import { dbSchema, getDb } from '@/db';
import { getAuth } from './auth';
import { marketService, type FarmerMarket } from '@/app/api/markets/data';
import { getCityForMarketSlug } from './geoIndex';
import {
  LISTING_SECTIONS,
  SECTION_LABELS,
  changedSections,
  mergeListingEdits,
  parseListingEdits,
  sectionsThatDiffer,
  listingEditsSchema,
  type ListingEdits,
  type ListingSection,
} from './listingEdits';
import { listingEditsFromMarket } from './organizerOverlay';
import { adminEmails, adminReviewAlertEmail, decisionEmail, sendOrganizerEmail } from './organizerEmails';
import { getPostHogServer } from './posthogServer';
import { absoluteUrl } from './site';
import marketPopularity from '../../data/market-popularity.json';

const { user: userTable, marketManagers, marketClaims, marketChangeRequests, marketOverrides, marketPhotos } = dbSchema;

export const MAX_PHOTOS_PER_MARKET = 12;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
}

/* ------------------------------------------------------------------ *
 * Sessions and permissions
 * ------------------------------------------------------------------ */

/** One session lookup per request, shared by layout, page and actions. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  try {
    const session = await getAuth().api.getSession({ headers: await headers() });
    if (!session) return null;
    const { id, name, email, emailVerified } = session.user;
    return { id, name, email, emailVerified };
  } catch (error) {
    console.error('Session lookup failed:', error);
    return null;
  }
});

export function isAdmin(user: SessionUser | null): boolean {
  return Boolean(user?.emailVerified && adminEmails().includes(user.email.toLowerCase()));
}

/** Signed in with a verified email, or redirected to sign in (then back to `next`). */
export async function requireOrganizer(next: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  if (!user.emailVerified) redirect(`/sign-in?next=${encodeURIComponent(next)}&verify=1`);
  return user;
}

/** Admin pages answer 404 to everyone else, so they do not advertise themselves. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!isAdmin(user)) notFound();
  return user as SessionUser;
}

export async function managedMarketIds(userId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ marketId: marketManagers.marketId })
    .from(marketManagers)
    .where(eq(marketManagers.userId, userId));
  return rows.map((row) => row.marketId);
}

export async function canManageMarket(user: SessionUser, marketId: string): Promise<boolean> {
  if (isAdmin(user)) return true;
  const rows = await getDb()
    .select({ marketId: marketManagers.marketId })
    .from(marketManagers)
    .where(and(eq(marketManagers.userId, user.id), eq(marketManagers.marketId, marketId)))
    .limit(1);
  return rows.length > 0;
}

/* ------------------------------------------------------------------ *
 * Markets as organizers see them
 * ------------------------------------------------------------------ */

/** The published listing (dataset + organizer layer), or null for an unknown slug. */
export async function getPublishedMarket(slug: string): Promise<FarmerMarket | null> {
  if (!/^[a-z0-9-]{1,200}$/.test(slug)) return null;
  return marketService.getMarketBySlug(slug);
}

export async function getMarketsByIds(ids: string[]): Promise<FarmerMarket[]> {
  if (ids.length === 0) return [];
  const wanted = new Set(ids);
  const all = await marketService.getAllMarkets();
  return all.filter((market) => wanted.has(market.id));
}

/**
 * What the editor starts from: the listing as published now, every section.
 * Organizers see name and location too; they can suggest changes there, and
 * like everything they send, those changes wait for an admin.
 */
export async function editorValuesFor(market: FarmerMarket, _options: { admin?: boolean } = {}): Promise<ListingEdits> {
  void _options;
  return listingEditsFromMarket(market);
}

/* ------------------------------------------------------------------ *
 * Organizer overview
 * ------------------------------------------------------------------ */

const RECENT_VISITS: Record<string, number> = marketPopularity.markets;
/** How many days `recentVisits` covers (refreshed daily from PostHog, people only). */
export const VISITS_WINDOW_DAYS: number = marketPopularity.window_days;

export interface OrganizerMarketSummary {
  market: FarmerMarket;
  /** Human visits to the listing in the last `VISITS_WINDOW_DAYS` days. */
  recentVisits: number;
  /** Newest update from any manager still waiting for review. */
  pending: { id: string; createdAt: Date; sections: ListingSection[] } | null;
  lastApprovedAt: Date | null;
  lastRejected: { reviewedAt: Date | null; note: string | null } | null;
  photos: { live: number; waiting: number };
}

/** Everything the organizer overview shows, for the markets this account manages. */
export async function organizerOverview(user: SessionUser): Promise<OrganizerMarketSummary[]> {
  const ids = await managedMarketIds(user.id);
  if (ids.length === 0) return [];
  const db = getDb();
  const [markets, changes, photos] = await Promise.all([
    getMarketsByIds(ids),
    db
      .select({
        id: marketChangeRequests.id,
        marketId: marketChangeRequests.marketId,
        status: marketChangeRequests.status,
        changes: marketChangeRequests.changes,
        createdAt: marketChangeRequests.createdAt,
        reviewedAt: marketChangeRequests.reviewedAt,
        reviewNote: marketChangeRequests.reviewNote,
      })
      .from(marketChangeRequests)
      .where(inArray(marketChangeRequests.marketId, ids))
      .orderBy(desc(marketChangeRequests.createdAt)),
    db
      .select({ marketId: marketPhotos.marketId, status: marketPhotos.status, n: count() })
      .from(marketPhotos)
      .where(and(inArray(marketPhotos.marketId, ids), inArray(marketPhotos.status, ['pending', 'approved'])))
      .groupBy(marketPhotos.marketId, marketPhotos.status),
  ]);
  return markets
    .map((market) => {
      const mine = changes.filter((row) => row.marketId === market.id);
      const pendingRow = mine.find((row) => row.status === 'pending');
      const parsed = pendingRow ? listingEditsSchema.safeParse(pendingRow.changes) : null;
      const approved = mine.find((row) => row.status === 'approved');
      const latestReviewed = mine.find((row) => row.status !== 'pending');
      const photoCount = (status: 'pending' | 'approved') =>
        photos.find((row) => row.marketId === market.id && row.status === status)?.n ?? 0;
      return {
        market,
        recentVisits: RECENT_VISITS[market.slug] ?? 0,
        pending: pendingRow
          ? { id: pendingRow.id, createdAt: pendingRow.createdAt, sections: parsed?.success ? changedSections(parsed.data) : [] }
          : null,
        lastApprovedAt: approved ? approved.reviewedAt ?? approved.createdAt : null,
        lastRejected:
          latestReviewed?.status === 'rejected' ? { reviewedAt: latestReviewed.reviewedAt, note: latestReviewed.reviewNote } : null,
        photos: { live: photoCount('approved'), waiting: photoCount('pending') },
      };
    })
    .sort((a, b) => a.market.name.localeCompare(b.market.name));
}

/* ------------------------------------------------------------------ *
 * Claims
 * ------------------------------------------------------------------ */

export interface ClaimInput {
  role: string;
  phone?: string;
  message?: string;
  evidenceUrl?: string;
}

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export async function submitClaim(user: SessionUser, market: FarmerMarket, input: ClaimInput): Promise<ActionResult> {
  const db = getDb();
  if (await canManageMarket(user, market.id)) return { ok: false, error: 'You already manage this market.' };
  const pending = await db
    .select({ id: marketClaims.id })
    .from(marketClaims)
    .where(and(eq(marketClaims.userId, user.id), eq(marketClaims.marketId, market.id), eq(marketClaims.status, 'pending')))
    .limit(1);
  if (pending.length) return { ok: false, error: 'Your claim for this market is already waiting for review.' };

  const [claim] = await db
    .insert(marketClaims)
    .values({
      userId: user.id,
      marketId: market.id,
      role: input.role,
      phone: input.phone || null,
      message: input.message || null,
      evidenceUrl: input.evidenceUrl || null,
    })
    .returning({ id: marketClaims.id });

  await alertAdmins({
    kind: 'claim',
    market,
    user,
    summary: [
      `Role: ${input.role}`,
      ...(input.phone ? [`Phone: ${input.phone}`] : []),
      ...(input.evidenceUrl ? [`Proof: ${input.evidenceUrl}`] : []),
      ...(input.message ? [`Message: ${input.message}`] : []),
      emailDomainHint(user.email, market),
    ],
    reviewPath: `/admin/claims/${claim.id}`,
  });
  capture(user.id, 'Market Claim Submitted', { market_id: market.id });
  return { ok: true, message: 'Thanks. We will email you once your claim is reviewed, usually within two business days.' };
}

/** Admin hint: does the account's email domain match the market's website? */
export function emailDomainHint(email: string, market: Pick<FarmerMarket, 'websites'>): string {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  const hosts = (market.websites ?? []).map((url) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return '';
    }
  });
  const matches = Boolean(domain) && hosts.some((host) => host === domain || host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`));
  return matches ? `Email domain ${domain} matches the market website` : `Email domain ${domain || 'unknown'} does not match the market website`;
}

export async function claimsForUser(userId: string) {
  return getDb()
    .select()
    .from(marketClaims)
    .where(eq(marketClaims.userId, userId))
    .orderBy(desc(marketClaims.createdAt));
}

/* ------------------------------------------------------------------ *
 * Listing change requests
 * ------------------------------------------------------------------ */

export async function submitChangeRequest(user: SessionUser, market: FarmerMarket, input: unknown): Promise<
  ActionResult | { ok: false; error: string; fieldErrors: { path: string; message: string }[] }
> {
  if (!(await canManageMarket(user, market.id))) return { ok: false, error: 'You do not manage this market.' };
  // Organizers may suggest every section, name and location included: nothing
  // they send is published until an admin approves it.
  const parsed = parseListingEdits(input, { admin: true });
  if (!parsed.ok) return { ok: false, error: 'Some fields need a fix before you submit.', fieldErrors: parsed.errors };

  const published = listingEditsFromMarket(market);
  const sections = sectionsThatDiffer(published, parsed.edits);
  const db = getDb();
  if (sections.length === 0) {
    // Everything matches the live listing again: withdraw a waiting update.
    const withdrawn = await db
      .delete(marketChangeRequests)
      .where(
        and(
          eq(marketChangeRequests.userId, user.id),
          eq(marketChangeRequests.marketId, market.id),
          eq(marketChangeRequests.status, 'pending'),
        ),
      )
      .returning({ id: marketChangeRequests.id });
    return withdrawn.length
      ? { ok: true, message: 'Your waiting update was withdrawn, since the listing already says this.' }
      : { ok: false, error: 'Nothing has changed yet.' };
  }
  const changes = Object.fromEntries(sections.map((section) => [section, parsed.edits[section]])) as ListingEdits;

  // One pending request per organizer and market: a new submit replaces it.
  await db.batch([
    db
      .delete(marketChangeRequests)
      .where(
        and(
          eq(marketChangeRequests.userId, user.id),
          eq(marketChangeRequests.marketId, market.id),
          eq(marketChangeRequests.status, 'pending'),
        ),
      ),
    db.insert(marketChangeRequests).values({ userId: user.id, marketId: market.id, changes }),
  ]);
  const [request] = await db
    .select({ id: marketChangeRequests.id })
    .from(marketChangeRequests)
    .where(and(eq(marketChangeRequests.userId, user.id), eq(marketChangeRequests.marketId, market.id), eq(marketChangeRequests.status, 'pending')))
    .limit(1);

  if (!isAdmin(user)) {
    await alertAdmins({
      kind: 'change',
      market,
      user,
      summary: sections.map((section) => `Changed: ${SECTION_LABELS[section]}`),
      reviewPath: `/admin/changes/${request?.id ?? ''}`,
    });
  }
  capture(user.id, 'Listing Change Submitted', { market_id: market.id, sections });
  return { ok: true, message: 'Sent for review. We will email you when it is live.' };
}

export async function pendingChangeFor(userId: string, marketId: string) {
  const [row] = await getDb()
    .select()
    .from(marketChangeRequests)
    .where(and(eq(marketChangeRequests.userId, userId), eq(marketChangeRequests.marketId, marketId), eq(marketChangeRequests.status, 'pending')))
    .orderBy(desc(marketChangeRequests.createdAt))
    .limit(1);
  return row ?? null;
}

export async function recentChangesFor(marketId: string, limit = 5) {
  return getDb()
    .select()
    .from(marketChangeRequests)
    .where(eq(marketChangeRequests.marketId, marketId))
    .orderBy(desc(marketChangeRequests.createdAt))
    .limit(limit);
}

/* ------------------------------------------------------------------ *
 * Photos
 * ------------------------------------------------------------------ */

export async function photosFor(marketId: string, statuses: ('pending' | 'approved' | 'rejected' | 'removed')[] = ['pending', 'approved']) {
  return getDb()
    .select()
    .from(marketPhotos)
    .where(and(eq(marketPhotos.marketId, marketId), inArray(marketPhotos.status, statuses)))
    .orderBy(asc(marketPhotos.sort), asc(marketPhotos.createdAt));
}

/** Blob pathname every organizer upload for a market must use. */
export function photoPathPrefix(marketId: string): string {
  return `markets/${marketId.replace(/[^a-zA-Z0-9_-]/g, '-')}/`;
}

export async function registerPhoto(
  user: SessionUser,
  market: FarmerMarket,
  input: { url: string; pathname: string; width?: number; height?: number; alt?: string },
): Promise<ActionResult> {
  if (!(await canManageMarket(user, market.id))) return { ok: false, error: 'You do not manage this market.' };
  if (!input.pathname.startsWith(photoPathPrefix(market.id))) return { ok: false, error: 'That upload does not belong to this market.' };
  let host = '';
  try {
    host = new URL(input.url).hostname;
  } catch {
    return { ok: false, error: 'That upload link is not valid.' };
  }
  if (!host.endsWith('.public.blob.vercel-storage.com')) return { ok: false, error: 'That upload link is not valid.' };

  const existing = await photosFor(market.id);
  if (existing.length >= MAX_PHOTOS_PER_MARKET) return { ok: false, error: `A listing can have up to ${MAX_PHOTOS_PER_MARKET} photos.` };

  await getDb()
    .insert(marketPhotos)
    .values({
      marketId: market.id,
      blobUrl: input.url,
      pathname: input.pathname,
      width: input.width && input.width > 0 ? Math.round(input.width) : null,
      height: input.height && input.height > 0 ? Math.round(input.height) : null,
      alt: input.alt?.trim().slice(0, 200) || null,
      sort: existing.length,
      uploadedBy: user.id,
      // Admin uploads skip review.
      ...(isAdmin(user) ? { status: 'approved' as const, reviewedAt: new Date() } : {}),
    })
    .onConflictDoNothing();
  if (isAdmin(user)) {
    await revalidateMarket(market.slug);
    return { ok: true, message: 'Photo published.' };
  }

  // One alert per batch: skip it when this market already had a photo waiting.
  const alreadyWaiting = existing.some((photo) => photo.status === 'pending');
  if (!isAdmin(user) && !alreadyWaiting) {
    await alertAdmins({
      kind: 'change',
      market,
      user,
      summary: ['New photos uploaded'],
      reviewPath: `/admin/markets/${market.slug}`,
    });
  }
  capture(user.id, 'Market Photo Uploaded', { market_id: market.id });
  return { ok: true, message: 'Photo uploaded. It will appear once reviewed.' };
}

export async function updatePhotoDetails(
  user: SessionUser,
  market: FarmerMarket,
  photoId: string,
  details: { alt?: string; caption?: string; sort?: number },
): Promise<ActionResult> {
  if (!(await canManageMarket(user, market.id))) return { ok: false, error: 'You do not manage this market.' };
  await getDb()
    .update(marketPhotos)
    .set({
      ...(details.alt !== undefined ? { alt: details.alt.trim().slice(0, 200) || null } : {}),
      ...(details.caption !== undefined ? { caption: details.caption.trim().slice(0, 200) || null } : {}),
      ...(details.sort !== undefined ? { sort: Math.max(0, Math.min(99, Math.round(details.sort))) } : {}),
    })
    .where(and(eq(marketPhotos.id, photoId), eq(marketPhotos.marketId, market.id)));
  await revalidateMarket(market.slug);
  return { ok: true };
}

/** Saves a whole new photo order in one go. Unknown ids are ignored. */
export async function reorderPhotos(user: SessionUser, market: FarmerMarket, photoIds: string[]): Promise<ActionResult> {
  if (!(await canManageMarket(user, market.id))) return { ok: false, error: 'You do not manage this market.' };
  const db = getDb();
  const updates = photoIds
    .slice(0, MAX_PHOTOS_PER_MARKET)
    .filter((id) => /^[0-9a-f-]{36}$/.test(id))
    .map((id, position) =>
      db.update(marketPhotos).set({ sort: position }).where(and(eq(marketPhotos.id, id), eq(marketPhotos.marketId, market.id))),
    );
  if (updates.length === 0) return { ok: false, error: 'Nothing to reorder.' };
  await db.batch(updates as [(typeof updates)[number], ...(typeof updates)[number][]]);
  await revalidateMarket(market.slug);
  return { ok: true };
}

/** Organizers remove their own photos right away; no review needed to take one down. */
export async function removePhoto(user: SessionUser, market: FarmerMarket, photoId: string): Promise<ActionResult> {
  if (!(await canManageMarket(user, market.id))) return { ok: false, error: 'You do not manage this market.' };
  const [photo] = await getDb()
    .update(marketPhotos)
    .set({ status: 'removed' })
    .where(and(eq(marketPhotos.id, photoId), eq(marketPhotos.marketId, market.id)))
    .returning({ url: marketPhotos.blobUrl });
  if (photo) await deleteBlob(photo.url);
  await revalidateMarket(market.slug);
  return { ok: true, message: 'Photo removed.' };
}

async function deleteBlob(url: string) {
  try {
    await del(url);
  } catch (error) {
    console.error('Blob delete failed:', error);
  }
}

/* ------------------------------------------------------------------ *
 * Admin review
 * ------------------------------------------------------------------ */

export async function reviewQueue() {
  const db = getDb();
  const [claims, changes, photos] = await Promise.all([
    db
      .select({ claim: marketClaims, user: { id: userTable.id, name: userTable.name, email: userTable.email } })
      .from(marketClaims)
      .innerJoin(userTable, eq(userTable.id, marketClaims.userId))
      .where(eq(marketClaims.status, 'pending'))
      .orderBy(asc(marketClaims.createdAt)),
    db
      .select({ change: marketChangeRequests, user: { id: userTable.id, name: userTable.name, email: userTable.email } })
      .from(marketChangeRequests)
      .innerJoin(userTable, eq(userTable.id, marketChangeRequests.userId))
      .where(eq(marketChangeRequests.status, 'pending'))
      .orderBy(asc(marketChangeRequests.createdAt)),
    db
      .select({ photo: marketPhotos, uploader: { name: userTable.name, email: userTable.email } })
      .from(marketPhotos)
      .leftJoin(userTable, eq(userTable.id, marketPhotos.uploadedBy))
      .where(eq(marketPhotos.status, 'pending'))
      .orderBy(asc(marketPhotos.createdAt)),
  ]);
  const legacyClaims = await db
    .select()
    .from(dbSchema.submissions)
    .where(and(eq(dbSchema.submissions.type, 'claim'), eq(dbSchema.submissions.status, 'pending')))
    .orderBy(asc(dbSchema.submissions.createdAt));
  const marketIds = [...new Set([...claims.map((c) => c.claim.marketId), ...changes.map((c) => c.change.marketId), ...photos.map((p) => p.photo.marketId)])];
  const markets = new Map((await getMarketsByIds(marketIds)).map((market) => [market.id, market]));
  // `photos` keeps its row shape for the queue UI; `photoUploaders` adds who sent each one.
  return {
    claims,
    changes,
    photos: photos.map((row) => row.photo),
    photoUploaders: new Map(photos.map((row) => [row.photo.id, row.uploader])),
    legacyClaims,
    markets,
  };
}

export async function getClaimForReview(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [row] = await getDb()
    .select({ claim: marketClaims, user: { id: userTable.id, name: userTable.name, email: userTable.email } })
    .from(marketClaims)
    .innerJoin(userTable, eq(userTable.id, marketClaims.userId))
    .where(eq(marketClaims.id, id))
    .limit(1);
  if (!row) return null;
  const [market] = await getMarketsByIds([row.claim.marketId]);
  return { ...row, market: market ?? null };
}

export async function getChangeForReview(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [row] = await getDb()
    .select({ change: marketChangeRequests, user: { id: userTable.id, name: userTable.name, email: userTable.email } })
    .from(marketChangeRequests)
    .innerJoin(userTable, eq(userTable.id, marketChangeRequests.userId))
    .where(eq(marketChangeRequests.id, id))
    .limit(1);
  if (!row) return null;
  const [base] = await getMarketsByIds([row.change.marketId]);
  const market = base ? await getPublishedMarket(base.slug) : null;
  const proposed = listingEditsSchema.safeParse(row.change.changes);
  return {
    ...row,
    market,
    published: market ? listingEditsFromMarket(market) : {},
    proposed: proposed.success ? proposed.data : {},
  };
}

export async function decideClaim(admin: SessionUser, id: string, approve: boolean, note?: string): Promise<ActionResult> {
  const review = await getClaimForReview(id);
  if (!review || review.claim.status !== 'pending') return { ok: false, error: 'This claim was already reviewed.' };
  const db = getDb();
  const now = new Date();
  await db.batch([
    db
      .update(marketClaims)
      .set({ status: approve ? 'approved' : 'rejected', reviewNote: note || null, reviewedAt: now, reviewedBy: admin.id })
      .where(eq(marketClaims.id, id)),
    ...(approve
      ? [
          db
            .insert(marketManagers)
            .values({ userId: review.claim.userId, marketId: review.claim.marketId, approvedBy: admin.id })
            .onConflictDoNothing(),
        ]
      : []),
  ]);
  if (review.market) {
    await sendOrganizerEmail(
      review.user.email,
      decisionEmail({ kind: 'claim', approved: approve, marketName: review.market.name, marketSlug: review.market.slug, note }),
    );
  }
  capture(review.claim.userId, approve ? 'Market Claim Approved' : 'Market Claim Rejected', { market_id: review.claim.marketId });
  return { ok: true, message: approve ? 'Claim approved.' : 'Claim rejected.' };
}

/** Approving publishes: the change merges into `market_overrides` and the pages refresh. */
export async function decideChange(admin: SessionUser, id: string, approve: boolean, note?: string): Promise<ActionResult> {
  const review = await getChangeForReview(id);
  if (!review || review.change.status !== 'pending') return { ok: false, error: 'This update was already reviewed.' };
  if (!review.market && approve) return { ok: false, error: 'That market is no longer in the dataset, so this update can only be rejected.' };
  const db = getDb();
  const now = new Date();

  if (approve) {
    const [current] = await db.select().from(marketOverrides).where(eq(marketOverrides.marketId, review.change.marketId)).limit(1);
    const currentEdits = current ? listingEditsSchema.safeParse(current.data) : null;
    const merged = mergeListingEdits(currentEdits?.success ? currentEdits.data : undefined, review.proposed);
    await db.batch([
      db
        .insert(marketOverrides)
        .values({ marketId: review.change.marketId, data: merged, updatedAt: now, updatedBy: admin.id })
        .onConflictDoUpdate({ target: marketOverrides.marketId, set: { data: merged, updatedAt: now, updatedBy: admin.id } }),
      db
        .update(marketChangeRequests)
        .set({ status: 'approved', reviewNote: note || null, reviewedAt: now, reviewedBy: admin.id, updatedAt: now })
        .where(eq(marketChangeRequests.id, id)),
    ]);
    await revalidateMarket(review.market!.slug);
  } else {
    await db
      .update(marketChangeRequests)
      .set({ status: 'rejected', reviewNote: note || null, reviewedAt: now, reviewedBy: admin.id, updatedAt: now })
      .where(eq(marketChangeRequests.id, id));
  }

  if (review.user.id !== admin.id && review.market) {
    await sendOrganizerEmail(
      review.user.email,
      decisionEmail({ kind: 'change', approved: approve, marketName: review.market.name, marketSlug: review.market.slug, note }),
    );
  }
  capture(review.user.id, approve ? 'Listing Change Approved' : 'Listing Change Rejected', {
    market_id: review.change.marketId,
    sections: changedSections(review.proposed),
  });
  return { ok: true, message: approve ? 'Published.' : 'Rejected.' };
}

export async function decidePhoto(admin: SessionUser, photoId: string, approve: boolean): Promise<ActionResult> {
  if (!/^[0-9a-f-]{36}$/.test(photoId)) return { ok: false, error: 'Unknown photo.' };
  const db = getDb();
  const [photo] = await db
    .update(marketPhotos)
    .set({ status: approve ? 'approved' : 'rejected', reviewedAt: new Date() })
    .where(and(eq(marketPhotos.id, photoId), eq(marketPhotos.status, 'pending')))
    .returning();
  if (!photo) return { ok: false, error: 'This photo was already reviewed.' };
  if (!approve) await deleteBlob(photo.blobUrl);
  const [market] = await getMarketsByIds([photo.marketId]);
  if (market) await revalidateMarket(market.slug);
  void admin;
  return { ok: true, message: approve ? 'Photo published.' : 'Photo rejected.' };
}

/** Admin: who manages a market, and revoke access. */
export async function managersFor(marketId: string) {
  return getDb()
    .select({ userId: marketManagers.userId, createdAt: marketManagers.createdAt, name: userTable.name, email: userTable.email })
    .from(marketManagers)
    .innerJoin(userTable, eq(userTable.id, marketManagers.userId))
    .where(eq(marketManagers.marketId, marketId));
}

export async function revokeManager(marketId: string, userId: string): Promise<ActionResult> {
  const removed = await getDb()
    .delete(marketManagers)
    .where(and(eq(marketManagers.marketId, marketId), eq(marketManagers.userId, userId)))
    .returning({ userId: marketManagers.userId });
  if (removed.length === 0) return { ok: false, error: 'That person does not manage this market.' };
  return { ok: true, message: 'Access removed.' };
}

/** Close an old contact-form claim once it has been handled (or moved to an organizer account). */
export async function markLegacySubmissionReviewed(id: string, note?: string): Promise<ActionResult> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, error: 'Unknown request.' };
  const updated = await getDb()
    .update(dbSchema.submissions)
    .set({ status: 'reviewed', reviewedAt: new Date(), reviewNote: note || null })
    .where(and(eq(dbSchema.submissions.id, id), eq(dbSchema.submissions.status, 'pending')))
    .returning({ id: dbSchema.submissions.id });
  return updated.length ? { ok: true, message: 'Marked as handled.' } : { ok: false, error: 'Already handled.' };
}

/* ------------------------------------------------------------------ *
 * Admin editing: publish directly, reset sections, managers, overview
 * ------------------------------------------------------------------ */

async function currentOverride(marketId: string): Promise<ListingEdits | undefined> {
  const [row] = await getDb().select().from(marketOverrides).where(eq(marketOverrides.marketId, marketId)).limit(1);
  if (!row) return undefined;
  const parsed = listingEditsSchema.safeParse(row.data);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Admin edits publish right away. A history row (already approved) keeps
 * the record of who changed what, next to organizer updates.
 */
export async function adminPublish(admin: SessionUser, market: FarmerMarket, input: unknown): Promise<
  ActionResult | { ok: false; error: string; fieldErrors: { path: string; message: string }[] }
> {
  if (!isAdmin(admin)) return { ok: false, error: 'Not allowed.' };
  const parsed = parseListingEdits(input, { admin: true });
  if (!parsed.ok) return { ok: false, error: 'Some fields need a fix before you publish.', fieldErrors: parsed.errors };
  const sections = sectionsThatDiffer(listingEditsFromMarket(market), parsed.edits);
  if (sections.length === 0) return { ok: false, error: 'Nothing has changed yet.' };
  const changes = Object.fromEntries(sections.map((section) => [section, parsed.edits[section]])) as ListingEdits;

  const db = getDb();
  const now = new Date();
  const merged = mergeListingEdits(await currentOverride(market.id), changes);
  await db.batch([
    db
      .insert(marketOverrides)
      .values({ marketId: market.id, data: merged, updatedAt: now, updatedBy: admin.id })
      .onConflictDoUpdate({ target: marketOverrides.marketId, set: { data: merged, updatedAt: now, updatedBy: admin.id } }),
    db.insert(marketChangeRequests).values({
      marketId: market.id,
      userId: admin.id,
      changes,
      status: 'approved',
      reviewNote: 'Published by an admin',
      reviewedAt: now,
      reviewedBy: admin.id,
      updatedAt: now,
    }),
  ]);
  await revalidateMarket(market.slug);
  capture(admin.id, 'Listing Edited By Admin', { market_id: market.id, sections });
  return { ok: true, message: `Published: ${sections.map((section) => SECTION_LABELS[section]).join(', ')}.` };
}

/** Puts sections back to what the dataset says, dropping the published edits for them. */
export async function resetSections(admin: SessionUser, market: FarmerMarket, sections: ListingSection[]): Promise<ActionResult> {
  if (!isAdmin(admin)) return { ok: false, error: 'Not allowed.' };
  const wanted = sections.filter((section) => (LISTING_SECTIONS as readonly string[]).includes(section));
  const current = await currentOverride(market.id);
  if (!current || wanted.every((section) => current[section] === undefined)) {
    return { ok: false, error: 'Those sections already match the original data.' };
  }
  const next: ListingEdits = { ...current };
  for (const section of wanted) delete next[section];
  const db = getDb();
  if (Object.keys(next).length === 0) {
    await db.delete(marketOverrides).where(eq(marketOverrides.marketId, market.id));
  } else {
    await db
      .update(marketOverrides)
      .set({ data: next, updatedAt: new Date(), updatedBy: admin.id })
      .where(eq(marketOverrides.marketId, market.id));
  }
  await revalidateMarket(market.slug);
  return { ok: true, message: `Reset to the original data: ${wanted.map((section) => SECTION_LABELS[section]).join(', ')}.` };
}

/** Which sections currently carry published edits (organizer or admin) for a market. */
export async function editedSectionsFor(marketId: string): Promise<ListingSection[]> {
  const current = await currentOverride(marketId);
  return current ? changedSections(current) : [];
}

/** Admin: give an existing, verified account manager access without a claim. */
export async function addManagerByEmail(admin: SessionUser, market: FarmerMarket, email: string): Promise<ActionResult> {
  if (!isAdmin(admin)) return { ok: false, error: 'Not allowed.' };
  const address = email.trim().toLowerCase();
  const [account] = await getDb()
    .select({ id: userTable.id, emailVerified: userTable.emailVerified })
    .from(userTable)
    .where(eq(userTable.email, address))
    .limit(1);
  if (!account) return { ok: false, error: 'No account uses that email yet. Ask them to sign up first.' };
  if (!account.emailVerified) return { ok: false, error: 'That account has not confirmed its email yet.' };
  const inserted = await getDb()
    .insert(marketManagers)
    .values({ userId: account.id, marketId: market.id, approvedBy: admin.id })
    .onConflictDoNothing()
    .returning({ userId: marketManagers.userId });
  if (inserted.length === 0) return { ok: false, error: 'They already manage this market.' };
  await revalidateMarket(market.slug);
  return { ok: true, message: 'Access granted.' };
}

/** Numbers and recent activity for the admin overview. */
export async function adminOverview() {
  const db = getDb();
  const [
    [claimsPending],
    [changesPending],
    [photosPending],
    [accounts],
    [verifiedAccounts],
    [managedMarkets],
    [editedMarkets],
    [photosLive],
    recentClaims,
    recentChanges,
    recentPhotos,
    recentAccounts,
  ] = await Promise.all([
    db.select({ n: count() }).from(marketClaims).where(eq(marketClaims.status, 'pending')),
    db.select({ n: count() }).from(marketChangeRequests).where(eq(marketChangeRequests.status, 'pending')),
    db.select({ n: count() }).from(marketPhotos).where(eq(marketPhotos.status, 'pending')),
    db.select({ n: count() }).from(userTable),
    db.select({ n: count() }).from(userTable).where(eq(userTable.emailVerified, true)),
    db.select({ n: sql<number>`count(distinct ${marketManagers.marketId})` }).from(marketManagers),
    db.select({ n: count() }).from(marketOverrides),
    db.select({ n: count() }).from(marketPhotos).where(eq(marketPhotos.status, 'approved')),
    db
      .select({ claim: marketClaims, user: { name: userTable.name, email: userTable.email } })
      .from(marketClaims)
      .innerJoin(userTable, eq(userTable.id, marketClaims.userId))
      .orderBy(desc(marketClaims.createdAt))
      .limit(10),
    db
      .select({ change: marketChangeRequests, user: { name: userTable.name, email: userTable.email } })
      .from(marketChangeRequests)
      .innerJoin(userTable, eq(userTable.id, marketChangeRequests.userId))
      .orderBy(desc(marketChangeRequests.updatedAt))
      .limit(10),
    db.select().from(marketPhotos).orderBy(desc(marketPhotos.createdAt)).limit(10),
    db
      .select({ id: userTable.id, name: userTable.name, email: userTable.email, emailVerified: userTable.emailVerified, createdAt: userTable.createdAt })
      .from(userTable)
      .orderBy(desc(userTable.createdAt))
      .limit(5),
  ]);
  const marketIds = [
    ...new Set([
      ...recentClaims.map((row) => row.claim.marketId),
      ...recentChanges.map((row) => row.change.marketId),
      ...recentPhotos.map((row) => row.marketId),
    ]),
  ];
  const markets = new Map((await getMarketsByIds(marketIds)).map((market) => [market.id, market]));

  type Activity = {
    kind: 'claim' | 'change' | 'photo';
    at: Date;
    status: string;
    marketId: string;
    who?: { name: string; email: string };
    detail: string;
    href: string;
  };
  const activity: Activity[] = [
    ...recentClaims.map((row) => ({
      kind: 'claim' as const,
      at: row.claim.reviewedAt ?? row.claim.createdAt,
      status: row.claim.status,
      marketId: row.claim.marketId,
      who: row.user,
      detail: `Claim as ${row.claim.role}`,
      href: `/admin/claims/${row.claim.id}`,
    })),
    ...recentChanges.map((row) => {
      const parsed = listingEditsSchema.safeParse(row.change.changes);
      const labels = parsed.success ? changedSections(parsed.data).map((section) => SECTION_LABELS[section]) : [];
      return {
        kind: 'change' as const,
        at: row.change.reviewedAt ?? row.change.createdAt,
        status: row.change.status,
        marketId: row.change.marketId,
        who: row.user,
        detail: labels.join(', ') || 'Listing update',
        href: `/admin/changes/${row.change.id}`,
      };
    }),
    ...recentPhotos.map((photo) => ({
      kind: 'photo' as const,
      at: photo.reviewedAt ?? photo.createdAt,
      status: photo.status,
      marketId: photo.marketId,
      detail: 'Photo',
      href: `/admin/markets/${markets.get(photo.marketId)?.slug ?? ''}`,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 15);

  return {
    counts: {
      claimsPending: claimsPending.n,
      changesPending: changesPending.n,
      photosPending: photosPending.n,
      accounts: accounts.n,
      verifiedAccounts: verifiedAccounts.n,
      managedMarkets: Number(managedMarkets.n),
      editedMarkets: editedMarkets.n,
      photosLive: photosLive.n,
    },
    activity,
    recentAccounts,
    markets,
  };
}

/** Markets that carry published edits or have managers, newest edit first. */
export async function adminEditedMarkets() {
  const db = getDb();
  const [overrides, managers] = await Promise.all([
    db.select({ marketId: marketOverrides.marketId, updatedAt: marketOverrides.updatedAt, data: marketOverrides.data }).from(marketOverrides),
    db
      .select({ marketId: marketManagers.marketId, managers: count() })
      .from(marketManagers)
      .groupBy(marketManagers.marketId),
  ]);
  const managerCount = new Map(managers.map((row) => [row.marketId, row.managers]));
  const ids = [...new Set([...overrides.map((row) => row.marketId), ...managers.map((row) => row.marketId)])];
  const markets = await getMarketsByIds(ids);
  const overrideFor = new Map(overrides.map((row) => [row.marketId, row]));
  return markets
    .map((market) => {
      const override = overrideFor.get(market.id);
      const parsed = override ? listingEditsSchema.safeParse(override.data) : null;
      return {
        market,
        updatedAt: override?.updatedAt ?? null,
        sections: parsed?.success ? changedSections(parsed.data) : [],
        managers: managerCount.get(market.id) ?? 0,
      };
    })
    .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
}

/** Every organizer account with what they manage and have claimed. */
export async function adminOrganizers() {
  const db = getDb();
  const [users, managers, claims] = await Promise.all([
    db
      .select({ id: userTable.id, name: userTable.name, email: userTable.email, emailVerified: userTable.emailVerified, createdAt: userTable.createdAt })
      .from(userTable)
      .orderBy(desc(userTable.createdAt))
      .limit(500),
    db.select({ userId: marketManagers.userId, marketId: marketManagers.marketId }).from(marketManagers),
    db
      .select({ userId: marketClaims.userId, marketId: marketClaims.marketId, status: marketClaims.status, id: marketClaims.id })
      .from(marketClaims),
  ]);
  const markets = new Map(
    (await getMarketsByIds([...new Set([...managers.map((m) => m.marketId), ...claims.map((c) => c.marketId)])])).map((market) => [market.id, market]),
  );
  return users.map((account) => ({
    ...account,
    admin: isAdmin({ ...account, emailVerified: account.emailVerified }),
    manages: managers.filter((row) => row.userId === account.id).map((row) => markets.get(row.marketId)).filter(Boolean) as FarmerMarket[],
    claims: claims
      .filter((row) => row.userId === account.id)
      .map((row) => ({ ...row, market: markets.get(row.marketId) ?? null })),
  }));
}

/* ------------------------------------------------------------------ *
 * Shared plumbing
 * ------------------------------------------------------------------ */

/** Refresh the pages that show this market: its page, its city and its state. */
export async function revalidateMarket(slug: string) {
  revalidatePath(`/markets/${slug}`);
  const placement = await getCityForMarketSlug(slug).catch(() => null);
  if (placement) {
    revalidatePath(`/${placement.state.slug}/${placement.city.slug}`);
    revalidatePath(`/${placement.state.slug}`);
  }
}

async function alertAdmins(input: {
  kind: 'claim' | 'change';
  market: FarmerMarket;
  user: SessionUser;
  summary: string[];
  reviewPath: string;
}) {
  const to = adminEmails();
  if (to.length === 0) return;
  await sendOrganizerEmail(
    to,
    adminReviewAlertEmail({
      kind: input.kind,
      marketName: input.market.name,
      marketSlug: input.market.slug,
      organizerName: input.user.name,
      organizerEmail: input.user.email,
      summary: input.summary,
      reviewUrl: absoluteUrl(input.reviewPath),
    }),
    input.user.email,
  );
}

/** Product analytics without personal data: user ids are opaque, no emails or text. */
function capture(userId: string, event: string, properties: Record<string, unknown>) {
  try {
    getPostHogServer()?.capture({ distinctId: `organizer:${userId}`, event, properties: { ...properties, $process_person_profile: false } });
  } catch {
    // Analytics never fails a request.
  }
}
