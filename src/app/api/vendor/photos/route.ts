/**
 * Issues Vercel Blob client-upload tokens for vendor profile photos.
 *
 * The browser uploads straight to the public photo store; this route only
 * says yes or no. A token is issued only to a signed-in, verified account,
 * only for that account's own vendor folder, only for JPEG/PNG/WebP/HEIC/HEIF
 * up to 8 MB (the file as sent). HEIC/HEIF go on to `./convert`, which turns
 * them into JPEG. The photo goes public only when an admin approves the
 * profile it is part of; the profile action checks the folder again.
 */
import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getSessionUser } from '@/lib/organizer';
import { requestOriginAllowed } from '@/lib/formGuards';
import { MAX_VENDOR_PHOTO_BYTES, VENDOR_PHOTO_CONTENT_TYPES } from '@/lib/vendorProfile';
import { ensureVendor, inVendorPreview, vendorPhotoPathPrefix } from '@/lib/vendors';

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
      onBeforeGenerateToken: async (pathname) => {
        const user = await getSessionUser();
        if (!user?.emailVerified) throw new Error('Sign in to upload photos.');
        if (await inVendorPreview(user)) throw new Error('This is a preview, so nothing was saved.');
        const vendor = await ensureVendor(user);
        if (!pathname.startsWith(vendorPhotoPathPrefix(vendor.id))) throw new Error('Upload path does not match your account.');
        return {
          allowedContentTypes: VENDOR_PHOTO_CONTENT_TYPES,
          maximumSizeInBytes: MAX_VENDOR_PHOTO_BYTES,
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

/** Tells the uploader which folder to use, creating the vendor row on first use. */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.emailVerified) return NextResponse.json({ error: 'Sign in to upload photos.' }, { status: 401 });
  if (await inVendorPreview(user)) return NextResponse.json({ error: 'This is a preview, so nothing was saved.' }, { status: 403 });
  const vendor = await ensureVendor(user);
  return NextResponse.json({ pathPrefix: vendorPhotoPathPrefix(vendor.id) }, { headers: { 'Cache-Control': 'private, no-store' } });
}
