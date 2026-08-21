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

/**
 * The public source repository for the site and its data pipeline.
 *
 * It is always in `sameAs` because it is a profile the entity genuinely
 * controls and that a third party can verify — the repository is public.
 */
export const GITHUB_REPO_URL = 'https://github.com/subramanya1997/farmermarkets';

/**
 * `Organization.sameAs` — the other places on the web that are demonstrably
 * this same entity.
 *
 * The list is env-driven (`NEXT_PUBLIC_ORG_SAMEAS`, comma-separated) so a
 * profile activates the moment it exists — a Wikidata item, a social account —
 * without a code change. The rules:
 *
 *  - Only absolute `http(s)` URLs survive. A Q-ID, a handle, or a bare domain
 *    is not a `sameAs` value, and emitting one is a claim a validator rejects.
 *  - Duplicates collapse, so listing the repository in the variable as well is
 *    harmless.
 *  - The repository URL is always present; everything else is opt-in. An empty
 *    or unset variable therefore yields exactly one entry, never `[]` — and
 *    the caller still guards on length, because an empty `sameAs` array is not
 *    a fact worth publishing.
 */
export function organizationSameAs(
  raw: string | undefined = process.env.NEXT_PUBLIC_ORG_SAMEAS
): string[] {
  const seen = new Set<string>();

  for (const candidate of [GITHUB_REPO_URL, ...(raw ?? '').split(',')]) {
    const value = candidate.trim();
    if (!/^https?:\/\//i.test(value)) continue;
    try {
      seen.add(new URL(value).toString());
    } catch {
      // Not a URL after all; there is nothing to point at.
    }
  }

  return [...seen];
}
