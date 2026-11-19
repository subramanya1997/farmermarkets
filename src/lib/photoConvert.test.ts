import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import sharp from 'sharp';
import { PhotoReadError, preparePhoto, sniffPhotoKind } from './photoConvert.ts';
import { vendorPhotoSchema } from './vendorProfile.ts';
import { PHOTO_READ_ERROR, PHOTO_TYPE_ERROR, isHeicPathname, photoAccept, photoContentType, photoFileName, UPLOAD_PHOTO_TYPES, WEB_PHOTO_TYPES } from './photoTypes.ts';

// Both fixtures were saved by macOS (`sips -s format heic`), HEVC coded like an iPhone photo.
const heic = readFileSync(new URL('./testdata/photo-64x48.heic', import.meta.url));
// Landscape pixels with a 90 degree rotation in the file, so it displays portrait.
const rotatedHeic = readFileSync(new URL('./testdata/rotated-64x48.heic', import.meta.url));

function jpeg(width = 40, height = 30) {
  return sharp({ create: { width, height, channels: 3, background: { r: 20, g: 120, b: 40 } } })
    .jpeg()
    .toBuffer();
}

test('HEIC converts to a JPEG with its size', async () => {
  const photo = await preparePhoto(heic);
  assert.equal(photo.converted, true);
  assert.equal(photo.contentType, 'image/jpeg');
  assert.deepEqual([photo.width, photo.height], [64, 48]);
  assert.equal(sniffPhotoKind(photo.data), 'jpeg');
  const meta = await sharp(photo.data).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ['jpeg', 64, 48]);
});

test('HEIC rotation is applied while converting', async () => {
  const photo = await preparePhoto(rotatedHeic);
  assert.deepEqual([photo.width, photo.height], [48, 64]);
});

test('JPEG passes through untouched', async () => {
  const original = await jpeg();
  const photo = await preparePhoto(original);
  assert.equal(photo.converted, false);
  assert.equal(photo.contentType, 'image/jpeg');
  assert.deepEqual([photo.width, photo.height], [40, 30]);
  assert.equal(photo.data, original);
});

test('PDF is rejected as the wrong type', async () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');
  await assert.rejects(preparePhoto(pdf), (error) => error instanceof PhotoReadError && error.message === PHOTO_TYPE_ERROR);
});

test('a broken HEIC gets the "export it as JPEG" message', async () => {
  const broken = Buffer.concat([heic.subarray(0, 40), Buffer.alloc(200)]);
  assert.equal(sniffPhotoKind(broken), 'heic');
  await assert.rejects(preparePhoto(broken), (error) => error instanceof PhotoReadError && error.message === PHOTO_READ_ERROR);
});

test('a photo over the cap is refused before decoding', async () => {
  await assert.rejects(preparePhoto(heic, { maxBytes: 100 }), /is over/);
});

test('picked files get a content type, by extension when the browser gives none', () => {
  assert.equal(photoContentType({ name: 'IMG_0001.HEIC', type: 'image/heic' }), 'image/heic');
  assert.equal(photoContentType({ name: 'IMG_0001.HEIC', type: '' }), 'image/heic');
  assert.equal(photoContentType({ name: 'IMG_0001.heif', type: 'application/octet-stream' }), 'image/heif');
  assert.equal(photoContentType({ name: 'stall.jpg', type: 'image/jpeg' }), 'image/jpeg');
  assert.equal(photoContentType({ name: 'menu.pdf', type: 'application/pdf' }), null);
  assert.equal(photoContentType({ name: 'menu.pdf', type: '' }), null);
  // A list without HEIC refuses it even by extension.
  assert.equal(photoContentType({ name: 'IMG_0001.HEIC', type: '' }, WEB_PHOTO_TYPES), null);
});

test('accept list, file names and pathnames', () => {
  assert.equal(photoAccept(UPLOAD_PHOTO_TYPES), 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif');
  assert.equal(photoFileName('Market Day!.HEIC', 'image/heic'), 'market-day.heic');
  assert.equal(isHeicPathname('markets/m1/market-day-AbC123.heic'), true);
  assert.equal(isHeicPathname('markets/m1/market-day-AbC123.jpg'), false);
});

test('a vendor profile refuses a photo that was never converted', () => {
  const base = { url: 'https://store.public.blob.vercel-storage.com/vendors/v1/stall-AbC.jpg', pathname: 'vendors/v1/stall-AbC.jpg', alt: undefined };
  assert.equal(vendorPhotoSchema.safeParse(base).success, true);
  const heicPhoto = { ...base, url: base.url.replace('.jpg', '.heic'), pathname: base.pathname.replace('.jpg', '.heic') };
  assert.equal(vendorPhotoSchema.safeParse(heicPhoto).success, false);
});
