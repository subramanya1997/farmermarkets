#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const auditDir = path.join(root, 'data/enrichment/site-audit/v1');
const progressOnly = process.argv.includes('--progress');
const writeReport = process.argv.includes('--write-report');

async function readJsonl(filePath, optional = false) {
  try {
    const contents = await fs.readFile(filePath, 'utf8');
    return contents.trim().split('\n').filter(Boolean).map(JSON.parse);
  } catch (error) {
    if (optional && error.code === 'ENOENT') return [];
    throw error;
  }
}

function require(condition, message) {
  if (!condition) throw new Error(message);
}

const shards = [];
let completed = 0;
let total = 0;
for (let shard = 1; shard <= 16; shard += 1) {
  const suffix = String(shard).padStart(2, '0');
  const initial = await readJsonl(path.join(auditDir, 'results', `shard-${suffix}-results.jsonl`), true);
  const eligible = initial.filter((result) =>
    result.disposition === 'rendered_identity_matched' &&
    result.identity_decisions?.some((decision) => decision.identity_match)
  );
  const eligibleById = new Map(eligible.map((result) => [result.target_id, result]));
  const details = await readJsonl(path.join(auditDir, 'details', `shard-${suffix}-details.jsonl`), true);
  const seen = new Set();
  const statuses = {};
  for (const [index, detail] of details.entries()) {
    const label = `shard ${shard} detail ${index + 1}`;
    require(eligibleById.has(detail.target_id), `${label} is not an eligible matched target`);
    require(!seen.has(detail.target_id), `${label} duplicates target ${detail.target_id}`);
    seen.add(detail.target_id);
    require(['detail_audited', 'detail_retry_exhausted'].includes(detail.disposition), `${label} has an invalid disposition`);
    require(Array.isArray(detail.matched_row_keys) && detail.matched_row_keys.length > 0, `${label} has no matched rows`);
    const allowedRows = new Set(eligibleById.get(detail.target_id).identity_decisions.filter((decision) => decision.identity_match).map((decision) => decision.row_key));
    require(detail.matched_row_keys.every((rowKey) => allowedRows.has(rowKey)), `${label} carries an unmatched row`);
    require(Array.isArray(detail.pages) && Array.isArray(detail.errors), `${label} pages/errors must be arrays`);
    require(detail.disposition !== 'detail_audited' || detail.pages.length > 0, `${label} audited without a page`);
    for (const [pageIndex, page] of detail.pages.entries()) {
      const pageLabel = `${label} page ${pageIndex + 1}`;
      require(/^https?:\/\//i.test(page.url), `${pageLabel} has an invalid URL`);
      require(typeof page.title === 'string', `${pageLabel} has no title`);
      require(/^[a-f0-9]{64}$/.test(page.main_text_hash), `${pageLabel} has an invalid text hash`);
      require(Array.isArray(page.evidence) && Array.isArray(page.social_profiles) && Array.isArray(page.newsletter_urls), `${pageLabel} has invalid evidence/contact arrays`);
    }
    statuses[detail.disposition] = (statuses[detail.disposition] ?? 0) + 1;
  }
  require(details.length <= eligible.length, `shard ${shard} has more details than eligible targets`);
  completed += details.length;
  total += eligible.length;
  shards.push({ shard, completed: details.length, total: eligible.length, remaining: eligible.length - details.length, statuses });
}

const report = {
  schema_version: 1,
  completed,
  total,
  remaining: total - completed,
  complete: completed === total,
  shards,
};
if (writeReport) await fs.writeFile(path.join(auditDir, 'detail-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!progressOnly && !report.complete) throw new Error(`Website detail audit incomplete: ${report.remaining} matched targets remain`);
