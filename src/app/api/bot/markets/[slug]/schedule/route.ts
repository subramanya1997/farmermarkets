import { applyListingChanges } from '@/lib/listingBot';
import { botError } from '@/lib/botRoute';
import { pastDateIssues, scheduleBody, scheduleToEdits } from '@/lib/listingBotRequests';
import { readJson, withListingBot, writableMarket, writeContext, writeResponse } from '@/lib/listingBotRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ slug: string }> };

/**
 * PUT /api/bot/markets/:slug/schedule
 *
 * Replaces the market's hours with structured data: weekly hours by day,
 * seasonal date ranges with their own hours, one-off special dates and
 * closures (and the season, when sent). The page text, the "Plan your
 * visit" card and the JSON-LD openingHoursSpecification /
 * specialOpeningHoursSpecification are all built from what this stores.
 */
export async function PUT(request: Request, { params }: Context) {
  const { slug } = await params;
  return withListingBot(request, 'Bot schedule update', async (identity) => {
    const body = await readJson(request, scheduleBody);
    if (!body.ok) return body.response;
    // A day of slack for markets west of UTC.
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const past = pastDateIssues(body.data, yesterday);
    if (past.length) return botError(400, 'Invalid request.', { issues: past });
    const target = await writableMarket(slug);
    if (!target.ok) return target.response;
    const result = await applyListingChanges(target.market, scheduleToEdits(body.data), writeContext(request, identity, body.data), 'schedule_replace');
    return writeResponse(result, { market: { id: target.market.id, slug: target.market.slug } });
  });
}
