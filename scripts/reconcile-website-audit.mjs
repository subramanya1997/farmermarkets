#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const auditDir = path.join(root, 'data/enrichment/site-audit/v1');

async function readJsonl(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return text.trim().split('\n').filter(Boolean).map(JSON.parse);
}

async function writeJsonlAtomic(filePath, records) {
  const temporary = `${filePath}.tmp`;
  await fs.writeFile(temporary, records.map((record) => JSON.stringify(record)).join('\n') + (records.length ? '\n' : ''));
  await fs.rename(temporary, filePath);
}

const targets = await readJsonl(path.join(auditDir, 'targets.jsonl'));
const allowedTargets = new Set(targets.map((target) => target.target_id));
const summary = { allowed_targets: allowedTargets.size, results_removed: 0, details_removed: 0 };

for (const [directory, summaryKey] of [['results', 'results_removed'], ['details', 'details_removed']]) {
  const directoryPath = path.join(auditDir, directory);
  let names = [];
  try {
    names = await fs.readdir(directoryPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  for (const name of names.filter((entry) => entry.endsWith('.jsonl')).sort()) {
    const filePath = path.join(directoryPath, name);
    const records = await readJsonl(filePath);
    const retained = records.filter((record) => allowedTargets.has(record.target_id));
    summary[summaryKey] += records.length - retained.length;
    if (retained.length !== records.length) await writeJsonlAtomic(filePath, retained);
  }
}

console.log(JSON.stringify(summary, null, 2));
