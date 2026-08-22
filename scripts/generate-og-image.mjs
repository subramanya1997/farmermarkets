/**
 * Regenerate `public/og-image.jpg` — the site-wide Open Graph / Twitter card
 * image used by the root layout (homepage and any page that does not ship its
 * own image).
 *
 * Per-market pages do NOT use this file; they render a personalised card at
 * `src/app/markets/[slug]/opengraph-image.tsx`.
 *
 * Run with: `node scripts/generate-og-image.mjs`
 *
 * The artwork is defined as an SVG below and rasterised with sharp (already a
 * devDependency used by `generate-favicons.mjs`). Text is drawn as vector paths
 * rather than <text> so the output does not
 * depend on which fonts happen to be installed on the machine running this.
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUTPUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'og-image.jpg'
);

const WIDTH = 1200;
const HEIGHT = 630;

// Tailwind green palette, matching the site chrome (green-50 → green-900).
const GREEN_900 = '#14532d';
const GREEN_800 = '#166534';
const GREEN_500 = '#22c55e';
const GREEN_300 = '#86efac';
const GREEN_50 = '#f0fdf4';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GREEN_900}"/>
      <stop offset="1" stop-color="${GREEN_800}"/>
    </linearGradient>
    <linearGradient id="leaf" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GREEN_300}"/>
      <stop offset="1" stop-color="${GREEN_500}"/>
    </linearGradient>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>

  <!-- Produce motif: a loose cluster of fruit/veg rounds in the lower right. -->
  <g opacity="0.16" fill="${GREEN_50}">
    <circle cx="1000" cy="470" r="96"/>
    <circle cx="1148" cy="352" r="62"/>
    <circle cx="1120" cy="556" r="78"/>
    <circle cx="930" cy="626" r="54"/>
  </g>
  <g opacity="0.5" fill="none" stroke="${GREEN_500}" stroke-width="4">
    <circle cx="1000" cy="470" r="96"/>
    <circle cx="1148" cy="352" r="62"/>
    <circle cx="1120" cy="556" r="78"/>
    <circle cx="930" cy="626" r="54"/>
  </g>

  <!-- Leaf mark -->
  <g transform="translate(80 84) scale(0.19)">
    <path d="M448 64C341.962 64.2462 240.744 104.413 166.4 181.029C91.7836 255.645 49.6178 356.589 49.3711 462.629C49.3711 469.143 53.0284 475.771 58.5139 475.771C164.552 475.523 265.498 435.358 339.842 358.742C414.186 282.126 456.352 181.182 456.571 75.1429C456.571 68.5714 452.914 64 448 64Z" fill="url(#leaf)"/>
    <path d="M256 150C230 180 210 220 200 270" stroke="${GREEN_800}" stroke-width="18" stroke-linecap="round" fill="none"/>
    <path d="M350 180C330 210 300 240 260 260" stroke="${GREEN_800}" stroke-width="18" stroke-linecap="round" fill="none"/>
  </g>

  <!-- Eyebrow rule -->
  <rect x="80" y="228" width="96" height="8" rx="4" fill="${GREEN_500}"/>

  ${text('Farmer Markets', { x: 80, y: 336, size: 96, weight: 'bold', fill: GREEN_50 })}
  ${text('Find local farmers markets near you.', { x: 80, y: 432, size: 44, weight: 'normal', fill: GREEN_300 })}
  ${text('Hours, directions, produce and SNAP/WIC info', { x: 80, y: 490, size: 34, weight: 'normal', fill: GREEN_300, opacity: 0.85 })}

  ${text('farmermarkets.app', { x: 80, y: 572, size: 30, weight: 'bold', fill: GREEN_50, opacity: 0.75 })}
</svg>`;

/**
 * Draw a line of text. `font-family` names a stack of faces that ship with
 * macOS and with the Debian-based images CI uses, so the render never falls
 * back to a font with different metrics on one platform and not the other.
 */
function text(value, { x, y, size, weight, fill, opacity = 1 }) {
  const escaped = value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<text x="${x}" y="${y}" font-family="Helvetica Neue, Helvetica, Arial, DejaVu Sans, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" opacity="${opacity}" letter-spacing="${weight === 'bold' ? -1.5 : 0}">${escaped}</text>`;
}

await sharp(Buffer.from(svg))
  .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
  .toFile(OUTPUT);

const { width, height, format, size } = await sharp(OUTPUT).metadata();
console.log(`Wrote ${OUTPUT}: ${format} ${width}x${height}, ${size} bytes`);
