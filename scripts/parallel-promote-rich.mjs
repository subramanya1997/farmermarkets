#!/usr/bin/env node
// Source-screened additive rich facts, with a receipt for every input/item.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {snippet,host,authoritative,identitySupported} from './lib/parallel-evidence.mjs';
import {normalize,contains,realDate,dateSupported,richIdentity,itemEvidence,currentRoster,programSupported} from './lib/parallel-rich-evidence.mjs';
import {validateRichEnrichment} from './lib/rich-enrichment-validation.mjs';
import {mergeRichRecords} from './lib/rich-enrichment-merge.mjs';
const arg=(n,d)=>{let i=process.argv.indexOf(`--${n}`);return i<0?d:process.argv[i+1];};
const labels=arg('labels','september-rich-core-pilot,september-rich-core-main').split(',');
const outName=arg('out','research-september-showcase.json');
const asOf=arg('verified-at','2026-09-30');const dry=process.argv.includes('--dry-run');
if(!realDate(asOf)||labels.some(l=>!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(l))||!/^research-[a-zA-Z0-9_-]+\.json$/.test(outName))throw new Error('Invalid labels/output/date');
const base='data/enrichment';const receiptPath=`${base}/parallel/september-rich-selection/review.json`;
if(!dry){try{await fs.access(receiptPath);throw new Error('Reviewed rich output exists; dry-run only, preserve manual edits');}catch(e){if(e.code!=='ENOENT')throw e;}}
const snapshots=new Map();for(const file of ['legacy_markets.json','government_markets.json'])for(const m of JSON.parse(await fs.readFile(`data/sources/${file}`,'utf8')))snapshots.set(String(m.id),m);
const existing=new Map();for(const file of (await fs.readdir(base)).filter(n=>/^research-.+\.json$/.test(n)&&n!==outName))for(const r of JSON.parse(await fs.readFile(`${base}/${file}`,'utf8')))if(r.first_party)existing.set(String(r.id),existing.has(String(r.id))?mergeRichRecords(existing.get(String(r.id)),r):r);
const hash=x=>crypto.createHash('sha256').update(x).digest('hex').slice(0,14);
const rows=[];for(const label of labels)for(const line of (await fs.readFile(`${base}/parallel/${label}/results.jsonl`,'utf8')).split('\n').filter(Boolean))rows.push({...JSON.parse(line),label});
const records=[];const receipts=[];const stats={runs:rows.length,empty_outputs:0,observed_items:{events:0,vendor_directory:0,vendor_roster:0,programs:0},accepted_markets:0,events:0,vendor_links:0,named_vendors:0,programs:0,reasons:{}};
const reject=(r,reason,field)=>{r.decisions.push({field,decision:'reject',reason});stats.reasons[reason]=(stats.reasons[reason]||0)+1;};
const seen=new Set();
for(const row of rows){
 const id=String(row.market.id);const receipt={id,run_id:row.run_id,label:row.label,decisions:[]};receipts.push(receipt);
 if(seen.has(id))throw new Error('Duplicate raw market ID');seen.add(id);
 const market=snapshots.get(id);let out;try{out=typeof row.output==='string'?JSON.parse(row.output):row.output;}catch{reject(receipt,'invalid_output','run');continue;}
 if(row.status!=='completed'||!out){reject(receipt,'not_completed','run');continue;}
 receipt.output_counts=Object.fromEntries(Object.keys(stats.observed_items).map(k=>[k,Array.isArray(out[k])?out[k].length:0]));
 for(const [k,n]of Object.entries(receipt.output_counts))stats.observed_items[k]+=n;
 if(!Object.values(receipt.output_counts).some(Boolean))stats.empty_outputs++;
 const official=row.market.official_website;
 if(!market||!richIdentity(market,official,out,row.basis)){reject(receipt,'unsupported_identity_or_locality','run');continue;}
 const sources=new Map();const first={};const prior=existing.get(id)?.first_party||{};
 const sourced=(value,citations,field,itemId)=>{
  const ids=[];for(const c of citations){const url=new URL(c.url).href;const sourceId=`rich-parallel-${hash(url)}`;let s=sources.get(sourceId);if(!s){s={id:sourceId,title:c.title||'Official market source',url,fields:[],kind:'first_party',scope:'market',accessed_at:asOf};sources.set(sourceId,s);}if(!s.fields.includes(field))s.fields.push(field);ids.push(sourceId);}
  return {...(itemId?{id:itemId}:{}),value,source_ids:[...new Set(ids)],verified_at:asOf};
 };
 for(const [i,item]of(out.events||[]).slice(0,6).entries()){
  const field=`events.${i}`;const cites=itemEvidence(market,official,row.basis,field,item);
  const supporting=cites.filter(c=>dateSupported(item.start_date,item.evidence_excerpt)&&dateSupported(item.start_date,snippet(c))&&(!item.end_date||dateSupported(item.end_date,item.evidence_excerpt)&&dateSupported(item.end_date,snippet(c))));
  if(!supporting.length){reject(receipt,'unsupported_event_name_date_year',field);continue;}
  if(!realDate(item.start_date)||item.start_date<asOf||item.end_date&&(!realDate(item.end_date)||item.end_date<item.start_date)){reject(receipt,'stale_or_invalid_event',field);continue;}
  if(/cancel(?:led|ed)|postponed/i.test(supporting.map(snippet).join(' '))){reject(receipt,'event_cancellation_or_postponement',field);continue;}
  const dup=(prior.events||[]).some(e=>e.value.start?.slice(0,10)===item.start_date&&(contains(e.value.name,item.name)||contains(item.name,e.value.name)||e.value.url===item.source_url&&e.value.kind===item.kind));
  if(dup){reject(receipt,'existing_event',field);continue;}
  const value={name:item.name,kind:['music','workshop','kids','festival','special_market','other'].includes(item.kind)?item.kind:'other',start:item.start_date,url:item.source_url};
  if(item.end_date)value.end=item.end_date;
  for(const key of ['published_hours','venue'])if(item[key]&&supporting.some(c=>contains(snippet(c),item[key])))value[key]=item[key];
  const itemId=`parallel-event-${hash(`${normalize(item.name)}|${item.start_date}`)}`;
  if(first.events?.some(e=>e.id===itemId)){reject(receipt,'duplicate_event',field);continue;}
  (first.events??=[]).push(sourced(value,supporting,'first_party.events',itemId));stats.events++;receipt.decisions.push({field,decision:'accept',item_id:itemId,source_urls:supporting.map(c=>c.url)});
 }
 for(const [i,item]of(out.vendor_directory||[]).slice(0,1).entries()){
  const field=`vendor_directory.${i}`;const cites=itemEvidence(market,official,row.basis,field,item);
  const supports=cites.filter(c=>identitySupported(market,[c])&&/vendors|sellers|roster|producers|farmers/i.test(snippet(c))&&!/all (?:our )?markets|across (?:all|our) markets/i.test(snippet(c)));
  const key=item.kind==='weekly_roster'?'weekly_roster_url':'directory_url';
  if(!supports.length||!authoritative(item.url)||host(item.url)!==host(official)){reject(receipt,'unsupported_market_specific_vendor_link',field);continue;}
  if(prior.vendors?.[key]){reject(receipt,'existing_vendor_link',field);continue;}
  // Link must be a cited destination itself or explicitly present in excerpts.
  if(!supports.some(c=>new URL(c.url).href===new URL(item.url).href||snippet(c).includes(item.url))){reject(receipt,'uncited_vendor_destination',field);continue;}
  (first.vendors??={})[key]=sourced(item.url,supports,`first_party.vendors.${key}`);stats.vendor_links++;receipt.decisions.push({field,decision:'accept',source_urls:supports.map(c=>c.url)});
 }
 let rosterContext;
 for(const [i,item]of(out.vendor_roster||[]).slice(0,12).entries()){
  const field=`vendor_roster.${i}`;const cites=itemEvidence(market,official,row.basis,field,item);
  const supports=cites.filter(c=>currentRoster(item,asOf,item.evidence_excerpt)&&currentRoster(item,asOf,snippet(c))&&identitySupported(market,[c]));
  if(!supports.length){reject(receipt,'unsupported_or_stale_named_roster',field);continue;}
  const context={as_of:asOf,label:item.period,non_exhaustive:true,...(item.start_date?{start_date:item.start_date}:{}),...(item.end_date?{end_date:item.end_date}:{})};
  if(prior.vendors?.roster_context||rosterContext&&JSON.stringify(rosterContext)!==JSON.stringify(context)){reject(receipt,'existing_or_conflicting_roster_context',field);continue;}
  if((prior.vendors?.roster||[]).some(v=>normalize(v.value.name)===normalize(item.name))){reject(receipt,'existing_named_vendor',field);continue;}
  const itemId=`parallel-vendor-${hash(normalize(item.name))}`;
  if(first.vendors?.roster?.some(v=>v.id===itemId)){reject(receipt,'duplicate_named_vendor',field);continue;}
  const vendors=first.vendors??={};
  vendors.roster_context=sourced(context,[...supports,...(vendors.roster_context?vendors.roster_context.source_ids.flatMap(s=>{const src=sources.get(s);return[{url:src.url,title:src.title}];}):[])],'first_party.vendors.roster_context');rosterContext=context;
  (vendors.roster??=[]).push(sourced({name:item.name,attendance_note:`Published roster: ${item.period}. Attendance on a particular date is not confirmed.`},supports,'first_party.vendors.roster',itemId));stats.named_vendors++;receipt.decisions.push({field,decision:'accept',item_id:itemId,source_urls:supports.map(c=>c.url)});
 }
 for(const [i,item]of(out.programs||[]).slice(0,4).entries()){
  const field=`programs.${i}`;const cites=itemEvidence(market,official,row.basis,field,item);const supports=cites.filter(c=>programSupported(item,asOf,item.evidence_excerpt)&&programSupported(item,asOf,snippet(c))&&identitySupported(market,[c]));
  if(!supports.length){reject(receipt,'unsupported_current_program',field);continue;}
  if((prior.programs||[]).some(p=>contains(p.value.name,item.name)||contains(item.name,p.value.name))){reject(receipt,'existing_program',field);continue;}
  const itemId=`parallel-program-${hash(normalize(item.name))}`;if(first.programs?.some(p=>p.id===itemId)){reject(receipt,'duplicate_program',field);continue;}
  (first.programs??=[]).push(sourced({name:item.name,kind:item.kind,description:item.description},supports,'first_party.programs',itemId));stats.programs++;receipt.decisions.push({field,decision:'accept',item_id:itemId,source_urls:supports.map(c=>c.url)});
 }
 if(!Object.keys(first).length){reject(receipt,'no_supported_new_facts','run');continue;}
 const record={id,market_name:market.name,verified_at:asOf,verification_scope:'partial',schema_version:2,first_party:first,sources:[...sources.values()]};
 validateRichEnrichment(record,id,msg=>{throw new Error(msg);});
 if(existing.has(id))validateRichEnrichment(mergeRichRecords(existing.get(id),record),id,msg=>{throw new Error(msg);});
 records.push(record);stats.accepted_markets++;
}
console.log(JSON.stringify(stats,null,2));
if(!dry){await fs.writeFile(`${base}/${outName}`,JSON.stringify(records,null,2)+'\n');await fs.writeFile(receiptPath,JSON.stringify({as_of:asOf,output:outName,stats,rows:receipts},null,2)+'\n');}
