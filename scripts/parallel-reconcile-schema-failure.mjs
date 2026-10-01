#!/usr/bin/env node
// Explicit operator reconciliation, never called automatically by submit/collect.
// Reads every run and retains its error evidence. Only the known pre-research
// maxItems rejection can be released; all other failure/ambiguity stays reserved.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {atomicJson,reconcileSchemaFailure} from './lib/parallel-campaign.mjs';
const label=process.argv[process.argv.indexOf('--label')+1];
if(!process.argv.includes('--label')||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(label||'')) throw new Error('Explicit --label required');
if(!process.env.PARALLEL_API_KEY) throw new Error('Credential unavailable');
const dir=`data/enrichment/parallel/${label}`;
const meta=JSON.parse(await fs.readFile(`${dir}/group.json`,'utf8'));
const ledgerPath=`data/enrichment/parallel/campaign-${meta.campaign}.json`;
const lock=`${ledgerPath}.lock`;
await fs.mkdir(lock);
try {
 const get=async p=>{const r=await fetch(`https://api.parallel.ai${p}`,{headers:{'x-api-key':process.env.PARALLEL_API_KEY}});if(!r.ok) throw new Error(`Read failed ${r.status}`);return r.json();};
 const group=await get(`/v1/tasks/groups/${meta.groupId}`);
 const queue=Object.keys(meta.runMap);const runs=[];let sampleRun;
 await Promise.all(Array.from({length:8},async()=>{while(queue.length){const id=queue.shift();const r=await get(`/v1/tasks/runs/${id}`);sampleRun??=r;let errors=[];try{errors=JSON.parse(r.error?.message||'{}').errors||[];}catch{/* unknown error cannot reconcile */}
 runs.push({run_id:r.run_id,status:r.status,is_active:r.is_active,error_ref:r.error?.ref_id,errors});if(runs.length%100===0) console.log(`verified failed metadata ${runs.length}/980`);}}));
 const receipt={label,group,sample_run:sampleRun,runs,verified_at:new Date().toISOString(),pricing:{url:'https://docs.parallel.ai/getting-started/pricing',verified_via:'gstack browse',rule:'Only successful Task API runs are billed; failed runs are not billed'},failure_documentation:'https://docs.parallel.ai/task-api/guides/specify-a-task'};
 const receiptPath=path.join(dir,'schema-failure-reconciliation.json');
 await atomicJson(receiptPath,receipt);
 const digest=crypto.createHash('sha256').update(await fs.readFile(receiptPath)).digest('hex');
 const ledger=JSON.parse(await fs.readFile(ledgerPath,'utf8'));
 reconcileSchemaFailure(ledger,label,group,runs,{path:receiptPath,sha256:digest,pricing_url:receipt.pricing.url,verified_at:receipt.verified_at,zero_successes:true});
 await atomicJson(ledgerPath,ledger);
 console.log(`Explicitly reconciled ${runs.length} unbilled schema rejections; retained receipt and original reserved cost.`);
}finally{await fs.rmdir(lock);}
