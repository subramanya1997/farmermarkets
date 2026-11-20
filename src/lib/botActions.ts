/**
 * What the outreach bot may change on a listing, and the audit log of
 * everything it did (`bot_actions`). See docs/organizer-bot.md.
 *
 * Listing edits and new photos publish at once through the same
 * `market_overrides` and `market_photos` layers organizer and admin edits
 * use. Anything that takes a listing or photo down (removing a market,
 * marking it permanently closed, removing published photos) is stored as a
 * pending item for an admin in /admin/review and changes nothing live.
 */
import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { put } from '@vercel/blob';
import sharp from 'sharp';
import { dbSchema, getDb } from '@/db';
import type { FarmerMarket } from '@/app/api/markets/data';
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_MARKET,
  OUTREACH_BOT_REVIEWER,
  currentOverride,
  deleteBlob,
  getMarketsByIds,
  photoPathPrefix,
  photosFor,
  revalidateMarket,
  upsertOverride,
  type ActionResult,
  type SessionUser,
} from './organizer';
import { SECTION_LABELS, mergeListingEdits, sectionsThatDiffer, type ListingEdits, type ListingSection } from './listingEdits';
import { listingEditsFromMarket } from './organizerOverlay';
import { IMAGE_CONTENT_TYPES, photoCaption, sniffImage, splitBotEdits } from './botRequests';
import { publishRedirect } from './listingBot';

const { botActions, marketPhotos } = dbSchema;

/** Published by a bot (the listing API's kinds are in src/lib/listingBot.ts). */
export type AppliedBotAction =
  | 'listing_edit'
  | 'photo_upload'
  | 'schedule_replace'
  | 'photo_reorder'
  | 'photo_cover'
  | 'photo_details'
  | 'photo_remove'
  | 'market_create';
/** Waiting for an admin. `merge_redirect` is applied directly when an approved merge comes with the merge token. */
export type PendingBotAction = 'remove_listing' | 'close_listing' | 'remove_photos' | 'merge_redirect';
export type BotActionKind = AppliedBotAction | PendingBotAction;

export const BOT_ACTION_LABELS: Record<BotActionKind, string> = {
  listing_edit: 'Listing edit',
  photo_upload: 'Photos added',
  schedule_replace: 'Hours and dates replaced',
  photo_reorder: 'Photos reordered',
  photo_cover: 'Cover photo changed',
  photo_details: 'Photo caption edited',
  photo_remove: 'Photo hidden',
  market_create: 'New market page',
  remove_listing: 'Remove listing',
  close_listing: 'Mark permanently closed',
  remove_photos: 'Remove photos',
  merge_redirect: 'Merge duplicate page (301)',
};

export type BotActionRow = typeof botActions.$inferSelect;

interface BotContext {
  note: string;
  email?: string;
}

async function record(
  market: FarmerMarket,
  action: BotActionKind,
  status: 'applied' | 'pending',
  context: BotContext,
  details: Record<string, unknown>,
): Promise<string> {
  const [row] = await getDb()
    .insert(botActions)
    .values({
      action,
      marketId: market.id,
      actor: OUTREACH_BOT_REVIEWER,
      note: context.note,
      operatorEmail: context.email ?? null,
      details: { market_slug: market.slug, market_name: market.name, ...details },
      status,
    })
    .returning({ id: botActions.id });
  return row.id;
}

export interface BotEditResult {
  sections: ListingSection[];
  auditId: string | null;
  pending: { id: string; action: PendingBotAction }[];
}

/**
 * Publishes the sections that differ from the live listing (identity and
 * location included: outreach often fixes names and map pins) and holds a
 * permanent closure for an admin. `edits` must already be parsed with
 * `parseListingEdits(changes, { admin: true })`.
 */
export async function applyBotListingEdits(market: FarmerMarket, edits: ListingEdits, context: BotContext): Promise<BotEditResult> {
  const { publish, held } = splitBotEdits(edits);
  const live = listingEditsFromMarket(market);
  const sections = sectionsThatDiffer(live, publish);
  const pending: BotEditResult['pending'] = [];

  let auditId: string | null = null;
  if (sections.length > 0) {
    const changes = Object.fromEntries(sections.map((section) => [section, publish[section]])) as ListingEdits;
    const now = new Date();
    const merged = mergeListingEdits(await currentOverride(market.id), changes);
    const db = getDb();
    const [, inserted] = await db.batch([
      upsertOverride(market.id, merged, OUTREACH_BOT_REVIEWER, now),
      db
        .insert(botActions)
        .values({
          action: 'listing_edit',
          marketId: market.id,
          actor: OUTREACH_BOT_REVIEWER,
          note: context.note,
          operatorEmail: context.email ?? null,
          details: { market_slug: market.slug, market_name: market.name, sections, changes },
          status: 'applied',
          createdAt: now,
        })
        .returning({ id: botActions.id }),
    ]);
    auditId = inserted[0]?.id ?? null;
    await revalidateMarket(market.slug);
  }

  if (held.status && sectionsThatDiffer(live, held).length > 0) {
    const id = await record(market, 'close_listing', 'pending', context, { changes: held });
    pending.push({ id, action: 'close_listing' });
  }
  return { sections, auditId, pending };
}

/** The operator asked to take the listing down. Nothing changes until an admin acts. */
export async function requestListingRemoval(market: FarmerMarket, context: BotContext): Promise<string> {
  return record(market, 'remove_listing', 'pending', context, {});
}

export interface BotPhotoInput {
  name: string;
  bytes: Uint8Array;
}

export type BotPhotoResult =
  | { ok: true; auditId: string; photos: { id: string; url: string; width: number | null; height: number | null }[] }
  | { ok: false; status: 409 | 413 | 415 | 422; error: string };

/** Checks every file before anything is uploaded, so a bad one fails the whole call. */
async function inspectPhotos(files: BotPhotoInput[]) {
  const inspected = [];
  for (const file of files) {
    if (file.bytes.byteLength === 0) return { ok: false as const, status: 422 as const, error: `${file.name} is empty.` };
    if (file.bytes.byteLength > MAX_PHOTO_BYTES) {
      return { ok: false as const, status: 413 as const, error: `${file.name} is over ${MAX_PHOTO_BYTES / 1024 / 1024} MB.` };
    }
    const kind = sniffImage(file.bytes);
    if (kind === 'heic') {
      return {
        ok: false as const,
        status: 415 as const,
        error: `${file.name} is a HEIC photo, which is not supported yet. Convert it to JPEG and send it again.`,
      };
    }
    if (!kind) return { ok: false as const, status: 415 as const, error: `${file.name} is not a JPEG, PNG or WebP image.` };
    let width: number | null = null;
    let height: number | null = null;
    try {
      const meta = await sharp(file.bytes).metadata();
      // Phone photos carry their rotation in EXIF; store the size as shown.
      const turned = (meta.orientation ?? 1) >= 5;
      width = (turned ? meta.height : meta.width) ?? null;
      height = (turned ? meta.width : meta.height) ?? null;
    } catch {
      return { ok: false as const, status: 422 as const, error: `${file.name} could not be read as an image.` };
    }
    inspected.push({ ...file, kind, width, height });
  }
  return { ok: true as const, inspected };
}

/**
 * Uploads photos to Blob under the market's folder and publishes them:
 * approved, reviewed now, with `outreach-bot` as the reviewer in the audit
 * log. The bot's note is the source record.
 */
export async function uploadBotPhotos(
  market: FarmerMarket,
  files: BotPhotoInput[],
  context: BotContext & { alt?: string; caption?: string; credit?: string },
): Promise<BotPhotoResult> {
  const existing = await photosFor(market.id);
  if (existing.length + files.length > MAX_PHOTOS_PER_MARKET) {
    const room = Math.max(0, MAX_PHOTOS_PER_MARKET - existing.length);
    return {
      ok: false,
      status: 409,
      error: `A listing can have up to ${MAX_PHOTOS_PER_MARKET} photos. This one has room for ${room} more.`,
    };
  }
  const checked = await inspectPhotos(files);
  if (!checked.ok) return checked;

  const prefix = photoPathPrefix(market.id);
  const uploaded: ((typeof checked.inspected)[number] & { url: string; pathname: string })[] = [];
  for (const file of checked.inspected) {
    const extension = file.kind === 'jpeg' ? 'jpg' : file.kind;
    const blob = await put(`${prefix}bot-${Date.now()}.${extension}`, Buffer.from(file.bytes), {
      access: 'public',
      contentType: IMAGE_CONTENT_TYPES[file.kind],
      addRandomSuffix: true,
    });
    uploaded.push({ ...file, url: blob.url, pathname: blob.pathname });
  }

  const now = new Date();
  const alt = context.alt?.trim().slice(0, 200) || null;
  const caption = photoCaption(context.caption, context.credit);
  let rows: { id: string; url: string; width: number | null; height: number | null }[];
  try {
    rows = await getDb()
      .insert(marketPhotos)
      .values(
        uploaded.map((file, index) => ({
          marketId: market.id,
          blobUrl: file.url,
          pathname: file.pathname,
          width: file.width,
          height: file.height,
          alt,
          caption,
          sort: existing.length + index,
          uploadedBy: null,
          status: 'approved' as const,
          reviewedAt: now,
        })),
      )
      .returning({ id: marketPhotos.id, url: marketPhotos.blobUrl, width: marketPhotos.width, height: marketPhotos.height });
  } catch (error) {
    // No row points at them, so the files would only be orphans.
    for (const file of uploaded) await deleteBlob(file.url);
    throw error;
  }

  const auditId = await record(market, 'photo_upload', 'applied', context, {
    photos: rows.map((row, index) => ({ id: row.id, url: row.url, name: uploaded[index]?.name, bytes: uploaded[index]?.bytes.byteLength })),
    alt,
    caption,
  });
  await revalidateMarket(market.slug);
  return { ok: true, auditId, photos: rows };
}

/**
 * Asks an admin to take photos down. `photos` are `market_photos` ids or
 * image URLs (a dataset photo has no id). Nothing is removed here.
 */
export async function requestPhotoRemoval(
  market: FarmerMarket,
  photos: string[],
  context: BotContext,
): Promise<{ auditId: string; matched: string[]; unmatched: string[] }> {
  const published = await photosFor(market.id, ['approved', 'pending']);
  const matched: string[] = [];
  const unmatched: string[] = [];
  for (const value of new Set(photos)) {
    const photo = published.find((row) => row.id === value || row.blobUrl === value);
    if (photo) matched.push(photo.id);
    else unmatched.push(value);
  }
  const auditId = await record(market, 'remove_photos', 'pending', context, { photo_ids: matched, other_urls: unmatched });
  return { auditId, matched, unmatched };
}

/* ------------------------------------------------------------------ *
 * Admin side
 * ------------------------------------------------------------------ */

/** The bot's recent activity on one market, newest first. */
export async function botActionsFor(marketId: string, limit = 20): Promise<BotActionRow[]> {
  return getDb().select().from(botActions).where(eq(botActions.marketId, marketId)).orderBy(desc(botActions.createdAt)).limit(limit);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * An admin's call on a pending bot request.
 *
 * - `close_listing`: approving publishes the held status section.
 * - `remove_photos`: approving takes the matched photos down and deletes
 *   their files. Dataset photos (listed by URL) need the data pipeline.
 * - `remove_listing`: listings come from the dataset files, so approving
 *   records that the admin agreed; the removal itself is a data change.
 */
export async function decideBotAction(admin: SessionUser, id: string, approve: boolean, note?: string): Promise<ActionResult> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, error: 'Unknown request.' };
  const db = getDb();
  const [row] = await db.select().from(botActions).where(eq(botActions.id, id)).limit(1);
  if (!row || row.status !== 'pending') return { ok: false, error: 'This request was already handled.' };
  const details = (row.details ?? {}) as Record<string, unknown>;
  const now = new Date();
  // Only a still-pending row is settled, so a second click changes nothing.
  const settle = db
    .update(botActions)
    .set({ status: approve ? 'approved' : 'dismissed', reviewedAt: now, reviewedBy: admin.id, reviewNote: note || null })
    .where(and(eq(botActions.id, id), eq(botActions.status, 'pending')))
    .returning({ id: botActions.id });

  if (!approve) {
    const settled = await settle;
    return settled.length ? { ok: true, message: 'Dismissed. Nothing changed.' } : { ok: false, error: 'This request was already handled.' };
  }
  const [market] = await getMarketsByIds([row.marketId]);

  if (row.action === 'close_listing') {
    const status = (details.changes as ListingEdits | undefined)?.status;
    if (!status || !market) return { ok: false, error: 'That market is no longer in the dataset, so this can only be dismissed.' };
    const merged = mergeListingEdits(await currentOverride(row.marketId), { status });
    const [, settled] = await db.batch([upsertOverride(row.marketId, merged, admin.id, now), settle]);
    if (settled.length === 0) return { ok: false, error: 'This request was already handled.' };
    await revalidateMarket(market.slug);
    return { ok: true, message: 'Published. The market now shows as permanently closed.' };
  }

  if (row.action === 'remove_photos') {
    const settled = await settle;
    if (settled.length === 0) return { ok: false, error: 'This request was already handled.' };
    const ids = stringList(details.photo_ids).filter((value) => /^[0-9a-f-]{36}$/.test(value));
    const removed = ids.length
      ? await db
          .update(marketPhotos)
          .set({ status: 'removed' })
          .where(and(inArray(marketPhotos.id, ids), eq(marketPhotos.marketId, row.marketId)))
          .returning({ url: marketPhotos.blobUrl })
      : [];
    for (const photo of removed) await deleteBlob(photo.url);
    if (market) await revalidateMarket(market.slug);
    const others = stringList(details.other_urls).length;
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
    return {
      ok: true,
      message: `Removed ${plural(removed.length, 'photo')}.${others ? ` ${plural(others, 'dataset photo link')} also ${others === 1 ? 'needs' : 'need'} a data change.` : ''}`,
    };
  }

  if (row.action === 'merge_redirect') {
    const toSlug = typeof details.to_slug === 'string' ? details.to_slug : '';
    const fromSlug = typeof details.from_slug === 'string' ? details.from_slug : '';
    const [to] = await getMarketsByIds([typeof details.to_market_id === 'string' ? details.to_market_id : '']);
    if (!market || !to || to.slug !== toSlug || market.slug !== fromSlug) {
      return { ok: false, error: 'One of these pages changed since the request, so this can only be dismissed.' };
    }
    const [settled] = await db.batch([
      settle,
      ...publishRedirect(market, to, admin.email || admin.id, row.actor, row.note, now),
    ]);
    if (settled.length === 0) return { ok: false, error: 'This request was already handled.' };
    await revalidateMarket(market.slug);
    await revalidateMarket(to.slug);
    return { ok: true, message: `Merged. /markets/${market.slug} now answers with a 301 to /markets/${to.slug}.` };
  }

  const settled = await settle;
  if (settled.length === 0) return { ok: false, error: 'This request was already handled.' };
  return { ok: true, message: 'Approved. Take the listing out of the dataset to remove it.' };
}

/** What a bot audit row asked for, in words an admin reads at a glance. */
export function describeBotAction(row: BotActionRow): { title: string; detail: string | null; approveLabel: string } {
  const details = (row.details ?? {}) as Record<string, unknown>;
  const title = BOT_ACTION_LABELS[row.action as BotActionKind] ?? row.action;
  switch (row.action) {
    case 'listing_edit': {
      const sections = stringList(details.sections) as ListingSection[];
      return { title, detail: sections.map((section) => SECTION_LABELS[section] ?? section).join(', ') || null, approveLabel: '' };
    }
    case 'photo_upload': {
      const count = Array.isArray(details.photos) ? details.photos.length : 0;
      return { title, detail: `${count} photo${count === 1 ? '' : 's'}`, approveLabel: '' };
    }
    case 'remove_photos': {
      const count = stringList(details.photo_ids).length + stringList(details.other_urls).length;
      return { title, detail: `${count} photo${count === 1 ? '' : 's'}`, approveLabel: 'Take down' };
    }
    case 'close_listing':
      return { title, detail: (details.changes as ListingEdits | undefined)?.status?.note ?? null, approveLabel: 'Publish' };
    case 'merge_redirect':
      return {
        title,
        detail: `/markets/${String(details.from_slug ?? '')} → /markets/${String(details.to_slug ?? '')}${details.approved_by ? ` (approved by ${String(details.approved_by)})` : ''}`,
        approveLabel: 'Merge',
      };
    case 'schedule_replace': {
      const sections = stringList(details.sections) as ListingSection[];
      return { title, detail: sections.map((section) => SECTION_LABELS[section] ?? section).join(', ') || null, approveLabel: '' };
    }
    default:
      return { title, detail: null, approveLabel: 'Approve' };
  }
}
