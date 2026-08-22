#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const auditDir = path.join(root, 'data/enrichment/audit');
const enrichmentDir = path.join(root, 'data/enrichment');
const checkOnly = process.argv.includes('--check');

function fail(message) {
  throw new Error(message);
}

function valueAtPath(value, field) {
  return field.split('.').reduce((current, key) => current?.[key], value);
}

async function readJsonLines(file) {
  const body = await fs.readFile(file, 'utf8');
  if (!body.trim()) return [];
  return body.trimEnd().split('\n').map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      fail(`${path.basename(file)} line ${index + 1} is invalid JSON: ${error.message}`);
    }
  });
}

const manifest = JSON.parse(await fs.readFile(path.join(auditDir, 'manifest.json'), 'utf8'));
let compiled = 0;
const auditRecords = [];
const outputs = [];
const seenIds = new Set();
const firstRowsById = new Map();
const duplicateSourceIds = new Set();

for (const shard of manifest.shards) {
  const resultPath = path.join(auditDir, `shard-${shard.shard}-results.jsonl`);
  const outputPath = path.join(enrichmentDir, `research-audit-${shard.shard}.json`);
  const rows = await readJsonLines(resultPath);
  if (rows.length !== shard.count) {
    fail(`shard ${shard.shard} is incomplete: ${rows.length}/${shard.count}`);
  }
  for (const row of rows) {
    const first = firstRowsById.get(row.id);
    if (first) {
      if (first.market_name !== row.market_name) fail(`duplicate audit id ${row.id} has conflicting names`);
      if (first.status === 'verified_update' || row.status === 'verified_update') {
        fail(`duplicate source id ${row.id} cannot safely publish a shared enrichment`);
      }
      duplicateSourceIds.add(row.id);
    } else {
      firstRowsById.set(row.id, row);
      seenIds.add(row.id);
      auditRecords.push({ id: row.id, checked_at: row.checked_at, status: row.status });
    }
    if (row.status === 'blocked') fail(`audit id ${row.id} is still blocked`);
  }
  const records = rows
    .filter((row) => row.status === 'verified_update')
    .map((row) => {
      const record = {
        id: row.id,
        market_name: row.market_name,
        verified_at: row.checked_at,
        verification_scope: 'partial',
        ...row.verified_fields,
        sources: row.sources,
      };
      if (row.sources.some((source) => source.fields.includes('google_maps_url'))) {
        if (!row.google_maps_url) fail(`${row.id} cites google_maps_url without providing it`);
        record.google_maps_url = row.google_maps_url;
      }
      for (const source of row.sources) {
        for (const field of source.fields) {
          if (valueAtPath(record, field) === undefined) {
            fail(`${row.id} cites ${field}, but verified_fields does not contain it`);
          }
        }
      }
      return record;
    });

  outputs.push({ outputPath, contents: `${JSON.stringify(records, null, 2)}\n` });
  compiled += records.length;
  console.log(`compiled shard ${shard.shard}: ${records.length} verified updates`);
}

auditRecords.sort((left, right) => left.id.localeCompare(right.id, 'en'));

if (checkOnly) {
  for (const { outputPath, contents } of outputs) {
    const current = await fs.readFile(outputPath, 'utf8');
    if (current !== contents) {
      fail(`${path.relative(root, outputPath)} is out of date; run npm run data:enrichment:audit:compile`);
    }
  }
} else {
  const staged = outputs.map(({ outputPath, contents }) => ({
    outputPath,
    contents,
    temporaryPath: `${outputPath}.tmp-${process.pid}-${Date.now()}`,
  }));
  try {
    await Promise.all(staged.map(({ temporaryPath, contents }) => fs.writeFile(temporaryPath, contents)));
    for (const { temporaryPath, outputPath } of staged) await fs.rename(temporaryPath, outputPath);
  } finally {
    await Promise.all(staged.map(({ temporaryPath }) => fs.rm(temporaryPath, { force: true })));
  }
}
console.log(`compiled ${auditRecords.length} compact audit dispositions`);
console.log(`compiled ${compiled} verified updates from the full-corpus audit`);
if (duplicateSourceIds.size) {
  console.log(`accounted for ${duplicateSourceIds.size} duplicate source ID(s): ${[...duplicateSourceIds].join(', ')}`);
}
