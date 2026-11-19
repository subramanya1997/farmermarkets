/**
 * Shopper updates, read for public market pages.
 *
 * Same loading strategy as the vendor layer (./vendorLayer): one read for the
 * whole `next build`, one read per render at runtime with React `cache()`.
 * The table only ever holds a handful of open updates, so reading them all
 * beats one query per market.
 *
 * Pages are cached for up to a day, so this hands the page every update that
 * has not ended yet, scheduled ones included, with its dates. The notice
 * component then decides in the browser which ones are live, so an update
 * appears and expires on time without waiting for the page to rebuild.
 *
 * Nothing here needs a session, so public pages can import it freely.
 */
import 'server-only';
import { cache } from 'react';
import { and, gt, isNull } from 'drizzle-orm';
import { DatabaseUnavailableError, dbSchema, getDb } from '@/db';

const { marketUpdates } = dbSchema;

/** One update as the market page receives it. `body` is plain text and is rendered escaped. */
export interface ShopperUpdate {
  id: string;
  body: string;
  startsAt: string;
  endsAt: string;
}

type UpdatesByMarket = Map<string, ShopperUpdate[]>;

async function queryOpenUpdates(): Promise<UpdatesByMarket> {
  let db;
  try {
    db = getDb();
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) return new Map();
    throw error;
  }
  const rows = await db
    .select({
      id: marketUpdates.id,
      marketId: marketUpdates.marketId,
      body: marketUpdates.body,
      startsAt: marketUpdates.startsAt,
      endsAt: marketUpdates.endsAt,
    })
    .from(marketUpdates)
    .where(and(isNull(marketUpdates.withdrawnAt), gt(marketUpdates.endsAt, new Date())));
  const byMarket: UpdatesByMarket = new Map();
  for (const row of rows) {
    const list = byMarket.get(row.marketId) ?? [];
    list.push({ id: row.id, body: row.body, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() });
    byMarket.set(row.marketId, list);
  }
  return byMarket;
}

let buildUpdates: Promise<UpdatesByMarket> | null = null;

const runtimeUpdates = cache(queryOpenUpdates);

/** Updates for one market that have not ended or been withdrawn. Empty when the database is unavailable. */
export async function getShopperUpdates(marketId: string): Promise<ShopperUpdate[]> {
  try {
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      buildUpdates ??= queryOpenUpdates().catch((error) => {
        console.error('Could not load shopper updates during build:', error);
        return new Map();
      });
      return (await buildUpdates).get(marketId) ?? [];
    }
    return (await runtimeUpdates()).get(marketId) ?? [];
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('Shopper updates unavailable:', error);
    return [];
  }
}
