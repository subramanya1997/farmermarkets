import { botError } from '@/lib/botRoute';
import { findBotMarket, mergeBotMarket } from '@/lib/listingBot';
import { redirectBody } from '@/lib/listingBotRequests';
import { readJson, withListingBot, writeContext, writeResponse } from '@/lib/listingBotRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ slug: string }> };

/**
 * POST /api/bot/markets/:slug/redirect { to_slug, approved_by? }
 *
 * Asks to merge a duplicate page into the one we keep. Merges need
 * Subramanya's sign-off, so this only queues the merge for /admin/review
 * (202); approving it there makes the duplicate's URL answer with a 301 to
 * `to_slug`. `approved_by` is recorded with the request.
 */
export async function POST(request: Request, { params }: Context) {
  const { slug } = await params;
  return withListingBot(request, 'Bot market merge', async (identity) => {
    const body = await readJson(request, redirectBody);
    if (!body.ok) return body.response;
    // Not `writableMarket`: repeating a merge that is already live must answer "unchanged", not 409.
    const found = await findBotMarket(slug);
    if (!found.ok) return botError(404, found.error);
    const result = await mergeBotMarket(found.market, body.data.to_slug, body.data.approved_by, writeContext(request, identity, body.data));
    const extra = result.ok && result.pending && result.changed && !result.dry_run
      ? { message: 'Waiting for an admin in /admin/review. Approving it there publishes the 301.' }
      : {};
    return writeResponse(result, extra);
  });
}
