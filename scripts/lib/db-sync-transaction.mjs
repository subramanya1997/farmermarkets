// Identifiers/types are constants. Research values are bound JSON parameters.
const TABLES = [
  { name: 'markets', key: 'markets', columns: 'id text, slug text, name text, city text, state text, country text, country_code text, latitude double precision, longitude double precision, record jsonb', keys: ['id'] },
  { name: 'market_facts', key: 'facts', columns: 'market_id text, field text, value jsonb, source_url text, source_title text, verified_at text, batch text' },
  { name: 'market_events', key: 'events', columns: 'market_id text, item_id text, name text, payload jsonb, provenance jsonb, verified_at date, kind text, url text, source_start text, source_end text, start_precision text, end_precision text, start_date date, end_date date, starts_at timestamptz, ends_at timestamptz', keys: ['market_id', 'item_id'] },
  { name: 'market_vendors', key: 'vendors', columns: 'market_id text, item_id text, name text, payload jsonb, provenance jsonb, verified_at date, website text, social_url text, categories jsonb, seasonal boolean', keys: ['market_id', 'item_id'] },
  { name: 'market_programs', key: 'programs', columns: 'market_id text, item_id text, name text, payload jsonb, provenance jsonb, verified_at date, kind text, eligibility text, url text', keys: ['market_id', 'item_id'] },
];

export async function syncDatabaseSnapshot(client, snapshot, { chunkSize = 200 } = {}) {
  if (!snapshot.markets?.length) throw new Error('Refusing an empty canonical snapshot');
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new Error('chunkSize must be a positive integer');
  let began = false;
  try {
    await client.query('BEGIN');
    began = true;
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query("SET LOCAL statement_timeout = '120s'");
    await client.query('SELECT pg_advisory_xact_lock(1652588589, 20260930)');
    for (const table of TABLES) {
      await client.query(`CREATE TEMP TABLE sync_${table.name} (LIKE public.${table.name} INCLUDING DEFAULTS) ON COMMIT DROP`);
      const fields = table.columns.split(', ').map((column) => column.split(' ')[0]).join(', ');
      for (let i = 0; i < snapshot[table.key].length; i += chunkSize) {
        const select = table.name === 'market_facts'
          // -> retains a genuine JSON null; jsonb_to_recordset would make it
          // SQL NULL and violate the existing value NOT NULL constraint.
          ? `SELECT ${fields.split(', ').map((field) => `entry${field === 'value' ? '->' : '->>'}'${field}'`).join(', ')} FROM jsonb_array_elements($1::jsonb) AS entry`
          : `SELECT ${fields} FROM jsonb_to_recordset($1::jsonb) AS rows(${table.columns})`;
        await client.query(`INSERT INTO sync_${table.name} (${fields}) ${select}`, [JSON.stringify(snapshot[table.key].slice(i, i + chunkSize))]);
      }
    }
    // Staging precedes every published mutation; absent markets stay for review.
    for (const table of TABLES) {
      const fields = table.columns.split(', ').map((column) => column.split(' ')[0]);
      if (table.name === 'market_facts') {
        await client.query('DELETE FROM market_facts WHERE market_id IN (SELECT id FROM sync_markets)');
        await client.query(`INSERT INTO market_facts (${fields.join(', ')}) SELECT ${fields.join(', ')} FROM sync_market_facts`);
      } else {
        const updates = fields.filter((field) => !table.keys.includes(field)).map((field) => `${field} = EXCLUDED.${field}`);
        updates.push('synced_at = now()');
        await client.query(`INSERT INTO ${table.name} (${fields.join(', ')}) SELECT ${fields.join(', ')} FROM sync_${table.name} WHERE true ON CONFLICT (${table.keys.join(', ')}) DO UPDATE SET ${updates.join(', ')}`);
        if (table.name !== 'markets') {
          await client.query(`DELETE FROM ${table.name} AS existing USING sync_markets AS canonical WHERE existing.market_id = canonical.id AND NOT EXISTS (SELECT 1 FROM sync_${table.name} AS staged WHERE staged.market_id = existing.market_id AND staged.item_id = existing.item_id)`);
        }
      }
    }
    const { rows: counts } = await client.query(`SELECT
      (SELECT count(*)::int FROM markets) AS markets,
      (SELECT count(*)::int FROM market_facts) AS facts,
      (SELECT count(*)::int FROM market_events) AS events,
      (SELECT count(*)::int FROM market_vendors) AS vendors,
      (SELECT count(*)::int FROM market_programs) AS programs,
      (SELECT count(*)::int FROM markets WHERE id IN (SELECT id FROM sync_markets)) AS canonical_markets,
      (SELECT count(*)::int FROM market_facts WHERE market_id IN (SELECT id FROM sync_markets)) AS canonical_facts,
      (SELECT count(*)::int FROM market_events WHERE market_id IN (SELECT id FROM sync_markets)) AS canonical_events,
      (SELECT count(*)::int FROM market_vendors WHERE market_id IN (SELECT id FROM sync_markets)) AS canonical_vendors,
      (SELECT count(*)::int FROM market_programs WHERE market_id IN (SELECT id FROM sync_markets)) AS canonical_programs`);
    for (const table of TABLES) {
      if (counts[0]?.[`canonical_${table.key}`] !== snapshot[table.key].length) {
        throw new Error(`Canonical ${table.key} row count does not match prepared snapshot`);
      }
    }
    await client.query('COMMIT');
    return counts[0];
  } catch (error) {
    if (began) await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}
