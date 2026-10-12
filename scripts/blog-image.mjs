#!/usr/bin/env node
/**
 * Fetch one photo and store it as a blog cover.
 *
 *   node scripts/blog-image.mjs <slug> <image-url>
 *
 * Writes `public/blog/<slug>.jpg`, cropped to the cover's 1600x840 box. The
 * photo is committed to the repo rather than hotlinked, so a post never loses
 * its picture because a third party moved a file.
 *
 * This script does not judge whether a photo may be used. That is decided
 * before it runs, from the licence stated on the photo's own source page; see
 * `docs/blog-playbook.md`.
 */
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const WIDTH = 1600;
const HEIGHT = 840;
/** A source smaller than this would be visibly upscaled on the post page. */
const MIN_SOURCE_WIDTH = 1200;

const [slug, url] = process.argv.slice(2);
if (!slug || !url || !/^[a-z0-9-]+$/.test(slug) || !/^https:\/\//.test(url)) {
  console.error('usage: node scripts/blog-image.mjs <slug> <https image url>');
  process.exit(1);
}

const response = await fetch(url, {
  headers: { 'user-agent': 'farmermarkets.app blog image fetch (hello@farmermarkets.app)' },
});
if (!response.ok) {
  console.error(`download failed: ${response.status} ${response.statusText}`);
  process.exit(1);
}
const type = response.headers.get('content-type') ?? '';
if (!type.startsWith('image/')) {
  console.error(`not an image: content-type is "${type}"`);
  process.exit(1);
}

const input = Buffer.from(await response.arrayBuffer());
const meta = await sharp(input).metadata();
if (!meta.width || meta.width < MIN_SOURCE_WIDTH) {
  console.error(`source is ${meta.width}px wide; need at least ${MIN_SOURCE_WIDTH}px`);
  process.exit(1);
}

mkdirSync(new URL('../public/blog/', import.meta.url), { recursive: true });
const target = new URL(`../public/blog/${slug}.jpg`, import.meta.url);
const info = await sharp(input)
  .rotate() // honour EXIF orientation before the metadata is dropped
  .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'attention' })
  .jpeg({ quality: 78, mozjpeg: true })
  .toFile(target.pathname);

console.log(`public/blog/${slug}.jpg ${info.width}x${info.height} ${Math.round(info.size / 1024)} KB`);
