#!/usr/bin/env node
// Sync the canonical dataset and enrichment provenance into Neon Postgres.
//
//   npm run db:sync
//
// The file pipeline stays the source of truth: this replaces the `markets`
// and `market_facts` tables with the current contents of
// public/data/farmers_markets.json and data/enrichment/research-*.json.
// The `submissions` table is never touched.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set (run via: npm run db:sync)');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

const allRows = JSON.parse(await fs.readFile(path.join(root, 'public/data/farmers_markets.json'), 'utf8'));
// The canonical file contains a couple of duplicate-id rows (e.g. Baxter
// Market); keep the first occurrence since id is the primary key here.
const seen = new Set();
const markets = allRows.filter((m) => !seen.has(String(m.id)) && seen.add(String(m.id)));
if (markets.length !== allRows.length) {
  console.log(`note: skipped ${allRows.length - markets.length} duplicate-id rows`);
}

console.log(`Syncing ${markets.length} markets...`);
for (let i = 0; i < markets.length; i += 200) {
  const chunk = markets.slice(i, i + 200);
  const rows = chunk.map((m) => [
    String(m.id),
    m.slug,
    m.name,
    m.location?.city ?? null,
    m.location?.state ?? null,
    m.country ?? null,
    m.country_code ?? null,
    m.location?.coordinates?.latitude ?? null,
    m.location?.coordinates?.longitude ?? null,
    JSON.stringify(m),
  ]);
  await sql`
    INSERT INTO markets (id, slug, name, city, state, country, country_code, latitude, longitude, record)
    SELECT id, slug, name, city, state, country, country_code, latitude, longitude, record::jsonb
    FROM unnest(
      ${rows.map((r) => r[0])}::text[], ${rows.map((r) => r[1])}::text[], ${rows.map((r) => r[2])}::text[],
      ${rows.map((r) => r[3])}::text[], ${rows.map((r) => r[4])}::text[], ${rows.map((r) => r[5])}::text[],
      ${rows.map((r) => r[6])}::text[], ${rows.map((r) => r[7])}::double precision[], ${rows.map((r) => r[8])}::double precision[],
      ${rows.map((r) => r[9])}::text[]
    ) AS t(id, slug, name, city, state, country, country_code, latitude, longitude, record)
    ON CONFLICT (id) DO UPDATE SET
      slug = EXCLUDED.slug, name = EXCLUDED.name, city = EXCLUDED.city, state = EXCLUDED.state,
      country = EXCLUDED.country, country_code = EXCLUDED.country_code,
      latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
      record = EXCLUDED.record, synced_at = now()
  `;
  if ((i / 200) % 10 === 0) console.log(`  ${Math.min(i + 200, markets.length)}/${markets.length}`);
}

// Remove markets that no longer exist in the canonical file.
const ids = markets.map((m) => String(m.id));
await sql`DELETE FROM markets WHERE NOT (id = ANY(${ids}::text[]))`;

console.log('Syncing provenance facts...');
const valueAtPath = (record, field) => field.split('.').reduce((v, k) => v?.[k], record);
const enrichmentDir = path.join(root, 'data/enrichment');
const facts = [];
for (const file of (await fs.readdir(enrichmentDir)).filter((n) => /^research-.+\.json$/.test(n))) {
  for (const rec of JSON.parse(await fs.readFile(path.join(enrichmentDir, file), 'utf8'))) {
    for (const source of rec.sources ?? []) {
      for (const field of source.fields ?? []) {
        const value = valueAtPath(rec, field);
        if (value === undefined) continue;
        facts.push([String(rec.id), field, JSON.stringify(value), source.url ?? null, source.title ?? null, rec.verified_at ?? null, file]);
      }
    }
  }
}
await sql`TRUNCATE market_facts`;
for (let i = 0; i < facts.length; i += 500) {
  const chunk = facts.slice(i, i + 500);
  await sql`
    INSERT INTO market_facts (market_id, field, value, source_url, source_title, verified_at, batch)
    SELECT market_id, field, value::jsonb, source_url, source_title, verified_at, batch
    FROM unnest(
      ${chunk.map((r) => r[0])}::text[], ${chunk.map((r) => r[1])}::text[], ${chunk.map((r) => r[2])}::text[],
      ${chunk.map((r) => r[3])}::text[], ${chunk.map((r) => r[4])}::text[], ${chunk.map((r) => r[5])}::text[],
      ${chunk.map((r) => r[6])}::text[]
    ) AS t(market_id, field, value, source_url, source_title, verified_at, batch)
  `;
}

const [{ count: marketCount }] = await sql`SELECT count(*)::int AS count FROM markets`;
const [{ count: factCount }] = await sql`SELECT count(*)::int AS count FROM market_facts`;
console.log(`Done: ${marketCount} markets, ${factCount} facts in Postgres.`);
