/**
 * Matching a public register row (USDA SNAP retailers, Overture places) to a
 * directory listing, and the small URL/phone helpers the register batches
 * share. Everything here fails closed: a doubtful match adds nothing.
 */

const GENERIC = new Set([
  'farmers', 'farmer', 'farm', 'market', 'markets', 'mkt', 'the', 'at', 'of', 'and', 'in', 'on', 'for', 'a',
  'fm', 'cfm', 'certified', 'community', 'llc', 'inc', 'co', 'association', 'assoc',
]);

/** Words that identify one market among others: lowercased, accents and possessives dropped, generic words removed. */
export function distinctiveTokens(name) {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['‘’]s\b/g, '')
    .replace(/['‘’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !GENERIC.has(word) && !/^\d+fm\d+$/.test(word));
}

export function distanceMeters(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const x = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  const y = (lat2 - lat1) * rad;
  return 6371000 * Math.hypot(x, y);
}

function similarity(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * How a listing and a register row relate: 'exact' (same distinctive words,
 * within 1 km), 'near' (most words shared, within 250 m) or null.
 */
export function matchKind(listingName, registerName, meters) {
  const score = similarity(distinctiveTokens(listingName), distinctiveTokens(registerName));
  if (score === 1 && meters <= 1000) return 'exact';
  if (score >= 0.6 && meters <= 250) return 'near';
  return null;
}

const cell = (lat, lon) => `${Math.round(lat * 50)}:${Math.round(lon * 50)}`;

/**
 * One-to-one matches between listings and register rows. A pair is kept only
 * when each side is the other's single best candidate; a listing with two
 * equally good register rows (or the reverse) gets nothing.
 *
 * `listings` and `rows` need `{ name, lat, lon }`; returns `[listing, row, meters, kind]`.
 */
export function matchRegister(listings, rows) {
  const grid = new Map();
  for (const row of rows) {
    if (!Number.isFinite(row.lat) || !Number.isFinite(row.lon)) continue;
    const key = cell(row.lat, row.lon);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(row);
  }
  const rank = (kind, meters) => (kind === 'exact' ? 0 : 1) * 1e7 + meters;
  const bestForListing = new Map();
  const bestForRow = new Map();
  const tied = new Set();
  for (const listing of listings) {
    if (!Number.isFinite(listing.lat) || !Number.isFinite(listing.lon)) continue;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const key = `${Math.round(listing.lat * 50) + dy}:${Math.round(listing.lon * 50) + dx}`;
        for (const row of grid.get(key) ?? []) {
          const meters = distanceMeters(listing.lat, listing.lon, row.lat, row.lon);
          const kind = matchKind(listing.name, row.name, meters);
          if (!kind) continue;
          const score = rank(kind, meters);
          for (const [index, self, other] of [[bestForListing, listing, row], [bestForRow, row, listing]]) {
            const current = index.get(self);
            if (!current || score < current.score) index.set(self, { other, score, meters, kind });
            else if (current.other !== other && Math.abs(score - current.score) < 25) tied.add(self);
          }
        }
      }
    }
  }
  const pairs = [];
  for (const [listing, best] of bestForListing) {
    if (tied.has(listing) || tied.has(best.other)) continue;
    if (bestForRow.get(best.other)?.other !== listing) continue;
    pairs.push([listing, best.other, Math.round(best.meters), best.kind]);
  }
  return pairs;
}

const SOCIAL_HOSTS = { 'facebook.com': 'facebook', 'instagram.com': 'instagram' };

/** 'facebook' | 'instagram' | null for a URL. */
export function socialPlatform(value) {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^(?:www|m|web|business)\./, '');
    return SOCIAL_HOSTS[host] ?? null;
  } catch {
    return null;
  }
}

const FACEBOOK_NON_PROFILE = /^(?:sharer(?:\.php)?|share|tr|plugins|dialog|login(?:\.php)?|profile\.php|events?|groups|photos?|posts?|watch|reels?|hashtag|help|policies|privacy|legal|2008|home\.php|pages|people|p|l\.php|v\d+\.\d+|business|ads|marketplace|gaming|stories|story\.php|permalink\.php|media|sharer|search)$/i;
const INSTAGRAM_NON_PROFILE = /^(?:p|reels?|stories|explore|accounts|tv|about|developer|legal|direct|share|web)$/i;

/**
 * A profile link as `https://www.facebook.com/{handle}` or
 * `https://www.instagram.com/{handle}`, or null for anything that is not one
 * plain profile (share buttons, posts, events, groups, tracking pixels).
 */
export function canonicalProfileUrl(value) {
  const platform = socialPlatform(value);
  if (!platform) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const parts = url.pathname.split('/').filter(Boolean);
  const handle = parts[0];
  if (!handle || parts.length > 1) return null;
  if (!/^[A-Za-z0-9._-]{2,80}$/.test(handle)) return null;
  if (platform === 'facebook' && FACEBOOK_NON_PROFILE.test(handle)) return null;
  if (platform === 'instagram' && INSTAGRAM_NON_PROFILE.test(handle)) return null;
  return `https://www.${platform}.com/${handle}`;
}

const VENUE_WORDS = new Set(['city', 'town', 'county', 'village', 'township', 'downtown', 'center', 'centre', 'plaza', 'park', 'square', 'mall', 'street', 'main']);

const squash = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Whether a profile handle reads as this market's own page rather than its
 * city's, chamber's or extension office's: the handle must say "market" (or
 * be the market website's own name) and carry one of the market's
 * distinctive words or its town.
 */
export function handleBelongsToMarket(profileUrl, { name, city, websiteHost }) {
  const handle = squash(new URL(profileUrl).pathname);
  if (handle.length < 4 || /^\d+$/.test(handle)) return false;
  const host = String(websiteHost ?? '').toLowerCase().replace(/^www\./, '');
  const site = squash(host.split('.').slice(0, -1).join(''));
  const marketWords = /market|mkt|farmstand/.test(handle);
  const siteIsMarket = /market|mkt|farmstand/.test(site);
  if (site.length >= 6 && siteIsMarket && (handle === site || handle.includes(site) || site.includes(handle))) return true;

  const nameWords = distinctiveTokens(name).filter((word) => word.length >= 4);
  const cityWords = new Set(distinctiveTokens(city));
  // A farm or stand whose site and profile share one name: the site must be
  // the business's own (not a .gov or .edu host) and carry a word from the
  // listing's name that is more than the town's name, or a farm word.
  if (
    handle === site &&
    site.length >= 6 &&
    !/\.(?:gov|edu|us)$/.test(host) &&
    !/^(?:cityof|townof|villageof|countyof|visit|discover|downtown|explore)/.test(site)
  ) {
    const own = nameWords.filter((word) => !cityWords.has(word) && !VENUE_WORDS.has(word) && site.includes(word));
    const covered = own.reduce((total, word) => total + word.length, 0) / site.length;
    const farmSite = /farm|berry|orchard|produce|grange|harvest|acres/.test(site);
    if (covered >= 0.75 || (farmSite && nameWords.some((word) => !VENUE_WORDS.has(word) && site.includes(word)))) {
      return true;
    }
  }
  if (!marketWords) return false;
  const words = [...nameWords, ...distinctiveTokens(city).filter((word) => word.length >= 4)];
  if (words.some((word) => handle.includes(word))) return true;
  // "GFFarmersMarket" for Glens Falls Farmers' Market: initials plus the market words.
  const initials = distinctiveTokens(name).map((word) => word[0]).join('');
  const rest = handle.replace(/farmers?|markets?|mkt|the/g, '');
  return initials.length >= 2 && rest === initials;
}

/** US phone as 555-123-4567, or null. */
export function formatUsPhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

const NOT_A_MARKET_SITE = /(?:^|\.)(?:facebook|instagram|twitter|x|tiktok|youtube|linkedin|pinterest|google|goo|yelp|tripadvisor|foursquare|localharvest|linktr|eventbrite|etsy|square|squareup|wixsite|blogspot|wordpress|weebly|business\.site|mapquest|nextdoor|yellowpages|bing|apple|amazon|usda|bit)\.[a-z.]+$/i;

/** A place's website worth showing as the market's own: http(s), not a social network, directory, link hub or map. */
export function usableWebsite(value) {
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return null;
  if (NOT_A_MARKET_SITE.test(url.hostname)) return null;
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_|fbclid|gclid|ref$|mc_)/i.test(key)) url.searchParams.delete(key);
  }
  return url.href;
}
