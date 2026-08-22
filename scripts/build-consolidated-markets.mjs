#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { mergeEnrichment } from '../src/lib/enrichment.ts';
import { buildMarketEnrichment } from './build-market-enrichment.mjs';

const root = process.cwd();
const execFile = promisify(execFileCallback);
const legacyPath = path.join(root, 'data/sources/legacy_markets.json');
const governmentPath = path.join(root, 'data/sources/government_markets.json');
const auditDirectory = path.join(root, 'data/enrichment/audit');
const auditArchivePath = path.join(root, 'data/enrichment/archive/audit-2026-08-21.tar.gz');
const outputPath = path.join(root, 'public/data/farmers_markets.json');
const overridesPath = path.join(root, 'data/overrides/editorial-overrides.json');

function fail(message) {
  throw new Error(message);
}

function isGoogleMapsUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname === 'maps.app.goo.gl' ||
      (/(^|\.)google\.[a-z.]+$/i.test(url.hostname) && url.pathname.toLowerCase().includes('/maps'));
  } catch {
    return false;
  }
}

function googleMapsSearchUrl(market) {
  const coordinates = market.location?.coordinates;
  const query = coordinates &&
    Number.isFinite(coordinates.latitude) &&
    Number.isFinite(coordinates.longitude)
    ? `${coordinates.latitude},${coordinates.longitude}`
    : [market.name, market.location?.address].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

async function readJson(filePath) {
  const value = JSON.parse(await fs.readFile(filePath, 'utf8'));
  if (!Array.isArray(value)) fail(`${path.relative(root, filePath)} must contain a top-level array`);
  return value;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function readAuditText(relativePath) {
  const livePath = path.join(auditDirectory, relativePath);
  if (await pathExists(livePath)) return fs.readFile(livePath, 'utf8');
  if (!await pathExists(auditArchivePath)) {
    fail('full-market audit is neither restored nor archived');
  }
  const member = `data/enrichment/audit/${relativePath}`;
  const { stdout } = await execFile('tar', ['-xOzf', auditArchivePath, member], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

function parseJsonLines(body, label) {
  if (!body.trim()) return [];
  return body.trimEnd().split(/\r?\n/).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      fail(`${label}:${index + 1}: ${error.message}`);
    }
  });
}

async function readAuditById() {
  const manifest = JSON.parse(await readAuditText('manifest.json'));
  const auditById = new Map();
  for (const shard of manifest.shards ?? []) {
    const fileName = `shard-${shard.shard}-results.jsonl`;
    const rows = parseJsonLines(
      await readAuditText(fileName),
      `data/enrichment/audit/${fileName}`,
    );
    if (rows.length !== shard.count) {
      fail(`audit shard ${shard.shard} is incomplete: ${rows.length}/${shard.count}`);
    }
    for (const row of rows) {
      const id = String(row.id);
      const audit = { checked_at: row.checked_at, status: row.status };
      const existing = auditById.get(id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(audit)) {
        fail(`duplicate source id ${id} has conflicting audit metadata`);
      }
      if (!existing) auditById.set(id, audit);
    }
  }
  return auditById;
}

function validateConsolidation({ sources, enrichmentById, auditById, markets }) {
  if (markets.length !== sources.length) {
    fail(`consolidation changed the row count: ${sources.length} source rows became ${markets.length}`);
  }

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const market = markets[index];
    if (String(source.id) !== String(market.id) || source.name !== market.name) {
      fail(`consolidation changed row identity at index ${index}`);
    }
    if (!market.suppress_map && !isGoogleMapsUrl(market.google_maps_url)) {
      fail(`consolidated market ${market.id} is missing its Google Maps URL`);
    }
  }

  const marketsById = new Map();
  for (const market of markets) {
    const id = String(market.id);
    marketsById.set(id, [...(marketsById.get(id) ?? []), market]);
  }

  for (const [id, enrichment] of enrichmentById) {
    const matches = marketsById.get(id) ?? [];
    if (!matches.length) fail(`enrichment ${id} has no consolidated market`);
    for (const market of matches) {
      if (!market.enrichment || JSON.stringify(market.enrichment.sources) !== JSON.stringify(enrichment.sources)) {
        fail(`consolidated market ${id} lost enrichment sources`);
      }
      if (enrichment.first_party && JSON.stringify(market.first_party) !== JSON.stringify(enrichment.first_party)) {
        fail(`consolidated market ${id} lost rich first-party facts`);
      }
    }
  }

  for (const id of auditById.keys()) {
    const matches = marketsById.get(id) ?? [];
    if (!matches.length) fail(`audit ${id} has no consolidated market`);
    if (matches.some((market) => !market.audit)) fail(`consolidated market ${id} lost audit metadata`);
  }
}

// Editorial fixes to enrichment-derived values (typography, time and season
// formatting) that cannot live in the source files because the underlying
// values come from the archived audits. Applied after validation so the
// enrichment integrity checks still compare against the raw audit data.
async function applyEditorialOverrides(markets) {
  if (!await pathExists(overridesPath)) return;
  const { schema_version: schemaVersion, overrides } = JSON.parse(await fs.readFile(overridesPath, 'utf8'));
  if (schemaVersion !== 1 || !Array.isArray(overrides)) {
    fail('editorial overrides file has an unsupported shape');
  }
  for (const override of overrides) {
    const market = markets[override.index];
    if (!market || String(market.id) !== String(override.id)) {
      fail(`editorial override at index ${override.index} does not match market ${override.id}`);
    }
    const keys = override.path.split('.');
    let target = market;
    for (const key of keys.slice(0, -1)) {
      target = target?.[key];
      if (target === null || typeof target !== 'object') {
        fail(`editorial override path ${override.path} is missing on market ${override.id}`);
      }
    }
    target[keys.at(-1)] = override.value;
  }
}

export async function buildConsolidatedMarkets({ check = false } = {}) {
  const [legacy, government, enrichments, auditById] = await Promise.all([
    readJson(legacyPath),
    readJson(governmentPath),
    buildMarketEnrichment(),
    readAuditById(),
  ]);
  const enrichmentById = new Map(enrichments.map((record) => [String(record.id), record]));
  const sources = [...legacy, ...government];
  const markets = sources.map((source, index) => {
    const market = index < legacy.length
      ? { ...source, country: source.country || 'United States', country_code: source.country_code || 'US' }
      : source;
    const merged = mergeEnrichment(
      market,
      enrichmentById.get(String(market.id)),
      auditById.get(String(market.id)),
    );
    if (merged.suppress_map) return merged;
    return {
      ...merged,
      google_maps_url: merged.google_maps_url ||
        merged.contact?.websites?.find(isGoogleMapsUrl) ||
        googleMapsSearchUrl(merged),
    };
  });

  validateConsolidation({ sources, enrichmentById, auditById, markets });
  await applyEditorialOverrides(markets);
  const serialized = `${JSON.stringify(markets, null, 2)}\n`;
  if (check) {
    const current = await fs.readFile(outputPath, 'utf8');
    if (current !== serialized) {
      fail('public/data/farmers_markets.json is out of date; run npm run data:consolidate');
    }
  } else {
    const temporaryPath = `${outputPath}.tmp-${process.pid}-${Date.now()}`;
    try {
      await fs.writeFile(temporaryPath, serialized);
      await fs.rename(temporaryPath, outputPath);
    } finally {
      await fs.rm(temporaryPath, { force: true });
    }
  }

  console.log(
    `${check ? 'validated' : 'built'} one canonical file with ${markets.length} rows, ` +
    `${enrichmentById.size} enriched IDs, and ${auditById.size} audited IDs`
  );
  return markets;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildConsolidatedMarkets({ check: process.argv.includes('--check') });
}
