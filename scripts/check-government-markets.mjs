#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { validateGlobalRecords } from './update-government-markets.mjs';

const root = process.cwd();
const outputPath = path.join(root, 'data/sources/government_markets.json');
const manifestPath = path.join(root, 'data/sources/government_markets.manifest.json');
const registryPath = path.join(root, 'data/government-market-sources.json');
const failOnStale = process.argv.includes('--fail-on-stale');

const [outputContents, manifestContents, registryContents] = await Promise.all([
  fs.readFile(outputPath, 'utf8'),
  fs.readFile(manifestPath, 'utf8'),
  fs.readFile(registryPath, 'utf8')
]);

const records = JSON.parse(outputContents);
const manifest = JSON.parse(manifestContents);
const registry = JSON.parse(registryContents);
validateGlobalRecords(records);

if (records.length !== manifest.record_count) {
  throw new Error(`Manifest says ${manifest.record_count} records but snapshot contains ${records.length}`);
}

const checksum = createHash('sha256').update(outputContents).digest('hex');
if (checksum !== manifest.sha256) throw new Error('Snapshot checksum does not match the manifest');

const enabledSourceIds = new Set(registry.sources.filter((source) => source.enabled).map((source) => source.id));
const manifestSourceIds = new Set(manifest.sources.map((source) => source.id));
for (const sourceId of enabledSourceIds) {
  if (!manifestSourceIds.has(sourceId)) throw new Error(`Manifest is missing enabled source ${sourceId}`);
}

const counts = new Map();
for (const market of records) {
  const sourceId = market.provenance?.source_id;
  counts.set(sourceId, [...(counts.get(sourceId) ?? []), market]);
}
for (const source of manifest.sources) {
  const actualCount = counts.get(source.id)?.length ?? 0;
  if (actualCount !== source.record_count) {
    throw new Error(`${source.id} manifest count is ${source.record_count}, snapshot count is ${actualCount}`);
  }
}

for (const market of records) {
  if (market.provenance?.official !== true) throw new Error(`${market.id} is missing official provenance`);
  if (!enabledSourceIds.has(market.provenance.source_id)) {
    throw new Error(`${market.id} references unknown or disabled source ${market.provenance.source_id}`);
  }
}

if (failOnStale && manifest.status !== 'ok') {
  throw new Error(`Manifest status is ${manifest.status}`);
}

console.log(`validated ${records.length} official markets across ${manifest.sources.length} enabled sources (${manifest.status})`);
