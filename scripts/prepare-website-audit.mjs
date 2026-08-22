#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  WEBSITE_AUDIT_SCHEMA_VERSION,
  WEBSITE_AUDIT_SHARD_COUNT,
  isWebsiteAuditCandidate,
  marketRowKey,
  normalizeWebsiteUrl,
  normalizedHost,
  serializeJson,
  serializeJsonl,
  sha256,
  websiteShardForHost,
  websiteTargetId,
} from './lib/website-audit.mjs';
import { buildMarketEnrichment } from './build-market-enrichment.mjs';

const root = process.cwd();
const outputDir = path.join(root, 'data/enrichment/site-audit/v1');
const shardDir = path.join(outputDir, 'shards');
const checkOnly = process.argv.includes('--check');

const sourceFiles = {
  legacy: 'data/sources/legacy_markets.json',
  government: 'data/sources/government_markets.json',
  consolidated: 'public/data/farmers_markets.json',
};

function normalizeIdentity(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function readInputs() {
  const entries = await Promise.all(
    Object.entries(sourceFiles).map(async ([key, relativePath]) => {
      const contents = await fs.readFile(path.join(root, relativePath), 'utf8');
      return [key, { relativePath, contents, parsed: JSON.parse(contents), sha256: sha256(contents) }];
    })
  );
  return Object.fromEntries(entries);
}

function addSeed(targetSeeds, rowKey, rawUrl, provenance) {
  if (!isWebsiteAuditCandidate(rawUrl)) return;
  const normalizedUrl = normalizeWebsiteUrl(rawUrl);
  const targetId = websiteTargetId(normalizedUrl);
  const seed = targetSeeds.get(targetId) ?? {
    target_id: targetId,
    normalized_url: normalizedUrl,
    host: normalizedHost(normalizedUrl),
    seed_urls: new Set(),
    provenance: new Set(),
    row_keys: new Set(),
  };
  seed.seed_urls.add(rawUrl);
  seed.provenance.add(provenance);
  seed.row_keys.add(rowKey);
  targetSeeds.set(targetId, seed);
}

async function buildOutputs() {
  const [inputs, enrichments] = await Promise.all([readInputs(), buildMarketEnrichment()]);
  if (inputs.consolidated.parsed.length !== inputs.legacy.parsed.length + inputs.government.parsed.length) {
    throw new Error('canonical market file does not match the source row count');
  }
  const enrichmentById = new Map(enrichments.map((record) => [String(record.id), record]));
  const targetSeeds = new Map();
  const rows = [];

  for (const [sourceKind, markets] of [
    ['legacy', inputs.legacy.parsed],
    ['government', inputs.government.parsed],
  ]) {
    for (const market of markets) {
      const rowKey = marketRowKey(sourceKind, market);
      const enrichment = enrichmentById.get(String(market.id));
      const candidateUrls = [];
      for (const rawUrl of market.contact?.websites ?? []) {
        if (!isWebsiteAuditCandidate(rawUrl)) continue;
        candidateUrls.push({ url: rawUrl });
        addSeed(targetSeeds, rowKey, rawUrl, 'source_snapshot');
      }
      for (const rawUrl of enrichment?.contact?.websites ?? []) {
        if (!isWebsiteAuditCandidate(rawUrl)) continue;
        candidateUrls.push({ url: rawUrl });
        addSeed(targetSeeds, rowKey, rawUrl, 'enrichment');
      }
      const targetIds = [...new Set(candidateUrls.map(({ url }) => websiteTargetId(normalizeWebsiteUrl(url))))]
        .sort((left, right) => left.localeCompare(right, 'en'));
      rows.push({
        row_key: rowKey,
        source_kind: sourceKind,
        market_id: String(market.id),
        slug: market.slug,
        market_name: market.name,
        identity_key: [
          market.name,
          market.location?.city,
          market.location?.state,
          market.country,
        ]
          .map(normalizeIdentity)
          .filter(Boolean)
          .join('|'),
        location: {
          address: market.location?.address,
          city: market.location?.city,
          state: market.location?.state,
          zip_code: market.location?.zip_code,
          country: market.country ?? (sourceKind === 'legacy' ? 'United States' : undefined),
        },
        target_ids: targetIds,
        candidate_status: targetIds.length ? 'trusted_seed' : 'no_website_candidate',
      });
    }
  }

  rows.sort((left, right) => left.row_key.localeCompare(right.row_key, 'en'));
  const rowByKey = new Map(rows.map((row) => [row.row_key, row]));
  const targets = [...targetSeeds.values()].map((seed) => {
    const rowKeys = [...seed.row_keys].sort((left, right) => left.localeCompare(right, 'en'));
    const identityCount = new Set(rowKeys.map((rowKey) => rowByKey.get(rowKey)?.identity_key)).size;
    return {
      target_id: seed.target_id,
      normalized_url: seed.normalized_url,
      host: seed.host,
      shard: websiteShardForHost(seed.host),
      seed_urls: [...seed.seed_urls].sort((left, right) => left.localeCompare(right, 'en')),
      provenance: [...seed.provenance].sort((left, right) => left.localeCompare(right, 'en')),
      row_keys: rowKeys,
      linked_markets: rowKeys.length,
      risk_class: rowKeys.length === 1
        ? 'single_market_page'
        : identityCount === 1
          ? 'shared_exact_identity'
          : 'shared_page_multiple_identities',
    };
  }).sort((left, right) => left.target_id.localeCompare(right.target_id, 'en'));

  const targetsByHost = new Map();
  for (const target of targets) {
    const values = targetsByHost.get(target.host) ?? [];
    values.push(target);
    targetsByHost.set(target.host, values);
  }
  const domains = [...targetsByHost.entries()].map(([host, hostTargets]) => ({
    host,
    shard: websiteShardForHost(host),
    target_ids: hostTargets.map((target) => target.target_id).sort((left, right) => left.localeCompare(right, 'en')),
    target_count: hostTargets.length,
    row_keys: [...new Set(hostTargets.flatMap((target) => target.row_keys))]
      .sort((left, right) => left.localeCompare(right, 'en')),
    max_concurrency: 1,
  })).sort((left, right) => left.host.localeCompare(right.host, 'en'));

  const shardInputs = Array.from({ length: WEBSITE_AUDIT_SHARD_COUNT }, (_, shard) => ({
    schema_version: WEBSITE_AUDIT_SCHEMA_VERSION,
    shard,
    targets: targets.filter((target) => target.shard === shard),
  }));
  const corpusDigest = sha256(serializeJsonl(rows) + serializeJsonl(targets));
  const manifest = {
    schema_version: WEBSITE_AUDIT_SCHEMA_VERSION,
    corpus_digest: corpusDigest,
    rotation_id: corpusDigest.slice(0, 16),
    source_files: Object.fromEntries(
      Object.entries(inputs).map(([key, input]) => [key, {
        path: input.relativePath,
        sha256: input.sha256,
        rows: input.parsed.length,
      }])
    ),
    counts: {
      source_rows: rows.length,
      unique_market_ids: new Set(rows.map((row) => row.market_id)).size,
      rows_with_candidates: rows.filter((row) => row.target_ids.length).length,
      rows_without_candidates: rows.filter((row) => !row.target_ids.length).length,
      targets: targets.length,
      domains: domains.length,
      shared_page_multiple_identities: targets.filter(
        (target) => target.risk_class === 'shared_page_multiple_identities'
      ).length,
    },
    shard_count: WEBSITE_AUDIT_SHARD_COUNT,
    shard_target_counts: shardInputs.map((input) => input.targets.length),
  };

  const files = new Map([
    [path.join(outputDir, 'manifest.json'), serializeJson(manifest)],
    [path.join(outputDir, 'rows.jsonl'), serializeJsonl(rows)],
    [path.join(outputDir, 'targets.jsonl'), serializeJsonl(targets)],
    [path.join(outputDir, 'domains.jsonl'), serializeJsonl(domains)],
    ...shardInputs.map((input) => [
      path.join(shardDir, `shard-${String(input.shard + 1).padStart(2, '0')}-input.json`),
      serializeJson(input),
    ]),
  ]);
  return { files, manifest };
}

async function writeAtomically(files) {
  await fs.mkdir(shardDir, { recursive: true });
  const staged = [];
  try {
    for (const [filePath, contents] of files) {
      const tempPath = `${filePath}.tmp-${process.pid}`;
      await fs.writeFile(tempPath, contents);
      staged.push([tempPath, filePath]);
    }
    for (const [tempPath, filePath] of staged) await fs.rename(tempPath, filePath);
  } catch (error) {
    await Promise.all(staged.map(([tempPath]) => fs.unlink(tempPath).catch(() => {})));
    throw error;
  }
}

async function checkParity(files) {
  for (const [filePath, expected] of files) {
    const actual = await fs.readFile(filePath, 'utf8');
    if (actual !== expected) {
      throw new Error(`${path.relative(root, filePath)} is out of date; run node scripts/prepare-website-audit.mjs`);
    }
  }
}

const { files, manifest } = await buildOutputs();
if (checkOnly) await checkParity(files);
else await writeAtomically(files);
console.log(JSON.stringify(manifest, null, 2));
