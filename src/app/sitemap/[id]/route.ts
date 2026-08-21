import { getSitemapChunk, getSitemapChunkCount } from '@/lib/sitemapEntries';

/**
 * The chunk sitemaps, published at `/sitemap/{id}.xml`.
 *
 * These used to come from `generateSitemaps` in `src/app/sitemap.ts`, but
 * Next 16 reserves `/sitemap.xml` for its metadata route without actually
 * serving an index there, which conflicted with the hand-written index in
 * `src/app/sitemap.xml/route.ts`. Both index and chunks are plain route
 * handlers now; the URLs are unchanged.
 *
 * Everything about the entries — which URLs are in, and the rule that a page
 * with no truthful date carries no `lastmod` — lives in
 * `src/lib/sitemapEntries.ts`.
 */
export const revalidate = 86400;
export const dynamic = 'force-static';

export async function generateStaticParams(): Promise<{ id: string }[]> {
  const count = await getSitemapChunkCount();
  return Array.from({ length: count }, (_unused, id) => ({ id: `${id}.xml` }));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id: rawId } = await params;
  const match = /^(\d+)\.xml$/.exec(rawId);
  if (!match) return new Response('Not found', { status: 404 });

  const entries = await getSitemapChunk(Number(match[1]));
  if (entries.length === 0) return new Response('Not found', { status: 404 });

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map((entry) =>
      [
        '<url>',
        `<loc>${escapeXml(entry.url)}</loc>`,
        entry.lastModified ? `<lastmod>${entry.lastModified}</lastmod>` : '',
        '</url>',
      ]
        .filter(Boolean)
        .join('')
    ),
    '</urlset>',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control':
        'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
}
