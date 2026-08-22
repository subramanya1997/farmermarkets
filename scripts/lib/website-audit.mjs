import crypto from 'node:crypto';

export const WEBSITE_AUDIT_SCHEMA_VERSION = 1;
export const WEBSITE_AUDIT_SHARD_COUNT = 16;

const SOCIAL_HOSTS = new Set([
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'tiktok.com',
  'twitter.com',
  'x.com',
  'youtube.com',
]);

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function normalizedHost(value) {
  const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  return host;
}

export function isWebsiteAuditCandidate(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const host = normalizedHost(url);
    if (SOCIAL_HOSTS.has(host) || host === 'maps.app.goo.gl') return false;
    if (/(^|\.)google\.[a-z.]+$/i.test(host) && url.pathname.toLowerCase().includes('/maps')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function normalizeWebsiteUrl(value) {
  const url = new URL(value);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
  }
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
    url.port = '';
  }
  url.pathname = url.pathname.replace(/\/{2,}/g, '/');
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/$/, '');
  url.searchParams.sort();
  return url.toString();
}

export function marketRowKey(sourceKind, market) {
  if (!['legacy', 'government'].includes(sourceKind)) {
    throw new Error(`Unsupported source kind: ${sourceKind}`);
  }
  if (!market.slug) throw new Error(`Market ${market.id} has no slug`);
  return `${sourceKind}:${String(market.id)}:${market.slug}`;
}

export function websiteTargetId(normalizedUrl) {
  // Treat HTTP and HTTPS spellings as one page target while retaining every
  // original seed URL for the browser worker's ordered attempts.
  const schemeIndependentKey = normalizedUrl.replace(/^https?:\/\//i, '');
  return sha256(`website-audit:v1:url:${schemeIndependentKey}`);
}

export function websiteShardForHost(host, shardCount = WEBSITE_AUDIT_SHARD_COUNT) {
  const digest = crypto.createHash('sha256').update(`website-audit:v1:${host}`).digest();
  return digest.readUInt32BE(0) % shardCount;
}

export function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, entry]) => [key, stableJson(entry)])
  );
}

export function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function serializeJsonl(values) {
  return values.map((value) => JSON.stringify(value)).join('\n') + (values.length ? '\n' : '');
}

function normalizedWords(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

const GENERIC_NAME_WORDS = new Set([
  'and', 'at', 'community', 'downtown', 'farm', 'farmer', 'farmers', 'in',
  'local', 'market', 'markets', 'marketplace', 'of', 'the',
]);

export function marketIdentityDecision(row, snapshot) {
  const headings = Array.isArray(snapshot.h1)
    ? snapshot.h1
    : typeof snapshot.h1 === 'string'
      ? [snapshot.h1]
      : [];
  const searchable = [snapshot.title, ...headings, snapshot.main_text]
    .filter(Boolean)
    .join(' ');
  const pageWords = new Set(normalizedWords(searchable));
  const nameWords = normalizedWords(row.market_name).filter((word) => !GENERIC_NAME_WORDS.has(word));
  const nameMatches = nameWords.length
    ? nameWords.filter((word) => pageWords.has(word)).length / nameWords.length >= 0.75
    : pageWords.has('market');
  const cityWords = normalizedWords(row.location?.city);
  const zip = String(row.location?.zip_code ?? '').trim();
  const normalizedPage = normalizedWords(searchable).join(' ');
  const localityMatches = Boolean(
    (zip && normalizedPage.includes(zip.toLowerCase())) ||
    (cityWords.length && cityWords.every((word) => pageWords.has(word)))
  );
  return {
    identity_match: nameMatches && localityMatches,
    name_match: nameMatches,
    locality_match: localityMatches,
  };
}

const EVIDENCE_PATTERNS = {
  schedule: /\b(?:hours?|open|monday|tuesday|wednesday|thursday|friday|saturday|sunday|year[- ]round|season)\b/i,
  payment: /\b(?:cash|credit|debit|contactless|apple pay|market coins?|tokens?|payment)\b/i,
  assistance: /\b(?:snap|ebt|wic|fmnp|sfmnp|calfresh|double up|market match|food bucks|voucher)\b/i,
  parking: /\b(?:parking|garage|park and ride|disabled placard)\b/i,
  transit: /\b(?:transit|bus|rail|bart|muni|ferry|station|streetcar|metro|train)\b/i,
  accessibility: /\b(?:accessible|accessibility|wheelchair|ada|drop[- ]?off|flat surface|paved)\b/i,
  pets: /\b(?:pets?|dogs?|service animals?|live animals?)\b/i,
  amenities: /\b(?:restrooms?|toilets?|seating|shade|drinking water|atm|information booth|info booth|valet)\b/i,
  weather: /\b(?:rain or shine|weather|cancel(?:led|lation)?|storm|heat advisory)\b/i,
  vendors: /\b(?:vendors?|sellers?|farms?|producer(?:s| only)?|lineup|roster)\b/i,
  products: /\b(?:produce|fruit|vegetables?|meat|dairy|eggs?|prepared food|baked goods?|flowers?|honey|crafts?)\b/i,
  programs: /\b(?:kids?|children|music|cooking demo|education|workshop|activities|programs?)\b/i,
  languages: /\b(?:language|translated|translation|español|中文|日本語|русский|tiếng việt)\b/i,
  faq: /(?:^|\b)(?:faq|frequently asked|q(?:uestion)?\s*:|a(?:nswer)?\s*:|can i|do you|is there|are there|what (?:should|can|do)|where (?:can|do|is)|how (?:can|do)|when (?:is|does))\b/i,
};

export function extractEvidenceExcerpts(text, maxPerKind = 4) {
  const lines = String(text ?? '')
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 12 && line.length <= 700);
  const excerpts = [];
  for (const [kind, pattern] of Object.entries(EVIDENCE_PATTERNS)) {
    if (kind === 'faq') {
      let count = 0;
      for (let index = 0; index < lines.length && count < maxPerKind; index += 1) {
        const line = lines[index];
        const inline = line.match(/^\s*(?:Q(?:uestion)?\s*:\s*)?(.+?\?)\s*(?:A(?:nswer)?\s*:\s*)(.{10,350})$/i);
        const question = inline?.[1] ?? (/\?\s*$/.test(line) ? line : undefined);
        const next = inline?.[2] ?? lines[index + 1];
        if (!question || !next || /\?\s*$/.test(next)) continue;
        if (!/\b(?:access|ada|arriv|bring|buy|cash|card|dog|ebt|hour|market|open|park|pay|pet|product|rain|restroom|sell|snap|transit|weather|wheelchair|wic)\b/i.test(question)) continue;
        if (/\b(?:apply|application|become a vendor|booth|insurance|vendor fee)\b/i.test(question)) continue;
        const excerpt = `Q: ${question.replace(/^Q(?:uestion)?\s*:\s*/i, '')} A: ${next.replace(/^A(?:nswer)?\s*:\s*/i, '')}`.slice(0, 500);
        excerpts.push({ kind, excerpt, text_hash: sha256(`${question}\n${next}`) });
        count += 1;
        if (!inline) index += 1;
      }
      continue;
    }
    let count = 0;
    for (const line of lines) {
      if (!pattern.test(line)) continue;
      excerpts.push({ kind, excerpt: line.slice(0, 500), text_hash: sha256(line) });
      count += 1;
      if (count >= maxPerKind) break;
    }
  }
  return excerpts;
}
