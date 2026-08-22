/**
 * Where a government record came from, and when we last pulled it.
 *
 * `provenance` on the 1,975 official records names the publisher, the dataset
 * and its catalogue page, but not the fetch date — that lives once per source
 * in `data/sources/government_markets.manifest.json`, written by
 * `npm run data:update`. Joining the two here is what lets a market page say
 * "retrieved 20 August 2026" and mean it.
 */

import 'server-only';
import { promises as fs } from 'fs';
import path from 'path';

const MANIFEST_PATH = 'data/sources/government_markets.manifest.json';

interface ManifestSource {
  id: string;
  retrieved_at?: string;
  license?: string;
  catalog_url?: string;
}

interface Manifest {
  sources?: ManifestSource[];
}

/** Parsed once per server process; dropped on failure so the next caller retries. */
let sourcesPromise: Promise<Map<string, ManifestSource>> | null = null;

function getSources(): Promise<Map<string, ManifestSource>> {
  if (!sourcesPromise) {
    sourcesPromise = fs
      .readFile(path.join(process.cwd(), MANIFEST_PATH), 'utf8')
      .then((contents) => {
        const manifest = JSON.parse(contents) as Manifest;
        return new Map((manifest.sources ?? []).map((source) => [source.id, source]));
      })
      .catch(() => {
        // A missing or malformed manifest costs the page its retrieval date,
        // not its render: the publisher and dataset still come off the record.
        sourcesPromise = null;
        return new Map<string, ManifestSource>();
      });
  }

  return sourcesPromise;
}

/** What a market page can honestly say about the origin of its record. */
export interface MarketProvenance {
  publisher: string;
  datasetName?: string;
  catalogUrl?: string;
  license?: string;
  /** ISO timestamp of the last successful fetch of this source. */
  retrievedAt?: string;
}

/** The record a provenance lookup reads. */
export interface ProvenanceRecord {
  provenance?: {
    official?: boolean;
    source_id?: string;
    publisher?: string;
    dataset_name?: string;
    catalog_url?: string;
    license?: string;
    retrieved_at?: string;
  } | null;
}

/**
 * The provenance line for a market, or `null` for the 6,832 legacy records
 * that have no named publisher to credit.
 */
export async function getMarketProvenance(
  market: ProvenanceRecord
): Promise<MarketProvenance | null> {
  const provenance = market.provenance;
  const publisher = provenance?.publisher?.trim();
  if (!publisher) return null;

  const source = provenance?.source_id
    ? (await getSources()).get(provenance.source_id)
    : undefined;

  return {
    publisher,
    datasetName: provenance?.dataset_name?.trim() || undefined,
    catalogUrl: provenance?.catalog_url?.trim() || source?.catalog_url || undefined,
    license: provenance?.license?.trim() || source?.license || undefined,
    retrievedAt: provenance?.retrieved_at || source?.retrieved_at || undefined,
  };
}
