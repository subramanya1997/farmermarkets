import { NextResponse } from 'next/server';
import { botAuthorized } from '@/lib/botAuth';
import { requestPhotoRemoval } from '@/lib/botActions';
import { botPhotoRemovalBody } from '@/lib/botRequests';
import { UNAUTHORIZED, botError, findMarket, invalid, marketJson, marketNotFound, serverError } from '@/lib/botRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/bot/photo-removals
 *
 * An operator asked to take photos down. The bot never removes published
 * photos itself: this stores a pending request for an admin in
 * /admin/review and returns 202. See docs/organizer-bot.md.
 */
export async function POST(request: Request) {
  if (!botAuthorized(request)) return UNAUTHORIZED();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return botError(400, 'Send a JSON body.');
  }
  const parsed = botPhotoRemovalBody.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  try {
    const market = await findMarket(parsed.data.market);
    if (!market) return marketNotFound(parsed.data.market);
    const result = await requestPhotoRemoval(market, parsed.data.photos, parsed.data);
    return NextResponse.json(
      {
        ok: true,
        pending: true,
        market: marketJson(market),
        audit_id: result.auditId,
        matched_photo_ids: result.matched,
        unmatched: result.unmatched,
      },
      { status: 202 },
    );
  } catch (error) {
    return serverError(error, 'Bot photo removal request');
  }
}
