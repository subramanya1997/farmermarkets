#!/usr/bin/env node
// Writes reviewed alt text (from scripts/draft-photo-alts.mjs) to
// market_photos.alt. Only `alt` changes, only on approved editorial rows, and
// only where the row still has the alt the draft replaces, so an organizer or
// operator edit made after drafting is never overwritten.
//
// Dry run by default: the update runs inside a transaction that is rolled
// back, so the counts are real. Pass --apply to commit.
//
//   node --env-file=.env.local scripts/apply-photo-alts.mjs --in data/photo-alts/drafts.json [--apply]
//
// Corrections to already-written alts use the same script: a file whose
// old_alt is the alt now live (see data/photo-alts/fixes-*.json).
//
// Drafts with "skip": true, or listed in --exclude (comma separated ids), are left alone.
import fs from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { Client } from '@neondatabase/serverless';
import { checkAlt } from './lib/photo-alt.mjs';

const { values: args } = parseArgs({
  options: {
    in: { type: 'string', default: 'data/photo-alts/drafts.json' },
    apply: { type: 'boolean', default: false },
    exclude: { type: 'string', default: '' },
  },
});

const BLOCKING = new Set(['empty', 'market-name', 'dash', 'too-long']);

function databaseLabel(url) {
  const { hostname, pathname } = new URL(url);
  return `${hostname.split('.')[0]}${pathname}`;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (run with --env-file=.env.local)');
  const { drafts } = JSON.parse(await fs.readFile(args.in, 'utf8'));
  const excluded = new Set(args.exclude.split(',').filter(Boolean));
  const staged = [];
  const blocked = [];
  for (const draft of drafts) {
    if (draft.skip || excluded.has(draft.id)) continue;
    // A correction may put an off-topic photo back on its import template.
    const revert = draft.template === true && /^Photo of \S/.test(draft.alt);
    const problems = revert ? [] : checkAlt(draft.alt, draft.market_name).filter((problem) => BLOCKING.has(problem));
    if (problems.length) blocked.push({ id: draft.id, alt: draft.alt, problems });
    else staged.push({ id: draft.id, alt: draft.alt, old_alt: draft.old_alt });
  }
  if (blocked.length) {
    console.error(`${blocked.length} drafts break the alt rules; fix or skip them first:`);
    for (const item of blocked.slice(0, 20)) console.error(`  ${item.id} [${item.problems.join(', ')}] ${item.alt}`);
    process.exit(1);
  }
  if (new Set(staged.map((row) => row.id)).size !== staged.length) throw new Error('Duplicate ids in drafts');
  console.log(`${args.apply ? 'APPLY' : 'DRY RUN'} against ${databaseLabel(process.env.DATABASE_URL)}: ${staged.length} drafts staged, ${drafts.length - staged.length} skipped`);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query("SET LOCAL statement_timeout = '120s'");
    await client.query('CREATE TEMP TABLE staged_alts (id uuid PRIMARY KEY, alt text NOT NULL, old_alt text NOT NULL) ON COMMIT DROP');
    for (let i = 0; i < staged.length; i += 500) {
      await client.query(
        'INSERT INTO staged_alts (id, alt, old_alt) SELECT id, alt, old_alt FROM jsonb_to_recordset($1::jsonb) AS rows(id uuid, alt text, old_alt text)',
        [JSON.stringify(staged.slice(i, i + 500))],
      );
    }
    const { rows: [before] } = await client.query(`SELECT
        count(*)::int AS staged,
        count(p.id)::int AS found,
        count(p.id) FILTER (WHERE p.alt IS NOT DISTINCT FROM s.old_alt AND p.status = 'approved' AND p.pathname LIKE 'markets/%/editorial-%')::int AS eligible,
        count(p.id) FILTER (WHERE p.alt = s.alt)::int AS already
      FROM staged_alts s LEFT JOIN market_photos p ON p.id = s.id`);
    const { rows: updated } = await client.query(`UPDATE market_photos AS p
         SET alt = s.alt
        FROM staged_alts AS s
       WHERE p.id = s.id
         AND p.alt IS NOT DISTINCT FROM s.old_alt
         AND p.status = 'approved'
         AND p.pathname LIKE 'markets/%/editorial-%'
      RETURNING p.id, p.market_id, p.alt`);
    if (updated.length !== before.eligible) throw new Error(`Updated ${updated.length} rows but ${before.eligible} were eligible`);
    console.log(`staged ${before.staged}, found ${before.found}, still on the drafted alt ${before.eligible}, updated ${updated.length}`);
    if (before.found !== before.staged) console.log(`${before.staged - before.found} drafted rows no longer exist (left alone)`);
    if (before.already) console.log(`${before.already} rows already have the drafted alt`);
    const changed = before.found - before.eligible - before.already;
    if (changed) console.log(`${changed} rows edited or no longer approved since drafting (left alone)`);
    for (const row of updated.slice(0, 5)) console.log(`  ${row.market_id} ${row.alt}`);
    if (args.apply) {
      await client.query('COMMIT');
      console.log(`committed: ${updated.length} rows changed`);
    } else {
      await client.query('ROLLBACK');
      console.log('rolled back (dry run); pass --apply to commit');
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
