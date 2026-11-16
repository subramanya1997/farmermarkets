/**
 * Issues Vercel Blob client-upload tokens for organizer photos.
 *
 * The browser uploads straight to Blob (photos are larger than a server
 * action body allows); this route only says yes or no. A token is issued
 * only to a signed-in, verified organizer who manages the market, only for
 * that market's folder, only for JPEG/PNG/WebP up to 8 MB. The browser then
 * registers the finished upload with a server action, which checks the same
 * things again and queues the photo for review.
 */
import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import {
  MAX_PHOTO_BYTES,
  PHOTO_CONTENT_TYPES,
  canManageMarket,
  getPublishedMarket,
  getSessionUser,
  photoPathPrefix,
} from '@/lib/organizer';
import { requestOriginAllowed } from '@/lib/formGuards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: 'Request origin is not allowed.' }, { status: 403 });
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const user = await getSessionUser();
        if (!user?.emailVerified) throw new Error('Sign in to upload photos.');
        const { slug } = JSON.parse(clientPayload ?? '{}') as { slug?: string };
        const market = slug ? await getPublishedMarket(slug) : null;
        if (!market || !(await canManageMarket(user, market.id))) throw new Error('You do not manage this market.');
        if (!pathname.startsWith(photoPathPrefix(market.id))) throw new Error('Upload path does not match this market.');
        return {
          allowedContentTypes: PHOTO_CONTENT_TYPES,
          maximumSizeInBytes: MAX_PHOTO_BYTES,
          addRandomSuffix: true,
          allowOverwrite: false,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload was not allowed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
