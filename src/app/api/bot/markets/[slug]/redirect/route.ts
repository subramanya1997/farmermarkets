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
 * Merges a duplicate page into the one we keep: the duplicate's URL then
 * answers with a 301 to `to_slug`. Merges need Subramanya's sign-off, so a
 * merge is published only when it names `approved_by` AND the call uses
 * `LISTING_BOT_MERGE_TOKEN`. Otherwise it waits in /admin/review (202).
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
    const extra =
      result.ok && result.pending
        ? {
            message: identity.canMerge
              ? 'Waiting for an admin in /admin/review: send approved_by to publish it now.'
              : 'Waiting for an admin in /admin/review: merges are published only with the merge token and approved_by.',
          }
        : {};
    return writeResponse(result, extra);
  });
}
