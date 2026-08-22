/**
 * The view model for `/about-the-data`.
 *
 * Same contract as `src/lib/topicPage.ts`: the page renders what this builder
 * returns and nothing else. Every number on that page — record counts, state
 * and city counts, how many listings state their hours, how many take SNAP,
 * the date range the data covers — is computed here from the two committed
 * snapshots and the geo index at build/ISR time. Nothing is written into the
 * copy, so the page cannot drift away from the data the way a hand-maintained
 * "we list 9,000 markets" sentence does.
 *
 * The source list is derived the same way: it is a grouping of the `provenance`
 * blocks the official records actually carry, joined to the source manifest
 * for the retrieval date and catalogue URL.
 * A publisher appears on the page because records from it are in the file, not
 * because someone remembered to add it.
 */

import 'server-only';
import { promises as fs } from 'fs';
import path from 'path';
import { getMarkets, type FarmerMarket } from './data';
import { getGeoIndex } from './geoIndex';
import { marketFreshness } from './freshness';
import { marketHours, marketWeekdays } from './seo';
import { toIsoInstant } from './dates';

const MANIFEST_PATH = 'data/sources/government_markets.manifest.json';

/** The one canonical market file served to the public. */
export const DATA_FILES = [
  {
    path: '/data/farmers_markets.json',
    name: 'Consolidated farmers market dataset',
  },
] as const;

/** The upstream the legacy half of the directory is refreshed from. */
export const USDA_PORTAL_URL = 'https://www.usdalocalfoodportal.com/';

/** The keyless bulk export `npm run data:update-legacy` reads. */
export const USDA_EXPORT_URL =
  'https://www.usdalocalfoodportal.com/api/download_by_directory/?directory=farmersmarket';

/* ------------------------------------------------------------------ *
 * Sources
 * ------------------------------------------------------------------ */

/** One dataset a publisher ships, as the records and the manifest describe it. */
export interface DatasetSourceEntry {
  sourceId: string;
  datasetName?: string;
  catalogUrl?: string;
  license?: string;
  /** ISO instant of the last successful fetch. */
  retrievedAt?: string;
  scopeNote?: string;
  recordCount: number;
}

/** One publisher, with every dataset of theirs that is in the file. */
export interface DatasetPublisher {
  publisher: string;
  recordCount: number;
  datasets: DatasetSourceEntry[];
}

interface ManifestSource {
  id: string;
  catalog_url?: string;
  license?: string;
  retrieved_at?: string;
}

async function readManifestSources(): Promise<Map<string, ManifestSource>> {
  try {
    const contents = await fs.readFile(path.join(process.cwd(), MANIFEST_PATH), 'utf8');
    const manifest = JSON.parse(contents) as { sources?: ManifestSource[] };
    return new Map((manifest.sources ?? []).map((source) => [source.id, source]));
  } catch {
    // A missing manifest costs the page its retrieval dates, not its render:
    // publisher, dataset and licence all come off the records themselves.
    return new Map<string, ManifestSource>();
  }
}

/* ------------------------------------------------------------------ *
 * Coverage
 * ------------------------------------------------------------------ */

export interface DatasetCoverage {
  totalMarkets: number;
  /** Records carrying an official publisher in `provenance`. */
  officialMarkets: number;
  /** The remainder: the USDA directory records, which name no publisher. */
  legacyMarkets: number;
  stateCount: number;
  cityCount: number;
  /** Records the geo index could not place at all. */
  unplacedMarkets: number;
  countries: string[];
  withHoursCount: number;
  withDaysCount: number;
  snapCount: number;
  /** Records labelled "may be out of date" by `src/lib/freshness.ts`. */
  staleCount: number;
  /** Records the upstream USDA directory no longer lists. */
  unverifiedCount: number;
  /** Oldest `last_updated` in the data, as `YYYY-MM-DD`. */
  earliestUpdate?: string;
  /** Newest `last_updated` in the data, as `YYYY-MM-DD`. */
  latestUpdate?: string;
}

export interface DatasetFileSummary {
  path: string;
  name: string;
  /** Human-readable size of the committed file, e.g. "10.1 MB". */
  size?: string;
}

export interface DatasetPageData {
  coverage: DatasetCoverage;
  publishers: DatasetPublisher[];
  /** Distinct licence statements across the official sources. */
  licenses: string[];
  files: DatasetFileSummary[];
  /** Newest retrieval date across the official sources, ISO instant. */
  lastRetrievedAt?: string;
}

function countryName(code: string, fromRecords: Map<string, string>): string {
  const recorded = fromRecords.get(code);
  if (recorded) return recorded;
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

async function fileSize(publicPath: string): Promise<string | undefined> {
  try {
    const stats = await fs.stat(path.join(process.cwd(), 'public', publicPath));
    return `${(stats.size / 1_048_576).toFixed(1)} MB`;
  } catch {
    return undefined;
  }
}

function newer(left: string | undefined, right: string | undefined): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return left >= right ? left : right;
}

function summarize(markets: FarmerMarket[]): {
  coverage: Omit<DatasetCoverage, 'stateCount' | 'cityCount' | 'unplacedMarkets' | 'countries'>;
  countryNames: Map<string, string>;
} {
  let officialMarkets = 0;
  let withHoursCount = 0;
  let withDaysCount = 0;
  let snapCount = 0;
  let staleCount = 0;
  let unverifiedCount = 0;
  let earliest: string | undefined;
  let latest: string | undefined;
  const countryNames = new Map<string, string>();

  for (const market of markets) {
    if (market.provenance?.publisher) officialMarkets += 1;
    if (marketHours(market)) withHoursCount += 1;
    if (marketWeekdays(market).length > 0) withDaysCount += 1;
    if (market.snap) snapCount += 1;

    const freshness = marketFreshness(market);
    if (freshness.level === 'stale') staleCount += 1;
    if (freshness.level === 'unverified') unverifiedCount += 1;

    const updated = toIsoInstant(market.last_updated);
    if (updated) {
      if (!earliest || updated < earliest) earliest = updated;
      latest = newer(latest, updated);
    }

    const code = market.country_code?.trim();
    const name = market.country?.trim();
    if (code && name && !countryNames.has(code)) countryNames.set(code, name);
  }

  return {
    coverage: {
      totalMarkets: markets.length,
      officialMarkets,
      legacyMarkets: markets.length - officialMarkets,
      withHoursCount,
      withDaysCount,
      snapCount,
      staleCount,
      unverifiedCount,
      earliestUpdate: earliest?.slice(0, 10),
      latestUpdate: latest?.slice(0, 10),
    },
    countryNames,
  };
}

function groupPublishers(
  markets: FarmerMarket[],
  manifest: Map<string, ManifestSource>
): DatasetPublisher[] {
  // Group by source first, so a publisher shipping two datasets is described
  // as two datasets rather than one merged blob with one licence.
  const bySource = new Map<string, DatasetSourceEntry & { publisher: string }>();

  for (const market of markets) {
    const provenance = market.provenance;
    const publisher = provenance?.publisher?.trim();
    if (!publisher) continue;

    const sourceId = provenance?.source_id?.trim() || publisher;
    const existing = bySource.get(sourceId);
    if (existing) {
      existing.recordCount += 1;
      continue;
    }

    const manifestSource = manifest.get(sourceId);
    bySource.set(sourceId, {
      publisher,
      sourceId,
      datasetName: provenance?.dataset_name?.trim() || undefined,
      catalogUrl: provenance?.catalog_url?.trim() || manifestSource?.catalog_url || undefined,
      license: provenance?.license?.trim() || manifestSource?.license || undefined,
      retrievedAt: provenance?.retrieved_at || manifestSource?.retrieved_at || undefined,
      scopeNote: provenance?.scope_note?.trim() || undefined,
      recordCount: 1,
    });
  }

  const byPublisher = new Map<string, DatasetPublisher>();
  for (const entry of bySource.values()) {
    const { publisher, ...dataset } = entry;
    const group = byPublisher.get(publisher) ?? { publisher, recordCount: 0, datasets: [] };
    group.recordCount += dataset.recordCount;
    group.datasets.push(dataset);
    byPublisher.set(publisher, group);
  }

  for (const group of byPublisher.values()) {
    group.datasets.sort((left, right) => right.recordCount - left.recordCount);
  }

  return [...byPublisher.values()].sort(
    (left, right) =>
      right.recordCount - left.recordCount || left.publisher.localeCompare(right.publisher)
  );
}

let dataPromise: Promise<DatasetPageData> | null = null;

async function buildDatasetPageData(): Promise<DatasetPageData> {
  const [markets, geoIndex, manifest] = await Promise.all([
    getMarkets(),
    getGeoIndex(),
    readManifestSources(),
  ]);

  const { coverage, countryNames } = summarize(markets);
  const publishers = groupPublishers(markets, manifest);

  const countryCodes = [...new Set(geoIndex.states.map((state) => state.country_code))];
  const countries = countryCodes
    .map((code) => countryName(code, countryNames))
    .sort((left, right) => left.localeCompare(right));

  const licenses = [
    ...new Set(
      publishers
        .flatMap((publisher) => publisher.datasets.map((dataset) => dataset.license))
        .filter((license): license is string => Boolean(license))
    ),
  ].sort((left, right) => left.localeCompare(right));

  const lastRetrievedAt = publishers
    .flatMap((publisher) => publisher.datasets.map((dataset) => dataset.retrievedAt))
    .reduce<string | undefined>((latest, value) => newer(latest, value), undefined);

  const files = await Promise.all(
    DATA_FILES.map(async (file) => ({
      path: file.path,
      name: file.name,
      size: await fileSize(file.path),
    }))
  );

  return {
    coverage: {
      ...coverage,
      stateCount: geoIndex.states.length,
      cityCount: geoIndex.states.reduce((total, state) => total + state.city_count, 0),
      unplacedMarkets: geoIndex.unresolved.length,
      countries,
    },
    publishers,
    licenses,
    files,
    lastRetrievedAt,
  };
}

/** Everything `/about-the-data` renders. Built once per server process. */
export function getDatasetPageData(): Promise<DatasetPageData> {
  if (!dataPromise) {
    dataPromise = buildDatasetPageData().catch((error) => {
      dataPromise = null;
      throw error;
    });
  }
  return dataPromise;
}
