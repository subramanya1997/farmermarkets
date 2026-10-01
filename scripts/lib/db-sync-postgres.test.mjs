import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { buildDatabaseSnapshot } from './db-projections.mjs';
import { syncDatabaseSnapshot } from './db-sync-transaction.mjs';

// Opt-in: needs initdb/pg_ctl/psql binaries and permission for a local Unix
// socket. Runs a disposable cluster; never reads DATABASE_URL or a remote DB.
test('Postgres executes migration/sync idempotently and rolls back a post-delete failure', { skip: process.env.RUN_DB_POSTGRES_TESTS !== '1' }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'fm-pg-'));
  const data = path.join(root, 'cluster');
  const user = userInfo().username;
  let started = false;
  const psql = (input, failOnError = true) => execFileSync('psql', ['-h', root, '-p', '55463', '-U', user, '-d', 'postgres', '-Atq', '-v', `ON_ERROR_STOP=${failOnError ? '1' : '0'}`], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const source = { id: 'official', title: 'Market', url: 'https://example.org/market', kind: 'first_party', scope: 'market', accessed_at: '2026-09-30' };
  const node = (id, value) => ({ id, value, source_ids: ['official'], verified_at: '2026-09-30' });
  const record = { id: 'current', name: 'Current Market', slug: 'current', enrichment: { sources: [source] }, first_party: {
    events: [node('dated-event', { name: 'Dated event', kind: 'special_market', start: '2026-11-22' })],
    vendors: { roster: [node('apple-farm', { name: 'Apple Farm' })] },
    programs: [node('snap-match', { name: 'SNAP match', kind: 'food_access' })],
  } };
  const snapshot = buildDatabaseSnapshot([record], [{ file: 'research-fixture.json', records: [{
    id: 'current', verified_at: '2026-09-30', note: null, sources: [{ ...source, fields: ['note'] }],
  }] }]);
  async function sqlForSync() {
    const statements = [];
    await syncDatabaseSnapshot({ async query(sql, parameters) {
      // Safe SQL quoting only for controlled local test values. Production
      // uses bound driver parameters.
      statements.push(parameters ? sql.replace('$1', `'${parameters[0].replace(/'/g, "''")}'`) : sql);
      return { rows: [{ canonical_markets: 1, canonical_facts: 1, canonical_events: 1, canonical_vendors: 1, canonical_programs: 1 }] };
    } }, snapshot);
    return statements.join(';\n') + ';\n';
  }
  try {
    execFileSync('initdb', ['-D', data, '--auth=trust', '--no-locale', '-E', 'UTF8'], { stdio: 'pipe' });
    execFileSync('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.log'), '-o', `-k ${root} -h '' -p 55463 -F`, '-w', 'start'], { stdio: 'pipe' });
    started = true;
    const migrations = ['../../drizzle/0000_condemned_rockslide.sql', '../../drizzle/0001_market_highlights.sql'];
    for (const migration of migrations) psql(await readFile(fileURLToPath(new URL(migration, import.meta.url)), 'utf8'));
    psql(`INSERT INTO markets (id,slug,name,record) VALUES ('current','current','Old Market','{}'),('retained','retained','Retained Market','{}');
      INSERT INTO market_facts (market_id,field,value,batch) VALUES ('current','old','"old"','fixture'),('retained','retained','true','fixture');
      INSERT INTO submissions (type,market_id,payload) VALUES ('correction','current','{"keep":true}');`);
    const commands = await sqlForSync();
    psql(commands);
    assert.equal(psql("SELECT count(*) FROM markets; SELECT count(*) FROM market_facts; SELECT count(*) FROM market_events; SELECT count(*) FROM market_vendors; SELECT count(*) FROM market_programs; SELECT count(*) FROM submissions;").trim(), '2\n2\n1\n1\n1\n1');
    assert.equal(psql("SELECT start_date::text || ':' || (starts_at IS NULL)::text FROM market_events; SELECT (value = 'null'::jsonb)::text FROM market_facts WHERE market_id='current';").trim(), '2026-11-22:true\ntrue');
    const stableKeys = psql('SELECT market_id,item_id FROM market_events; SELECT id::text FROM submissions;');
    psql(commands);
    assert.equal(psql('SELECT market_id,item_id FROM market_events; SELECT id::text FROM submissions;'), stableKeys);
    psql("UPDATE markets SET name='Before Failure' WHERE id='current'; UPDATE market_facts SET value='\"before\"' WHERE market_id='current';");
    // Inject an actual FK violation after live facts have been deleted. The
    // transaction becomes aborted; its COMMIT rolls back all earlier changes.
    const broken = commands.replace('INSERT INTO market_facts (', "INSERT INTO market_facts (market_id,field,value,batch) VALUES ('missing','failure','true','fixture');\nINSERT INTO market_facts (");
    psql(broken, false);
    assert.equal(psql("SELECT name FROM markets WHERE id='current'; SELECT value::text FROM market_facts WHERE market_id='current'; SELECT count(*) FROM submissions;").trim(), 'Before Failure\n"before"\n1');
  } finally {
    if (started) execFileSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'pipe' });
    await rm(root, { recursive: true, force: true });
  }
});
