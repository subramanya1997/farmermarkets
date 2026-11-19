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
import { cookies, headers } from 'next/headers';
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
import { adminEmails, adminReviewAlertEmail, decisionEmail, managerInviteEmail, sendOrganizerEmail } from './organizerEmails';
import { getPostHogServer } from './posthogServer';
import { absoluteUrl } from './site';
import { webPhotoForUpload } from './photoConvert';
import { UPLOAD_PHOTO_TYPES } from './photoTypes';
import marketPopularity from '../../data/market-popularity.json';

const { user: userTable, marketManagers, marketClaims, marketChangeRequests, marketOverrides, marketPhotos } = dbSchema;

export const MAX_PHOTOS_PER_MARKET = 12;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
/** HEIC/HEIF uploads are converted to JPEG in `registerPhoto` (src/lib/photoConvert.ts). */
export const PHOTO_CONTENT_TYPES = UPLOAD_PHOTO_TYPES;

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

/**
 * Admins can preview the organizer dashboard for any market, as if they had
 * claimed it. The choice lives in a cookie scoped to /dashboard; it is ignored
 * for anyone who is not an admin.
 */
export const ORGANIZER_PREVIEW_COOKIE = 'fm_organizer_preview';

export const organizerPreviewMarket = cache(async (user: SessionUser | null): Promise<FarmerMarket | null> => {
  if (!isAdmin(user)) return null;
  const slug = (await cookies()).get(ORGANIZER_PREVIEW_COOKIE)?.value ?? '';
  return slug ? getPublishedMarket(slug) : null;
});

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

/** The account's claim for a market that is still waiting for review, if any. */
export async function pendingClaimFor(userId: string, marketId: string) {
  const [row] = await getDb()
    .select()
    .from(marketClaims)
    .where(and(eq(marketClaims.userId, userId), eq(marketClaims.marketId, marketId), eq(marketClaims.status, 'pending')))
    .orderBy(desc(marketClaims.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * May this account open the listing editor and upload photos? Managers can,
 * and so can someone whose claim is still waiting: they start editing right
 * away, and nothing they send goes live until an admin approves the claim.
 */
export async function canEditMarket(user: SessionUser, marketId: string): Promise<boolean> {
  if (await canManageMarket(user, marketId)) return true;
  return Boolean(await pendingClaimFor(user.id, marketId));
}

/**
 * Which photos of a market this account may change: all of them for a
 * manager, only its own uploads while a claim is waiting (so nobody can touch
 * live photos before we confirm them). Null means no access at all.
 */
async function photoAccess(user: SessionUser, marketId: string) {
  if (await canManageMarket(user, marketId)) return eq(marketPhotos.marketId, marketId);
  if (await pendingClaimFor(user.id, marketId)) return and(eq(marketPhotos.marketId, marketId), eq(marketPhotos.uploadedBy, user.id));
  return null;
}

/** Market ids this account has a claim waiting for. */
async function pendingClaimMarketIds(userId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ marketId: marketClaims.marketId })
    .from(marketClaims)
    .where(and(eq(marketClaims.userId, userId), eq(marketClaims.status, 'pending')));
  return [...new Set(rows.map((row) => row.marketId))];
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
  /** True while this account's claim is waiting: it can edit, but nothing goes live until the claim is approved. */
  awaitingClaim: boolean;
}

/** Everything the organizer overview shows, for the markets this account manages or has a claim waiting for. */
export async function organizerOverview(user: SessionUser): Promise<OrganizerMarketSummary[]> {
  const preview = await organizerPreviewMarket(user);
  const [managed, claimed] = preview ? [[preview.id], []] : await Promise.all([managedMarketIds(user.id), pendingClaimMarketIds(user.id)]);
  const managedIds = new Set(managed);
  const ids = [...new Set([...managed, ...claimed])];
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
        awaitingClaim: !managedIds.has(market.id),
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
  return { ok: true, message: 'You can start editing now. Your changes go live once we confirm you run this market.' };
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
  if (!(await canEditMarket(user, market.id))) return { ok: false, error: 'You do not manage this market.' };
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

  // While a claim waits, its review page shows these edits; one email (the claim's) is enough.
  if (!isAdmin(user) && (await canManageMarket(user, market.id))) {
    await alertAdmins({
      kind: 'change',
      market,
      user,
      summary: sections.map((section) => `Changed: ${SECTION_LABELS[section]}`),
      reviewPath: `/admin/changes/${request?.id ?? ''}`,
    });
  }
  capture(user.id, 'Listing Change Submitted', { market_id: market.id, sections });
  return {
    ok: true,
    message: (await canManageMarket(user, market.id))
      ? 'Sent for review. We will email you when it is live.'
      : 'Saved. It goes live as soon as we confirm you run this market.',
  };
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
  if (!(await canEditMarket(user, market.id))) return { ok: false, error: 'You do not manage this market.' };
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
  const web = await webPhotoForUpload(input);
  if (!web.ok) return web;
  input = { ...input, ...web.photo };

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
  const manages = await canManageMarket(user, market.id);
  if (manages && !alreadyWaiting) {
    await alertAdmins({
      kind: 'change',
      market,
      user,
      summary: ['New photos uploaded'],
      reviewPath: `/admin/markets/${market.slug}`,
    });
  }
  capture(user.id, 'Market Photo Uploaded', { market_id: market.id });
  return {
    ok: true,
    message: manages ? 'Photo uploaded. It will appear once reviewed.' : 'Photo uploaded. It goes live once we confirm you run this market.',
  };
}

export async function updatePhotoDetails(
  user: SessionUser,
  market: FarmerMarket,
  photoId: string,
  details: { alt?: string; caption?: string; sort?: number },
): Promise<ActionResult> {
  const scope = await photoAccess(user, market.id);
  if (!scope) return { ok: false, error: 'You do not manage this market.' };
  await getDb()
    .update(marketPhotos)
    .set({
      ...(details.alt !== undefined ? { alt: details.alt.trim().slice(0, 200) || null } : {}),
      ...(details.caption !== undefined ? { caption: details.caption.trim().slice(0, 200) || null } : {}),
      ...(details.sort !== undefined ? { sort: Math.max(0, Math.min(99, Math.round(details.sort))) } : {}),
    })
    .where(and(eq(marketPhotos.id, photoId), scope));
  await revalidateMarket(market.slug);
  return { ok: true };
}

/** Saves a whole new photo order in one go. Unknown ids are ignored. */
export async function reorderPhotos(user: SessionUser, market: FarmerMarket, photoIds: string[]): Promise<ActionResult> {
  const scope = await photoAccess(user, market.id);
  if (!scope) return { ok: false, error: 'You do not manage this market.' };
  const db = getDb();
  const updates = photoIds
    .slice(0, MAX_PHOTOS_PER_MARKET)
    .filter((id) => /^[0-9a-f-]{36}$/.test(id))
    .map((id, position) =>
      db.update(marketPhotos).set({ sort: position }).where(and(eq(marketPhotos.id, id), scope)),
    );
  if (updates.length === 0) return { ok: false, error: 'Nothing to reorder.' };
  await db.batch(updates as [(typeof updates)[number], ...(typeof updates)[number][]]);
  await revalidateMarket(market.slug);
  return { ok: true };
}

/** Organizers remove their own photos right away; no review needed to take one down. */
export async function removePhoto(user: SessionUser, market: FarmerMarket, photoId: string): Promise<ActionResult> {
  const scope = await photoAccess(user, market.id);
  if (!scope) return { ok: false, error: 'You do not manage this market.' };
  const [photo] = await getDb()
    .update(marketPhotos)
    .set({ status: 'removed' })
    .where(and(eq(marketPhotos.id, photoId), scope))
    .returning({ url: marketPhotos.blobUrl });
  if (photo) await deleteBlob(photo.url);
  await revalidateMarket(market.slug);
  return { ok: true, message: 'Photo removed.' };
}

export async function deleteBlob(url: string) {
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
  const [legacyClaims, botRequests] = await Promise.all([
    db
      .select()
      .from(dbSchema.submissions)
      .where(and(eq(dbSchema.submissions.type, 'claim'), eq(dbSchema.submissions.status, 'pending')))
      .orderBy(asc(dbSchema.submissions.createdAt)),
    // Removals and closures the outreach bot may not publish (src/lib/botActions.ts).
    db.select().from(dbSchema.botActions).where(eq(dbSchema.botActions.status, 'pending')).orderBy(asc(dbSchema.botActions.createdAt)),
  ]);
  const marketIds = [
    ...new Set([
      ...claims.map((c) => c.claim.marketId),
      ...changes.map((c) => c.change.marketId),
      ...photos.map((p) => p.photo.marketId),
      ...botRequests.map((row) => row.marketId),
    ]),
  ];
  const markets = new Map((await getMarketsByIds(marketIds)).map((market) => [market.id, market]));
  // `photos` keeps its row shape for the queue UI; `photoUploaders` adds who sent each one.
  return {
    claims,
    changes,
    photos: photos.map((row) => row.photo),
    photoUploaders: new Map(photos.map((row) => [row.photo.id, row.uploader])),
    legacyClaims,
    botRequests,
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
  const db = getDb();
  const [[base], changeRows, photos] = await Promise.all([
    getMarketsByIds([row.claim.marketId]),
    // What the claimant already edited while waiting: approving the claim publishes it.
    db
      .select({ id: marketChangeRequests.id })
      .from(marketChangeRequests)
      .where(
        and(
          eq(marketChangeRequests.userId, row.claim.userId),
          eq(marketChangeRequests.marketId, row.claim.marketId),
          eq(marketChangeRequests.status, 'pending'),
        ),
      )
      .orderBy(desc(marketChangeRequests.createdAt))
      .limit(1),
    db
      .select()
      .from(marketPhotos)
      .where(
        and(
          eq(marketPhotos.marketId, row.claim.marketId),
          eq(marketPhotos.uploadedBy, row.claim.userId),
          eq(marketPhotos.status, 'pending'),
        ),
      )
      .orderBy(asc(marketPhotos.sort)),
  ]);
  const change = changeRows[0] ? await getChangeForReview(changeRows[0].id) : null;
  return { ...row, market: base ?? null, change, photos };
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

/**
 * One decision covers everything the claimant sent while waiting: approving
 * the claim also publishes their listing edits and photos, and rejecting it
 * turns those down too. They get a single email.
 */
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
  if (review.change) await decideChange(admin, review.change.change.id, approve, undefined, { notify: false });
  for (const photo of review.photos) await decidePhoto(admin, photo.id, approve);
  const published = approve && Boolean(review.change || review.photos.length);
  if (review.market) {
    await sendOrganizerEmail(
      review.user.email,
      decisionEmail({
        kind: 'claim',
        approved: approve,
        marketName: review.market.name,
        marketSlug: review.market.slug,
        note,
        published,
      }),
    );
  }
  capture(review.claim.userId, approve ? 'Market Claim Approved' : 'Market Claim Rejected', { market_id: review.claim.marketId });
  return { ok: true, message: approve ? 'Claim approved.' : 'Claim rejected.' };
}

/** Approving publishes: the change merges into `market_overrides` and the pages refresh. */
export async function decideChange(
  admin: SessionUser,
  id: string,
  approve: boolean,
  note?: string,
  options: { notify?: boolean } = {},
): Promise<ActionResult> {
  const review = await getChangeForReview(id);
  if (!review || review.change.status !== 'pending') return { ok: false, error: 'This update was already reviewed.' };
  if (!review.market && approve) return { ok: false, error: 'That market is no longer in the dataset, so this update can only be rejected.' };
  const db = getDb();
  const now = new Date();

  if (approve) {
    const merged = mergeListingEdits(await currentOverride(review.change.marketId), review.proposed);
    await db.batch([
      upsertOverride(review.change.marketId, merged, admin.id, now),
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

  if (options.notify !== false && review.user.id !== admin.id && review.market) {
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

/** The published edits for a market, if any. */
export async function currentOverride(marketId: string): Promise<ListingEdits | undefined> {
  const [row] = await getDb().select().from(marketOverrides).where(eq(marketOverrides.marketId, marketId)).limit(1);
  if (!row) return undefined;
  const parsed = listingEditsSchema.safeParse(row.data);
  return parsed.success ? parsed.data : undefined;
}

/**
 * The one way published edits are stored: the whole merged `ListingEdits`
 * for a market (merge with `mergeListingEdits` first). Returned unexecuted
 * so callers batch it with their history row.
 */
export function upsertOverride(marketId: string, merged: ListingEdits, updatedBy: string, now = new Date()) {
  return getDb()
    .insert(marketOverrides)
    .values({ marketId, data: merged, updatedAt: now, updatedBy })
    .onConflictDoUpdate({ target: marketOverrides.marketId, set: { data: merged, updatedAt: now, updatedBy } });
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
    upsertOverride(market.id, merged, admin.id, now),
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

/** Who approved access granted by the outreach bot, in `market_managers.approved_by` and `market_claims.reviewed_by`. */
export const OUTREACH_BOT_REVIEWER = 'outreach-bot';

export interface BotGrantInput {
  email: string;
  name?: string;
  role?: string;
  note?: string;
  /** Also send our own "you can now update this listing" email with the claim link. */
  notify?: boolean;
}

export type BotGrantResult =
  | {
      ok: true;
      claimUrl: string;
      createdAccount: boolean;
      alreadyManager: boolean;
      notified: boolean;
    }
  | { ok: false; status: 400 | 403; error: string };

/**
 * The outreach bot (see docs/organizer-bot.md) vouches for someone the
 * operator conversation already confirmed: they get an account for their
 * email, if they have none, and manager access to the market, recorded as
 * an approved claim. They sign in at /markets/<slug>/claim with a code sent
 * to that email, so access only ever reaches whoever reads that inbox.
 *
 * A new account starts verified (it has no password, so nobody else can use
 * it). An existing account is left as it is: an unverified one is proven by
 * the first code sign-in, which also drops any password set before that.
 */
export async function grantMarketAccessFromBot(market: FarmerMarket, input: BotGrantInput): Promise<BotGrantResult> {
  const email = input.email.trim().toLowerCase();
  if (adminEmails().includes(email)) {
    return { ok: false, status: 403, error: 'Admin accounts cannot be set up through the bot.' };
  }
  const db = getDb();
  const name = input.name?.trim().slice(0, 120) || '';

  let [account] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, email)).limit(1);
  let createdAccount = false;
  if (!account) {
    [account] = await db
      .insert(userTable)
      .values({ id: crypto.randomUUID(), email, name, emailVerified: true })
      .onConflictDoNothing()
      .returning({ id: userTable.id });
    if (account) {
      createdAccount = true;
    } else {
      // Created by a sign-up in the meantime.
      [account] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, email)).limit(1);
    }
  }

  const granted = await db
    .insert(marketManagers)
    .values({ userId: account.id, marketId: market.id, approvedBy: OUTREACH_BOT_REVIEWER })
    .onConflictDoNothing()
    .returning({ userId: marketManagers.userId });
  const alreadyManager = granted.length === 0;

  if (!alreadyManager) {
    const now = new Date();
    const review = { status: 'approved' as const, reviewNote: 'Set up by the outreach bot.', reviewedAt: now, reviewedBy: OUTREACH_BOT_REVIEWER };
    // The paper trail admins already read: a claim they had waiting is
    // approved, otherwise an approved claim is recorded for the grant.
    const settled = await db
      .update(marketClaims)
      .set(review)
      .where(and(eq(marketClaims.userId, account.id), eq(marketClaims.marketId, market.id), eq(marketClaims.status, 'pending')))
      .returning({ id: marketClaims.id });
    if (settled.length === 0) {
      await db.insert(marketClaims).values({
        userId: account.id,
        marketId: market.id,
        role: input.role?.trim().slice(0, 80) || 'Organizer',
        message: input.note?.trim().slice(0, 1000) || null,
        ...review,
      });
    }
    capture(account.id, 'Market Access Granted By Bot', { market_id: market.id, created_account: createdAccount });
  }

  const notified = input.notify
    ? await sendOrganizerEmail(email, managerInviteEmail({ marketName: market.name, marketSlug: market.slug }))
    : false;

  return {
    ok: true,
    claimUrl: absoluteUrl(`/markets/${market.slug}/claim`),
    createdAccount,
    alreadyManager,
    notified,
  };
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
      organizerName: input.user.name || input.user.email,
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
