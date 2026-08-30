#!/usr/bin/env node
// Enrich sparse market records with the Parallel.ai Task Group API.
//
// Selects markets that lack a website, submits them as a task group, then
// collects per-run structured output (with citations) into a raw JSONL file
// that scripts/parallel-promote.mjs converts into a research batch.
//
//   PARALLEL_API_KEY=... node scripts/parallel-enrich.mjs submit --limit 10 --processor base
//   PARALLEL_API_KEY=... node scripts/parallel-enrich.mjs collect --group <dir-or-id>
//   node scripts/parallel-enrich.mjs select   # just print candidate counts
//
// Raw output and run-id mappings live under data/enrichment/parallel/<label>/.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const datasetPath = path.join(root, 'public/data/farmers_markets.json');
const workDir = path.join(root, 'data/enrichment/parallel');
const API = 'https://api.parallel.ai';

const COST_PER_RUN = { lite: 0.005, base: 0.01, core: 0.025, pro: 0.1 };

const OUTPUT_SCHEMA = {
  type: 'json',
  json_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      status: {
        type: 'string',
        enum: ['operating', 'permanently_closed', 'could_not_verify'],
        description:
          'Whether this exact farmers market (matching name and city/locality) still operates. Use could_not_verify when you cannot confidently match the market identity.',
      },
      official_website: {
        type: 'string',
        description:
          "Official website URL for this specific market: the market's own site, its operating organization's market page, or a municipal page about it. NOT Google Maps, Yelp, directories, or social media. Empty string if none found.",
      },
      phone: {
        type: 'string',
        description:
          'Public contact phone number for the market or its manager, as published. Empty string if none found.',
      },
      facebook_url: {
        type: 'string',
        description:
          "Full URL of the market's own Facebook page. Empty string if none found.",
      },
      instagram_url: {
        type: 'string',
        description:
          "Full URL of the market's own Instagram profile. Empty string if none found.",
      },
      schedule: {
        type: 'string',
        description:
          'Current published operating days and hours, verbatim where possible, e.g. "Saturdays 8:00 AM - 1:00 PM". Include distinct entries separated by semicolons. Empty string if not found.',
      },
      season: {
        type: 'string',
        description:
          'Operating season as published, e.g. "June through October" or "Year-round". Empty string if not found.',
      },
    },
    required: [
      'status',
      'official_website',
      'phone',
      'facebook_url',
      'instagram_url',
      'schedule',
      'season',
    ],
  },
};

const INPUT_SCHEMA = {
  type: 'json',
  json_schema: {
    type: 'object',
    properties: {
      market_name: { type: 'string', description: 'Name of the farmers market to research' },
      address: { type: 'string', description: 'Street address of the market' },
      city: { type: 'string' },
      state: { type: 'string' },
      zip_code: { type: 'string' },
      country: { type: 'string' },
    },
    required: ['market_name', 'city', 'state', 'country'],
  },
};

const TASK_SPEC = { input_schema: INPUT_SCHEMA, output_schema: OUTPUT_SCHEMA };

function apiKey() {
  const key = process.env.PARALLEL_API_KEY;
  if (!key) {
    console.error('PARALLEL_API_KEY is not set');
    process.exit(1);
  }
  return key;
}

async function api(method, pathname, body) {
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: { 'x-api-key': apiKey(), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${method} ${pathname} -> ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

async function loadCandidates() {
  const markets = JSON.parse(await fs.readFile(datasetPath, 'utf8'));
  const missing = (m) => ({
    website: !(m.contact?.websites || []).length,
    phone: !(m.contact?.phone_numbers || []).length,
    social: !(m.contact?.social_media || []).length,
    days: !(m.operations?.days || []).length,
  });
  const candidates = markets
    .filter((m) => missing(m).website && m.name && m.location?.city)
    .map((m) => {
      const gaps = missing(m);
      const gapCount = Object.values(gaps).filter(Boolean).length;
      return { m, gapCount };
    })
    // US first (best web coverage), then the most information-starved records.
    .sort(
      (a, b) =>
        (b.m.country_code === 'US') - (a.m.country_code === 'US') || b.gapCount - a.gapCount,
    )
    .map(({ m }) => m);
  return candidates;
}

function toInput(m) {
  return {
    market_name: m.name,
    address: m.location?.address || '',
    city: m.location?.city || '',
    state: m.location?.state || '',
    zip_code: m.location?.zip_code || '',
    country: m.country || 'United States',
  };
}

async function submit() {
  const processor = arg('processor', 'base');
  const limit = Number(arg('limit', '0'));
  const offset = Number(arg('offset', '0'));
  const maxCost = Number(arg('max-cost', '50'));
  const label = arg('label', `${processor}-${limit}`);
  if (!limit) throw new Error('--limit is required for submit');

  const candidates = (await loadCandidates()).slice(offset, offset + limit);
  const cost = candidates.length * (COST_PER_RUN[processor] ?? 0.1);
  if (cost > maxCost) {
    throw new Error(`Estimated cost $${cost.toFixed(2)} exceeds --max-cost ${maxCost}`);
  }
  console.log(`Submitting ${candidates.length} markets on "${processor}" (~$${cost.toFixed(2)})`);

  const group = await api('POST', '/v1/tasks/groups', {});
  const groupId = group.taskgroup_id;
  const runMap = {};
  for (let i = 0; i < candidates.length; i += 500) {
    const batch = candidates.slice(i, i + 500);
    const res = await api('POST', `/v1/tasks/groups/${groupId}/runs`, {
      default_task_spec: TASK_SPEC,
      inputs: batch.map((m) => ({ input: toInput(m), processor })),
      refresh_status: false,
    });
    res.run_ids.forEach((runId, j) => {
      runMap[runId] = { id: batch[j].id, name: batch[j].name, slug: batch[j].slug };
    });
    console.log(`  queued ${i + batch.length}/${candidates.length}`);
  }

  const dir = path.join(workDir, label);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, 'group.json'),
    JSON.stringify({ groupId, processor, submitted_at: new Date().toISOString(), runMap }, null, 2),
  );
  console.log(`Group ${groupId} saved to ${path.relative(root, dir)}/group.json`);
  console.log(`Collect with: node scripts/parallel-enrich.mjs collect --label ${label}`);
}

async function collect() {
  const label = arg('label');
  if (!label) throw new Error('--label is required for collect');
  const dir = path.join(workDir, label);
  const meta = JSON.parse(await fs.readFile(path.join(dir, 'group.json'), 'utf8'));
  const { groupId, runMap } = meta;

  for (;;) {
    const group = await api('GET', `/v1/tasks/groups/${groupId}`);
    const counts = group.status?.task_run_status_counts || {};
    console.log(`status: ${JSON.stringify(counts)}`);
    if (!group.status?.is_active) break;
    await new Promise((r) => setTimeout(r, 20000));
  }

  const outPath = path.join(dir, 'results.jsonl');
  const lines = [];
  const runIds = Object.keys(runMap);
  let done = 0;
  const queue = [...runIds];
  const workers = Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const runId = queue.shift();
      let record;
      try {
        const result = await api('GET', `/v1/tasks/runs/${runId}/result`);
        record = {
          market: runMap[runId],
          run_id: runId,
          status: result.run?.status,
          output: result.output?.content ?? null,
          basis: result.output?.basis ?? null,
        };
      } catch (err) {
        record = { market: runMap[runId], run_id: runId, status: 'fetch_error', error: String(err) };
      }
      lines.push(JSON.stringify(record));
      done += 1;
      if (done % 100 === 0) console.log(`  fetched ${done}/${runIds.length}`);
    }
  });
  await Promise.all(workers);
  await fs.writeFile(outPath, lines.join('\n') + '\n');
  console.log(`Wrote ${lines.length} results to ${path.relative(root, outPath)}`);
}

async function select() {
  const candidates = await loadCandidates();
  console.log(`candidates missing website: ${candidates.length}`);
  console.log('first 10:', candidates.slice(0, 10).map((m) => `${m.id} ${m.name} (${m.location.city}, ${m.location.state})`));
}

const cmd = process.argv[2];
if (cmd === 'submit') await submit();
else if (cmd === 'collect') await collect();
else if (cmd === 'select') await select();
else {
  console.error('usage: parallel-enrich.mjs <select|submit|collect> [options]');
  process.exit(1);
}
