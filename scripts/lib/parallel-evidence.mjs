// Deliberately conservative: model reasoning is not published evidence.
export const confidenceRank = { low: 0, medium: 1, high: 2 };
export function host(url) {
  try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase().replace(/^www\./, '') : ''; } catch { return ''; }
}
const banned = ['facebook.com', 'instagram.com', 'google.com', 'goo.gl', 'yelp.com', 'tripadvisor.com', 'yellowpages.com', 'mapquest.com', 'localharvest.org', 'ams.usda.gov', 'x.com', 'twitter.com', 'linktr.ee', 'harvestlymarkets.com', 'nfmd.org', 'farmersmarketonline.com', 'farmspread.com'];
export function authoritative(url) {
  const h = host(url);
  return h && !banned.some(b => h === b || h.endsWith(`.${b}`));
}
export function snippet(citation) {
  return Array.isArray(citation?.excerpts) ? citation.excerpts.filter(s => typeof s === 'string').join(' ') : '';
}
const normalize = value => String(value).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const contains = (text, value) => (` ${normalize(text)} `).includes(` ${normalize(value)} `);
export function identitySupported(market, citations) {
  const text = citations.map(snippet).join(' ');
  if (!market?.name || !market.location?.city || !contains(text, market.location.city)) return false;
  if (contains(text, market.name)) return true;
  const tokens = [...new Set(normalize(market.name).split(' ').filter(t => t.length > 2 && !['the', 'farmers', 'farmer', 'market', 'markets', 'certified', 'cfm', 'and', 'community'].includes(t)))];
  if (tokens.length === 1) {
    // A street such as '121 Sunnyside Ave' beside 'Granger Farmers Market'
    // does not identify a market named Sunnyside Farmers Market.
    const name = tokens[0];
    return ['farmers market', 'certified farmers market', 'farm market', 'farm stand'].some(kind => contains(text, `${name} ${kind}`) || contains(text, `${kind} ${name}`));
  }
  return tokens.length > 1 && tokens.every(t => contains(text, t));
}
export function qualifiedCitations(basis, minConfidence = 'high') {
  if (!basis || (confidenceRank[basis.confidence] ?? -1) < confidenceRank[minConfidence]) return [];
  return (basis.citations || []).filter(c => host(c.url) && snippet(c).trim());
}
export function authorityContext(market, output, basisByField, minConfidence = 'high') {
  const site = (output.official_website || '').trim();
  if (!authoritative(site)) return null;
  const h = host(site);
  const status = qualifiedCitations(basisByField.get('status'), 'high').filter(c => authoritative(c.url) && host(c.url) === h);
  const website = qualifiedCitations(basisByField.get('official_website'), minConfidence).filter(c => authoritative(c.url) && host(c.url) === h);
  const identity = [...basisByField.values()].flatMap(b => qualifiedCitations(b, minConfidence)).filter(c => authoritative(c.url) && host(c.url) === h);
  const statusText = status.map(snippet).join(' ');
  if (/permanently closed|no longer (?:operating|open)|ceased operations/i.test(statusText)) return null;
  if (!status.length || !website.length || !identitySupported(market, identity)) return null;
  return { host: h, status, website };
}
function scheduleText(value) {
  return normalize(String(value).toLowerCase().replace(/\ba\s*\.\s*m\.?/g, 'am').replace(/\bp\s*\.\s*m\.?/g, 'pm').replace(/\bnoon\b/g, '12pm').replace(/\b(\d{1,2}):00\b/g, '$1').replace(/\b0(\d)(?=[:ap])/g, '$1').replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/g, (_, day) => day.slice(0, 3))).replace(/(\d)\s+(am|pm)\b/g, '$1$2');
}
export function fieldSupported(field, value, citations) {
  const evidence = citations.map(snippet).join(' ');
  if (field === 'phone') {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 7 && evidence.replace(/\D/g, '').includes(digits);
  }
  if (field === 'schedule') {
    // Every day, hour, date, month and qualifier must appear in the published excerpts.
    const published = scheduleText(evidence);
    const words = scheduleText(value).split(' ').filter(w => !['every', 'from', 'to', 'through', 'on', 'at', 'and', 'the', 'open', 'only'].includes(w));
    return words.length > 0 && words.every(w => (` ${published} `).includes(` ${w} `));
  }
  if (field === 'season') {
    if (/^year[ -]?round$/i.test(value)) return /year[ -]?round|open all year|all year[ -]?round/i.test(evidence);
    return contains(evidence, value);
  }
  if (field === 'facebook_url' || field === 'instagram_url') {
    const wanted = new URL(value);
    return citations.some(c => { const u = new URL(c.url); return host(c.url) === host(value) && u.pathname.replace(/\/$/, '').toLowerCase() === wanted.pathname.replace(/\/$/, '').toLowerCase(); }) || evidence.includes(value);
  }
  return field === 'official_website';
}
