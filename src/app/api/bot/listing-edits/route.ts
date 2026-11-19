import { NextResponse } from 'next/server';
import { botAuthorized } from '@/lib/botAuth';
import { applyBotListingEdits, requestListingRemoval } from '@/lib/botActions';
import { botListingEditsBody, fillFromLive } from '@/lib/botRequests';
import { UNAUTHORIZED, botError, findMarket, invalid, marketJson, marketNotFound, serverError } from '@/lib/botRoute';
import { parseListingEdits } from '@/lib/listingEdits';
import { listingEditsFromMarket } from '@/lib/organizerOverlay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/bot/listing-edits
 *
 * The outreach bot publishes corrections an operator sent by email (hours,
 * address, name, map pin, SNAP, links) straight to the live listing, with
 * only the corrected fields sent (object sections are filled from the live
 * listing; list sections like schedules replace the whole list), with
 * an audit row in `bot_actions`. Taking a listing down, or marking it
 * permanently closed, is never published: it waits for an admin in
 * /admin/review. Authorized by `Authorization: Bearer $ORGANIZER_BOT_TOKEN`;
 * see docs/organizer-bot.md.
 */
export async function POST(request: Request) {
  if (!botAuthorized(request)) return UNAUTHORIZED();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return botError(400, 'Send a JSON body.');
  }
  const parsed = botListingEditsBody.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const { market: marketValue, note, email, changes, remove_listing } = parsed.data;

  try {
    const market = await findMarket(marketValue);
    if (!market) return marketNotFound(marketValue);

    if (remove_listing) {
      const auditId = await requestListingRemoval(market, { note, email });
      return NextResponse.json(
        { ok: true, pending: true, market: marketJson(market), sections: [], audit_id: auditId, pending_requests: [{ id: auditId, action: 'remove_listing' }] },
        { status: 202 },
      );
    }

    const edits = parseListingEdits(fillFromLive(listingEditsFromMarket(market), changes ?? {}), { admin: true });
    if (!edits.ok) return invalid(edits.errors.map((issue) => ({ ...issue, path: `changes.${issue.path}` })));
    const result = await applyBotListingEdits(market, edits.edits, { note, email });
    const pending = result.pending.length > 0;
    return NextResponse.json(
      {
        ok: true,
        pending,
        market: marketJson(market),
        sections: result.sections,
        audit_id: result.auditId,
        pending_requests: result.pending,
        ...(result.sections.length === 0 && !pending ? { message: 'The listing already says this. Nothing changed.' } : {}),
      },
      { status: pending && result.sections.length === 0 ? 202 : 200 },
    );
  } catch (error) {
    return serverError(error, 'Bot listing edit');
  }
}
