import { NextResponse } from 'next/server';
import { botError } from '@/lib/botRoute';
import { addBotPhoto, arrangeBotPhotos } from '@/lib/listingBot';
import { issuesOf, photoFields, photoOrderBody } from '@/lib/listingBotRequests';
import { readJson, withListingBot, writableMarket, writeContext, writeResponse } from '@/lib/listingBotRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ slug: string }> };

const FIELD_NAMES = new Set(['source_note', 'operator_email', 'url', 'caption', 'credit', 'alt', 'cover', 'photo']);

/**
 * POST /api/bot/markets/:slug/photos
 *
 * Adds one photo, published at once: a multipart `photo` file, or JSON with
 * an https `url` to fetch. Caption, credit and a source note go with it.
 * HEIC is converted to JPEG. Sending the same image again adds nothing.
 */
export async function POST(request: Request, { params }: Context) {
  const { slug } = await params;
  return withListingBot(request, 'Bot photo upload', async (identity) => {
    const type = request.headers.get('content-type') ?? '';
    let fields: unknown;
    let file: { name: string; bytes: Uint8Array } | undefined;
    if (type.startsWith('multipart/form-data')) {
      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        return botError(400, 'Could not read the multipart body.');
      }
      const unknown = [...new Set(form.keys())].filter((key) => !FIELD_NAMES.has(key));
      if (unknown.length) return botError(400, 'Invalid request.', { issues: unknown.map((key) => ({ path: key, message: 'Unknown field' })) });
      const files = form.getAll('photo').filter((value): value is File => typeof value !== 'string');
      if (files.length > 1) return botError(400, 'Send one photo per call.');
      if (files[0]) file = { name: files[0].name || 'photo', bytes: new Uint8Array(await files[0].arrayBuffer()) };
      const text = (key: string) => {
        const value = form.get(key);
        return typeof value === 'string' && value.trim() ? value : undefined;
      };
      fields = {
        source_note: text('source_note') ?? '',
        operator_email: text('operator_email'),
        url: text('url'),
        caption: text('caption'),
        credit: text('credit'),
        alt: text('alt'),
        cover: text('cover') === undefined ? undefined : text('cover') === 'true',
      };
    } else {
      try {
        fields = await request.json();
      } catch {
        return botError(400, 'Send multipart/form-data with a "photo" file, or JSON with a "url".');
      }
    }
    const parsed = photoFields.safeParse(fields);
    if (!parsed.success) return botError(400, 'Invalid request.', { issues: issuesOf(parsed.error) });
    if (Boolean(file) === Boolean(parsed.data.url)) return botError(400, 'Send either a "photo" file or a "url", not both.');

    const target = await writableMarket(slug);
    if (!target.ok) return target.response;
    const result = await addBotPhoto(target.market, { ...parsed.data, file }, writeContext(request, identity, parsed.data));
    if (result.ok && !result.changed && !result.dry_run) {
      return NextResponse.json({ ...result, message: 'This photo is already on the listing. Nothing changed.' });
    }
    return writeResponse(result, { market: { id: target.market.id, slug: target.market.slug } });
  });
}

/**
 * PATCH /api/bot/markets/:slug/photos
 *
 * `{ "order": [ids...] }` reorders the published photos (listed ids first,
 * the rest after them as they were); `{ "cover": id }` moves one photo to
 * the front, which makes it the cover on the page and on cards.
 */
export async function PATCH(request: Request, { params }: Context) {
  const { slug } = await params;
  return withListingBot(request, 'Bot photo reorder', async (identity) => {
    const body = await readJson(request, photoOrderBody);
    if (!body.ok) return body.response;
    const target = await writableMarket(slug);
    if (!target.ok) return target.response;
    const result = await arrangeBotPhotos(target.market, body.data, writeContext(request, identity, body.data));
    return writeResponse(result, { market: { id: target.market.id, slug: target.market.slug } });
  });
}
