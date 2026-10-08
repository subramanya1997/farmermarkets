#!/usr/bin/env node
// Enrich sparse market records with the Parallel.ai Task Group API.
//
// Selects markets that lack a website, submits them as a task group, then
// collects per-run structured output (with citations) into a raw JSONL file
// that scripts/parallel-promote.mjs converts into a research batch.
//
//   PARALLEL_API_KEY=... node scripts/parallel-enrich.mjs submit --limit 10 --processor base
//   PARALLEL_API_KEY=... node scripts/parallel-enrich.mjs collect --label <label>
//   submit supports --ids-file <JSON array> --campaign <id> --campaign-budget 50
//   Campaign reservations include ambiguous charges and are never auto-released.
//   node scripts/parallel-enrich.mjs select   # just print candidate counts
//
// Raw output and run-id mappings live under data/enrichment/parallel/<label>/.

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostHog } from 'posthog-node';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const datasetPath = path.join(root, 'public/data/farmers_markets.json');
const workDir = path.join(root, 'data/enrichment/parallel');
const API = 'https://api.parallel.ai';

import { validateSubmitOptions, reserveCampaign, atomicJson, orderedCandidates } from './lib/parallel-campaign.mjs';
import { RICH_TASK_SPEC } from './lib/parallel-rich-spec.mjs';
import { validateTaskSpec } from './lib/parallel-spec-validation.mjs';
import { authoritative } from './lib/parallel-evidence.mjs';

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
          'Cite authoritative published evidence with excerpts naming this market AND its city/locality. Never infer operating status from a stale directory alone. Whether this exact farmers market (matching name and city/locality) still operates. Use could_not_verify when you cannot confidently match the market identity.',
      },
      official_website: {
        type: 'string',
        description:
          "Official website URL for this specific market: the market's own site, its operating organization's market page, or a municipal page about it. NOT Google Maps, Yelp, directories, or social media. Empty string if none found.",
      },
      phone: {
        type: 'string',
        description:
          'Public contact phone number for the market or its manager, as published. Include the number itself in a citation excerpt from the official website. Empty string if none found.',
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
          'Citations MUST include verbatim excerpts showing the specific day and hours, not just a homepage heading. Current published operating days and hours, verbatim where possible, e.g. "Saturdays 8:00 AM - 1:00 PM". Include distinct entries separated by semicolons. Empty string if not found.',
      },
      season: {
        type: 'string',
        description:
          'Include the published season in citation excerpts from the official website. Operating season as published, e.g. "June through October" or "Year-round". Empty string if not found.',
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

const posthogToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim();
if (process.env.NODE_ENV === 'development' && !posthogToken) {
  console.error('NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured');
}
if (process.env.NODE_ENV === 'development' && !posthogHost) {
  console.error('NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured');
}
const posthog = posthogToken && posthogHost
  ? new PostHog(posthogToken, { host: posthogHost, flushAt: 1, flushInterval: 0, privacyMode: false })
  : null;

function aiIdentifier(prefix, value) {
  return `${prefix}-${createHash('sha256').update(String(value)).digest('hex')}`;
}

function captureParallelTaskGeneration(meta, runId, result, market) {
  if (!posthog) return;

  const sessionId = aiIdentifier('parallel-task-group', meta.groupId);
  const output = result.output?.content;
  try {
    posthog.capture({
      distinctId: sessionId,
      event: '$ai_generation',
      properties: {
        $insert_id: aiIdentifier('parallel-task-result', runId),
        $process_person_profile: false,
        $ai_trace_id: aiIdentifier('parallel-task-run', runId),
        $ai_session_id: sessionId,
        $ai_span_name: 'parallel_task_run',
        $ai_model: meta.processor,
        $ai_provider: 'parallel',
        $ai_input: [{ role: 'user', content: JSON.stringify({ purpose: meta.purpose, market }) }],
        ...(output === null || output === undefined
          ? {}
          : { $ai_output_choices: [{ role: 'assistant', content: typeof output === 'string' ? output : JSON.stringify(output) }] }),
        $ai_is_error: result.run?.status !== 'completed',
      },
    });
  } catch (error) {
    console.error('PostHog AI generation capture failed', error);
  }
}

async function flushPostHogAiObservability() {
  if (!posthog) return;
  try {
    await posthog.flush();
  } catch (error) {
    console.error('PostHog AI observability flush failed', error);
  }
}

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
  const rich = arg('purpose', 'identity') === 'richshowcase';
  const excluded = new Set();
  for (const name of (await fs.readdir(path.join(root, 'data/enrichment'))).filter(n => /^research-.+\.json$/.test(n))) {
    if (!rich) for (const record of JSON.parse(await fs.readFile(path.join(root, 'data/enrichment', name), 'utf8'))) excluded.add(String(record.id));
  }
  const idsFile = arg('ids-file');
  let ids;
  if (idsFile) {
    const manifest = JSON.parse(await fs.readFile(path.resolve(idsFile), 'utf8'));
    ids = Array.isArray(manifest) ? manifest : manifest.ids;
    if (ids === undefined) throw new Error('IDs file must contain an array or { ids: [...] }');
  }
  const eligible = rich ? markets.filter(m => ['US','CA'].includes(m.country_code) && m.contact?.websites?.some(authoritative)) : markets;
  if (rich && ids === undefined) return eligible.filter(m=>m.name && m.location?.city);
  return orderedCandidates(eligible, excluded, ids);
}

function toInput(m) {
  return {
    market_name: m.name,
    address: m.location?.address || '',
    city: m.location?.city || '',
    state: m.location?.state || '',
    zip_code: m.location?.zip_code || '',
    country: m.country || 'United States',
    ...(arg('purpose','identity') === 'richshowcase' ? {official_website:m.contact.websites.find(authoritative),research_date:arg('research-date','2026-09-30')} : {}),
  };
}

async function submit() {
  const processor = arg('processor', 'base');
  const limit = Number(arg('limit', '0'));
  const offset = Number(arg('offset', '0'));
  const maxCost = Number(arg('max-cost', '50'));
  const budget = Number(arg('campaign-budget', '50'));
  const label = arg('label', `${processor}-${limit}`);
  const campaign = arg('campaign', '2026-09-30');
  const purpose = arg('purpose', 'identity');
  validateSubmitOptions({ processor, limit, offset, maxCost, budget, label, campaign, purpose });
  validateTaskSpec(purpose === 'richshowcase' ? RICH_TASK_SPEC : TASK_SPEC);
  const researchDate = arg('research-date', '2026-09-30');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(researchDate) || new Date(researchDate).toISOString().slice(0,10) !== researchDate) throw new Error('Invalid research date');
  apiKey(); // Fail before creating a reservation when credentials are unavailable.
  const candidates = (await loadCandidates()).slice(offset, offset + limit);
  if (!candidates.length) throw new Error('No eligible markets selected');
  const dir = path.join(workDir, label);
  await fs.mkdir(workDir, { recursive: true });
  const ledgerPath = path.join(workDir, `campaign-${campaign}.json`);
  const lock = `${ledgerPath}.lock`;
  try { await fs.mkdir(lock); } catch (e) {
    if (e.code === 'EEXIST') throw new Error('Campaign locked by another submit or interrupted request; reconcile it before any retry');
    throw e;
  }
  let ledger, reservation;
  try {
    try { await fs.access(dir); throw new Error('Label directory already exists; never resubmit it'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    try { ledger = JSON.parse(await fs.readFile(ledgerPath, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; ledger = { version: 1, campaign, budget_mills: Math.floor(budget * 1000), reservations: [] }; }
    if (ledger.version !== 1 || ledger.campaign !== campaign || !Number.isSafeInteger(ledger.budget_mills) || ledger.budget_mills <= 0 || ledger.budget_mills > 50000 || !Array.isArray(ledger.reservations)) throw new Error('Invalid campaign ledger');
    reservation = reserveCampaign(ledger, { label, purpose, processor, ids: candidates.map(m => m.id), budget, maxCost, now: new Date().toISOString() });
    await atomicJson(ledgerPath, ledger); // Reserve ALL potential spend before the first API request.
    await fs.mkdir(dir);
    const meta = { groupId: null, processor, purpose, research_date: researchDate, campaign, reserved_cost: reservation.cost_mills / 1000, submitted_at: reservation.reserved_at, runMap: {}, batches: [], state: 'creating_group' };
    await atomicJson(path.join(dir, 'group.json'), meta);
    console.log(`Reserved ${candidates.length} markets on "${processor}" ($${(reservation.cost_mills / 1000).toFixed(3)})`);
    const group = await api('POST', '/v1/tasks/groups', {});
    if (typeof group.taskgroup_id !== 'string' || !group.taskgroup_id) throw new Error('Ambiguous group response');
    meta.groupId = group.taskgroup_id;
    reservation.group_id = meta.groupId;
    await atomicJson(path.join(dir, 'group.json'), meta);
    await atomicJson(ledgerPath, ledger);
    for (let i = 0; i < candidates.length; i += 500) {
      const batch = candidates.slice(i, i + 500);
      const attempt = { market_ids: batch.map(m => String(m.id)), state: 'request_pending', started_at: new Date().toISOString() };
      meta.batches.push(attempt);
      meta.state = 'submitting';
      reservation.state = 'submitting';
      await atomicJson(path.join(dir, 'group.json'), meta);
      await atomicJson(ledgerPath, ledger);
      const res = await api('POST', `/v1/tasks/groups/${meta.groupId}/runs`, {
        default_task_spec: purpose === 'richshowcase' ? RICH_TASK_SPEC : TASK_SPEC,
        inputs: batch.map(m => ({ input: toInput(m), processor })), refresh_status: false,
      });
      if (!Array.isArray(res.run_ids) || res.run_ids.length !== batch.length || res.run_ids.some(id => typeof id !== 'string' || !id) || new Set(res.run_ids).size !== res.run_ids.length) throw new Error('Ambiguous run IDs response; reservation retained, do not retry');
      res.run_ids.forEach((runId, j) => { meta.runMap[runId] = { id: batch[j].id, name: batch[j].name, slug: batch[j].slug, ...(purpose === 'richshowcase' ? {official_website:toInput(batch[j]).official_website} : {}) }; });
      attempt.state = 'submitted'; attempt.run_ids = res.run_ids;
      reservation.run_ids.push(...res.run_ids);
      await atomicJson(path.join(dir, 'group.json'), meta);
      await atomicJson(ledgerPath, ledger);
      console.log(`  queued ${i + batch.length}/${candidates.length}`);
    }
    meta.state = 'submitted'; reservation.state = 'submitted';
    await atomicJson(path.join(dir, 'group.json'), meta);
    await atomicJson(ledgerPath, ledger);
    console.log(`Group ${meta.groupId} saved to ${path.relative(root, dir)}/group.json`);
    console.log(`Collect with: node scripts/parallel-enrich.mjs collect --label ${label}`);
  } catch (e) {
    if (reservation) {
      reservation.state = 'needs_reconciliation';
      await atomicJson(ledgerPath, ledger);
      console.error('Reservation retained. A request may have been charged; inspect group.json and Parallel before any retry.');
    }
    throw e;
  } finally { await fs.rmdir(lock); }
}

async function collect() {
  const label = arg('label');
  if (!label) throw new Error('--label is required for collect');
  const dir = path.join(workDir, label);
  const meta = JSON.parse(await fs.readFile(path.join(dir, 'group.json'), 'utf8'));
  const { groupId, runMap } = meta;
  if (!groupId || (meta.state && meta.state !== 'submitted')) throw new Error('Group submission is incomplete or ambiguous; reconcile paid requests before collecting a purported complete batch');

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
        captureParallelTaskGeneration(meta, runId, result, record.market);
      } catch (err) {
        record = { market: runMap[runId], run_id: runId, status: 'fetch_error', error: String(err) };
      }
      lines.push(JSON.stringify(record));
      done += 1;
      if (done % 100 === 0) console.log(`  fetched ${done}/${runIds.length}`);
    }
  });
  await Promise.all(workers);
  await flushPostHogAiObservability();
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
