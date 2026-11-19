/**
 * Stall QR scans, shopper follows and the vendor's Footprint. The rules live
 * in src/lib/reachRules.ts; this module reads and writes rows.
 *
 * Privacy: no IP address is stored (a daily keyed hash stands in for the
 * visitor), and nothing a vendor or a bot can read carries an email, a name
 * or a user id. Follows are read back as counts only.
 */
import 'server-only';
import { and, count, eq, gte, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { DatabaseUnavailableError, dbSchema, getDb } from '@/db';
import type { SessionUser } from './organizer';
import { FOOTPRINT_DAYS, followRefusal, isLikelyBot, isPrefetch, scanDecision, type Footprint, type HourBucket, type ScanDecision } from './reachRules';
import { visitorHash } from './visitorHash';
import { vendorPagePublic } from './vendorRules';
import { getVendorForUser, type VendorActionResult } from './vendors';

const { vendors, vendorFollows, vendorQrScans } = dbSchema;

const SLUG = /^[a-z0-9-]{1,80}$/;

/** The secret behind visitor hashes. Any server secret works; it never leaves the server. */
function hashSecret(): string {
  return process.env.SCAN_HASH_SECRET || process.env.BETTER_AUTH_SECRET || 'farmermarkets-dev-scan-secret';
}

async function publicVendorBySlug(slug: string) {
  if (!SLUG.test(slug)) return null;
  const [row] = await getDb()
    .select({ id: vendors.id, slug: vendors.slug, userId: vendors.userId, profile: vendors.profile, suspendedAt: vendors.suspendedAt })
    .from(vendors)
    .where(eq(vendors.slug, slug))
    .limit(1);
  if (!row || !vendorPagePublic({ hasLiveProfile: row.profile !== null, suspended: row.suspendedAt !== null })) return null;
  return row;
}

/* ------------------------------------------------------------------ *
 * Scans
 * ------------------------------------------------------------------ */

export interface ScanRequest {
  headers: { get(name: string): string | null };
}

/** The visitor's address as the platform reports it; used only to hash. */
function clientIp(headers: ScanRequest['headers']): string {
  return (headers.get('x-real-ip') || headers.get('x-forwarded-for')?.split(',')[0] || '').trim() || 'unknown';
}

/**
 * Record one visit to a vendor's stall QR URL, if it counts. Never throws:
 * a scan that cannot be stored must not break the page the shopper opened.
 */
export async function recordScan(vendorId: string, request: ScanRequest, now = new Date()): Promise<ScanDecision | 'error'> {
  try {
    if (isPrefetch(request.headers)) return 'bot';
    const userAgent = request.headers.get('user-agent') ?? '';
    const bot = isLikelyBot(userAgent);
    if (bot) return 'bot';
    const hash = visitorHash({ ip: clientIp(request.headers), userAgent, day: now.toISOString().slice(0, 10), secret: hashSecret() });
    const db = getDb();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const [[last], [recent]] = await Promise.all([
      db
        .select({ createdAt: vendorQrScans.createdAt })
        .from(vendorQrScans)
        .where(and(eq(vendorQrScans.vendorId, vendorId), eq(vendorQrScans.visitorHash, hash)))
        .orderBy(sql`${vendorQrScans.createdAt} desc`)
        .limit(1),
      db.select({ n: count() }).from(vendorQrScans).where(and(eq(vendorQrScans.visitorHash, hash), gte(vendorQrScans.createdAt, hourAgo))),
    ]);
    const decision = scanDecision({ bot, lastFromVisitor: last?.createdAt ?? null, visitorScansLastHour: recent?.n ?? 0, now });
    if (decision === 'count') await db.insert(vendorQrScans).values({ vendorId, visitorHash: hash, createdAt: now });
    return decision;
  } catch (error) {
    if (!(error instanceof DatabaseUnavailableError)) console.error('Could not record a QR scan:', error);
    return 'error';
  }
}

/* ------------------------------------------------------------------ *
 * Follows
 * ------------------------------------------------------------------ */

export interface FollowState {
  signedIn: boolean;
  following: boolean;
  /** The vendor's own account is looking at its own page. */
  own: boolean;
}

export async function followState(user: SessionUser | null, vendorId: string): Promise<FollowState> {
  if (!user) return { signedIn: false, following: false, own: false };
  const [own, [row]] = await Promise.all([
    getVendorForUser(user.id).then((vendor) => vendor?.id === vendorId),
    getDb()
      .select({ id: vendorFollows.id })
      .from(vendorFollows)
      .where(and(eq(vendorFollows.vendorId, vendorId), eq(vendorFollows.userId, user.id)))
      .limit(1),
  ]);
  return { signedIn: true, following: Boolean(row), own };
}

/** Follow a vendor. Following twice is a no-op: one row per vendor and account. */
export async function followVendor(user: SessionUser, slug: string): Promise<VendorActionResult> {
  const vendor = await publicVendorBySlug(slug);
  const refusal = followRefusal({ vendorPublic: Boolean(vendor), ownVendor: vendor?.userId === user.id, emailVerified: user.emailVerified });
  if (refusal || !vendor) return { ok: false, error: refusal ?? 'This vendor is not on the site right now.' };
  await getDb().insert(vendorFollows).values({ vendorId: vendor.id, userId: user.id, source: 'qr' }).onConflictDoNothing();
  revalidatePath('/vendor/footprint');
  return { ok: true, message: 'Following.' };
}

export async function unfollowVendor(user: SessionUser, slug: string): Promise<VendorActionResult> {
  if (!SLUG.test(slug)) return { ok: false, error: 'Unknown vendor.' };
  const [vendor] = await getDb().select({ id: vendors.id }).from(vendors).where(eq(vendors.slug, slug)).limit(1);
  if (!vendor) return { ok: false, error: 'Unknown vendor.' };
  await getDb().delete(vendorFollows).where(and(eq(vendorFollows.vendorId, vendor.id), eq(vendorFollows.userId, user.id)));
  revalidatePath('/vendor/footprint');
  return { ok: true, message: 'Unfollowed.' };
}

/* ------------------------------------------------------------------ *
 * Footprint: what the vendor sees, counts only
 * ------------------------------------------------------------------ */

async function hourBuckets(vendorId: string, since: Date): Promise<HourBucket[]> {
  const db = getDb();
  // ISO hour strings straight from Postgres, so no driver date parsing is involved.
  const isoHour = (column: typeof vendorQrScans.createdAt | typeof vendorFollows.createdAt) =>
    sql<string>`to_char(date_trunc('hour', ${column} at time zone 'UTC'), 'YYYY-MM-DD"T"HH24:00:00.000"Z"')`;
  const scanHour = isoHour(vendorQrScans.createdAt);
  const followHour = isoHour(vendorFollows.createdAt);
  const [scans, follows] = await Promise.all([
    db
      .select({ hour: scanHour, n: count() })
      .from(vendorQrScans)
      .where(and(eq(vendorQrScans.vendorId, vendorId), gte(vendorQrScans.createdAt, since)))
      .groupBy(scanHour),
    db
      .select({ hour: followHour, n: count() })
      .from(vendorFollows)
      .where(and(eq(vendorFollows.vendorId, vendorId), gte(vendorFollows.createdAt, since)))
      .groupBy(followHour),
  ]);
  const byHour = new Map<string, HourBucket>();
  for (const row of scans) {
    const hour = row.hour;
    byHour.set(hour, { hour, scans: row.n, follows: byHour.get(hour)?.follows ?? 0 });
  }
  for (const row of follows) {
    const hour = row.hour;
    byHour.set(hour, { hour, scans: byHour.get(hour)?.scans ?? 0, follows: row.n });
  }
  return [...byHour.values()].sort((a, b) => a.hour.localeCompare(b.hour));
}

/** The signed-in vendor's own Footprint, or null without a vendor. Never another vendor's. */
export async function vendorFootprint(user: SessionUser, now = new Date()): Promise<Footprint | null> {
  const vendor = await getVendorForUser(user.id);
  if (!vendor) return null;
  const db = getDb();
  const monthAgo = new Date(now.getTime() - FOOTPRINT_DAYS * 86_400_000);
  // One extra day so every browser time zone gets full days.
  const seriesSince = new Date(now.getTime() - (FOOTPRINT_DAYS + 1) * 86_400_000);
  const [[scans], [follows], [scans30], [follows30], hours] = await Promise.all([
    db.select({ n: count() }).from(vendorQrScans).where(eq(vendorQrScans.vendorId, vendor.id)),
    db.select({ n: count() }).from(vendorFollows).where(eq(vendorFollows.vendorId, vendor.id)),
    db.select({ n: count() }).from(vendorQrScans).where(and(eq(vendorQrScans.vendorId, vendor.id), gte(vendorQrScans.createdAt, monthAgo))),
    db.select({ n: count() }).from(vendorFollows).where(and(eq(vendorFollows.vendorId, vendor.id), gte(vendorFollows.createdAt, monthAgo))),
    hourBuckets(vendor.id, seriesSince),
  ]);
  return {
    totals: { scans: scans?.n ?? 0, follows: follows?.n ?? 0, scans30: scans30?.n ?? 0, follows30: follows30?.n ?? 0 },
    hours,
  };
}

/* ------------------------------------------------------------------ *
 * For the bot metrics endpoint (#62)
 * ------------------------------------------------------------------ */

export interface VendorReachCounts {
  follows: number;
  follows_30d: number;
  qr_scans: number;
  qr_scans_30d: number;
  vendors_with_follows: number;
  vendors_with_scans: number;
}

/**
 * Site-wide follow and scan totals, the same numbers vendors see summed.
 * Aggregates only. `GET /api/bot/metrics` can put this under
 * `vendors.follow_or_scan_counts`.
 */
export async function vendorReachCounts(now = new Date()): Promise<VendorReachCounts> {
  const db = getDb();
  const monthAgo = new Date(now.getTime() - FOOTPRINT_DAYS * 86_400_000).toISOString();
  const [[follows], [scans]] = await Promise.all([
    db
      .select({
        total: count(),
        recent: sql<number>`count(*) filter (where ${vendorFollows.createdAt} >= ${monthAgo}::timestamptz)`.mapWith(Number),
        vendors: sql<number>`count(distinct ${vendorFollows.vendorId})`.mapWith(Number),
      })
      .from(vendorFollows),
    db
      .select({
        total: count(),
        recent: sql<number>`count(*) filter (where ${vendorQrScans.createdAt} >= ${monthAgo}::timestamptz)`.mapWith(Number),
        vendors: sql<number>`count(distinct ${vendorQrScans.vendorId})`.mapWith(Number),
      })
      .from(vendorQrScans),
  ]);
  return {
    follows: follows?.total ?? 0,
    follows_30d: follows?.recent ?? 0,
    qr_scans: scans?.total ?? 0,
    qr_scans_30d: scans?.recent ?? 0,
    vendors_with_follows: follows?.vendors ?? 0,
    vendors_with_scans: scans?.vendors ?? 0,
  };
}
