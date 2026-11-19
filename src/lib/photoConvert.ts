/**
 * Turns uploaded photos into files every browser can show.
 *
 * Phones save photos as HEIC (iPhone) or HEIF, which only Safari can display.
 * Uploads in those formats are converted here to JPEG, with the width and
 * height read from the result. JPEG, PNG and WebP pass through untouched.
 *
 * Why two libraries: sharp's prebuilt binaries include libheif with only the
 * AV1 (AVIF) decoder, because HEVC is patent encumbered, so sharp alone
 * fails on iPhone photos with "Support for this compression format has not
 * been built in: HEVC". heic-decode wraps libheif compiled to WebAssembly
 * (libheif-js, kept in step with upstream libheif), which needs no native
 * binary and runs anywhere Node runs, including Vercel functions. It hands
 * back raw pixels; sharp resizes and encodes them.
 *
 * Size rules: uploads are capped at 8 MB as sent (the Blob upload token
 * enforces it, before conversion). The converted JPEG is at most 3000 px on
 * its long side, which keeps it well under 8 MB; it is checked against the
 * same cap anyway.
 *
 * Used by organizer photos (`registerPhoto`), vendor photos
 * (`/api/vendor/photos/convert`) and any bot upload path: `preparePhoto`
 * for bytes in hand, `webPhotoForUpload` for a file already in Blob.
 */
import sharp from 'sharp';
import decodeHeic from 'heic-decode';
import { del, put } from '@vercel/blob';
import { PHOTO_READ_ERROR, PHOTO_TYPE_ERROR, isHeicPathname } from './photoTypes.ts';

export const MAX_UPLOAD_PHOTO_BYTES = 8 * 1024 * 1024;
/** Long side of a converted photo. Larger than any page shows it. */
export const CONVERTED_MAX_EDGE = 3000;
/** Refuse to decode anything bigger than a 48 MP phone photo, with headroom. */
const MAX_DECODE_PIXELS = 60_000_000;

/** A photo the user can fix by sending a different file. `message` is safe to show. */
export class PhotoReadError extends Error {
  constructor(message = PHOTO_READ_ERROR, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PhotoReadError';
  }
}

export type PhotoKind = 'jpeg' | 'png' | 'webp' | 'heic';

const KIND_TYPES: Record<PhotoKind, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};

// ISO base media brands libheif reads as HEIC/HEIF stills or sequences.
const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']);

/** What the bytes are, whatever the file name or declared type says. */
export function sniffPhotoKind(bytes: Uint8Array): PhotoKind | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(4, 8) === 'ftyp' && HEIC_BRANDS.has(ascii(8, 12))) return 'heic';
  return null;
}

export interface PreparedPhoto {
  data: Buffer;
  contentType: string;
  width: number;
  height: number;
  /** True when `data` is a new JPEG, false when it is the original bytes. */
  converted: boolean;
}

/**
 * Checks a photo and converts it when browsers cannot show it.
 * Throws `PhotoReadError` for anything that is not a readable photo.
 */
export async function preparePhoto(input: Uint8Array, options: { maxBytes?: number } = {}): Promise<PreparedPhoto> {
  const maxBytes = options.maxBytes ?? MAX_UPLOAD_PHOTO_BYTES;
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (bytes.length > maxBytes) throw new PhotoReadError(`This photo is over ${Math.round(maxBytes / (1024 * 1024))} MB. Try a smaller one.`);
  const kind = sniffPhotoKind(bytes);
  if (!kind) throw new PhotoReadError(PHOTO_TYPE_ERROR);
  if (kind === 'heic') return convertHeic(bytes, maxBytes);

  try {
    const meta = await sharp(bytes).metadata();
    // EXIF-rotated photos display with their sides swapped.
    const width = meta.autoOrient?.width ?? meta.width;
    const height = meta.autoOrient?.height ?? meta.height;
    if (!width || !height) throw new Error('No dimensions');
    return { data: bytes, contentType: KIND_TYPES[kind], width, height, converted: false };
  } catch (cause) {
    throw new PhotoReadError(PHOTO_READ_ERROR, { cause });
  }
}

async function convertHeic(bytes: Buffer, maxBytes: number): Promise<PreparedPhoto> {
  let images: Awaited<ReturnType<typeof decodeHeic.all>> | null = null;
  try {
    images = await decodeHeic.all({ buffer: bytes });
    // libheif lists the primary image first; burst and depth extras follow.
    const primary = images[0];
    if (!primary || primary.width * primary.height > MAX_DECODE_PIXELS) throw new Error('No usable image');
    // libheif applies the file's rotation and mirroring while decoding.
    const pixels = await primary.decode();
    const { data, info } = await sharp(Buffer.from(pixels.data.buffer, pixels.data.byteOffset, pixels.data.byteLength), {
      raw: { width: pixels.width, height: pixels.height, channels: 4 },
    })
      .resize({ width: CONVERTED_MAX_EDGE, height: CONVERTED_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    if (data.length > maxBytes) throw new Error('Converted photo is too large');
    return { data, contentType: 'image/jpeg', width: info.width, height: info.height, converted: true };
  } catch (cause) {
    throw new PhotoReadError(PHOTO_READ_ERROR, { cause });
  } finally {
    images?.dispose();
  }
}

export interface UploadedPhoto {
  url: string;
  pathname: string;
  width?: number;
  height?: number;
}

/** True when `url` is the public Blob address of `pathname`, so it is safe to fetch. */
function isPublicBlobUrl(url: string, pathname: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname.endsWith('.public.blob.vercel-storage.com') &&
      !parsed.search &&
      parsed.pathname === `/${encodeURI(pathname)}`
    );
  } catch {
    return false;
  }
}

/**
 * Makes an upload already in Blob safe to show. A `.heic` or `.heif` upload
 * is converted to a JPEG beside it (same folder), and the original is
 * deleted whether or not that worked. Anything else comes back unchanged.
 *
 * The caller checks the folder belongs to the user before calling this.
 */
export async function webPhotoForUpload(
  upload: UploadedPhoto,
): Promise<{ ok: true; photo: UploadedPhoto } | { ok: false; error: string }> {
  if (!isHeicPathname(upload.pathname)) return { ok: true, photo: upload };
  if (!isPublicBlobUrl(upload.url, upload.pathname)) return { ok: false, error: 'That upload link is not valid.' };

  try {
    const response = await fetch(upload.url, { cache: 'no-store' });
    if (!response.ok) return { ok: false, error: 'That upload could not be found. Please try again.' };
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_UPLOAD_PHOTO_BYTES) throw new PhotoReadError('This photo is over 8 MB. Try a smaller one.');
    const photo = await preparePhoto(new Uint8Array(await response.arrayBuffer()));
    const pathname = upload.pathname.replace(/\.(heic|heif)$/i, '.jpg');
    const stored = await put(pathname, photo.data, {
      access: 'public',
      contentType: photo.contentType,
      addRandomSuffix: true,
    });
    return { ok: true, photo: { url: stored.url, pathname: stored.pathname, width: photo.width, height: photo.height } };
  } catch (error) {
    if (error instanceof PhotoReadError) return { ok: false, error: error.message };
    console.error('Photo conversion failed:', error);
    return { ok: false, error: 'The photo did not save. Please try again.' };
  } finally {
    await del(upload.url).catch((error: unknown) => console.error('Could not delete the original upload:', error));
  }
}
