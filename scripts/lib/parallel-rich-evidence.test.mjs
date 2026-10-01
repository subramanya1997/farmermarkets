import test from 'node:test';import assert from 'node:assert/strict';
import {dateSupported,currentRoster,itemEvidence,richIdentity,programSupported} from './parallel-rich-evidence.mjs';
const market={name:'Sunnyside Farmers Market',location:{city:'Granger',state:'Washington'}};
const official='https://market.test/sunnyside';
const basis=(field,text,confidence='high',url=official)=>[{field,confidence,citations:[{url,excerpts:[text]}]}];
test('dates require explicit nearby year, reject footer-only year, invalid calendars and inferred dates',()=>{
 assert.ok(dateSupported('2026-10-11','Harvest Festival October 11, 2026'));
 assert.ok(dateSupported('2026-10-11','2026 Events: Harvest Festival October 11th'));
 assert.ok(dateSupported('2026-10-11','Harvest Festival 10/11/2026'));
 assert.equal(dateSupported('2026-10-11','Harvest Festival October 11. Copyright 2026'),false);
 assert.equal(dateSupported('2026-02-30','February 30, 2026'),false);
 assert.equal(dateSupported('2026-10-11','October 11, 2025'),false);
});
test('current roster requires explicit applicable period, not an expired list or footer year',()=>{
 const r={period:'2026 season: May 5–September 29',start_date:'2026-05-05',end_date:'2026-09-29'};
 assert.equal(currentRoster(r,'2026-09-30',r.period),false);
 const current={period:'2026 current vendors',start_date:'',end_date:''};assert.ok(currentRoster(current,'2026-09-30',current.period));
 assert.equal(currentRoster({...current,period:'Vendors'},'2026-09-30','Vendors. Copyright 2026'),false);
});
test('individual evidence cannot borrow another array item or model quotation without actual matching citation',()=>{
 const item={name:'Apple Farm',source_url:official,evidence_excerpt:'Sunnyside Farmers Market vendors in Granger: Apple Farm'};
 assert.equal(itemEvidence(market,official,basis('vendor_roster.1.name',item.evidence_excerpt),'vendor_roster.0',item).length,0);
 assert.equal(itemEvidence(market,official,basis('vendor_roster','Completely unrelated official source text'),'vendor_roster.0',item).length,0);
 assert.equal(itemEvidence(market,official,basis('vendor_roster',item.evidence_excerpt,'medium'),'vendor_roster.0',item).length,0);
 assert.equal(itemEvidence(market,official,basis('vendor_roster',item.evidence_excerpt),'vendor_roster.0',item).length,1);
});
test('identity requires exact named market/locality on input host, not street mentions',()=>{
 const out={identity_match:'exact_market',identity_evidence:'Sunnyside Farmers Market, Granger, Washington'};
 assert.ok(richIdentity(market,official,out,basis('identity_evidence',out.identity_evidence)));
 assert.equal(richIdentity(market,official,{...out,identity_evidence:'Granger Farmers Market at 121 Sunnyside Avenue'},basis('identity_evidence','Granger Farmers Market at 121 Sunnyside Avenue')),false);
});
test('shared official operators cannot lend identity to unrelated event or vendor pages',()=>{
 const identity=basis('identity_evidence','Sunnyside Farmers Market, Granger, Washington');
 const item={name:'Blue Farm',source_url:'https://market.test/other-town',evidence_excerpt:'Other Town Farmers Market vendors: Blue Farm, 2026 season'};
 const b=[...identity,...basis('vendor_roster.0',item.evidence_excerpt,'high',item.source_url)];
 assert.equal(itemEvidence(market,official,b,'vendor_roster.0',item).length,0);
 const own={...item,source_url:official,evidence_excerpt:'This market vendors: Blue Farm, 2026 season'};
 assert.equal(itemEvidence(market,official,[...identity,...basis('vendor_roster.0',own.evidence_excerpt)],'vendor_roster.0',own).length,1);
});
test('program current year must be near its name, not inferred from copyright',()=>{
 const p={name:'Power of Produce',year:'2026',description:'Kids receive tokens'};
 assert.ok(programSupported(p,'2026-09-30','2026 Power of Produce. Kids receive tokens'));
 assert.equal(programSupported(p,'2026-09-30','Power of Produce. Kids receive tokens. Copyright 2026'),false);
});
test('same-named city in another state and lowercase prose postal lookalikes fail identity',()=>{
 const m={name:'Portland Farmers Market',location:{city:'Portland',state:'Oregon'}};
 const quote='Portland Farmers Market in Maine; buy produce or flowers';
 assert.equal(richIdentity(m,official,{identity_match:'exact_market',identity_evidence:quote},basis('identity_evidence',quote)),false);
 const correct='Portland Farmers Market, Portland, OR';
 assert.ok(richIdentity(m,official,{identity_match:'exact_market',identity_evidence:correct},basis('identity_evidence',correct)));
});
