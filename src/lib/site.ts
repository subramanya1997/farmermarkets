/**
 * Single source of truth for the canonical site origin.
 *
 * The canonical host is the `www` subdomain: Google has indexed `www`, and the
 * apex domain issues a 308 redirect to it (configured in Vercel domain settings,
 * not in code). Every absolute URL we emit — canonicals, og:url, JSON-LD
 * `url`/`@id`, sitemap `<loc>` values, the robots.txt `Sitemap:` line — must be
 * built from this constant so the declared host can never drift again.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.farmermarkets.app';

/** Build an absolute URL on the canonical host from a root-relative path. */
export function absoluteUrl(path = '/'): string {
  return new URL(path, SITE_URL).toString();
}
