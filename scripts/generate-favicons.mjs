#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDirectory = path.join(root, 'public');
const source = await fs.readFile(path.join(publicDirectory, 'leaf-hq.svg'));
const fullSizeIcon = path.join(publicDirectory, 'leaf-hq.png');
await sharp(source)
  .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ quality: 100 })
  .toFile(fullSizeIcon);
console.log(`Wrote ${path.relative(root, fullSizeIcon)}`);

const icon = await fs.readFile(fullSizeIcon);

const outputs = [
  ['favicon.ico', 32],
  ['favicon-16x16.png', 16],
  ['favicon-32x32.png', 32],
  ['apple-touch-icon.png', 180],
  ['android-chrome-192x192.png', 192],
  ['android-chrome-512x512.png', 512],
];

await Promise.all(
  outputs.map(async ([name, size]) => {
    const output = path.join(publicDirectory, name);
    await sharp(icon)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ quality: 100 })
      .toFile(output);
    console.log(`Wrote ${path.relative(root, output)}`);
  })
);
