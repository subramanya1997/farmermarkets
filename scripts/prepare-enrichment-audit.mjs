#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const shardCount = 3;
const outputDir = path.join(root, 'data/enrichment/audit');

function normalizedLocation(market) {
  return [
    market.location?.address,
    market.location?.city,
    market.location?.state,
    market.location?.zip_code,
    market.country,
  ].filter(Boolean).join(', ');
}

function present(value) {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

const [legacy, government, enrichmentNames] = await Promise.all([
  fs.readFile(path.join(root, 'data/sources/legacy_markets.json'), 'utf8').then(JSON.parse),
  fs.readFile(path.join(root, 'data/sources/government_markets.json'), 'utf8').then(JSON.parse),
  fs.readdir(path.join(root, 'data/enrichment')),
]);

// Only hand-curated, non-audit batches qualify as already enriched. Reading
// the compiled public overlay here would make a rerun classify the previous
// audit's own rows as `already_enriched`; the next compile would then erase
// those rows from the audit batches.
const baselineFiles = enrichmentNames
  .filter((name) => /^research-(?!audit-).+\.json$/.test(name))
  .sort();
const baselineBatches = await Promise.all(baselineFiles.map((name) =>
  fs.readFile(path.join(root, 'data/enrichment', name), 'utf8').then(JSON.parse),
));
const alreadyEnriched = new Set(baselineBatches.flat().map((record) => String(record.id)));
const markets = [...legacy, ...government]
  .map((market) => ({
    id: String(market.id),
    market_name: market.name,
    slug: market.slug,
    location: normalizedLocation(market),
    location_parts: {
      address: market.location?.address ?? null,
      city: market.location?.city ?? null,
      state: market.location?.state ?? null,
      zip_code: market.location?.zip_code ?? null,
      country: market.country ?? null,
    },
    coordinates: market.location?.coordinates ?? null,
    official_source: market.provenance ? {
      publisher: market.provenance.publisher,
      dataset_name: market.provenance.dataset_name,
      catalog_url: market.provenance.catalog_url,
      data_url: market.provenance.data_url,
    } : null,
    current_coverage: {
      independently_enriched: alreadyEnriched.has(String(market.id)),
      website: present(market.contact?.websites),
      social_media: present(market.contact?.social_media),
      phone: present(market.contact?.phone_numbers),
      email: present(market.contact?.emails),
      schedule: present(market.operations?.days),
      season: present(market.operations?.season),
      payment: present(market.payment?.methods),
      amenities: present(market.amenities?.features),
    },
  }))
  .sort((left, right) => left.id.localeCompare(right.id, 'en'));

await fs.mkdir(outputDir, { recursive: true });

const manifests = Array.from({ length: shardCount }, () => []);
markets.forEach((market, index) => manifests[index % shardCount].push(market));

await Promise.all(manifests.map((records, index) =>
  fs.writeFile(
    path.join(outputDir, `shard-${index + 1}-input.json`),
    `${JSON.stringify(records, null, 2)}\n`,
  ),
));

const manifest = {
  generated_at: new Date().toISOString(),
  total_markets: markets.length,
  shard_count: shardCount,
  shards: manifests.map((records, index) => ({
    shard: index + 1,
    count: records.length,
    first_id: records.at(0)?.id ?? null,
    last_id: records.at(-1)?.id ?? null,
  })),
};

await fs.writeFile(
  path.join(outputDir, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

console.log(JSON.stringify(manifest, null, 2));
