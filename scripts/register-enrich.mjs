#!/usr/bin/env node

/**
 * Fill gaps on existing US listings from free public sources. Each command
 * writes one register batch under data/enrichment/ (see README there):
 *
 *   node scripts/register-enrich.mjs snap
 *       USDA SNAP Retailer Locator, store type "Farmers and Markets":
 *       sets the SNAP flag on listings the register matches.
 *   node scripts/register-enrich.mjs overture --input <places.json>
 *       Overture Maps places (export with scripts/overture-places.sql):
 *       Facebook page, phone and website where the listing has none.
 *   node scripts/register-enrich.mjs websites
 *       Reads each listing's own home page for the market's Facebook and
 *       Instagram profiles.
 *
 * Add --dry-run to print counts without writing. Run `npm run data:enrichment`
 * afterwards. Re-running a command rebuilds its batch from scratch: values a
 * register batch supplied earlier are not counted as already present.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  canonicalProfileUrl,
  formatUsPhone,
  handleBelongsToMarket,
  matchRegister,
  socialPlatform,
  usableWebsite,
} from './lib/register-match.mjs';

const root = process.cwd();
const enrichmentDir = path.join(root, 'data/enrichment');
const datasetPath = path.join(root, 'public/data/farmers_markets.json');
const today = new Date().toISOString().slice(0, 10);
const USER_AGENT = 'Mozilla/5.0 (compatible; farmers-market-directory-check)';

const SNAP_SERVICE =
  'https://services1.arcgis.com/RLQu0rK7h4kbsBq5/arcgis/rest/services/snap_retailer_location_data/FeatureServer/0/query';
const SNAP_SOURCE = {
  title: 'USDA SNAP Retailer Locator, store type Farmers and Markets',
  url: 'https://www.fns.usda.gov/snap/retailer-locator',
};

const args = process.argv.slice(2);
const command = args[0];
const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1] ?? true;
};
const dryRun = args.includes('--dry-run');

const phoneDigits = (value) => String(value).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');

/** US listings as the site publishes them, minus anything an earlier register batch supplied. */
async function loadListings() {
  const markets = JSON.parse(await fs.readFile(datasetPath, 'utf8'));
  const names = (await fs.readdir(enrichmentDir)).filter((name) => /^register-.+\.json$/.test(name));
  const supplied = new Map();
  for (const name of names) {
    for (const record of JSON.parse(await fs.readFile(path.join(enrichmentDir, name), 'utf8'))) {
      const entry = supplied.get(String(record.id)) ?? { urls: new Set(), phones: new Set(), snap: false };
      for (const url of [...(record.contact?.websites ?? []), ...(record.contact?.social_media ?? [])]) entry.urls.add(url);
      for (const phone of record.contact?.phone_numbers ?? []) entry.phones.add(phoneDigits(phone));
      if (record.payment?.food_assistance?.snap) entry.snap = true;
      supplied.set(String(record.id), entry);
    }
  }
  return markets
    .filter((market) => market.country_code === 'US')
    .filter((market) => market.first_party?.operations?.status?.value?.value !== 'permanently_closed')
    .map((market) => {
      const prior = supplied.get(String(market.id));
      const keep = (url) => !prior?.urls.has(url);
      const coordinates = market.location?.coordinates ?? {};
      return {
        id: String(market.id),
        name: market.name,
        city: market.location?.city ?? '',
        lat: Number(coordinates.latitude),
        lon: Number(coordinates.longitude),
        websites: (market.contact?.websites ?? []).filter(keep),
        socials: (market.contact?.social_media ?? []).filter(keep),
        phones: (market.contact?.phone_numbers ?? []).filter((phone) => !prior?.phones.has(phoneDigits(phone))),
        snap: market.payment?.food_assistance?.snap === true && !prior?.snap,
      };
    });
}

function record(listing, fields, sources) {
  return {
    id: listing.id,
    market_name: listing.name,
    verified_at: today,
    verification_scope: 'partial',
    ...fields,
    sources,
  };
}

async function writeBatch(name, records, summary) {
  records.sort((left, right) => left.id.localeCompare(right.id, 'en'));
  console.log(`${name}: ${records.length} records`, summary);
  if (dryRun) return;
  await fs.writeFile(path.join(enrichmentDir, name), `${JSON.stringify(records, null, 1)}\n`);
}

async function pool(items, size, work) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await work(items[index], index);
      }
    })
  );
  return results;
}

async function get(url, { timeout = 15000, bytes = 700000 } = {}) {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
  });
  const reader = response.body?.getReader();
  let text = '';
  if (reader && response.ok && /html|text/i.test(response.headers.get('content-type') ?? 'text/html')) {
    const decoder = new TextDecoder();
    while (text.length < bytes) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    reader.cancel().catch(() => {});
  } else {
    response.body?.cancel().catch(() => {});
  }
  return { status: response.status, finalUrl: response.url, text };
}

async function snap() {
  const listings = await loadListings();
  const rows = [];
  for (let offset = 0; ; ) {
    const query = new URLSearchParams({
      where: "Store_Type='Farmers and Markets'",
      outFields: 'Record_ID,Store_Name,City,State,Latitude,Longitude',
      returnGeometry: 'false',
      orderByFields: 'ObjectId',
      resultOffset: String(offset),
      resultRecordCount: '2000',
      f: 'json',
    });
    const page = await (await fetch(`${SNAP_SERVICE}?${query}`)).json();
    if (page.error) throw new Error(`SNAP service error: ${JSON.stringify(page.error)}`);
    const features = page.features ?? [];
    rows.push(...features.map(({ attributes }) => ({
      name: attributes.Store_Name,
      lat: attributes.Latitude,
      lon: attributes.Longitude,
    })));
    if (!features.length || !page.exceededTransferLimit) break;
    offset += features.length;
  }
  if (rows.length < 3000) throw new Error(`SNAP register returned only ${rows.length} rows; refusing to write`);
  const pairs = matchRegister(listings, rows);
  const records = pairs
    .filter(([listing]) => !listing.snap)
    .map(([listing]) =>
      record(listing, { payment: { food_assistance: { snap: true } } }, [
        { ...SNAP_SOURCE, fields: ['payment.food_assistance.snap'] },
      ])
    );
  await writeBatch('register-snap.json', records, { registerRows: rows.length, matched: pairs.length });
}

async function overture() {
  const input = flag('input');
  if (typeof input !== 'string') throw new Error('overture needs --input <places.json>');
  const release = typeof flag('release') === 'string' ? flag('release') : '2026-10-21.0';
  const source = { title: `Overture Maps places, release ${release}`, url: 'https://overturemaps.org/' };
  const listings = await loadListings();
  const places = JSON.parse(await fs.readFile(input, 'utf8'))
    .filter((place) => place.country === 'US')
    .filter((place) => !/closed/i.test(place.operating_status ?? ''))
    .filter((place) => (place.confidence ?? 0) >= 0.5);
  const pairs = matchRegister(listings, places);

  const drafts = [];
  for (const [listing, place] of pairs) {
    const fields = {};
    const facebook = (place.socials ?? []).map(canonicalProfileUrl).find((url) => url && socialPlatform(url) === 'facebook');
    if (facebook && !listing.socials.some((url) => socialPlatform(url) === 'facebook')) fields.social = facebook;
    const phone = (place.phones ?? []).map(formatUsPhone).find(Boolean);
    if (phone && !listing.phones.length) fields.phone = phone;
    const website = (place.websites ?? []).map(usableWebsite).find(Boolean);
    if (website && !listing.websites.length) fields.website = website;
    if (Object.keys(fields).length) drafts.push({ listing, fields });
  }

  // A dead or parked address is worse than no website: keep only ones that answer.
  const withSite = drafts.filter((draft) => draft.fields.website);
  let dropped = 0;
  await pool(withSite, 24, async (draft) => {
    try {
      const { status } = await get(draft.fields.website, { timeout: 12000, bytes: 0 });
      if (status >= 400 && ![401, 403, 405, 429, 503].includes(status)) throw new Error(String(status));
    } catch {
      delete draft.fields.website;
      dropped += 1;
    }
  });

  const records = drafts
    .filter((draft) => Object.keys(draft.fields).length)
    .map(({ listing, fields }) => {
      const contact = {
        ...(fields.website ? { websites: [fields.website] } : {}),
        ...(fields.phone ? { phone_numbers: [fields.phone] } : {}),
        ...(fields.social ? { social_media: [fields.social] } : {}),
      };
      return record(listing, { contact }, [{ ...source, fields: Object.keys(contact).map((key) => `contact.${key}`) }]);
    });
  const count = (key) => records.filter((item) => item.contact[key]).length;
  await writeBatch('register-overture.json', records, {
    places: places.length,
    matched: pairs.length,
    facebook: count('social_media'),
    phones: count('phone_numbers'),
    websites: count('websites'),
    websitesNotAnswering: dropped,
  });
}

function pageTitle(html, fallback) {
  const title = /<title[^>]*>([^<]{2,200})<\/title>/i.exec(html)?.[1]
    ?.replace(/&amp;/g, '&').replace(/&#0?39;|&apos;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  return title || fallback;
}

async function websites() {
  const listings = (await loadListings()).filter((listing) => {
    const platforms = new Set(listing.socials.map(socialPlatform));
    return listing.websites.length && !(platforms.has('facebook') && platforms.has('instagram'));
  });
  const stats = { pages: listings.length, fetched: 0, facebook: 0, instagram: 0, ambiguous: 0 };
  const records = [];
  await pool(listings, 20, async (listing) => {
    const site = listing.websites.find((url) => !socialPlatform(url));
    if (!site) return;
    let page;
    try {
      page = await get(site);
    } catch {
      return;
    }
    if (page.status !== 200 || !page.text) return;
    stats.fetched += 1;
    const have = new Set(listing.socials.map(socialPlatform));
    const context = { name: listing.name, city: listing.city, websiteHost: new URL(site).hostname };
    const found = { facebook: new Set(), instagram: new Set() };
    for (const [, href] of page.text.matchAll(/href\s*=\s*["']([^"']{10,200})["']/gi)) {
      const profile = canonicalProfileUrl(href.replace(/&amp;/g, '&'));
      if (!profile) continue;
      const platform = socialPlatform(profile);
      if (have.has(platform) || !handleBelongsToMarket(profile, context)) continue;
      found[platform].add(profile.toLowerCase());
    }
    const socials = [];
    for (const platform of ['facebook', 'instagram']) {
      if (found[platform].size > 1) stats.ambiguous += 1;
      if (found[platform].size !== 1) continue;
      const lower = [...found[platform]][0];
      // Keep the handle's casing as the page wrote it.
      const original = [...page.text.matchAll(/href\s*=\s*["']([^"']{10,200})["']/gi)]
        .map(([, href]) => canonicalProfileUrl(href.replace(/&amp;/g, '&')))
        .find((url) => url && url.toLowerCase() === lower);
      socials.push(original ?? lower);
      stats[platform] += 1;
    }
    if (!socials.length) return;
    records.push(
      record(listing, { contact: { social_media: socials } }, [
        { title: pageTitle(page.text, new URL(site).hostname), url: site, fields: ['contact.social_media'] },
      ])
    );
  });
  // One profile on several listings is an operator's or a city's page, not a market's.
  const uses = new Map();
  const bump = (url) => uses.set(url.toLowerCase(), (uses.get(url.toLowerCase()) ?? 0) + 1);
  for (const listing of await loadListings()) for (const url of new Set(listing.socials)) bump(url);
  for (const item of records) for (const url of item.contact.social_media) bump(url);
  const unshared = records.flatMap((item) => {
    const social_media = item.contact.social_media.filter((url) => uses.get(url.toLowerCase()) === 1);
    stats.shared = (stats.shared ?? 0) + item.contact.social_media.length - social_media.length;
    return social_media.length ? [{ ...item, contact: { social_media } }] : [];
  });
  await writeBatch('register-market-websites.json', unshared, stats);
}

const commands = { snap, overture, websites };
if (!commands[command]) {
  console.error('usage: node scripts/register-enrich.mjs <snap|overture --input places.json|websites> [--dry-run]');
  process.exit(1);
}
await commands[command]();
