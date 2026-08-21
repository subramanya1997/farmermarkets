/**
 * Which of a record's descriptions are actually about *that* market.
 *
 * `organization_description` and `location_description` look like per-market
 * prose, and on some records they are. On most they are not: of the 913
 * records with an organization description, 727 carry their source's scope
 * note ("Program-authorized subset; this is not a complete list of every
 * California…" on 356 records at once), and the busiest location description
 * is the word "Farmers' Market" repeated on 384. Rendering those would
 * reintroduce exactly the shared paragraph this page was cleaned up to
 * remove — just with a longer tail.
 *
 * So the corpus decides: a description that shows up on `SHARED_THRESHOLD` or
 * more records describes a dataset, not a market, and is dropped in favour of
 * the composed summary. The tally is built once per server process from the
 * same memoized market list everything else reads.
 */

import 'server-only';
import { getMarkets } from './data';
import { descriptionParagraphs } from './marketFacts';

/**
 * Four. Two markets run by one organization can honestly share a blurb (the
 * Wednesday and Saturday editions of one county market do); four hundred
 * cannot.
 */
const SHARED_THRESHOLD = 4;

function key(value?: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

let sharedPromise: Promise<Set<string>> | null = null;

function getSharedDescriptions(): Promise<Set<string>> {
  if (!sharedPromise) {
    sharedPromise = getMarkets()
      .then((markets) => {
        const counts = new Map<string, number>();
        for (const market of markets) {
          for (const value of [market.organization_description, market.location_description]) {
            const normalized = key(value);
            if (!normalized) continue;
            counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
          }
        }

        const shared = new Set<string>();
        for (const [value, count] of counts) {
          if (count >= SHARED_THRESHOLD) shared.add(value);
        }
        return shared;
      })
      .catch((error) => {
        sharedPromise = null;
        throw error;
      });
  }

  return sharedPromise;
}

/** The prose a market page may render as this market's own. */
export interface MarketProse {
  /** Paragraphs of `organization_description`, or `[]` when it is not its own. */
  about: string[];
  /** Paragraphs of `location_description`, same rule. */
  location: string[];
}

/** The record a prose lookup reads. */
export interface ProseRecord {
  organization_description?: string | null;
  location_description?: string | null;
}

/** Split and filter both description fields for one market. */
export async function getMarketProse(market: ProseRecord): Promise<MarketProse> {
  const shared = await getSharedDescriptions();
  const own = (value?: string | null) =>
    shared.has(key(value)) ? [] : descriptionParagraphs(value);

  return {
    about: own(market.organization_description),
    location: own(market.location_description),
  };
}
