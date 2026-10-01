import {host,authoritative,identitySupported,qualifiedCitations,snippet} from './parallel-evidence.mjs';
export const normalize = x=>String(x||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/(\d)(?:st|nd|rd|th)\b/g,'$1').replace(/[^a-z0-9]+/g,' ').trim();
export const contains = (text,value)=>Boolean(normalize(value))&&(` ${normalize(text)} `).includes(` ${normalize(value)} `);
export const realDate = value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const clean = text=>String(text).replace(/(?:copyright|©|&copy;)[^\n|]{0,100}/gi,'');
const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
export function richMarketAssignment(market,citations) {
 if(identitySupported(market,citations))return true;
 const text=normalize(citations.map(snippet).join(' '));
 if(!contains(text,market.location?.city))return false;
 const tokens=[...new Set(normalize(market.name).split(' ').filter(t=>t.length>2&&!['the','farmers','farmer','market','markets','certified','cfm','and','community','farm','farms','stand'].includes(t)))];
 if(tokens.length===1)return ['farmers market','certified farmers market','farm market','farm stand','farm','farms'].some(k=>contains(text,`${tokens[0]} ${k}`)||contains(text,`${k} ${tokens[0]}`));
 return tokens.length>1&&tokens.every(t=>new RegExp(`\\b${t.replace(/s$/,'')}s?\\b`).test(text));
}
export function dateSupported(date,text) {
 if(!realDate(date))return false;
 const [year,month,day]=date.split('-');const d=String(Number(day));const m=String(Number(month));const n=normalize(clean(text));
 if(contains(n,date)||contains(n,`${m} ${d} ${year}`)||contains(n,`${d} ${m} ${year}`)) return true;
 const word=months[Number(month)-1];const forms=[word,word.slice(0,3),...(word==='september'?['sept']:[])];
 // An explicit season/page year can precede or follow the date, but must be
 // in the same nearby excerpt; a remote copyright year never supplies it.
 return forms.some(w=>new RegExp(`\\b(?:${w} ${d}|${d} ${w})\\b.{0,80}\\b${year}\\b|\\b${year}\\b.{0,80}\\b(?:${w} ${d}|${d} ${w})\\b`).test(n));
}
const fieldPath = x=>String(x||'').replace(/\[(\d+)\]/g,'.$1');
export function citationsFor(basis,field,url,official) {
 const group=field.split('.')[0];const wanted=new URL(url).href;
 return (basis||[]).filter(b=>{const p=fieldPath(b.field);return p===group||p===field||p.startsWith(`${field}.`);})
 .flatMap(b=>qualifiedCitations(b)).filter(c=>authoritative(c.url)&&host(c.url)===host(official)&&new URL(c.url).href===wanted);
}
export function richIdentity(market,official,out,basis) {
 if(!authoritative(official)||out.identity_match!=='exact_market')return false;
 const citations=(basis||[]).filter(b=>['identity_match','identity_evidence'].includes(b.field)).flatMap(b=>qualifiedCitations(b)).filter(c=>host(c.url)===host(official)&&authoritative(c.url));
 const text=citations.map(snippet).join(' ');
 const aliases=Object.fromEntries('Alabama:AL|Alaska:AK|Arizona:AZ|Arkansas:AR|California:CA|Colorado:CO|Connecticut:CT|Delaware:DE|District of Columbia:DC|Florida:FL|Georgia:GA|Hawaii:HI|Idaho:ID|Illinois:IL|Indiana:IN|Iowa:IA|Kansas:KS|Kentucky:KY|Louisiana:LA|Maine:ME|Maryland:MD|Massachusetts:MA|Michigan:MI|Minnesota:MN|Mississippi:MS|Missouri:MO|Montana:MT|Nebraska:NE|Nevada:NV|New Hampshire:NH|New Jersey:NJ|New Mexico:NM|New York:NY|North Carolina:NC|North Dakota:ND|Ohio:OH|Oklahoma:OK|Oregon:OR|Pennsylvania:PA|Rhode Island:RI|South Carolina:SC|South Dakota:SD|Tennessee:TN|Texas:TX|Utah:UT|Vermont:VT|Virginia:VA|Washington:WA|West Virginia:WV|Wisconsin:WI|Wyoming:WY|Alberta:AB|British Columbia:BC|Manitoba:MB|New Brunswick:NB|Newfoundland and Labrador:NL|Nova Scotia:NS|Ontario:ON|Prince Edward Island:PE|Quebec:QC|Saskatchewan:SK'.split('|').map(x=>x.split(':')));
 const state=market.location?.state;const zip=market.location?.zip_code?.split('-')[0];
 const postal=aliases[state]||(/^[A-Z]{2}$/.test(state||'')?state:undefined);
 // 'in', 'or', 'me' in prose are not postal evidence for IN/OR/ME.
 const locality=(state?.length>2&&contains(text,state))||Boolean(postal&&new RegExp(`\\b${postal}\\b`).test(text))||Boolean(zip&&zip.length>=5&&contains(text,zip));
 // Only the high-confidence published citation establishes identity. The
 // model's assembled identity_evidence string is a hint, never proof itself.
 return locality&&richMarketAssignment(market,citations);
}
export function itemEvidence(market,official,basis,field,item) {
 if(!authoritative(item.source_url)||host(item.source_url)!==host(official)||typeof item.evidence_excerpt!=='string'||item.evidence_excerpt.length<25)return [];
 let citations;try{citations=citationsFor(basis,field,item.source_url,official);}catch{return [];}
 return citations.filter(c=>{
  const text=snippet(c);const quote=item.evidence_excerpt;
  const parts=quote.split(/(?:\.\.\.|…)/).map(s=>s.trim()).filter(s=>s.length>12);
  const identityCites=(basis||[]).filter(b=>['identity_match','identity_evidence'].includes(b.field)).flatMap(b=>qualifiedCitations(b)).filter(ic=>host(ic.url)===host(official)&&new URL(ic.url).href===new URL(c.url).href);
  const assigned=richMarketAssignment(market,[c])||richMarketAssignment(market,identityCites);
  return assigned&&parts.length>0&&parts.every(p=>contains(text,p))&&(!item.name||contains(text,item.name));
 });
}
export function currentRoster(item,asOf,text) {
 if(!item.period||normalize(item.period).length<10||!contains(clean(text),item.period))return false;
 // Published explicit season bounds stop expired summer lists looking current.
 if(item.start_date||item.end_date) return realDate(item.start_date)&&realDate(item.end_date)&&item.start_date<=asOf&&item.end_date>=asOf&&dateSupported(item.start_date,text)&&dateSupported(item.end_date,text);
 return contains(clean(text),asOf.slice(0,4))&&/\b(?:current|year[ -]?round)\b/i.test(item.period)&&contains(clean(text),item.period);
}
export function programSupported(item,asOf,text) {
 const n=normalize(clean(text));const name=normalize(item.name);const year=asOf.slice(0,4);
 if(item.year!==year||!name||!contains(text,item.description))return false;
 const at=n.indexOf(name);return at>=0&&contains(n.slice(Math.max(0,at-100),at+name.length+150),year);
}
