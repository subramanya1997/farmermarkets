import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateSubmitOptions, reserveCampaign, orderedCandidates, atomicJson } from './parallel-campaign.mjs';
const options = { processor: 'base', limit: 20, offset: 0, maxCost: 50, budget: 50, label: 'pilot', campaign: 'sept-30' };
test('paid options reject unsupported tiers, NaN, Infinity, fractions, negative counts and path traversal', () => {
  validateSubmitOptions(options);
  for (const bad of [{ processor: 'typo' }, { limit: NaN }, { limit: Infinity }, { limit: -1 }, { limit: 1.2 }, { offset: -1 }, { maxCost: NaN }, { maxCost: 51 }, { budget: Infinity }, { label: '../x' }]) assert.throws(() => validateSubmitOptions({ ...options, ...bad }));
});
test('reservations aggregate cost and retain ambiguous spend, duplicate IDs cannot be paid twice', () => {
  const ledger = { budget_mills: 50000, reservations: [] };
  const first = reserveCampaign(ledger, { ...options, ids: ['1', '2'], now: '2026-09-30' });
  assert.equal(first.cost_mills, 20);
  first.state = 'needs_reconciliation';
  assert.throws(() => reserveCampaign(ledger, { ...options, label: 'retry', ids: ['1'], now: 'today' }), /already reserved/);
  assert.throws(() => reserveCampaign(ledger, { ...options, label: 'too-expensive', processor: 'pro', ids: Array.from({ length: 500 }, (_, i) => String(i + 10)), now: 'today' }), /cumulative/);
  assert.equal(ledger.reservations.length, 1);
  assert.throws(() => reserveCampaign(ledger, { ...options, label: 'unknown', processor: 'typo', ids: ['99'], now: 'today' }), /Invalid/);
  assert.throws(() => reserveCampaign(ledger, { ...options, label: 'bad-cap', maxCost: NaN, ids: ['99'], now: 'today' }), /Invalid/);
});
test('explicit IDs preserve priority and allow known-site records but exclude prior research IDs', () => {
  const markets = [{ id: 1, name: 'A', location: { city: 'X' } }, { id: 2, name: 'B', location: { city: 'X' }, contact: { websites: ['https://b.test'] } }];
  assert.deepEqual(orderedCandidates(markets, new Set(), [2, 1]).map(m => m.id), [2, 1]);
  assert.deepEqual(orderedCandidates(markets, new Set()).map(m => m.id), [1]);
  assert.throws(() => orderedCandidates(markets, new Set(['1']), [1]), /previously enriched/);
  assert.throws(() => orderedCandidates(markets, new Set(), [1, 1]), /duplicate/);
  assert.throws(() => orderedCandidates(markets, new Set(), [3]), /missing/);
});
test('ledger snapshot is atomically replaced without partial JSON', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'parallel-ledger-'));
  try {
    const file = path.join(dir, 'ledger.json');
    await atomicJson(file, { reservations: [{ state: 'reserved' }] });
    await atomicJson(file, { reservations: [{ state: 'submitted', run_ids: ['r1'] }] });
    assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')).reservations[0].run_ids, ['r1']);
    assert.deepEqual(await fs.readdir(dir), ['ledger.json']);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
