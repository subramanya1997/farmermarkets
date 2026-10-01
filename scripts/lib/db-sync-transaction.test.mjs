import assert from 'node:assert/strict';
import test from 'node:test';
import { syncDatabaseSnapshot } from './db-sync-transaction.mjs';

const snapshot = () => ({ markets: [{ id: 'one', slug: 'one', name: "Market's name", record: {} }], facts: [{ market_id: 'one', field: 'note', value: null, batch: 'research.json' }], events: [], vendors: [], programs: [] });
function recordingClient(failAt) {
  const queries = [];
  return { queries, async query(sql, parameters) {
    queries.push({ sql, parameters });
    if (failAt?.(sql)) throw new Error('injected failure');
    return { rows: [{ markets: 1, facts: 1, events: 0, vendors: 0, programs: 0,
      canonical_markets: 1, canonical_facts: 1, canonical_events: 0, canonical_vendors: 0, canonical_programs: 0 }] };
  } };
}

test('complete staging precedes publication, values are bound, and no market/submission pruning occurs', async () => {
  const client = recordingClient();
  await syncDatabaseSnapshot(client, snapshot(), { chunkSize: 1 });
  const queries = client.queries.map((query) => query.sql);
  assert.equal(queries[0], 'BEGIN');
  assert.equal(queries.at(-1), 'COMMIT');
  const firstPublishedMutation = queries.findIndex((sql) => sql.startsWith('INSERT INTO markets'));
  assert.ok(firstPublishedMutation > queries.findIndex((sql) => sql.startsWith('CREATE TEMP TABLE sync_market_programs')));
  assert.ok(!queries.some((sql) => /TRUNCATE|DELETE FROM markets\b|submissions/i.test(sql)));
  assert.ok(queries.includes('DELETE FROM market_facts WHERE market_id IN (SELECT id FROM sync_markets)'));
  const insert = client.queries.find((query) => query.sql.startsWith('INSERT INTO sync_markets'));
  assert.ok(!insert.sql.includes("Market's name"));
  assert.equal(JSON.parse(insert.parameters[0])[0].name, "Market's name");
});

test('a staging failure rolls back without touching published facts', async () => {
  const client = recordingClient((sql) => sql.startsWith('INSERT INTO sync_market_facts'));
  await assert.rejects(syncDatabaseSnapshot(client, snapshot()), /injected failure/);
  assert.equal(client.queries.at(-1).sql, 'ROLLBACK');
  assert.ok(!client.queries.some(({ sql }) => sql.startsWith('DELETE FROM market_facts')));
});

test('failure after fact replacement starts rolls back instead of committing a wiped table', async () => {
  const client = recordingClient((sql) => sql.startsWith('INSERT INTO market_facts'));
  await assert.rejects(syncDatabaseSnapshot(client, snapshot()), /injected failure/);
  assert.equal(client.queries.at(-1).sql, 'ROLLBACK');
  assert.ok(!client.queries.some(({ sql }) => sql === 'COMMIT'));
});

test('an empty snapshot is refused before opening a transaction', async () => {
  const client = recordingClient();
  await assert.rejects(syncDatabaseSnapshot(client, { ...snapshot(), markets: [] }), /empty/);
  assert.equal(client.queries.length, 0);
});

test('a mismatched published count rolls back before commit', async () => {
  const client = recordingClient();
  await assert.rejects(syncDatabaseSnapshot(client, { ...snapshot(), facts: [] }), /row count/);
  assert.equal(client.queries.at(-1).sql, 'ROLLBACK');
});
