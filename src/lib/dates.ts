/**
 * Date parsing for the two market snapshots.
 *
 * The legacy USDA export writes local-looking timestamps with no zone
 * ("2020-08-03T13:44:04"). Reading those as UTC rather than as the server's
 * local time is what keeps derived output — sitemap `lastmod` values, topic
 * page freshness — identical on a developer's machine, in CI, and on the
 * deployment host.
 *
 * Pure and dependency-free so it can be unit tested without Next.js
 * (`src/lib/topicCopy.test.ts`).
 */

/** A `last_updated` value as a stable ISO instant, or undefined when unusable. */
export function toIsoInstant(value?: string | null): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;

  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw) ? raw : `${raw}Z`;
  const parsed = new Date(zoned);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

/** The later of two ISO instants, ignoring the ones that are undefined. */
export function newerInstant(
  left: string | undefined,
  right: string | undefined
): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return left >= right ? left : right;
}
