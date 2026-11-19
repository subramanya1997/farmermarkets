import { NextResponse } from 'next/server';
import { botAuthorized } from '@/lib/botAuth';
import { uploadBotPhotos, type BotPhotoInput } from '@/lib/botActions';
import { MAX_BOT_PHOTOS_PER_REQUEST, botPhotoFields } from '@/lib/botRequests';
import { UNAUTHORIZED, botError, findMarket, invalid, marketJson, marketNotFound, serverError } from '@/lib/botRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/bot/photos (multipart/form-data)
 *
 * The outreach bot publishes photos an operator sent: they are stored in
 * Vercel Blob under the market's folder and go live at once, with an audit
 * row in `bot_actions`. JPEG, PNG and WebP only; HEIC is refused with 415
 * until the shared converter lands. Removing photos is a separate,
 * reviewed request (POST /api/bot/photo-removals). See docs/organizer-bot.md.
 */
export async function POST(request: Request) {
  if (!botAuthorized(request)) return UNAUTHORIZED();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return botError(400, 'Send multipart/form-data with the fields and one or more "photo" files.');
  }
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === 'string' && value.trim() ? value : undefined;
  };
  const fields = botPhotoFields.safeParse({
    market: text('market') ?? '',
    note: text('note') ?? '',
    email: text('email'),
    alt: text('alt'),
    caption: text('caption'),
    credit: text('credit'),
  });
  if (!fields.success) return invalid(fields.error);

  const files = form.getAll('photo').filter((value): value is File => typeof value !== 'string');
  if (files.length === 0) return invalid([{ path: 'photo', message: 'Attach at least one file in a "photo" field.' }]);
  if (files.length > MAX_BOT_PHOTOS_PER_REQUEST) {
    return invalid([{ path: 'photo', message: `Send up to ${MAX_BOT_PHOTOS_PER_REQUEST} photos per request.` }]);
  }

  try {
    const market = await findMarket(fields.data.market);
    if (!market) return marketNotFound(fields.data.market);

    const inputs: BotPhotoInput[] = await Promise.all(
      files.map(async (file, index) => ({ name: file.name || `photo ${index + 1}`, bytes: new Uint8Array(await file.arrayBuffer()) })),
    );
    const result = await uploadBotPhotos(market, inputs, fields.data);
    if (!result.ok) return botError(result.status, result.error);
    return NextResponse.json({ ok: true, market: marketJson(market), audit_id: result.auditId, photos: result.photos });
  } catch (error) {
    return serverError(error, 'Bot photo upload');
  }
}
