/**
 * Opens one vendor document for someone allowed to see it: the vendor, an
 * admin, or an organizer of a market the document was sent to
 * (`documentForDownload` decides). Everyone else gets a plain 404, signed
 * in or not, so the route never confirms that a document exists.
 *
 * The file is streamed from the private Blob store and always served as a
 * download, never rendered on this origin.
 */
import { get } from '@vercel/blob';
import { getSessionUser } from '@/lib/organizer';
import { documentForDownload, documentsToken } from '@/lib/vendors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXTENSIONS: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  const token = documentsToken();
  if (!user?.emailVerified || !token) return notFound();
  const document = await documentForDownload(user, id);
  if (!document) return notFound();

  const file = await get(document.pathname, { access: 'private', token, useCache: false }).catch((error) => {
    console.error('Vendor document read failed:', error);
    return null;
  });
  if (!file || file.statusCode !== 200) return notFound();

  const extension = EXTENSIONS[document.contentType] ?? 'bin';
  const name = document.label.replace(/[^A-Za-z0-9 _.-]/g, '').trim().slice(0, 80) || 'document';
  return new Response(file.stream, {
    headers: {
      'Content-Type': EXTENSIONS[document.contentType] ? document.contentType : 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${name}.${extension}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
