'use server';

/**
 * Server actions for shopper updates. Each one re-checks the session;
 * src/lib/marketUpdates.ts checks that the account runs the market and that
 * the update belongs to it.
 */
import { revalidatePath } from 'next/cache';
import { getPublishedMarket, getSessionUser } from '@/lib/organizer';
import { editMarketUpdate, postMarketUpdate, withdrawMarketUpdate, type MarketUpdateResult } from '@/lib/marketUpdates';

async function context(slug: string) {
  const user = await getSessionUser();
  if (!user?.emailVerified) return { error: { ok: false as const, error: 'Your session ended. Sign in again to continue.' } };
  const market = await getPublishedMarket(String(slug));
  if (!market) return { error: { ok: false as const, error: 'We could not find that market.' } };
  return { user, market };
}

function refresh(slug: string) {
  revalidatePath(`/dashboard/markets/${slug}`, 'layout');
}

export async function postMarketUpdateAction(slug: string, input: unknown): Promise<MarketUpdateResult> {
  const found = await context(slug);
  if ('error' in found) return found.error!;
  const result = await postMarketUpdate(found.user, found.market, input);
  if (result.ok) refresh(found.market.slug);
  return result;
}

export async function editMarketUpdateAction(slug: string, updateId: string, input: unknown): Promise<MarketUpdateResult> {
  const found = await context(slug);
  if ('error' in found) return found.error!;
  const result = await editMarketUpdate(found.user, found.market, String(updateId), input);
  if (result.ok) refresh(found.market.slug);
  return result;
}

export async function withdrawMarketUpdateAction(slug: string, updateId: string): Promise<MarketUpdateResult> {
  const found = await context(slug);
  if ('error' in found) return found.error!;
  const result = await withdrawMarketUpdate(found.user, found.market, String(updateId));
  if (result.ok) refresh(found.market.slug);
  return result;
}
