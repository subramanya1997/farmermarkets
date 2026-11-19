/**
 * Which photo files the upload pickers take, and how each one is named.
 *
 * Pure and client safe: the organizer and vendor uploaders import it, and so
 * does the server converter (`photoConvert.ts`). Phones save photos as HEIC
 * (iPhone) or HEIF; browsers cannot show those, so the server converts them
 * to JPEG before anyone sees them. JPEG, PNG and WebP are stored as sent.
 */

/** Formats every browser can show. Stored as uploaded. */
export const WEB_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Phone formats the server converts to JPEG right after upload. */
export const HEIC_PHOTO_TYPES = ['image/heic', 'image/heif'];

/** Everything an uploader may send. */
export const UPLOAD_PHOTO_TYPES = [...WEB_PHOTO_TYPES, ...HEIC_PHOTO_TYPES];

/** Shown when a file cannot be decoded, whatever went wrong inside. */
export const PHOTO_READ_ERROR = 'This photo could not be read. Try exporting it as JPEG.';

/** Shown when a file is not a photo type we take. */
export const PHOTO_TYPE_ERROR = 'Use a JPEG, PNG, WebP or HEIC photo.';

/** Short list for the helper text under an upload button. */
export const PHOTO_FORMATS_LABEL = 'JPEG, PNG, WebP or HEIC';

const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

const TYPE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

export function isHeicType(contentType: string | null | undefined): boolean {
  return !!contentType && HEIC_PHOTO_TYPES.includes(contentType.toLowerCase());
}

/** True for a stored file that still needs converting (`.heic` or `.heif`). */
export function isHeicPathname(pathname: string): boolean {
  return /\.(heic|heif)$/i.test(pathname);
}

/**
 * The content type to upload a picked file as, or null when it is not a
 * photo we take. Windows and some Android browsers report HEIC files with an
 * empty type, so the file extension decides when the browser gives nothing
 * useful.
 */
export function photoContentType(file: { name: string; type: string }, allowed: readonly string[] = UPLOAD_PHOTO_TYPES): string | null {
  const reported = file.type.toLowerCase();
  if (allowed.includes(reported)) return reported;
  if (reported && reported !== 'application/octet-stream') return null;
  const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  const guessed = extension ? EXTENSION_TYPES[extension] : undefined;
  return guessed && allowed.includes(guessed) ? guessed : null;
}

/** `accept` value for a file input: the types, plus extensions for HEIC files the OS has no type for. */
export function photoAccept(allowed: readonly string[]): string {
  const extensions = allowed.filter(isHeicType).map((type) => `.${TYPE_EXTENSIONS[type]}`);
  return [...allowed, ...extensions].join(',');
}

/** A safe, readable Blob file name: "Market Day!.HEIC" becomes "market-day.heic". */
export function photoFileName(name: string, contentType: string): string {
  const base = name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'photo'}.${TYPE_EXTENSIONS[contentType] ?? 'jpg'}`;
}
