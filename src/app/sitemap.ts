import type { MetadataRoute } from 'next';
import { getSitemapChunk, getSitemapChunkCount } from '@/lib/sitemapEntries';

/**
 * The chunk sitemaps, published at `/sitemap/{id}.xml`.
 *
 * `generateSitemaps` is what splits the directory's ~13.9k URLs into files of
 * at most `SITEMAP_CHUNK_SIZE`; the index that lists them lives in
 * `src/app/sitemap.xml/route.ts`, because Next does not emit one itself.
 *
 * Everything about the entries — which URLs are in, and the rule that a page
 * with no truthful date carries no `lastmod` — lives in
 * `src/lib/sitemapEntries.ts`.
 */
export const revalidate = 86400;

export async function generateSitemaps(): Promise<{ id: number }[]> {
  const count = await getSitemapChunkCount();
  return Array.from({ length: count }, (_unused, id) => ({ id }));
}

export default async function sitemap({
  id,
}: {
  id: number;
}): Promise<MetadataRoute.Sitemap> {
  const entries = await getSitemapChunk(Number(id));

  return entries.map((entry) => ({
    url: entry.url,
    // Omitted rather than defaulted: Next drops the `<lastmod>` element for an
    // undefined value, which is the whole point (see sitemapEntries.ts).
    ...(entry.lastModified ? { lastModified: entry.lastModified } : {}),
  }));
}
