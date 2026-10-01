#!/usr/bin/env node
// Rank saved analytics evidence; no external requests or paid mutations.
import fs from 'node:fs/promises';
import { authoritative } from './lib/parallel-evidence.mjs';
const markets = JSON.parse(await fs.readFile('public/data/farmers_markets.json','utf8'));
const gsc = JSON.parse(await fs.readFile('.gstack/audits/2026-09-30/evidence/gsc-all-pages.json','utf8'));
const ga = JSON.parse(await fs.readFile('.gstack/audits/2026-09-30/evidence/ga-landingPage-1000.json','utf8'));
const search = new Map(gsc.rows.map(r=>[new URL(r.keys[0]).pathname,{clicks:r.clicks,impressions:r.impressions}]));
const sessions = new Map(ga.rows.map(r=>[r.key,r.sessions]));
const rich = new Set();
for(const file of (await fs.readdir('data/enrichment')).filter(n=>/^research-.+\.json$/.test(n))) {
  for(const r of JSON.parse(await fs.readFile(`data/enrichment/${file}`,'utf8'))) if(r.first_party) rich.add(String(r.id));
}
const ranked = markets.filter(m=>['US','CA'].includes(m.country_code)&&m.name&&m.location?.city&&m.contact?.websites?.some(authoritative))
  .map(m=>{const pathname=`/markets/${m.slug}`;return {id:String(m.id),name:m.name,slug:m.slug,country_code:m.country_code,official_website:m.contact.websites.find(authoritative),...search.get(pathname),sessions:sessions.get(pathname)||0,existing_rich:rich.has(String(m.id))};})
  .map(r=>({...r,clicks:r.clicks||0,impressions:r.impressions||0}))
  .sort((a,b)=>b.clicks-a.clicks||b.sessions-a.sessions||b.impressions-a.impressions||Number(a.existing_rich)-Number(b.existing_rich)||a.id.localeCompare(b.id));
const dir='data/enrichment/parallel/september-rich-selection';
await fs.mkdir(dir,{recursive:true});
await fs.writeFile('.gstack/audits/2026-09-30/evidence/rich-ranked-private.json',JSON.stringify(ranked,null,2)+'\n');
await fs.writeFile(`${dir}/ranked.json`,JSON.stringify(ranked.map((record,i)=>Object.fromEntries([...Object.entries(record).filter(([key])=>!['clicks','impressions','sessions'].includes(key)),['rank',i+1]])),null,2)+'\n');
await fs.writeFile(`${dir}/ids.json`,JSON.stringify(ranked.slice(0,980).map(r=>r.id),null,2)+'\n');
const selected=ranked.slice(0,980);
console.log(JSON.stringify({eligible:ranked.length,selected:selected.length,with_clicks:selected.filter(r=>r.clicks).length,with_sessions:selected.filter(r=>r.sessions).length,with_impressions:selected.filter(r=>r.impressions).length,existing_rich:selected.filter(r=>r.existing_rich).length,ranking:'clicks, GA sessions, impressions, missing rich facts, stable ID'},null,2));
