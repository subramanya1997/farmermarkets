import {
  getSitemapChunk,
  getSitemapChunkCount,
  sitemapChunkPath,
} from '@/lib/sitemapEntries';
import { absoluteUrl } from '@/lib/site';

/**
 * The sitemap index at `/sitemap.xml`.
 *
 * `generateSitemaps` in `src/app/sitemap.ts` publishes the chunks at
 * `/sitemap/{id}.xml` but does not emit an index for them, so `/sitemap.xml` —
 * the URL robots.txt points at and the one already submitted to Search
 * Console — is written here instead.
 *
 * Each `<lastmod>` is the newest real date inside that chunk, so the index
 * carries no fetch-time date either: two fetches minutes apart are
 * byte-identical.
 */
export const revalidate = 86400;
export const dynamic = 'force-static';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET(): Promise<Response> {
  const count = await getSitemapChunkCount();

  const chunks = await Promise.all(
    Array.from({ length: count }, async (_unused, id) => {
      const entries = await getSitemapChunk(id);
      const lastModified = entries.reduce<string | undefined>(
        (newest, entry) =>
          entry.lastModified && (!newest || entry.lastModified > newest)
            ? entry.lastModified
            : newest,
        undefined
      );
      return { loc: absoluteUrl(sitemapChunkPath(id)), lastModified };
    })
  );

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...chunks.map(({ loc, lastModified }) =>
      [
        '<sitemap>',
        `<loc>${escapeXml(loc)}</loc>`,
        lastModified ? `<lastmod>${lastModified}</lastmod>` : '',
        '</sitemap>',
      ]
        .filter(Boolean)
        .join('')
    ),
    '</sitemapindex>',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
}
