#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  extractEvidenceExcerpts,
  marketIdentityDecision,
  sha256,
} from './lib/website-audit.mjs';

const root = process.cwd();
const shardArgument = process.argv.find((argument) => argument.startsWith('--shard='));
const limitArgument = process.argv.find((argument) => argument.startsWith('--limit='));
if (!shardArgument) throw new Error('Pass a one-based --shard=N');
const shardNumber = Number(shardArgument.split('=')[1]);
const limit = limitArgument ? Number(limitArgument.split('=')[1]) : Number.POSITIVE_INFINITY;
if (!Number.isInteger(shardNumber) || shardNumber < 1 || shardNumber > 16) {
  throw new Error('--shard must be between 1 and 16');
}
if (!(limit > 0)) throw new Error('--limit must be positive');

const auditDir = path.join(root, 'data/enrichment/site-audit/v1');
const inputPath = path.join(auditDir, 'shards', `shard-${String(shardNumber).padStart(2, '0')}-input.json`);
const resultDir = path.join(auditDir, 'results');
const resultPath = path.join(resultDir, `shard-${String(shardNumber).padStart(2, '0')}-results.jsonl`);
const rowPath = path.join(auditDir, 'rows.jsonl');
const browseBinary = path.join(process.env.HOME, '.claude/skills/gstack/browse/dist/browse');
const browserEnvironment = {
  ...process.env,
  BROWSE_STATE_FILE: `/tmp/farmermarkets-site-audit-${shardNumber}.json`,
  CHROMIUM_PROFILE: `/tmp/farmermarkets-site-audit-${shardNumber}-profile`,
};

const SNAPSHOT_SCRIPT = `JSON.stringify((()=>{const root=document.querySelector('main,article,[role="main"]')||document.body;const clean=s=>(s||'').replace(/\\s+/g,' ').trim();return{final_url:location.href,title:document.title,h1:[...document.querySelectorAll('h1')].map(e=>clean(e.innerText)).filter(Boolean).slice(0,12),headings:[...root.querySelectorAll('h2,h3')].map(e=>clean(e.innerText)).filter(Boolean).slice(0,80),main_text:(root.innerText||'').slice(0,100000),links:[...root.querySelectorAll('a[href]')].map(a=>({text:clean(a.innerText||a.textContent),href:a.href})).filter(x=>x.text&&/^https?:/i.test(x.href)).slice(0,400)}})())`;

function runBrowse(arguments_, timeout = 45000) {
  const result = spawnSync(browseBinary, arguments_, {
    cwd: root,
    env: browserEnvironment,
    encoding: 'utf8',
    timeout,
    maxBuffer: 4 * 1024 * 1024,
  });
  return {
    ok: result.status === 0 && !result.error,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error?.message,
  };
}

function parseSnapshot(stdout) {
  const lines = stdout.trim().split('\n').reverse();
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === 'object' && typeof parsed.final_url === 'string') return parsed;
    } catch {
      // Continue until a JSON result line is found; browse may print startup text.
    }
  }
  throw new Error('browse js did not return a snapshot object');
}

function relevantLinks(links) {
  const pattern = /\b(?:calendar|directions?|events?|lineup|map|newsletter|schedule|seller|subscribe|transit|vendor)\b/i;
  const seen = new Set();
  const values = [];
  for (const link of links ?? []) {
    if (!pattern.test(`${link.text} ${link.href}`)) continue;
    const key = `${link.text}|${link.href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    values.push({ text: link.text.slice(0, 160), href: link.href });
    if (values.length >= 40) break;
  }
  return values;
}

function renderedDisposition(snapshot, identityDecisions) {
  const headings = Array.isArray(snapshot.h1)
    ? snapshot.h1
    : typeof snapshot.h1 === 'string'
      ? [snapshot.h1]
      : [];
  const page = `${snapshot.title}\n${headings.join('\n')}\n${snapshot.main_text.slice(0, 5000)}`;
  if (/\b(?:404|page not found|not found|page does not exist|nothing here)\b/i.test(page)) {
    return 'rendered_not_found';
  }
  if (/\b(?:captcha|verify you are human|unusual traffic|pardon our interruption|access denied|checking your browser|just a moment|enable javascript and cookies to continue)\b/i.test(page)) {
    return 'access_blocked_after_retries';
  }
  if (identityDecisions.some((decision) => decision.identity_match)) return 'rendered_identity_matched';
  return 'identity_ambiguous';
}

async function readJsonl(filePath) {
  const contents = await fs.readFile(filePath, 'utf8');
  return contents.trim().split('\n').filter(Boolean).map(JSON.parse);
}

await fs.access(browseBinary);
await fs.mkdir(resultDir, { recursive: true });
const [input, rows] = await Promise.all([
  fs.readFile(inputPath, 'utf8').then(JSON.parse),
  readJsonl(rowPath),
]);
const rowByKey = new Map(rows.map((row) => [row.row_key, row]));
let completed = new Set();
try {
  completed = new Set((await readJsonl(resultPath)).map((result) => result.target_id));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

let processed = 0;
for (const target of input.targets) {
  if (completed.has(target.target_id) || processed >= limit) continue;
  const attempts = [];
  let snapshot;
  for (const seedUrl of target.seed_urls) {
    for (let attempt = 1; attempt <= 3 && !snapshot; attempt += 1) {
      const navigation = runBrowse(['goto', seedUrl]);
      attempts.push({
        seed_url: seedUrl,
        attempt,
        navigation_ok: navigation.ok,
        status: navigation.status,
        error: navigation.error || navigation.stderr.trim().slice(0, 500) || undefined,
      });
      if (!navigation.ok) continue;
      const js = runBrowse(['js', SNAPSHOT_SCRIPT]);
      if (!js.ok) {
        attempts.at(-1).snapshot_error = js.error || js.stderr.trim().slice(0, 500) || 'snapshot failed';
        continue;
      }
      try {
        snapshot = parseSnapshot(js.stdout);
      } catch (error) {
        attempts.at(-1).snapshot_error = error.message;
      }
    }
    if (snapshot) break;
  }

  const linkedRows = target.row_keys.map((rowKey) => rowByKey.get(rowKey)).filter(Boolean);
  const identityDecisions = snapshot
    ? linkedRows.map((row) => ({ row_key: row.row_key, ...marketIdentityDecision(row, snapshot) }))
    : linkedRows.map((row) => ({
        row_key: row.row_key,
        identity_match: false,
        name_match: false,
        locality_match: false,
      }));
  const result = snapshot
    ? {
        target_id: target.target_id,
        shard: shardNumber - 1,
        checked_urls: attempts.map((attempt) => attempt.seed_url),
        attempts,
        final_url: snapshot.final_url,
        page_title: snapshot.title,
        h1: snapshot.h1,
        headings: snapshot.headings,
        disposition: renderedDisposition(snapshot, identityDecisions),
        identity_decisions: identityDecisions,
        main_text_hash: sha256(snapshot.main_text),
        evidence: extractEvidenceExcerpts(snapshot.main_text),
        relevant_links: relevantLinks(snapshot.links),
      }
    : {
        target_id: target.target_id,
        shard: shardNumber - 1,
        checked_urls: attempts.map((attempt) => attempt.seed_url),
        attempts,
        disposition: 'retry_exhausted',
        identity_decisions: identityDecisions,
        evidence: [],
        relevant_links: [],
      };
  await fs.appendFile(resultPath, `${JSON.stringify(result)}\n`);
  completed.add(target.target_id);
  processed += 1;
  console.log(`[${processed}/${Math.min(limit, input.targets.length)}] ${result.disposition} ${target.normalized_url}`);
}

runBrowse(['stop'], 10000);
console.log(`shard ${shardNumber}: ${completed.size}/${input.targets.length} terminal target results`);
