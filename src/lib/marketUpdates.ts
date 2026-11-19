/**
 * Shopper updates as their managers see them: post, edit and withdraw.
 *
 * Every write checks the session against `canPostMarketUpdates` (a confirmed
 * manager or an admin, email verified) and that the update belongs to the
 * market on the page. Nothing here touches `market_overrides` or the
 * dataset; listing changes still go through `submitChangeRequest` and
 * /admin review. The rules themselves live in ./marketUpdateRules.
 */
import 'server-only';
import { and, count, desc, eq, gt, isNull } from 'drizzle-orm';
import { dbSchema, getDb } from '@/db';
import type { FarmerMarket } from '@/app/api/markets/data';
import { canManageMarket, isAdmin, revalidateMarket, type SessionUser } from './organizer';
import { getPostHogServer } from './posthogServer';
import {
  MAX_OPEN_UPDATES,
  canPostMarketUpdates,
  isOpenUpdate,
  marketUpdateState,
  parseMarketUpdate,
  type MarketUpdateState,
} from './marketUpdateRules';

const { marketUpdates } = dbSchema;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MarketUpdateResult = { ok: true; message?: string } | { ok: false; error: string };

export interface DashboardMarketUpdate {
  id: string;
  body: string;
  /** ISO instants, formatted in the browser so dates read in the organizer's own time zone. */
  startsAt: string;
  endsAt: string;
  state: MarketUpdateState;
}

async function mayPost(user: SessionUser, marketId: string): Promise<boolean> {
  return canPostMarketUpdates({
    emailVerified: user.emailVerified,
    isAdmin: isAdmin(user),
    managesMarket: await canManageMarket(user, marketId),
  });
}

const NOT_ALLOWED: MarketUpdateResult = { ok: false, error: 'Only the people who run this market can post updates.' };

/** Open updates first (soonest to end), then the five most recent past ones. Null without access. */
export async function marketUpdatesFor(user: SessionUser, market: FarmerMarket): Promise<DashboardMarketUpdate[] | null> {
  if (!(await mayPost(user, market.id))) return null;
  const rows = await getDb()
    .select()
    .from(marketUpdates)
    .where(eq(marketUpdates.marketId, market.id))
    .orderBy(desc(marketUpdates.startsAt))
    .limit(40);
  const now = new Date();
  const views = rows.map((row) => ({
    id: row.id,
    body: row.body,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    state: marketUpdateState(row, now),
  }));
  const open = views.filter((row) => row.state === 'live' || row.state === 'scheduled').sort((a, b) => a.endsAt.localeCompare(b.endsAt));
  const past = views.filter((row) => row.state === 'ended' || row.state === 'withdrawn').slice(0, 5);
  return [...open, ...past];
}

async function openUpdateCount(marketId: string, now: Date): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(marketUpdates)
    .where(and(eq(marketUpdates.marketId, marketId), isNull(marketUpdates.withdrawnAt), gt(marketUpdates.endsAt, now)));
  return row?.n ?? 0;
}

export async function postMarketUpdate(user: SessionUser, market: FarmerMarket, input: unknown): Promise<MarketUpdateResult> {
  if (!(await mayPost(user, market.id))) return NOT_ALLOWED;
  const now = new Date();
  const parsed = parseMarketUpdate(input, now);
  if (!parsed.ok) return parsed;
  // A count then an insert: two managers posting in the same second could
  // land one over the limit, which is harmless.
  if ((await openUpdateCount(market.id, now)) >= MAX_OPEN_UPDATES) {
    return { ok: false, error: `You can have ${MAX_OPEN_UPDATES} updates up or scheduled at once. Withdraw one first.` };
  }
  await getDb().insert(marketUpdates).values({
    marketId: market.id,
    body: parsed.data.body,
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
    createdBy: user.id,
  });
  await revalidateMarket(market.slug);
  capture(user.id, 'Market Update Posted', { market_id: market.id, scheduled: parsed.data.startsAt.getTime() > now.getTime() });
  return { ok: true, message: parsed.data.startsAt.getTime() > now.getTime() ? 'Scheduled.' : 'Posted. Shoppers see it on your market page now.' };
}

export async function editMarketUpdate(user: SessionUser, market: FarmerMarket, updateId: string, input: unknown): Promise<MarketUpdateResult> {
  if (!UUID.test(updateId)) return { ok: false, error: 'Unknown update.' };
  if (!(await mayPost(user, market.id))) return NOT_ALLOWED;
  const db = getDb();
  const [row] = await db
    .select()
    .from(marketUpdates)
    .where(and(eq(marketUpdates.id, updateId), eq(marketUpdates.marketId, market.id)))
    .limit(1);
  const now = new Date();
  if (!row) return { ok: false, error: 'Unknown update.' };
  if (!isOpenUpdate(row, now)) return { ok: false, error: 'This update already ended or was withdrawn. Post a new one instead.' };
  const parsed = parseMarketUpdate(input, now);
  if (!parsed.ok) return parsed;
  const [saved] = await db
    .update(marketUpdates)
    .set({ body: parsed.data.body, startsAt: parsed.data.startsAt, endsAt: parsed.data.endsAt, updatedAt: now })
    .where(and(eq(marketUpdates.id, updateId), eq(marketUpdates.marketId, market.id), isNull(marketUpdates.withdrawnAt)))
    .returning({ id: marketUpdates.id });
  if (!saved) return { ok: false, error: 'This update was withdrawn. Post a new one instead.' };
  await revalidateMarket(market.slug);
  capture(user.id, 'Market Update Edited', { market_id: market.id });
  return { ok: true, message: 'Saved.' };
}

export async function withdrawMarketUpdate(user: SessionUser, market: FarmerMarket, updateId: string): Promise<MarketUpdateResult> {
  if (!UUID.test(updateId)) return { ok: false, error: 'Unknown update.' };
  if (!(await mayPost(user, market.id))) return NOT_ALLOWED;
  const now = new Date();
  const [withdrawn] = await getDb()
    .update(marketUpdates)
    .set({ withdrawnAt: now, updatedAt: now })
    .where(and(eq(marketUpdates.id, updateId), eq(marketUpdates.marketId, market.id), isNull(marketUpdates.withdrawnAt)))
    .returning({ id: marketUpdates.id });
  if (!withdrawn) return { ok: false, error: 'This update was already withdrawn.' };
  await revalidateMarket(market.slug);
  capture(user.id, 'Market Update Withdrawn', { market_id: market.id });
  return { ok: true, message: 'Withdrawn. It no longer shows on your market page.' };
}

/** Product analytics without personal data: user ids are opaque, no text. */
function capture(userId: string, event: string, properties: Record<string, unknown>) {
  try {
    getPostHogServer()?.capture({ distinctId: `organizer:${userId}`, event, properties: { ...properties, $process_person_profile: false } });
  } catch {
    // Analytics never fails a request.
  }
}
