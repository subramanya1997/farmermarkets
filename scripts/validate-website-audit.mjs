#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const auditDir = path.join(root, 'data/enrichment/site-audit/v1');
const progressOnly = process.argv.includes('--progress');
const writeReport = process.argv.includes('--write-report');
const manifest = JSON.parse(await fs.readFile(path.join(auditDir, 'manifest.json'), 'utf8'));
const targets = (await fs.readFile(path.join(auditDir, 'targets.jsonl'), 'utf8'))
  .trim().split('\n').filter(Boolean).map(JSON.parse);
const targetById = new Map(targets.map((target) => [target.target_id, target]));
const allowedDispositions = new Set([
  'rendered_identity_matched',
  'identity_ambiguous',
  'rendered_not_found',
  'access_blocked_after_retries',
  'retry_exhausted',
]);

function fail(message) {
  throw new Error(message);
}

const resultsById = new Map();
const shards = [];
for (let shard = 1; shard <= manifest.shard_count; shard += 1) {
  const input = JSON.parse(await fs.readFile(
    path.join(auditDir, 'shards', `shard-${String(shard).padStart(2, '0')}-input.json`),
    'utf8'
  ));
  const resultPath = path.join(auditDir, 'results', `shard-${String(shard).padStart(2, '0')}-results.jsonl`);
  let results = [];
  try {
    const contents = await fs.readFile(resultPath, 'utf8');
    results = contents.trim().split('\n').filter(Boolean).map(JSON.parse);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const inputIds = new Set(input.targets.map((target) => target.target_id));
  const statuses = {};
  for (const [index, result] of results.entries()) {
    const label = `shard ${shard} result ${index}`;
    if (!inputIds.has(result.target_id)) fail(`${label} is not in its shard input`);
    if (resultsById.has(result.target_id)) fail(`Duplicate target result ${result.target_id}`);
    if (!allowedDispositions.has(result.disposition)) fail(`${label} has unsupported disposition`);
    const target = targetById.get(result.target_id);
    if (!target) fail(`${label} has unknown target id`);
    const decisions = new Map((result.identity_decisions ?? []).map((decision) => [decision.row_key, decision]));
    if (decisions.size !== target.row_keys.length || target.row_keys.some((rowKey) => !decisions.has(rowKey))) {
      fail(`${label} does not disposition every linked source row`);
    }
    for (const decision of decisions.values()) {
      for (const key of ['identity_match', 'name_match', 'locality_match']) {
        if (typeof decision[key] !== 'boolean') fail(`${label}.${key} must be boolean`);
      }
    }
    if (result.disposition === 'rendered_identity_matched' && ![...decisions.values()].some((d) => d.identity_match)) {
      fail(`${label} claims a match without a matching row`);
    }
    if (!Array.isArray(result.evidence) || !Array.isArray(result.relevant_links)) {
      fail(`${label} must contain evidence and relevant_links arrays`);
    }
    resultsById.set(result.target_id, result);
    statuses[result.disposition] = (statuses[result.disposition] ?? 0) + 1;
  }
  shards.push({
    shard,
    completed: results.length,
    total: input.targets.length,
    remaining: input.targets.length - results.length,
    statuses,
  });
}

const statuses = {};
for (const result of resultsById.values()) {
  statuses[result.disposition] = (statuses[result.disposition] ?? 0) + 1;
}
const report = {
  schema_version: manifest.schema_version,
  rotation_id: manifest.rotation_id,
  completed: resultsById.size,
  total: targets.length,
  remaining: targets.length - resultsById.size,
  complete: resultsById.size === targets.length,
  statuses,
  shards,
};

if (!progressOnly && !report.complete) fail(`${report.remaining} website targets remain`);
if (writeReport) {
  await fs.writeFile(path.join(auditDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
