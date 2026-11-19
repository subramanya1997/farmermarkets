#!/usr/bin/env node
// Drafts descriptive alt text for the editorial market photos (rows whose
// pathname is markets/{id}/editorial-<sha>.webp and whose alt is still the
// "Photo of <market>" template) with a vision model, and writes the drafts to
// a JSON file for review. Nothing is written to the database here; see
// scripts/apply-photo-alts.mjs.
//
// The model runs through the local Claude Code CLI in headless mode (no API
// key in this repo). Each photo is downsized to 800px before it is read.
// Re-running resumes: ids already in --out are skipped.
//
//   node --env-file=.env.local scripts/draft-photo-alts.mjs \
//     --out data/photo-alts/drafts.json --cache /tmp/photo-alts [--limit 30]
//     [--batch 10] [--concurrency 6] [--model sonnet] [--ids id1,id2]
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { neon } from '@neondatabase/serverless';
import sharp from 'sharp';
import { altMarketName, checkAlt, normalizeAlt } from './lib/photo-alt.mjs';

const { values: args } = parseArgs({
  options: {
    out: { type: 'string', default: 'data/photo-alts/drafts.json' },
    cache: { type: 'string', default: path.join(process.env.TMPDIR ?? '/tmp', 'photo-alts') },
    limit: { type: 'string' },
    batch: { type: 'string', default: '10' },
    concurrency: { type: 'string', default: '6' },
    model: { type: 'string', default: 'sonnet' },
    ids: { type: 'string' },
    redo: { type: 'boolean', default: false },
  },
});

const MARKETS_FILE = 'public/data/farmers_markets.json';
const EDITORIAL = 'markets/%/editorial-%';

function marketNames() {
  return fs.readFile(MARKETS_FILE, 'utf8').then((text) => {
    const byId = new Map();
    for (const market of JSON.parse(text)) {
      byId.set(String(market.id), {
        name: market.name,
        city: market.location?.city ?? market.city ?? '',
        state: market.location?.state ?? market.state ?? '',
      });
    }
    return byId;
  });
}

async function loadRows(sql) {
  const rows = await sql.query(
    `SELECT id, market_id, pathname, blob_url, alt
       FROM market_photos
      WHERE status = 'approved' AND pathname LIKE $1 AND alt LIKE 'Photo of %'
      ORDER BY market_id, sort, id`,
    [EDITORIAL],
  );
  return rows;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function cachedImage(row, cacheDir) {
  const file = path.join(cacheDir, `${row.id}.jpg`);
  try {
    await fs.access(file);
    return file;
  } catch {}
  const response = await fetch(row.blob_url);
  if (!response.ok) throw new Error(`${response.status} fetching ${row.blob_url}`);
  const input = Buffer.from(await response.arrayBuffer());
  await sharp(input).rotate().resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(file);
  return file;
}

const PROMPT = (items) => `You are writing image alt text for photos on farmermarkets.app, a directory of farmers markets. The alt text is read by screen readers and by Google Images, so it must say plainly what is in each picture.

Read each image file listed below with the Read tool, look at it carefully, then write one alt for it.

Rules:
- Format: "<market name>, <what the picture shows>". Start with the market name exactly as given, then a comma, then a lowercase description.
- Describe only what is clearly visible: stands, tents, tables, produce, flowers, baked goods, crafts, shoppers, vendors, musicians, signs, the setting (street, parking lot, park, plaza, barn, indoor hall). Mention the two or three things that matter most, not everything.
- Name a fruit or vegetable only when you can clearly tell what it is. Otherwise use a general word like vegetables, fruit, greens, produce or baked goods. Never add food, people or objects you cannot see.
- People: plain neutral words (a vendor, a farmer, shoppers, a family, a child, a musician). Never guess who someone is, their age, ethnicity or job beyond what the scene shows.
- If a sign or banner is readable and names the market or what is sold, you may mention it briefly ("under a banner reading Saturday Market").
- Plain everyday words. No marketing words (vibrant, bustling, charming, delicious, colorful array, abundance). Do not start the description with "a photo of", "an image of" or "a picture of". No en dashes, em dashes, semicolons or exclamation marks. No full stop at the end.
- Aim for 60 to 130 characters in total. Never more than 150.
- If the image is not a photo of a market scene (a flyer, poster, logo, map, illustration, screenshot, a mostly-text graphic, or a photo that shows no market at all), still write an honest alt that says what it is ("a flyer listing summer market hours and the location") and set "kind" accordingly. If it looks AI-generated, set kind "ai_generated".

Images:
${items.map((item) => `- id ${item.id}: file ${item.file}; market name "${item.name}"${item.place ? ` (${item.place})` : ''}`).join('\n')}

Reply with only a JSON array, one object per image, in this shape and nothing else:
[{"id": "<id>", "alt": "<alt text>", "kind": "photo|graphic|logo|map|illustration|ai_generated|unrelated", "confidence": "high|medium|low", "note": "<optional, under 15 words, only if something is uncertain>"}]`;

function runClaude(prompt, cwd, model) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', [
      '-p', prompt,
      '--model', model,
      '--tools', 'Read',
      '--allowedTools', 'Read',
      '--setting-sources', '',
      '--strict-mcp-config',
      '--disable-slash-commands',
      '--no-session-persistence',
      '--output-format', 'json',
    ], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${stderr.slice(0, 500)}`));
      try {
        const envelope = JSON.parse(stdout);
        if (envelope.is_error) return reject(new Error(`claude error: ${String(envelope.result).slice(0, 500)}`));
        const text = String(envelope.result ?? '');
        const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
        resolve({ drafts: JSON.parse(json), cost: envelope.total_cost_usd ?? 0 });
      } catch (error) {
        reject(new Error(`unparseable reply: ${error.message}: ${stdout.slice(0, 500)}`));
      }
    });
  });
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (run with --env-file=.env.local)');
  const sql = neon(process.env.DATABASE_URL);
  const [rows, names] = await Promise.all([loadRows(sql), marketNames()]);
  await fs.mkdir(args.cache, { recursive: true });
  await fs.mkdir(path.dirname(args.out), { recursive: true });

  const existing = await readJson(args.out, { drafts: [] });
  const done = new Map(existing.drafts.map((draft) => [draft.id, draft]));
  const only = args.ids ? new Set(args.ids.split(',')) : null;
  let todo = rows.filter((row) => (only ? only.has(row.id) : args.redo || !done.has(row.id)));
  if (args.limit) todo = todo.slice(0, Number(args.limit));
  console.log(`${rows.length} templated editorial photos, ${done.size} drafted, ${todo.length} to draft`);

  const batchSize = Number(args.batch);
  const batches = [];
  for (let i = 0; i < todo.length; i += batchSize) batches.push(todo.slice(i, i + batchSize));

  let cost = 0;
  let saved = Promise.resolve();
  const save = () => {
    saved = saved.then(() => fs.writeFile(args.out, `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      model: args.model,
      drafts: [...done.values()].sort((a, b) => a.market_id.localeCompare(b.market_id) || a.pathname.localeCompare(b.pathname)),
    }, null, 2)}\n`));
    return saved;
  };

  async function draftBatch(batch, attempt = 1) {
    const items = [];
    for (const row of batch) {
      const market = names.get(row.market_id);
      const name = altMarketName(market?.name ?? row.alt.replace(/^Photo of /, ''));
      const file = await cachedImage(row, args.cache);
      items.push({ row, id: row.id, file: path.basename(file), name, place: [market?.city, market?.state].filter(Boolean).join(', ') });
    }
    try {
      const reply = await runClaude(PROMPT(items), args.cache, args.model);
      cost += reply.cost;
      const byId = new Map(reply.drafts.map((draft) => [draft.id, draft]));
      const missing = [];
      for (const item of items) {
        const draft = byId.get(item.id);
        if (!draft?.alt) { missing.push(item.row); continue; }
        const alt = normalizeAlt(draft.alt);
        done.set(item.id, {
          id: item.id,
          market_id: item.row.market_id,
          pathname: item.row.pathname,
          blob_url: item.row.blob_url,
          market_name: item.name,
          old_alt: item.row.alt,
          alt,
          kind: draft.kind ?? 'photo',
          confidence: draft.confidence ?? 'medium',
          note: draft.note || undefined,
          problems: checkAlt(alt, item.name),
        });
      }
      await save();
      if (missing.length && attempt < 3) await draftBatch(missing, attempt + 1);
    } catch (error) {
      if (attempt >= 3) { console.error(`giving up on ${batch.map((row) => row.id).join(',')}: ${error.message}`); return; }
      console.error(`retrying batch (${error.message.slice(0, 160)})`);
      await draftBatch(batch, attempt + 1);
    }
  }

  let next = 0;
  let finished = 0;
  const workers = Array.from({ length: Math.min(Number(args.concurrency), batches.length) }, async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      await draftBatch(batch);
      finished += 1;
      if (finished % 5 === 0 || finished === batches.length) {
        console.log(`${finished}/${batches.length} batches, ${done.size} drafts, $${cost.toFixed(2)}`);
      }
    }
  });
  await Promise.all(workers);
  await save();
  const flagged = [...done.values()].filter((draft) => draft.problems.length || draft.kind !== 'photo' || draft.confidence === 'low');
  console.log(`done: ${done.size} drafts, ${flagged.length} flagged for review, model cost $${cost.toFixed(2)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
