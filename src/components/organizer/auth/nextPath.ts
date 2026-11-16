/**
 * Where an organizer goes after signing in, signing up or confirming their
 * email. `?next=` comes from the URL, so it is only honoured when it is a
 * same-site relative path: one leading "/", no protocol-relative "//", no
 * backslashes or control characters. Anything else falls back to the
 * dashboard.
 *
 * Pure functions, safe on the server and in the browser.
 */

export const DEFAULT_NEXT = '/dashboard';

/** Sending someone back to an auth page after signing in would loop. */
const AUTH_PAGES = /^\/(sign-in|sign-up|forgot-password|reset-password)(\/|$)/;
const PROBE_ORIGIN = 'https://next-path.invalid';

/** First value of a page `searchParams` entry. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseRelative(raw: unknown): URL | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.length > 500) return null;
  if (value.includes('\\') || [...value].some((char) => char.charCodeAt(0) < 32)) return null;
  try {
    const url = new URL(value, PROBE_ORIGIN);
    return url.origin === PROBE_ORIGIN ? url : null;
  } catch {
    return null;
  }
}

/**
 * The validated `next` path. Better Auth appends `?error=...` to the callback
 * URL when a confirmation link fails; that is reported separately (see
 * `verificationErrorIn`) and stripped here so it does not follow the
 * organizer around.
 */
export function safeNext(raw: unknown, fallback: string = DEFAULT_NEXT): string {
  const url = parseRelative(raw);
  // Better Auth refuses callback paths with encoded slashes, so never pass one on.
  if (!url || AUTH_PAGES.test(url.pathname) || /%2f|%5c/i.test(url.pathname)) return fallback;
  url.searchParams.delete('error');
  return `${url.pathname}${url.search}${url.hash}`;
}

/** True when `next` carries a failed email-confirmation error from Better Auth. */
export function verificationFailedIn(raw: unknown): boolean {
  const error = parseRelative(raw)?.searchParams.get('error');
  return Boolean(error && /^(TOKEN_EXPIRED|INVALID_TOKEN|USER_NOT_FOUND|INVALID_USER)$/.test(error));
}

/** `path` with `?next=` added, unless `next` is already the default. */
export function withNext(path: string, next: string): string {
  if (next === DEFAULT_NEXT) return path;
  return `${path}?next=${encodeURIComponent(next)}`;
}
