/**
 * Markets the listing bot created (`bot_markets`), read by `marketService`
 * when a slug or id is not in the dataset file. Each read is one indexed
 * query; nothing is memoized across requests, so a new market is live on the
 * next request. A missing database means "no bot markets".
 */
import 'server-only';
import { eq, inArray } from 'drizzle-orm';
import { DatabaseUnavailableError, dbSchema, getDb } from '@/db';
import type { RawMarketData } from '@/app/api/markets/data';

const { botMarkets } = dbSchema;

/** Ids of bot-created markets start with this, so an id lookup knows where to look. */
export const BOT_MARKET_ID_PREFIX = 'bot-';

function db() {
  try {
    return getDb();
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) return null;
    throw error;
  }
}

export async function botMarketRecordBySlug(slug: string): Promise<RawMarketData | null> {
  const client = db();
  if (!client || !/^[a-z0-9-]{1,200}$/.test(slug)) return null;
  const [row] = await client.select({ record: botMarkets.record }).from(botMarkets).where(eq(botMarkets.slug, slug)).limit(1);
  return (row?.record as RawMarketData | undefined) ?? null;
}

export async function botMarketRecordsByIds(ids: string[]): Promise<RawMarketData[]> {
  const wanted = ids.filter((id) => id.startsWith(BOT_MARKET_ID_PREFIX));
  const client = db();
  if (!client || wanted.length === 0) return [];
  const rows = await client.select({ record: botMarkets.record }).from(botMarkets).where(inArray(botMarkets.id, wanted));
  return rows.map((row) => row.record as RawMarketData);
}

export async function allBotMarketRecords(): Promise<RawMarketData[]> {
  const client = db();
  if (!client) return [];
  const rows = await client.select({ record: botMarkets.record }).from(botMarkets);
  return rows.map((row) => row.record as RawMarketData);
}
