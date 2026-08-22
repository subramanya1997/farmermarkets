#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { detailPageRecord, selectDetailLinks } from './lib/website-detail-audit.mjs';

const root = process.cwd();
const shardArgument = process.argv.find((argument) => argument.startsWith('--shard='));
const limitArgument = process.argv.find((argument) => argument.startsWith('--limit='));
if (!shardArgument) throw new Error('Pass a one-based --shard=N');
const shardNumber = Number(shardArgument.split('=')[1]);
const limit = limitArgument ? Number(limitArgument.split('=')[1]) : Number.POSITIVE_INFINITY;
if (!Number.isInteger(shardNumber) || shardNumber < 1 || shardNumber > 16) throw new Error('--shard must be between 1 and 16');
if (!(limit > 0)) throw new Error('--limit must be positive');

const auditDir = path.join(root, 'data/enrichment/site-audit/v1');
const inputPath = path.join(auditDir, 'shards', `shard-${String(shardNumber).padStart(2, '0')}-input.json`);
const initialPath = path.join(auditDir, 'results', `shard-${String(shardNumber).padStart(2, '0')}-results.jsonl`);
const detailDir = path.join(auditDir, 'details');
const detailPath = path.join(detailDir, `shard-${String(shardNumber).padStart(2, '0')}-details.jsonl`);
const browseBinary = path.join(process.env.HOME, '.claude/skills/gstack/browse/dist/browse');
const browserEnvironment = {
  ...process.env,
  BROWSE_STATE_FILE: `/tmp/farmermarkets-site-detail-${shardNumber}.json`,
  CHROMIUM_PROFILE: `/tmp/farmermarkets-site-detail-${shardNumber}-profile`,
};
const SNAPSHOT_SCRIPT = `JSON.stringify((()=>{const root=document.querySelector('main,article,[role="main"]')||document.body;const clean=s=>(s||'').replace(/\\s+/g,' ').trim();return{final_url:location.href,title:document.title,h1:[...document.querySelectorAll('h1')].map(e=>clean(e.innerText)).filter(Boolean).slice(0,12),main_text:(root.innerText||'').slice(0,100000),links:[...document.querySelectorAll('a[href]')].map(a=>({text:clean(a.innerText||a.textContent),href:a.href})).filter(x=>x.href).slice(0,800)}})())`;

function runBrowse(arguments_, timeout = 45000) {
  const result = spawnSync(browseBinary, arguments_, {
    cwd: root,
    env: browserEnvironment,
    encoding: 'utf8',
    timeout,
    maxBuffer: 4 * 1024 * 1024,
  });
  return { ok: result.status === 0 && !result.error, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error?.message };
}

function parseSnapshot(stdout) {
  for (const line of stdout.trim().split('\n').reverse()) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed.final_url === 'string') return parsed;
    } catch {
      // Browse can print daemon startup information before the JSON payload.
    }
  }
  throw new Error('browse js did not return a snapshot object');
}

function browseSnapshot(url) {
  const navigation = runBrowse(['goto', url]);
  if (!navigation.ok) return { error: navigation.error || navigation.stderr.trim().slice(0, 500) || 'navigation failed' };
  const js = runBrowse(['js', SNAPSHOT_SCRIPT]);
  if (!js.ok) return { error: js.error || js.stderr.trim().slice(0, 500) || 'snapshot failed' };
  try {
    return { snapshot: parseSnapshot(js.stdout) };
  } catch (error) {
    return { error: error.message };
  }
}

async function readJsonl(filePath) {
  const contents = await fs.readFile(filePath, 'utf8');
  return contents.trim().split('\n').filter(Boolean).map(JSON.parse);
}

await fs.access(browseBinary);
await fs.mkdir(detailDir, { recursive: true });
const [input, initial] = await Promise.all([
  fs.readFile(inputPath, 'utf8').then(JSON.parse),
  readJsonl(initialPath),
]);
const targetById = new Map(input.targets.map((target) => [target.target_id, target]));
let completed = new Set();
try {
  completed = new Set((await readJsonl(detailPath)).map((result) => result.target_id));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const eligible = initial.filter((result) => result.disposition === 'rendered_identity_matched' && result.identity_decisions.some((decision) => decision.identity_match));
let processed = 0;
for (const initialResult of eligible) {
  if (completed.has(initialResult.target_id) || processed >= limit) continue;
  const target = targetById.get(initialResult.target_id);
  const matched_row_keys = initialResult.identity_decisions.filter((decision) => decision.identity_match).map((decision) => decision.row_key);
  const base = browseSnapshot(initialResult.final_url ?? target.seed_urls[0]);
  const pages = [];
  const errors = [];
  if (base.snapshot) {
    pages.push(detailPageRecord(base.snapshot));
    const links = selectDetailLinks(base.snapshot.links, base.snapshot.final_url, 2);
    for (const link of links) {
      const detail = browseSnapshot(link.href);
      if (detail.snapshot) pages.push(detailPageRecord(detail.snapshot));
      else errors.push({ url: link.href, error: detail.error });
    }
  } else {
    errors.push({ url: initialResult.final_url ?? target.seed_urls[0], error: base.error });
  }
  const result = {
    target_id: initialResult.target_id,
    shard: shardNumber - 1,
    matched_row_keys,
    disposition: pages.length ? 'detail_audited' : 'detail_retry_exhausted',
    pages,
    errors,
  };
  await fs.appendFile(detailPath, `${JSON.stringify(result)}\n`);
  completed.add(initialResult.target_id);
  processed += 1;
  console.log(`[${processed}/${Math.min(limit, eligible.length)}] ${result.disposition} ${target.normalized_url}`);
}

runBrowse(['stop'], 10000);
console.log(`detail shard ${shardNumber}: ${completed.size}/${eligible.length} terminal matched targets`);
