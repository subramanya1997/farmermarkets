'use server';

/**
 * Market search for the public `/for-market-operators` page, so a visitor can
 * find their market and go straight to its claim page before signing in.
 * It runs the same search as the organizer dashboard and returns only what
 * the public directory already shows: slug, name, city and state.
 */
import { headers } from 'next/headers';
import { marketService } from '@/app/api/markets/data';
import type { MarketSearchHit } from '@/app/(app)/dashboard/actions';
import { createRateLimiter } from '@/lib/formGuards';
import { searchMarkets } from '@/lib/marketSearch';

// Generous for a person typing (each pause is one search), tight enough to
// stop a script from walking the directory through this door.
const isRateLimited = createRateLimiter({ windowMs: 60 * 1000, max: 60 });

export async function searchOperatorMarketsAction(query: string): Promise<MarketSearchHit[]> {
  const text = String(query ?? '').trim().slice(0, 100);
  if (text.length < 2) return [];
  if (isRateLimited(new Request('https://farmermarkets.app', { headers: await headers() }))) {
    throw new Error('Too many searches');
  }
  const markets = await marketService.getAllMarkets();
  return searchMarkets(markets, text)
    .slice(0, 12)
    .map((market) => ({ slug: market.slug, name: market.name, city: market.city, state: market.state }));
}
