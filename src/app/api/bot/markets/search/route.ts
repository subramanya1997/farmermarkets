import { NextResponse } from 'next/server';
import { botError } from '@/lib/botRoute';
import { searchBotMarkets } from '@/lib/listingBot';
import { withListingBot } from '@/lib/listingBotRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/bot/markets/search?q=&city=&state=&limit=
 *
 * Finds market pages by name, city or state (code or name), to check for
 * duplicates and existing pages before creating one. Merged pages carry
 * `redirect_to`.
 */
export async function GET(request: Request) {
  return withListingBot(request, 'Bot market search', async () => {
    const params = new URL(request.url).searchParams;
    const q = params.get('q')?.trim().slice(0, 200) || undefined;
    const city = params.get('city')?.trim().slice(0, 80) || undefined;
    const state = params.get('state')?.trim().slice(0, 60) || undefined;
    const limit = Number(params.get('limit') ?? 20);
    const unknown = [...params.keys()].filter((key) => !['q', 'city', 'state', 'limit'].includes(key));
    if (unknown.length) return botError(400, `Unknown parameter: ${unknown.join(', ')}.`);
    if (!q && !city && !state) return botError(400, 'Send q, city or state.');
    const result = await searchBotMarkets({ q, city, state, limit: Number.isFinite(limit) ? limit : 20 });
    return NextResponse.json({ ok: true, ...result });
  });
}
