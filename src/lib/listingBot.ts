/**
 * The listing bot API (docs/listing-bot.md): what the operator-growth bot
 * may read and change on a market page, with every write logged in
 * `bot_actions` (who, what, when, old and new values, and the source note).
 *
 * Writes go through the same layers organizer and admin edits use:
 * `market_overrides` for listing fields, `market_photos` for photos, plus
 * `bot_markets` for new pages and `market_redirects` for merges. Every
 * write can be a dry run, repeats of the same call change nothing, and
 * nothing is ever hard-deleted: a removed photo is hidden, its file kept.
 */
import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { put } from '@vercel/blob';
import { dbSchema, getDb } from '@/db';
import { marketFromRaw, marketService, type FarmerMarket, type RawMarketData } from '@/app/api/markets/data';
import type { BotIdentity } from './botAuth';
import {
  MAX_PHOTOS_PER_MARKET,
  currentOverride,
  getPublishedMarket,
  managersFor,
  photoPathPrefix,
  revalidateMarket,
  upsertOverride,
} from './organizer';
import { changedSections, mergeListingEdits, parseListingEdits, type ListingEdits, type ListingSection } from './listingEdits';
import { listingEditsFromMarket } from './organizerOverlay';
import {
  diffSections,
  displayCaption,
  newMarketSlug,
  overlappingExceptionIssues,
  reorder,
  scheduleFromEdits,
  sectionsChanged,
  type FieldChange,
} from './listingBotRequests';
import { resolveMarketSlug } from './marketSlug';
import { runtimeRedirectFor, getRuntimeRedirects } from './marketRedirects';
import { searchMarkets } from './marketSearch';
import { getGeoIndex } from './geoIndex';
import { absoluteUrl } from './site';
import { PhotoReadError, preparePhoto, MAX_UPLOAD_PHOTO_BYTES } from './photoConvert';
import { pickCover } from './marketCard';
import { BOT_MARKET_ID_PREFIX } from './botMarkets';

const { botActions, marketPhotos, botMarkets, marketRedirects } = dbSchema;

export interface WriteContext {
  identity: BotIdentity;
  sourceNote: string;
  operatorEmail?: string;
  dryRun: boolean;
}

export type Issue = { path: string; message: string };

export type WriteResult<T extends object = object> =
  | ({ ok: true; changed: boolean; dry_run: boolean; changes: FieldChange[]; audit_id: string | null } & T)
  | { ok: false; status: number; error: string; issues?: Issue[] };

function fail(status: number, error: string, issues?: Issue[]): { ok: false; status: number; error: string; issues?: Issue[] } {
  return { ok: false, status, error, ...(issues ? { issues } : {}) };
}

function auditRow(market: Pick<FarmerMarket, 'id' | 'slug' | 'name'>, action: string, ctx: WriteContext, details: Record<string, unknown>, status: 'applied' | 'pending' = 'applied', now = new Date()) {
  return getDb()
    .insert(botActions)
    .values({
      action,
      marketId: market.id,
      actor: ctx.identity.actor,
      note: ctx.sourceNote,
      operatorEmail: ctx.operatorEmail ?? null,
      details: { market_slug: market.slug, market_name: market.name, ...details },
      status,
      createdAt: now,
    })
    .returning({ id: botActions.id });
}

/* ------------------------------------------------------------------ *
 * Finding markets
 * ------------------------------------------------------------------ */

export type FoundMarket =
  | { ok: true; market: FarmerMarket; redirect: { to_slug: string; approved_by: string } | null }
  | { ok: false; status: 404; error: string };

/** The live market for a slug or URL, following old slugs, with any runtime merge it is part of. */
export async function findBotMarket(value: string): Promise<FoundMarket> {
  const slug = resolveMarketSlug(decodeURIComponent(value));
  const market = slug ? await getPublishedMarket(slug) : null;
  if (!slug || !market) return { ok: false, status: 404, error: `No market found for "${value}".` };
  const redirect = await runtimeRedirectFor(market.slug);
  return { ok: true, market, redirect: redirect ? { to_slug: redirect.toSlug, approved_by: redirect.approvedBy } : null };
}

/** Writes to a merged page would be invisible: send them to the page we kept. */
export function mergedError(found: Extract<FoundMarket, { ok: true }>) {
  return found.redirect
    ? fail(409, `This page was merged into /markets/${found.redirect.to_slug}. Edit that one instead.`)
    : null;
}

/* ------------------------------------------------------------------ *
 * GET /api/bot/markets/:slug
 * ------------------------------------------------------------------ */

async function photoRows(marketId: string, statuses: ('approved' | 'pending' | 'removed' | 'rejected')[] = ['approved']) {
  return getDb()
    .select()
    .from(marketPhotos)
    .where(and(eq(marketPhotos.marketId, marketId), inArray(marketPhotos.status, statuses)))
    .orderBy(asc(marketPhotos.sort), asc(marketPhotos.createdAt));
}

/** The full editable record, in the same shapes the write endpoints take. */
export async function editableRecord(found: Extract<FoundMarket, { ok: true }>) {
  const { market, redirect } = found;
  const live = listingEditsFromMarket(market);
  const db = getDb();
  const [photos, managers, recent, redirectsIn] = await Promise.all([
    photoRows(market.id, ['approved', 'pending']),
    managersFor(market.id),
    db.select().from(botActions).where(eq(botActions.marketId, market.id)).orderBy(desc(botActions.createdAt)).limit(10),
    db.select().from(marketRedirects).where(eq(marketRedirects.toSlug, market.slug)),
  ]);
  const approved = photos.filter((photo) => photo.status === 'approved');
  const cover = pickCover(approved.map((photo) => ({ ...photo, url: photo.blobUrl })));
  const otherSchedules = (market.first_party?.operations?.schedules ?? []).filter(
    (item) => item.value.recurrence.kind !== 'weekly' || item.value.recurrence.interval_weeks === 2,
  );

  return {
    id: market.id,
    slug: market.slug,
    url: absoluteUrl(`/markets/${market.slug}`),
    claim_url: absoluteUrl(`/markets/${market.slug}/claim`),
    source: market.id.startsWith(BOT_MARKET_ID_PREFIX) ? 'listing_bot' : 'dataset',
    name: market.name,
    operator_name: live.identity?.operator_name ?? null,
    address: market.address ?? null,
    city: market.city ?? null,
    state: market.state ?? null,
    zip_code: market.zip_code ?? null,
    country_code: market.country_code ?? null,
    location_description: market.location_description ?? null,
    lat: market.location?.lat ?? null,
    lng: market.location?.lon ?? null,
    phone: live.contact?.phone_numbers[0] ?? null,
    phone_numbers: live.contact?.phone_numbers ?? [],
    website: live.contact?.websites[0] ?? null,
    websites: live.contact?.websites ?? [],
    emails: live.contact?.emails ?? [],
    payments: live.payments ?? { methods: [], assistance: [], incentives: [] },
    description: live.about?.description ?? null,
    visitor_note: live.about?.visitor_note ?? null,
    status: live.status ?? null,
    timezone: market.first_party?.operations?.timezone?.value ?? null,
    schedule: {
      ...scheduleFromEdits(live),
      /** Monthly, every-other-week or date-list hours from research. A schedule PUT replaces them. */
      other: otherSchedules.map((item) => item.value),
      /** The hours as the page lists them now. */
      text: market.days ?? [],
      season_text: market.season ?? null,
    },
    photos: photos.map((photo) => ({
      id: photo.id,
      url: photo.blobUrl,
      width: photo.width,
      height: photo.height,
      alt: photo.alt,
      caption: photo.caption,
      credit: photo.credit,
      source_note: photo.sourceNote,
      status: photo.status,
      cover: cover?.id === photo.id,
      position: approved.findIndex((row) => row.id === photo.id),
    })),
    organizers: managers.map((manager) => ({ name: manager.name, email: manager.email, since: manager.createdAt })),
    redirect,
    merged_in: redirectsIn.map((row) => row.fromSlug),
    last_edited: market.organizer?.updated_at ?? null,
    recent_changes: recent.map((row) => ({
      id: row.id,
      action: row.action,
      status: row.status,
      actor: row.actor,
      source_note: row.note,
      at: row.createdAt,
    })),
  };
}

/* ------------------------------------------------------------------ *
 * GET /api/bot/markets/search
 * ------------------------------------------------------------------ */

function normalized(value: string | undefined): string {
  return (value ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** State name for a 2-letter code ("CA" → "California"), or the value as given. */
async function stateName(value: string): Promise<string> {
  const trimmed = value.trim();
  if (!/^[A-Za-z]{2}$/.test(trimmed)) return trimmed;
  const index = await getGeoIndex();
  return index.states.find((state) => state.code?.toLowerCase() === trimmed.toLowerCase())?.name ?? trimmed;
}

export async function searchBotMarkets(input: { q?: string; city?: string; state?: string; limit?: number }) {
  const [dataset, created, redirects] = await Promise.all([
    marketService.getAllMarkets(),
    marketService.getBotMarkets(),
    getRuntimeRedirects(),
  ]);
  let markets = [...dataset, ...created];
  if (input.state) {
    const state = normalized(await stateName(input.state));
    markets = markets.filter((market) => normalized(market.state) === state);
  }
  if (input.city) {
    const city = normalized(input.city);
    markets = markets.filter((market) => normalized(market.city) === city);
  }
  if (input.q) markets = searchMarkets(markets, input.q);
  else markets = [...markets].sort((left, right) => left.name.localeCompare(right.name));
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  return {
    total: markets.length,
    results: markets.slice(0, limit).map((market) => ({
      id: market.id,
      slug: market.slug,
      name: market.name,
      address: market.address ?? null,
      city: market.city ?? null,
      state: market.state ?? null,
      url: absoluteUrl(`/markets/${market.slug}`),
      source: market.id.startsWith(BOT_MARKET_ID_PREFIX) ? 'listing_bot' : 'dataset',
      days: market.days ?? [],
      redirect_to: redirects.get(market.slug)?.toSlug ?? null,
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Listing edits (PATCH, PUT schedule)
 * ------------------------------------------------------------------ */

/**
 * Publishes `changes` (sections, already filled from the live listing) over
 * the live market, logs the field-level diff, and refreshes the page. Only
 * sections that really differ are written; a repeat changes nothing.
 */
export async function applyListingChanges(
  market: FarmerMarket,
  changes: Record<string, unknown>,
  ctx: WriteContext,
  action: 'listing_edit' | 'schedule_replace',
): Promise<WriteResult<{ sections: ListingSection[] }>> {
  const parsed = parseListingEdits(changes, { admin: true });
  if (!parsed.ok) return fail(400, 'Invalid request.', parsed.errors);
  if (parsed.edits.exceptions) {
    const overlaps = overlappingExceptionIssues(parsed.edits.exceptions);
    if (overlaps.length) return fail(400, 'Invalid request.', overlaps);
  }
  // A permanent closure hides the market; the bot API never publishes one.
  if (parsed.edits.status?.value === 'permanently_closed') return fail(403, 'Marking a market permanently closed needs an admin.');

  const live = listingEditsFromMarket(market);
  const sections = sectionsChanged(live, parsed.edits, changedSections(parsed.edits));
  const diff = diffSections(live, parsed.edits, sections);
  if (sections.length === 0 || ctx.dryRun) {
    return { ok: true, changed: sections.length > 0, dry_run: ctx.dryRun, changes: diff, audit_id: null, sections };
  }

  const publish = Object.fromEntries(sections.map((section) => [section, parsed.edits[section]])) as ListingEdits;
  const now = new Date();
  const merged = mergeListingEdits(await currentOverride(market.id), publish);
  const before = Object.fromEntries(sections.map((section) => [section, live[section] ?? null]));
  const [, inserted] = await getDb().batch([
    upsertOverride(market.id, merged, ctx.identity.actor, now),
    auditRow(market, action, ctx, { sections, changes: diff, before, after: publish }, 'applied', now),
  ]);
  await revalidateMarket(market.slug);
  return { ok: true, changed: true, dry_run: false, changes: diff, audit_id: inserted[0]?.id ?? null, sections };
}

/* ------------------------------------------------------------------ *
 * Photos
 * ------------------------------------------------------------------ */

const PRIVATE_V4 = [
  /^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^192\.0\.0\./, /^198\.1[89]\./, /^2(2[4-9]|[3-5]\d)\./,
];

function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) return !PRIVATE_V4.some((pattern) => pattern.test(address));
  const lower = address.toLowerCase();
  if (lower.startsWith('::ffff:')) return isPublicAddress(lower.slice(7));
  return !(lower === '::' || lower === '::1' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith('ff'));
}

/** An image from a public https URL: no private hosts, at most 3 redirects, 8 MB, 20 seconds. */
async function fetchImage(rawUrl: string): Promise<{ ok: true; bytes: Uint8Array; name: string } | { ok: false; status: number; error: string }> {
  let url = new URL(rawUrl);
  const deadline = AbortSignal.timeout(20_000);
  for (let hop = 0; hop < 4; hop += 1) {
    if (url.protocol !== 'https:') return { ok: false, status: 422, error: 'The image URL must use https.' };
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((entry) => entry.address);
    if (addresses.length === 0) return { ok: false, status: 422, error: `Could not find ${url.hostname}.` };
    if (!addresses.every(isPublicAddress)) return { ok: false, status: 422, error: 'That image URL points at a private address.' };
    let response: Response;
    try {
      response = await fetch(url, { redirect: 'manual', signal: deadline, headers: { accept: 'image/*' } });
    } catch {
      return { ok: false, status: 422, error: 'Could not download the image.' };
    }
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      url = new URL(response.headers.get('location')!, url);
      continue;
    }
    if (!response.ok || !response.body) return { ok: false, status: 422, error: `Downloading the image failed (HTTP ${response.status}).` };
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_UPLOAD_PHOTO_BYTES) return { ok: false, status: 413, error: 'That image is over 8 MB.' };
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_UPLOAD_PHOTO_BYTES) {
        await reader.cancel();
        return { ok: false, status: 413, error: 'That image is over 8 MB.' };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, bytes, name: url.pathname.split('/').pop() || 'photo' };
  }
  return { ok: false, status: 422, error: 'The image URL redirects too many times.' };
}

export interface PhotoInput {
  /** File bytes from multipart, or a URL to fetch. */
  file?: { name: string; bytes: Uint8Array };
  url?: string;
  caption?: string;
  credit?: string;
  alt?: string;
  cover?: boolean;
}

function photoJson(row: typeof marketPhotos.$inferSelect) {
  return {
    id: row.id,
    url: row.blobUrl,
    width: row.width,
    height: row.height,
    alt: row.alt,
    caption: row.caption,
    credit: row.credit,
    source_note: row.sourceNote,
    status: row.status,
  };
}

/** Puts the given ids first (in that order) and renumbers every published photo. */
function sortUpdates(marketId: string, order: string[]) {
  const db = getDb();
  return order.map((id, position) =>
    db.update(marketPhotos).set({ sort: position }).where(and(eq(marketPhotos.id, id), eq(marketPhotos.marketId, marketId))),
  );
}

export async function addBotPhoto(market: FarmerMarket, input: PhotoInput, ctx: WriteContext): Promise<WriteResult<{ photo: ReturnType<typeof photoJson> | null; duplicate: boolean; preview?: Record<string, unknown> }>> {
  let source: { bytes: Uint8Array; name: string };
  if (input.file) source = input.file;
  else if (input.url) {
    const fetched = await fetchImage(input.url);
    if (!fetched.ok) return fail(fetched.status, fetched.error);
    source = fetched;
  } else return fail(400, 'Send a "photo" file or a "url".');

  const hash = createHash('sha256').update(source.bytes).digest('hex');
  const published = await photoRows(market.id, ['approved', 'pending']);
  const existing = published.find((photo) => photo.contentHash === hash);
  if (existing) {
    // The same photo again: idempotent, nothing is added.
    return { ok: true, changed: false, dry_run: ctx.dryRun, changes: [], audit_id: null, photo: photoJson(existing), duplicate: true };
  }
  if (published.length >= MAX_PHOTOS_PER_MARKET) {
    return fail(409, `A listing can have up to ${MAX_PHOTOS_PER_MARKET} photos. Remove one first.`);
  }

  let prepared;
  try {
    prepared = await preparePhoto(source.bytes);
  } catch (error) {
    if (error instanceof PhotoReadError) return fail(415, `${source.name}: ${error.message}`);
    throw error;
  }

  const caption = displayCaption(input.caption, input.credit);
  const alt = input.alt?.trim() || null;
  const credit = input.credit?.trim() || null;
  const approvedIds = published.filter((photo) => photo.status === 'approved').map((photo) => photo.id);
  const preview = {
    url: null as string | null,
    width: prepared.width,
    height: prepared.height,
    caption,
    alt,
    credit,
    converted_from_heic: prepared.converted,
  };
  const changes: FieldChange[] = [{ path: 'photos', old: approvedIds, new: [...approvedIds, '(new photo)'] }];
  if (input.cover) changes.push({ path: 'photos.cover', old: approvedIds[0] ?? null, new: '(new photo)' });
  if (ctx.dryRun) {
    return { ok: true, changed: true, dry_run: true, changes, audit_id: null, photo: null, duplicate: false, preview };
  }

  const extension = prepared.contentType === 'image/png' ? 'png' : prepared.contentType === 'image/webp' ? 'webp' : 'jpg';
  const blob = await put(`${photoPathPrefix(market.id)}bot-${Date.now()}.${extension}`, prepared.data, {
    access: 'public',
    contentType: prepared.contentType,
    addRandomSuffix: true,
  });

  const db = getDb();
  const now = new Date();
  const id = randomUUID();
  const order = input.cover ? [id, ...approvedIds] : [...approvedIds, id];
  const finalChanges: FieldChange[] = [{ path: 'photos', old: approvedIds, new: order }];
  if (input.cover) finalChanges.push({ path: 'photos.cover', old: approvedIds[0] ?? null, new: id });
  const [inserted, audit] = await db.batch([
    db
      .insert(marketPhotos)
      .values({
        id,
        marketId: market.id,
        blobUrl: blob.url,
        pathname: blob.pathname,
        width: prepared.width,
        height: prepared.height,
        alt,
        caption,
        credit,
        sourceNote: ctx.sourceNote,
        contentHash: hash,
        sort: order.indexOf(id),
        uploadedBy: null,
        status: 'approved',
        reviewedAt: now,
      })
      .returning(),
    auditRow(market, 'photo_upload', ctx, {
      photos: [{ id, url: blob.url, sha256: hash, bytes: source.bytes.byteLength, converted_from_heic: prepared.converted }],
      caption,
      credit,
      alt,
      changes: finalChanges,
    }, 'applied', now),
    // Run in order in one transaction, after the insert above.
    ...(input.cover ? sortUpdates(market.id, order) : []),
  ]);
  await revalidateMarket(market.slug);
  return { ok: true, changed: true, dry_run: false, changes: finalChanges, audit_id: audit[0]?.id ?? null, photo: photoJson(inserted[0]), duplicate: false };
}

/** A new order or a new cover for the published photos. */
export async function arrangeBotPhotos(
  market: FarmerMarket,
  input: { order?: string[]; cover?: string },
  ctx: WriteContext,
): Promise<WriteResult<{ order: string[] }>> {
  const approved = (await photoRows(market.id, ['approved'])).map((photo) => photo.id);
  const wanted = input.order ?? [input.cover!];
  const unknown = wanted.filter((id) => !approved.includes(id));
  if (unknown.length) return fail(404, `Not a published photo of this market: ${unknown.join(', ')}.`);
  const order = reorder(approved, wanted);
  const changed = order.join() !== approved.join();
  const changes: FieldChange[] = changed ? [{ path: 'photos', old: approved, new: order }] : [];
  if (!changed || ctx.dryRun) return { ok: true, changed, dry_run: ctx.dryRun, changes, audit_id: null, order };

  const updates = sortUpdates(market.id, order);
  const audit = auditRow(market, input.cover ? 'photo_cover' : 'photo_reorder', ctx, { changes });
  const results = await getDb().batch([audit, ...updates]);
  await revalidateMarket(market.slug);
  return { ok: true, changed: true, dry_run: false, changes, audit_id: results[0][0]?.id ?? null, order };
}

/** Caption, credit and alt text of one photo. */
export async function updateBotPhoto(
  market: FarmerMarket,
  photoId: string,
  input: { caption?: string | null; credit?: string | null; alt?: string | null },
  ctx: WriteContext,
): Promise<WriteResult<{ photo: ReturnType<typeof photoJson> }>> {
  const [photo] = (await photoRows(market.id, ['approved', 'pending'])).filter((row) => row.id === photoId);
  if (!photo) return fail(404, 'No published photo with that id on this market.');
  // The stored caption already carries the credit ("... Photo: Pat Lee"); take it back off.
  const creditSuffix = photo.credit ? `Photo: ${photo.credit}` : '';
  const plainCaption = (photo.caption ?? '').replace(new RegExp(`(\\.\\s*)?${creditSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '').trim() || null;
  const credit = input.credit !== undefined ? input.credit?.trim() || null : photo.credit;
  const caption = displayCaption(input.caption !== undefined ? input.caption : creditSuffix ? plainCaption : photo.caption, credit);
  const alt = input.alt !== undefined ? input.alt?.trim() || null : photo.alt;
  const next = { caption, credit, alt };
  const before = { caption: photo.caption, credit: photo.credit, alt: photo.alt };
  const changes = (Object.keys(next) as (keyof typeof next)[])
    .filter((key) => (before[key] ?? null) !== (next[key] ?? null))
    .map((key) => ({ path: `photos.${photoId}.${key}`, old: before[key], new: next[key] }));
  if (changes.length === 0 || ctx.dryRun) {
    return { ok: true, changed: changes.length > 0, dry_run: ctx.dryRun, changes, audit_id: null, photo: { ...photoJson(photo), ...(ctx.dryRun ? next : {}) } };
  }
  const db = getDb();
  const [updated, audit] = await db.batch([
    db.update(marketPhotos).set(next).where(and(eq(marketPhotos.id, photoId), eq(marketPhotos.marketId, market.id))).returning(),
    auditRow(market, 'photo_details', ctx, { photo_id: photoId, changes }),
  ]);
  await revalidateMarket(market.slug);
  return { ok: true, changed: true, dry_run: false, changes, audit_id: audit[0]?.id ?? null, photo: photoJson(updated[0]) };
}

/** Hides a photo from the page. The file and the row stay, so an admin can bring it back. */
export async function removeBotPhoto(market: FarmerMarket, photoId: string, ctx: WriteContext): Promise<WriteResult<{ photo_id: string }>> {
  const [photo] = (await photoRows(market.id, ['approved', 'pending', 'removed', 'rejected'])).filter((row) => row.id === photoId);
  if (!photo) return fail(404, 'No photo with that id on this market.');
  if (photo.status === 'removed' || photo.status === 'rejected') {
    return { ok: true, changed: false, dry_run: ctx.dryRun, changes: [], audit_id: null, photo_id: photoId };
  }
  const changes: FieldChange[] = [{ path: `photos.${photoId}.status`, old: photo.status, new: 'removed' }];
  if (ctx.dryRun) return { ok: true, changed: true, dry_run: true, changes, audit_id: null, photo_id: photoId };
  const db = getDb();
  const [, audit] = await db.batch([
    db.update(marketPhotos).set({ status: 'removed' }).where(and(eq(marketPhotos.id, photoId), eq(marketPhotos.marketId, market.id))),
    auditRow(market, 'photo_remove', ctx, { photo_id: photoId, url: photo.blobUrl, previous_status: photo.status, changes }),
  ]);
  await revalidateMarket(market.slug);
  return { ok: true, changed: true, dry_run: false, changes, audit_id: audit[0]?.id ?? null, photo_id: photoId };
}

/* ------------------------------------------------------------------ *
 * POST /api/bot/markets
 * ------------------------------------------------------------------ */

export interface NewMarketInput {
  name: string;
  city: string;
  state: string;
  country_code?: 'US' | 'CA';
  address?: string;
  zip_code?: string;
  location_description?: string;
  lat?: number;
  lng?: number;
  timezone?: string;
  confirm_not_duplicate?: boolean;
}

/**
 * A new market page. The base record holds where it is; everything else
 * (hours, payments, contact, operator) is published through the same
 * listing edit as any later change, so the audit log has one shape.
 */
export async function createBotMarket(
  input: NewMarketInput,
  edits: (market: FarmerMarket) => Record<string, unknown>,
  ctx: WriteContext,
): Promise<WriteResult<{ created: boolean; market: { id: string; slug: string; name: string }; url: string; claim_url: string; duplicates?: unknown[] }>> {
  const state = await stateName(input.state);
  const name = input.name.trim();
  const city = input.city.trim();

  const db = getDb();
  // Idempotent: the same market created again returns the first one.
  const created = await db.select().from(botMarkets);
  const repeat = created.find(
    (row) => normalized(row.name) === normalized(name) && normalized(row.city ?? '') === normalized(city) && normalized(row.state ?? '') === normalized(state),
  );
  if (repeat) {
    return {
      ok: true,
      changed: false,
      dry_run: ctx.dryRun,
      changes: [],
      audit_id: null,
      created: false,
      market: { id: repeat.id, slug: repeat.slug, name: repeat.name },
      url: absoluteUrl(`/markets/${repeat.slug}`),
      claim_url: absoluteUrl(`/markets/${repeat.slug}/claim`),
    };
  }

  const dataset = await marketService.getAllMarkets();
  const local = dataset.filter((market) => normalized(market.city) === normalized(city) && normalized(market.state) === normalized(state));
  const duplicates = searchMarkets(local, name)
    .filter((market) => {
      const a = new Set(normalized(market.name).split(' ').filter((word) => !['farmers', 'market', 'the', 'fm'].includes(word)));
      const b = normalized(name).split(' ').filter((word) => !['farmers', 'market', 'the', 'fm'].includes(word));
      return b.length > 0 && b.filter((word) => a.has(word)).length / b.length >= 0.5;
    })
    .slice(0, 5)
    .map((market) => ({ slug: market.slug, name: market.name, url: absoluteUrl(`/markets/${market.slug}`) }));
  if (duplicates.length && !input.confirm_not_duplicate) {
    return fail(409, 'A market with a similar name is already listed in this city. Check these pages; send confirm_not_duplicate: true if it is a different market.', [
      { path: 'name', message: duplicates.map((item) => item.slug).join(', ') },
    ]);
  }

  const takenSlugs = new Set([...dataset.map((market) => market.slug), ...created.map((row) => row.slug)]);
  const redirects = await getRuntimeRedirects();
  const slug = newMarketSlug(name, city, (candidate) => takenSlugs.has(candidate) || redirects.has(candidate) || Boolean(resolveMarketSlug(candidate) !== candidate));
  const id = `${BOT_MARKET_ID_PREFIX}${randomUUID().slice(0, 8)}`;
  const countryCode = input.country_code ?? 'US';
  const today = new Date().toISOString().slice(0, 10);
  const record: RawMarketData = {
    id,
    slug,
    name,
    last_updated: new Date().toISOString(),
    country: countryCode === 'CA' ? 'Canada' : 'United States',
    country_code: countryCode,
    location: {
      address: input.address,
      city,
      state,
      zip_code: input.zip_code,
      ...(input.lat !== undefined && input.lng !== undefined ? { coordinates: { latitude: input.lat, longitude: input.lng } } : {}),
      description: input.location_description,
    },
    organization: { types: [], description: '' },
    contact: { phone_numbers: [], emails: [], websites: [], social_media: [] },
    operations: { days: [] },
    schema_version: 2,
    ...(input.timezone ? { first_party: { operations: { timezone: { value: input.timezone, source_ids: ['organizer'], verified_at: today } } } } : {}),
  };
  const market = marketFromRaw(record);
  const changes = edits(market);
  const parsed = parseListingEdits(changes, { admin: true });
  if (!parsed.ok) return fail(400, 'Invalid request.', parsed.errors);
  const sections = changedSections(parsed.edits);
  const diff: FieldChange[] = [
    { path: 'market', old: null, new: { slug, name, city, state, address: input.address ?? null } },
    ...diffSections({}, parsed.edits, sections),
  ];
  const result = {
    created: true,
    market: { id, slug, name },
    url: absoluteUrl(`/markets/${slug}`),
    claim_url: absoluteUrl(`/markets/${slug}/claim`),
    ...(duplicates.length ? { duplicates } : {}),
  };
  if (ctx.dryRun) return { ok: true, changed: true, dry_run: true, changes: diff, audit_id: null, ...result };

  const now = new Date();
  const [, , audit] = await db.batch([
    db.insert(botMarkets).values({ id, slug, name, city, state, record, createdBy: ctx.identity.actor, sourceNote: ctx.sourceNote, createdAt: now }),
    upsertOverride(id, parsed.edits, ctx.identity.actor, now),
    auditRow({ id, slug, name }, 'market_create', ctx, { record, sections, changes: diff }, 'applied', now),
  ]);
  await revalidateMarket(slug);
  return { ok: true, changed: true, dry_run: false, changes: diff, audit_id: audit[0]?.id ?? null, ...result };
}

/* ------------------------------------------------------------------ *
 * POST /api/bot/markets/:slug/redirect
 * ------------------------------------------------------------------ */

export async function mergeBotMarket(
  from: FarmerMarket,
  toValue: string,
  approvedBy: string | undefined,
  ctx: WriteContext,
): Promise<WriteResult<{ pending: boolean; from_slug: string; to_slug: string }>> {
  const target = await findBotMarket(toValue);
  if (!target.ok) return fail(404, target.error);
  const to = target.market;
  if (to.id === from.id || to.slug === from.slug) return fail(400, 'A page cannot be merged into itself.');
  if (target.redirect) return fail(409, `/markets/${to.slug} was itself merged into /markets/${target.redirect.to_slug}. Merge into that one.`);

  const db = getDb();
  const [existing] = await db.select().from(marketRedirects).where(eq(marketRedirects.fromSlug, from.slug)).limit(1);
  if (existing?.toSlug === to.slug) {
    return { ok: true, changed: false, dry_run: ctx.dryRun, changes: [], audit_id: null, pending: false, from_slug: from.slug, to_slug: to.slug };
  }
  const changes: FieldChange[] = [{ path: 'redirect', old: existing ? { to_slug: existing.toSlug } : null, new: { to_slug: to.slug, status: 301 } }];
  // Pages merged into `from` would chain; point them straight at `to`.
  const chained = await db.select().from(marketRedirects).where(eq(marketRedirects.toSlug, from.slug));
  for (const row of chained) changes.push({ path: `redirect.${row.fromSlug}`, old: { to_slug: from.slug }, new: { to_slug: to.slug } });

  const publish = Boolean(approvedBy) && ctx.identity.canMerge;
  const result = { pending: !publish, from_slug: from.slug, to_slug: to.slug };
  if (ctx.dryRun) return { ok: true, changed: true, dry_run: true, changes, audit_id: null, ...result };

  const details = { from_slug: from.slug, to_slug: to.slug, to_market_id: to.id, approved_by: approvedBy ?? null, changes };
  if (!publish) {
    // Already waiting for the same merge: do not queue it twice.
    const waiting = await db
      .select({ id: botActions.id, details: botActions.details })
      .from(botActions)
      .where(and(eq(botActions.marketId, from.id), eq(botActions.action, 'merge_redirect'), eq(botActions.status, 'pending')));
    const same = waiting.find((row) => (row.details as { to_slug?: string }).to_slug === to.slug);
    if (same) return { ok: true, changed: false, dry_run: false, changes, audit_id: same.id, ...result };
    const [row] = await auditRow(from, 'merge_redirect', ctx, details, 'pending');
    return { ok: true, changed: true, dry_run: false, changes, audit_id: row?.id ?? null, ...result };
  }

  const now = new Date();
  const [audit] = await db.batch([
    auditRow(from, 'merge_redirect', ctx, details, 'applied', now),
    ...publishRedirect(from, to, approvedBy!, ctx.identity.actor, ctx.sourceNote, now),
    // A request for this merge that was waiting in /admin/review is settled by this one.
    db
      .update(botActions)
      .set({ status: 'approved', reviewedAt: now, reviewedBy: approvedBy!, reviewNote: 'Published with the merge token' })
      .where(
        and(
          eq(botActions.marketId, from.id),
          eq(botActions.action, 'merge_redirect'),
          eq(botActions.status, 'pending'),
          sql`${botActions.details}->>'to_slug' = ${to.slug}`,
        ),
      ),
  ]);
  await revalidateMarket(from.slug);
  await revalidateMarket(to.slug);
  return { ok: true, changed: true, dry_run: false, changes, audit_id: audit[0]?.id ?? null, ...result };
}

/** The writes that make `from` answer with a 301 to `to` (and re-point pages merged into `from`). */
export function publishRedirect(
  from: Pick<FarmerMarket, 'id' | 'slug'>,
  to: Pick<FarmerMarket, 'id' | 'slug'>,
  approvedBy: string,
  createdBy: string,
  sourceNote: string,
  now = new Date(),
) {
  const db = getDb();
  const values = {
    fromSlug: from.slug,
    toSlug: to.slug,
    fromMarketId: from.id,
    toMarketId: to.id,
    approvedBy,
    createdBy,
    sourceNote,
    createdAt: now,
  };
  return [
    db.insert(marketRedirects).values(values).onConflictDoUpdate({ target: marketRedirects.fromSlug, set: values }),
    db.update(marketRedirects).set({ toSlug: to.slug, toMarketId: to.id }).where(eq(marketRedirects.toSlug, from.slug)),
  ] as const;
}
