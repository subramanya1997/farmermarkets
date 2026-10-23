import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ADDED_MARKETS_PATH, addedMarketKey, readAddedMarkets } from './added-markets.mjs';

const added = {
  id: 'added:clintonville-farmers-market-columbus-oh',
  slug: 'clintonville-farmers-market-columbus-oh',
  name: 'Clintonville Farmers Market',
  country: 'United States',
  country_code: 'US',
  location: { address: '3535 N High St', city: 'Columbus', state: 'Ohio' },
  provenance: {
    official: false,
    source_id: 'added',
    publisher: 'Common Greens',
    catalog_url: 'https://www.commongreensohio.org/clintonville/',
    retrieved_at: '2026-10-23',
  },
};

async function withFile(rows, run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'added-markets-'));
  try {
    await mkdir(path.join(root, path.dirname(ADDED_MARKETS_PATH)), { recursive: true });
    await writeFile(path.join(root, ADDED_MARKETS_PATH), JSON.stringify(rows));
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('a valid added market joins after the source rows', async () => {
  await withFile([added], async (root) => {
    assert.deepEqual(await readAddedMarkets([{ id: 1, slug: 'pearl-market-oh', name: 'Pearl Market', location: { city: 'Columbus', state: 'Ohio' } }], { root }), [added]);
  });
});

test('no file means no added markets', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'added-markets-'));
  assert.deepEqual(await readAddedMarkets([], { root }), []);
  await rm(root, { recursive: true, force: true });
});

test('an added market needs its source page and the added id scheme', async () => {
  const broken = { ...added, id: 'clintonville', provenance: { official: true, source_id: 'added' } };
  await withFile([broken], async (root) => {
    await assert.rejects(readAddedMarkets([], { root }), (error) => {
      assert.match(error.message, /id must be "added:\{slug\}"/);
      assert.match(error.message, /official: false/);
      assert.match(error.message, /source page URL/);
      assert.match(error.message, /retrieved_at/);
      return true;
    });
  });
});

test('a market the sources now list fails locally and is skipped in the refresh', async () => {
  const listed = { id: 999, slug: 'clintonville-farmers-market', name: "Clintonville Farmers' Market", location: { city: 'Columbus', state: 'Ohio' } };
  await withFile([added], async (root) => {
    await assert.rejects(readAddedMarkets([listed], { root }), /now in the sources as 999/);
    const warn = console.warn;
    console.warn = () => {};
    try {
      assert.deepEqual(await readAddedMarkets([listed], { root, skipStale: true }), []);
    } finally {
      console.warn = warn;
    }
  });
});

test('the identity key ignores market words and punctuation, not the place', () => {
  const key = (name, city) => addedMarketKey({ name, location: { city, state: 'Ohio' } });
  assert.equal(key("Clintonville Farmers' Market", 'Columbus'), key('Clintonville Farmers Market', 'Columbus'));
  assert.notEqual(key('Clintonville Farmers Market', 'Columbus'), key('Clintonville Farmers Market', 'Dayton'));
});
