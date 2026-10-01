import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { marketNamesEquivalent } from './market-name-equivalence.mjs';

test('Ontario apostrophe refresh preserves the same market identity', () => {
  assert.equal(marketNamesEquivalent('Hamilton Farmers’ Market', "Hamilton Farmers' Market"), true);
});

test('canonical Unicode, whitespace and equivalent typography are accepted', () => {
  assert.equal(marketNamesEquivalent('  Café\u00a0“Market” – East\n', 'Cafe\u0301 "Market" - East'), true);
  assert.equal(marketNamesEquivalent('North\u2011End Market', 'North-End Market'), true);
});

test('substantive text, accents, apostrophe placement and missing punctuation remain mismatches', () => {
  for (const [left, right] of [
    ['Hamilton Farmers’ Market', 'Hamilton Farmers Market'],
    ['Hamilton Farmers’ Market', 'Hamilton Farmer’s Market'],
    ['Hamilton Farmers’ Market', 'Hamilton Farmers’ Market East'],
    ['North-End Market', 'North End Market'],
    ['Café Market', 'Cafe Market'],
    ['Market II', 'Market Ⅱ'],
    ['Market A', 'Market А'], // Cyrillic A is not Latin A.
    ['Market', 'market'],
    ['', ''],
    [undefined, undefined],
    [null, 'Market'],
  ]) {
    assert.equal(marketNamesEquivalent(left, right), false, `${left} must differ from ${right}`);
  }
});

test('the enrichment builder accepts typography changes but still rejects wrong IDs and renamed markets', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'farmermarkets-identity-test-'));
  const builder = fileURLToPath(new URL('../build-market-enrichment.mjs', import.meta.url));
  const id = 'gov:ca_on_farmers_markets:11';
  const record = {
    id,
    market_name: 'Hamilton Farmers’ Market',
    verified_at: '2026-08-21',
    verification_scope: 'partial',
    google_maps_url: 'https://www.google.com/maps/search/?api=1&query=Hamilton',
    sources: [{
      url: 'https://example.org/hamilton', title: 'Official market information',
      fields: ['google_maps_url'],
    }],
  };
  try {
    await mkdir(path.join(root, 'data/sources'), { recursive: true });
    await mkdir(path.join(root, 'data/enrichment'), { recursive: true });
    await writeFile(path.join(root, 'data/sources/legacy_markets.json'), '[]');
    await writeFile(path.join(root, 'data/sources/government_markets.json'), JSON.stringify([
      { id, name: "Hamilton Farmers' Market" },
    ]));
    const research = path.join(root, 'data/enrichment/research-fixture.json');
    const run = () => spawnSync(process.execPath, [builder], { cwd: root, encoding: 'utf8' });

    await writeFile(research, JSON.stringify([record]));
    let result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /validated 1 independently enriched markets/);

    await writeFile(research, JSON.stringify([{ ...record, id: `${id}-different` }]));
    result = run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /id does not exist in a market snapshot/);

    await writeFile(research, JSON.stringify([{ ...record, market_name: 'Hamilton Farmers’ Market East' }]));
    result = run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /market_name does not match/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
