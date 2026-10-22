/**
 * Freshness labelling for a market record.
 *
 * Same contract as `src/lib/marketFacts.ts`: one pure function of one record,
 * unit tested (`src/lib/freshness.test.ts`) without Next.js or the data layer.
 *
 * Much of the legacy USDA export was last touched years ago — even after a full
 * refresh against the live directory, 345 records still carry a 2020 stamp and
 * 457 a 2021 one, because that is genuinely when the market last updated its
 * listing. A page that says nothing about that is quietly claiming a currency
 * the data does not have. This module decides, from the record alone, whether a
 * page owes the reader that caveat and what it says.
 *
 * The rules it encodes:
 *
 *  - `unverified` (the refresh script sets it on records the upstream USDA
 *    directory no longer lists) is the strongest signal and wins outright.
 *  - Otherwise a parseable `last_updated` older than `STALE_AFTER_YEARS` earns
 *    the softer "may be out of date" line.
 *  - A missing or unparseable `last_updated`, with `unverified` not set, is
 *    treated as fresh and says nothing at all. This is deliberate: we would be
 *    fabricating a staleness claim we cannot support. Silence is the only
 *    honest output when the record carries no date to reason about — the same
 *    reason no line here is ever built from `Date.now()`.
 */

import { formatDate } from './marketFacts.ts';

/**
 * How old a record's `last_updated` stamp has to be before the page says so.
 *
 * Four years, which on the current data labels 952 of 9,132 records — the
 * 2020–2022 tail — while leaving the 2023 bulk alone. Note that the 2023 bulk
 * (5,773 records) crosses the threshold during 2027; that is intended, and the
 * fix is a refresh pass, not a longer threshold.
 */
export const STALE_AFTER_YEARS = 4;

/** The freshness level a record earns, and the line the page should print. */
export interface MarketFreshness {
  level: 'fresh' | 'stale' | 'unverified';
  /** The record's own `last_updated`, formatted for display. */
  lastVerified?: string;
  /** The reader-facing caveat. Absent for a `fresh` record. */
  notice?: string;
}

/** The subset of a market record this module reads. */
export interface MarketFreshnessRecord {
  last_updated?: string | null;
  unverified?: boolean;
  enrichment?: { verified_at?: string | null; verification_scope?: 'partial' | null } | null;
  /** Only the structured schedules' check dates are read. */
  first_party?: { operations?: { schedules?: { verified_at: string }[] } } | null;
}

/**
 * `last_updated` as a `Date`, or `undefined` when the field holds something
 * that is not a date. The zone-less USDA stamps ("2020-08-03") are pinned to
 * UTC so the level never flips with the server's timezone — the same
 * normalization `formatDate` applies to the display string.
 */
function parseDate(value?: string | null): Date | undefined {
  const text = (value ?? '').trim();
  if (!text) return undefined;
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z` : text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * The freshness of one record, as of `now` (defaulting to the current time;
 * it is a parameter so tests are deterministic).
 */
export function marketFreshness(
  input: MarketFreshnessRecord,
  now: Date = new Date()
): MarketFreshness {
  // Enrichment batches verify only their cited fields. They never make the
  // source listing's location or schedule newly current as a whole, so the
  // level stays the source's; a recent check only quiets the header line.
  const sourceDate = parseDate(input.last_updated);
  const lastVerified = formatDate(input.last_updated);
  const year = sourceDate ? String(sourceDate.getUTCFullYear()) : undefined;

  if (input.unverified === true) {
    return {
      level: 'unverified',
      lastVerified,
      notice: year
        ? `No longer in the USDA directory and may be closed. Last checked ${year}.`
        : 'No longer in the USDA directory and may be closed.',
    };
  }

  if (sourceDate && lastVerified) {
    const threshold = new Date(now.getTime());
    threshold.setUTCFullYear(threshold.getUTCFullYear() - STALE_AFTER_YEARS);
    if (sourceDate.getTime() < threshold.getTime()) {
      return recentlyChecked(input, now)
        ? { level: 'stale', lastVerified }
        : { level: 'stale', lastVerified, notice: `Listing last checked ${year}.` };
    }
  }

  return lastVerified ? { level: 'fresh', lastVerified } : { level: 'fresh' };
}

/** How recent a research check must be to stand in for the old listing date. */
export const RECENT_CHECK_MONTHS = 12;

/**
 * True when the market's details were researched within the last
 * `RECENT_CHECK_MONTHS`: the page then shows those fresher facts, and an
 * "out of date" line about the original import would contradict them.
 */
function recentlyChecked(input: MarketFreshnessRecord, now: Date): boolean {
  const dates = [
    input.enrichment?.verified_at,
    ...(input.first_party?.operations?.schedules ?? []).map((item) => item.verified_at),
  ]
    .map((value) => parseDate(value))
    .filter((value): value is Date => Boolean(value));
  const cutoff = new Date(now.getTime());
  cutoff.setUTCMonth(cutoff.getUTCMonth() - RECENT_CHECK_MONTHS);
  return dates.some((date) => date.getTime() >= cutoff.getTime() && date.getTime() <= now.getTime() + 86_400_000);
}
