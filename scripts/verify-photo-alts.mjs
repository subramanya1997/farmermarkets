#!/usr/bin/env node
// Checks each drafted alt in data/photo-alts/drafts.json against its own
// photo. Drafting sends several photos per model call, and the model can swap
// two descriptions inside a batch; this pass catches that. Mismatches found in
// a batch should be rechecked with --batch 1, where a swap cannot happen.
//
//   node scripts/verify-photo-alts.mjs --cache /tmp/photo-alts [--batch 5] [--concurrency 12]
//   node scripts/verify-photo-alts.mjs --cache /tmp/photo-alts --batch 1 --recheck
//
// Results go to data/photo-alts/verify.json (resumable). With --recheck, only
// ids whose last verdict was not "match" are checked again.
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { cachedImage, runClaude } from './lib/photo-alt-model.mjs';
import { checkAlt, normalizeAlt } from './lib/photo-alt.mjs';

const { values: args } = parseArgs({
  options: {
    drafts: { type: 'string', default: 'data/photo-alts/drafts.json' },
    out: { type: 'string', default: 'data/photo-alts/verify.json' },
    cache: { type: 'string', default: path.join(process.env.TMPDIR ?? '/tmp', 'photo-alts') },
    batch: { type: 'string', default: '5' },
    concurrency: { type: 'string', default: '12' },
    model: { type: 'string', default: 'sonnet' },
    recheck: { type: 'boolean', default: false },
    limit: { type: 'string' },
  },
});

const PROMPT = (items) => `You are checking image alt text for photos on farmermarkets.app, a directory of farmers markets.

Work through the images below strictly one at a time: Read image 1 with the Read tool, compare it with alt 1 and decide; then Read image 2 and compare it with alt 2; and so on. Never compare an alt with any image except the one listed on the same line.

Verdict for each:
- "match": the alt describes this image. Small omissions or slightly loose wording are fine.
- "mismatch": the alt describes something that is not in this image (a different scene, subject, setting, people or main items), or it reads like a description of a different photo.
- "unsure": you cannot tell.

For a mismatch, also write a corrected alt in this style: "<market name>, <what the picture shows>", starting with the market name exactly as given, lowercase description, plain words, only what is clearly visible, 60 to 130 characters, no dashes, semicolons, exclamation marks or final full stop, no "photo of".

Images:
${items.map((item, index) => `${index + 1}. id ${item.id}: file ${item.file}; market name "${item.market_name}"; alt "${item.alt}"`).join('\n')}

Reply with only a JSON array, one object per image, and nothing else:
[{"id": "<id>", "verdict": "match|mismatch|unsure", "reason": "<under 15 words>", "corrected_alt": "<only for a mismatch>"}]`;

async function main() {
  const { drafts } = JSON.parse(await fs.readFile(args.drafts, 'utf8'));
  let results;
  try {
    results = JSON.parse(await fs.readFile(args.out, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    results = { checks: {} };
  }
  const live = drafts.filter((draft) => !draft.skip);
  let todo = args.recheck
    ? live.filter((draft) => results.checks[draft.id] && results.checks[draft.id].verdict !== 'match')
    : live.filter((draft) => !results.checks[draft.id]);
  if (args.limit) todo = todo.slice(0, Number(args.limit));
  console.log(`${live.length} published drafts, ${Object.keys(results.checks).length} checked, ${todo.length} to check (batch ${args.batch})`);

  const batchSize = Number(args.batch);
  const batches = [];
  for (let i = 0; i < todo.length; i += batchSize) batches.push(todo.slice(i, i + batchSize));

  let cost = 0;
  let saved = Promise.resolve();
  const save = () => {
    saved = saved.then(() => fs.writeFile(args.out, `${JSON.stringify({ checkedAt: new Date().toISOString(), model: args.model, checks: results.checks }, null, 2)}\n`));
    return saved;
  };

  async function checkBatch(batch, attempt = 1) {
    const items = [];
    for (const draft of batch) items.push({ ...draft, file: path.basename(await cachedImage(draft, args.cache)) });
    try {
      const reply = await runClaude(PROMPT(items), args.cache, args.model);
      cost += reply.cost;
      const byId = new Map(reply.drafts.map((check) => [check.id, check]));
      const missing = [];
      for (const item of items) {
        const check = byId.get(item.id);
        if (!check?.verdict) { missing.push(item); continue; }
        const corrected = check.corrected_alt ? normalizeAlt(check.corrected_alt) : undefined;
        const history = results.checks[item.id]?.history ?? [];
        if (results.checks[item.id]) history.push({ verdict: results.checks[item.id].verdict, batch: results.checks[item.id].batch });
        results.checks[item.id] = {
          verdict: check.verdict,
          reason: check.reason,
          corrected_alt: corrected,
          corrected_problems: corrected ? checkAlt(corrected, item.market_name) : undefined,
          batch: batchSize,
          history: history.length ? history : undefined,
        };
      }
      await save();
      if (missing.length && attempt < 3) await checkBatch(missing, attempt + 1);
    } catch (error) {
      if (attempt >= 3) { console.error(`giving up on ${batch.map((draft) => draft.id).join(',')}: ${error.message}`); return; }
      await checkBatch(batch, attempt + 1);
    }
  }

  let next = 0;
  let finished = 0;
  await Promise.all(Array.from({ length: Math.min(Number(args.concurrency), batches.length) }, async () => {
    while (next < batches.length) {
      await checkBatch(batches[next++]);
      finished += 1;
      if (finished % 20 === 0 || finished === batches.length) console.log(`${finished}/${batches.length} batches, $${cost.toFixed(2)}`);
    }
  }));
  await save();
  const counts = {};
  for (const draft of live) {
    const verdict = results.checks[draft.id]?.verdict ?? 'unchecked';
    counts[verdict] = (counts[verdict] ?? 0) + 1;
  }
  console.log(`done, model cost $${cost.toFixed(2)}:`, counts);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
