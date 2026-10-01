import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateSubmitOptions, reserveCampaign, orderedCandidates, atomicJson, reconcileSchemaFailure } from './parallel-campaign.mjs';
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
test('new rich purpose can revisit legacy identity IDs, without duplicate paid purposes or new budget', () => {
  const ledger = { budget_mills: 50000, reservations: [{ label: 'legacy', market_ids: ['1'], cost_mills: 25500 }] };
  assert.throws(() => reserveCampaign(ledger, { ...options, label: 'identity-again', ids: ['1'] }), /already reserved/);
  reserveCampaign(ledger, { ...options, processor: 'core', label: 'rich', purpose: 'richshowcase', ids: Array.from({length:980}, (_,i)=>String(i+1)) });
  assert.equal(ledger.reservations.reduce((s,r)=>s+r.cost_mills,0), 50000);
  assert.throws(() => reserveCampaign(ledger, { ...options, label: 'rich-retry', purpose: 'richshowcase', ids: ['1'] }), /already reserved/);
  assert.throws(() => reserveCampaign(ledger, { ...options, label: 'extra', ids: ['1000'] }), /cumulative/);
  assert.throws(() => reserveCampaign(ledger, { ...options, purpose: 'typo', ids: ['2000'] }), /purpose/);
});
test('only exhaustive documented schema failures release spend, never partial or ambiguous failures',()=>{
 const base={budget_mills:50000,reservations:[{label:'failed',purpose:'richshowcase',cost_mills:25,market_ids:['1'],state:'submitted',run_ids:['r1']}]};
 const group={status:{is_active:false,num_task_runs:1,task_run_status_counts:{failed:1}}};
 const runs=[{run_id:'r1',status:'failed',is_active:false,errors:[{error:"Unsupported keyword 'maxItems' at path: properties.events"}]}];
 const evidence={path:'receipt.json',sha256:'a'.repeat(64),pricing_url:'https://docs.parallel.ai/getting-started/pricing'};
 for(const bad of [[],[{...runs[0],status:'completed'}],[{...runs[0],errors:[{error:'internal error'}]}]]) assert.throws(()=>reconcileSchemaFailure(structuredClone(base),'failed',group,bad,evidence));
 const ambiguous=structuredClone(base);ambiguous.reservations[0].state='needs_reconciliation';assert.throws(()=>reconcileSchemaFailure(ambiguous,'failed',group,runs,evidence));
 const complete=structuredClone(base);reconcileSchemaFailure(complete,'failed',group,runs,evidence);
 assert.equal(complete.reservations[0].cost_mills,0);assert.equal(complete.reservations[0].reserved_cost_mills,25);
 const forged=structuredClone(complete);delete forged.reservations[0].reconciliation;assert.throws(()=>reserveCampaign(forged,{...options,label:'forged-retry',purpose:'richshowcase',ids:['1']}),/exemption/);
 reserveCampaign(complete,{...options,label:'corrected',processor:'core',purpose:'richshowcase',ids:['1']});
 assert.throws(()=>reserveCampaign(complete,{...options,label:'duplicate',purpose:'richshowcase',ids:['1']}),/already reserved/);
});
