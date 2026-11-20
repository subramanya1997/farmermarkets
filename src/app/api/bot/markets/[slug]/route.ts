import { NextResponse } from 'next/server';
import { botError } from '@/lib/botRoute';
import { applyListingChanges, editableRecord, findBotMarket } from '@/lib/listingBot';
import { patchBody, patchToEdits } from '@/lib/listingBotRequests';
import { readJson, withListingBot, writableMarket, writeContext, writeResponse } from '@/lib/listingBotRoute';
import { listingEditsFromMarket } from '@/lib/organizerOverlay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ slug: string }> };

/**
 * GET /api/bot/markets/:slug
 *
 * The full editable record of a market page, in the shapes the write
 * endpoints take. Old slugs are followed; a page merged into another one
 * says so in `redirect`. See docs/listing-bot.md.
 */
export async function GET(request: Request, { params }: Context) {
  const { slug } = await params;
  return withListingBot(request, 'Bot market read', async () => {
    const found = await findBotMarket(slug);
    if (!found.ok) return botError(404, found.error);
    return NextResponse.json({ ok: true, market: await editableRecord(found) });
  });
}

/**
 * PATCH /api/bot/markets/:slug
 *
 * Partial update of the listing's name, operator, address, map pin, phone,
 * website, payments and description. Fields not sent stay as they are.
 * `?dry_run=true` returns the diff and changes nothing.
 */
export async function PATCH(request: Request, { params }: Context) {
  const { slug } = await params;
  return withListingBot(request, 'Bot market update', async (identity) => {
    const body = await readJson(request, patchBody);
    if (!body.ok) return body.response;
    const target = await writableMarket(slug);
    if (!target.ok) return target.response;
    const { source_note: _note, operator_email: _email, ...fields } = body.data;
    void _note;
    void _email;
    if (Object.keys(fields).length === 0) return botError(400, 'Send at least one field to change.');
    const changes = patchToEdits(listingEditsFromMarket(target.market), fields);
    const result = await applyListingChanges(target.market, changes, writeContext(request, identity, body.data), 'listing_edit');
    return writeResponse(result, { market: { id: target.market.id, slug: target.market.slug } });
  });
}
