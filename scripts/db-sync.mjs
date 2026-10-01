#!/usr/bin/env node
// Canonical JSON/research batches remain the source of truth. --dry-run maps
// everything without a connection. Live sync stages in one transaction,
// retains absent market IDs and never edits submissions.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@neondatabase/serverless';
import { buildDatabaseSnapshot } from './lib/db-projections.mjs';
import { syncDatabaseSnapshot } from './lib/db-sync-transaction.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const enrichmentDir = path.join(root, 'data/enrichment');
const allRows = JSON.parse(await fs.readFile(path.join(root, 'public/data/farmers_markets.json'), 'utf8'));
const researchBatches = [];
for (const file of (await fs.readdir(enrichmentDir)).filter((name) => /^research-.+\.json$/.test(name)).sort()) {
  researchBatches.push({ file, records: JSON.parse(await fs.readFile(path.join(enrichmentDir, file), 'utf8')) });
}
const snapshot = buildDatabaseSnapshot(allRows, researchBatches);
const prepared = Object.fromEntries(['markets', 'facts', 'events', 'vendors', 'programs'].map((key) => [key, snapshot[key].length]));
console.log(`Prepared canonical snapshot: ${JSON.stringify(prepared)}; duplicate market IDs skipped: ${snapshot.duplicateMarketIds}`);
if (process.argv.includes('--dry-run')) {
  console.log('Dry run complete; no database connection or writes.');
} else {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (run via: npm run db:sync)');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const counts = await syncDatabaseSnapshot(client, snapshot);
    console.log(`Committed atomic sync: ${JSON.stringify(counts)}`);
  } catch {
    // Driver errors can contain connection details. Do not log credentials.
    console.error('Database sync failed or its commit acknowledgement was unavailable. Verify the current snapshot before retrying; check connectivity, migration status and database permissions.');
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {
      console.error('Database client cleanup failed.');
      process.exitCode = 1;
    });
  }
}
