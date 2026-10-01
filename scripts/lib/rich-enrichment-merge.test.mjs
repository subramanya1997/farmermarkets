import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRichRecords } from './rich-enrichment-merge.mjs';
import { validateRichEnrichment } from './rich-enrichment-validation.mjs';
const source = (id, url, accessed_at, fields) => ({id,url,title:'Official market',accessed_at,fields,kind:'first_party',scope:'market'});
const fact = (value, sourceId, verified_at='2026-09-30') => ({value,source_ids:[sourceId],verified_at});
const record = (first_party,sources,date='2026-09-30') => ({schema_version:2,id:'1',market_name:'Market',verified_at:date,first_party,sources});
test('new events preserve older rich vendor facts and their checked dates', () => {
 const old=record({vendors:{count:fact({value:12},'old','2026-08-21')}},[source('old','https://market.example/info','2026-08-21',['first_party.vendors'])],'2026-08-21');
 const next=record({events:[{id:'festival',...fact({name:'Festival',kind:'festival',start:'2026-10-10'},'new')}]},[source('new','https://market.example/events','2026-09-30',['first_party.events'])]);
 const merged=mergeRichRecords(old,next);
 assert.deepEqual(merged.first_party.vendors,old.first_party.vendors);
 assert.equal(merged.first_party.events[0].value.start,'2026-10-10');
 assert.equal(merged.verified_at,'2026-09-30');
 assert.doesNotThrow(()=>validateRichEnrichment(merged,'merged',message=>{throw new Error(message);}));
 assert.equal(old.first_party.events,undefined);
});
test('same URL keeps a stable source ID and remaps new fact evidence without predating old facts', () => {
 const old=record({vendors:{count:fact({value:12},'old','2026-08-21')}},[source('old','https://market.example/info','2026-08-21',['first_party.vendors'])],'2026-08-21');
 const next=record({programs:[{id:'kids',...fact({name:'Kids club',kind:'kids_club'},'new')}]},[source('new','https://market.example/info','2026-09-30',['first_party.programs'])]);
 const merged=mergeRichRecords(old,next);
 assert.equal(merged.sources.length,1);
 assert.equal(merged.sources[0].accessed_at,'2026-08-21');
 assert.deepEqual(merged.first_party.programs[0].source_ids,['old']);
 assert.equal(merged.first_party.programs[0].verified_at,'2026-09-30');
 assert.doesNotThrow(()=>validateRichEnrichment(merged,'merged',message=>{throw new Error(message);}));
});
test('conflicting values or reused source IDs fail instead of picking file-order winners', () => {
 const a=record({vendors:{count:fact({value:12},'s')}},[source('s','https://market.example/info','2026-09-30',['first_party.vendors'])]);
 const b=record({vendors:{count:fact({value:13},'s')}},a.sources);
 assert.throws(()=>mergeRichRecords(a,b),/Conflicting rich fact/);
 assert.throws(()=>mergeRichRecords(b,a),/Conflicting rich fact/);
 assert.throws(()=>mergeRichRecords(a,record({},[source('s','https://other.example/info','2026-09-30',['first_party.vendors'])])),/Conflicting rich source ID/);
});
test('identical item IDs merge evidence once; new IDs append and changed event dates fail', () => {
 const src=source('s','https://market.example/events','2026-09-30',['first_party.events']);
 const e={id:'festival',...fact({name:'Festival',kind:'festival',start:'2026-10-10'},'s')};
 const a=record({events:[e]},[src]);
 assert.equal(mergeRichRecords(a,a).first_party.events.length,1);
 const b=record({events:[{...e,value:{...e.value,start:'2026-10-11'}}]},[src]);
 assert.throws(()=>mergeRichRecords(a,b),/Conflicting rich fact/);
});
