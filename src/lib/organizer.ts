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
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { del } from '@vercel/blob';
import { dbSchema, getDb } from '@/db';
import { getAuth } from './auth';
import { marketService, type FarmerMarket } from '@/app/api/markets/data';
import { getCityForMarketSlug } from './geoIndex';
import {
  SECTION_LABELS,
  changedSections,
  mergeListingEdits,
  parseListingEdits,
  sectionsThatDiffer,
  listingEditsSchema,
  type ListingEdits,
} from './listingEdits';
import { listingEditsFromMarket } from './organizerOverlay';
import { adminEmails, adminReviewAlertEmail, decisionEmail, sendOrganizerEmail } from './organizerEmails';
import { getPostHogServer } from './posthogServer';
import { absoluteUrl } from './site';

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

/** What the editor starts from: the listing as published now. */
export async function editorValuesFor(market: FarmerMarket): Promise<ListingEdits> {
  return listingEditsFromMarket(market);
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
  const parsed = parseListingEdits(input);
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
    })
    .onConflictDoNothing();

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
