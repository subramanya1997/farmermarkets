import { botError } from '@/lib/botRoute';
import { removeBotPhoto, updateBotPhoto } from '@/lib/listingBot';
import { issuesOf, photoDetailsBody, photoRemovalBody } from '@/lib/listingBotRequests';
import { readJson, withListingBot, writableMarket, writeContext, writeResponse } from '@/lib/listingBotRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ slug: string; id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PATCH /api/bot/markets/:slug/photos/:id — caption, credit, alt text. */
export async function PATCH(request: Request, { params }: Context) {
  const { slug, id } = await params;
  return withListingBot(request, 'Bot photo edit', async (identity) => {
    if (!UUID.test(id)) return botError(404, 'No photo with that id.');
    const body = await readJson(request, photoDetailsBody);
    if (!body.ok) return body.response;
    const target = await writableMarket(slug);
    if (!target.ok) return target.response;
    const { source_note: _note, operator_email: _email, ...details } = body.data;
    void _note;
    void _email;
    const result = await updateBotPhoto(target.market, id.toLowerCase(), details, writeContext(request, identity, body.data));
    return writeResponse(result, { market: { id: target.market.id, slug: target.market.slug } });
  });
}

/**
 * DELETE /api/bot/markets/:slug/photos/:id
 *
 * Hides the photo from the page. Not a hard delete: the row and the file
 * stay, so an admin can bring it back. The source note goes in a JSON body
 * or as `?source_note=`.
 */
export async function DELETE(request: Request, { params }: Context) {
  const { slug, id } = await params;
  return withListingBot(request, 'Bot photo removal', async (identity) => {
    if (!UUID.test(id)) return botError(404, 'No photo with that id.');
    const query = new URL(request.url).searchParams;
    let input: unknown;
    const raw = await request.text();
    if (raw.trim()) {
      try {
        input = JSON.parse(raw);
      } catch {
        return botError(400, 'Send a JSON body, or the source note as ?source_note=.');
      }
    } else {
      input = { source_note: query.get('source_note') ?? '', ...(query.get('operator_email') ? { operator_email: query.get('operator_email') } : {}) };
    }
    const parsed = photoRemovalBody.safeParse(input);
    if (!parsed.success) return botError(400, 'Invalid request.', { issues: issuesOf(parsed.error) });
    const target = await writableMarket(slug);
    if (!target.ok) return target.response;
    const result = await removeBotPhoto(target.market, id.toLowerCase(), writeContext(request, identity, parsed.data));
    return writeResponse(result, { market: { id: target.market.id, slug: target.market.slug } });
  });
}
