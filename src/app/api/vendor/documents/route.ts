/**
 * Issues Vercel Blob client-upload tokens for vendor documents (permits,
 * insurance certificates and the like).
 *
 * Documents go to a separate PRIVATE Blob store (`VENDOR_DOCS_READ_WRITE_TOKEN`):
 * nothing in it has a public URL. A token is issued only to a signed-in,
 * verified account, only for that account's own folder, only for PDF, JPEG
 * or PNG up to 10 MB. The browser then registers the upload with a server
 * action, which checks the same things again. Reading a document goes
 * through /api/vendor/documents/[id], which decides who may open it.
 */
import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getSessionUser } from '@/lib/organizer';
import { requestOriginAllowed } from '@/lib/formGuards';
import { DOCUMENT_CONTENT_TYPES, MAX_DOCUMENT_BYTES } from '@/lib/vendorProfile';
import { documentPathPrefix, documentsToken, ensureVendor } from '@/lib/vendors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: 'Request origin is not allowed.' }, { status: 403 });
  }
  const token = documentsToken();
  if (!token) return NextResponse.json({ error: 'Document uploads are not available yet.' }, { status: 503 });

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
      token,
      onBeforeGenerateToken: async (pathname) => {
        const user = await getSessionUser();
        if (!user?.emailVerified) throw new Error('Sign in to upload documents.');
        const vendor = await ensureVendor(user);
        if (!pathname.startsWith(documentPathPrefix(vendor.id))) throw new Error('Upload path does not match your account.');
        return {
          allowedContentTypes: DOCUMENT_CONTENT_TYPES,
          maximumSizeInBytes: MAX_DOCUMENT_BYTES,
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
  if (!user?.emailVerified) return NextResponse.json({ error: 'Sign in to upload documents.' }, { status: 401 });
  if (!documentsToken()) return NextResponse.json({ error: 'Document uploads are not available yet.' }, { status: 503 });
  const vendor = await ensureVendor(user);
  return NextResponse.json({ pathPrefix: documentPathPrefix(vendor.id) }, { headers: { 'Cache-Control': 'private, no-store' } });
}
