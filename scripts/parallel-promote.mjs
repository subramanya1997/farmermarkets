#!/usr/bin/env node
// Convert raw Parallel.ai task results into a data/enrichment research batch.
//
//   node scripts/parallel-promote.mjs --label base-5000 --out research-parallel-1.json \
//     [--min-confidence medium] [--verified-at YYYY-MM-DD] [--dry-run]
//
// Only fields whose Parallel basis entry meets the confidence floor and carries
// at least one citation are promoted; every promoted field keeps its citing
// URLs in the record's sources array. Markets Parallel reports as closed or
// unverifiable are skipped entirely.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isCanonicalSocialProfileUrl,
  isKnownContaminatedPromotion,
  isPastDatedSchedule,
  isNonMarketSchedule,
  hasConflictingUnqualifiedSeasonalHours,
} from './lib/enrichment-audit-quality.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const enrichmentDir = path.join(root, 'data/enrichment');
const datasetPath = path.join(root, 'public/data/farmers_markets.json');

const CONF_RANK = { low: 0, medium: 1, high: 2 };

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const label = arg('label');
const outName = arg('out');
const minConf = arg('min-confidence', 'medium');
const verifiedAt = arg('verified-at', new Date().toISOString().slice(0, 10));
const dryRun = process.argv.includes('--dry-run');
if (!label || !outName) {
  console.error('usage: parallel-promote.mjs --label <label> --out <research-*.json>');
  process.exit(1);
}

const isHttp = (u) => /^https?:\/\//i.test(u || '');
const host = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
const SOCIAL_HOSTS = ['facebook.com', 'instagram.com', 'm.facebook.com'];
const BAD_WEBSITE_HOSTS = [
  ...SOCIAL_HOSTS,
  'google.com',
  'maps.google.com',
  'goo.gl',
  'yelp.com',
  'tripadvisor.com',
  'yellowpages.com',
  'mapquest.com',
  'localharvest.org',
  'ams.usda.gov',
  'x.com',
  'twitter.com',
  'linktr.ee',
];

const raw = (await fs.readFile(path.join(enrichmentDir, 'parallel', label, 'results.jsonl'), 'utf8'))
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));

// One v1 record per market id across all research files; skip ids already covered.
const existingIds = new Set();
for (const name of (await fs.readdir(enrichmentDir)).filter((n) => /^research-.+\.json$/.test(n))) {
  if (name === outName) continue;
  for (const rec of JSON.parse(await fs.readFile(path.join(enrichmentDir, name), 'utf8'))) {
    existingIds.add(String(rec.id));
  }
}

// Baseline for "only fill missing fields" checks must be the raw source
// snapshots: the canonical dataset already contains this batch's own output
// after a rebuild, and market_name must byte-match the snapshot anyway. Any id
// promoted here is skipped if it appears in any other research batch, so the
// snapshot row is the true pre-enrichment state.
const byId = new Map();
const snapshotNames = new Map();
for (const file of ['legacy_markets.json', 'government_markets.json']) {
  for (const m of JSON.parse(await fs.readFile(path.join(root, 'data/sources', file), 'utf8'))) {
    byId.set(String(m.id), m);
    snapshotNames.set(String(m.id), m.name);
  }
}

// Mirrors likelyMarketSchedule in scripts/build-market-enrichment.mjs.
function likelyMarketSchedule(value) {
  const text = String(value).trim();
  const hasDay = /\b(?:mo|tu|we|th|fr|sa|su|mon(?:day)?s?|tue(?:sday)?s?|wed(?:nesday)?s?|thu(?:rsday)?s?|fri(?:day)?s?|sat(?:urday)?s?|sun(?:day)?s?|daily|weekdays?|weekends?|every|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i.test(text);
  const hasTime = /\b(?:[01]?\d|2[0-3]):\d{2}(?::\d{2})?\b|\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i.test(text);
  return (hasDay || hasTime) && !isNonMarketSchedule(text) && !/\d{4}\d{1,2}:\d{2}|fill out the form|come visit/i.test(text);
}

function cleanScheduleEntry(day, id, verifiedAtDate) {
  return (
    day.length <= 180 &&
    (day.match(/[\p{L}\p{N}]/gu) ?? []).length >= 3 &&
    likelyMarketSchedule(day) &&
    !isPastDatedSchedule(day, verifiedAtDate) &&
    !/\b(?:next market|end day|frequency):/i.test(day)
  );
}

const stats = {
  total: raw.length,
  not_completed: 0,
  closed: 0,
  unverified: 0,
  already_in_batch: 0,
  no_fields: 0,
  promoted: 0,
  fields: {},
};
const records = [];

for (const row of raw) {
  if (row.status !== 'completed' || !row.output) {
    stats.not_completed += 1;
    continue;
  }
  const out = typeof row.output === 'string' ? JSON.parse(row.output) : row.output;
  if (out.status === 'permanently_closed') {
    stats.closed += 1;
    continue;
  }
  if (out.status !== 'operating') {
    stats.unverified += 1;
    continue;
  }
  const id = String(row.market.id);
  if (existingIds.has(id)) {
    stats.already_in_batch += 1;
    continue;
  }
  existingIds.add(id);
  const market = byId.get(id);
  const basisByField = new Map((row.basis || []).map((b) => [b.field, b]));
  // Aggregator directories often rescrape the same USDA data this dataset
  // started from; schedules and seasons need a fresher source than that.
  const AGGREGATOR_HOSTS = [
    'harvestlymarkets.com',
    'nfmd.org',
    'localharvest.org',
    'farmersmarketonline.com',
    'ams.usda.gov',
    'farmspread.com',
    'yelp.com',
    'tripadvisor.com',
    'yellowpages.com',
    'mapquest.com',
  ];
  const isAggregator = (u) => {
    const h = host(u);
    return !h || AGGREGATOR_HOSTS.some((a) => h === a || h.endsWith(`.${a}`));
  };
  const citationsFor = (field, { requireNonAggregator = false } = {}) => {
    const b = basisByField.get(field);
    if (!b) return null;
    if ((CONF_RANK[b.confidence] ?? 0) < CONF_RANK[minConf]) return null;
    let cites = (b.citations || []).filter((c) => isHttp(c.url));
    if (requireNonAggregator) {
      if (!cites.some((c) => !isAggregator(c.url))) return null;
      cites = cites.filter((c) => !isAggregator(c.url));
    }
    return cites.length ? cites : null;
  };

  const snapshotName = snapshotNames.get(id);
  if (!snapshotName) {
    stats.no_fields += 1;
    continue;
  }
  const record = { id, market_name: snapshotName, verified_at: verifiedAt, verification_scope: 'partial' };
  const sourcesByUrl = new Map();
  const cite = (field, mappedPath, opts) => {
    const cites = citationsFor(field, opts);
    if (!cites) return false;
    for (const c of cites.slice(0, 3)) {
      let key;
      try {
        key = new URL(c.url).href;
      } catch {
        continue;
      }
      const s = sourcesByUrl.get(key) || { title: (c.title || '').trim() || host(key) || key, url: key, fields: [] };
      if (!s.fields.includes(mappedPath)) s.fields.push(mappedPath);
      sourcesByUrl.set(key, s);
    }
    return true;
  };

  const contact = {};
  const operations = {};

  // Website: must be a real site, not maps/social/directories.
  const site = (out.official_website || '').trim();
  if (
    site &&
    isHttp(site) &&
    !/\s/.test(site) &&
    host(site) &&
    !BAD_WEBSITE_HOSTS.some((h) => host(site) === h || host(site).endsWith(`.${h}`)) &&
    !isKnownContaminatedPromotion(id, 'contact.websites', site)
  ) {
    if (cite('official_website', 'contact.websites')) contact.websites = [site];
  }

  const phone = (out.phone || '').trim();
  if (
    phone &&
    !(market?.contact?.phone_numbers || []).length &&
    phone.replace(/\D/g, '').length >= 7 &&
    !isKnownContaminatedPromotion(id, 'contact.phone_numbers', phone)
  ) {
    if (cite('phone', 'contact.phone_numbers')) contact.phone_numbers = [phone];
  }

  const socials = [];
  for (const [field, url] of [
    ['facebook_url', (out.facebook_url || '').trim()],
    ['instagram_url', (out.instagram_url || '').trim()],
  ]) {
    if (!url || !isHttp(url) || !SOCIAL_HOSTS.some((h) => host(url) === h || host(url).endsWith(`.${h}`))) continue;
    if ((market?.contact?.social_media || []).length) continue;
    if (!isCanonicalSocialProfileUrl(url) || isKnownContaminatedPromotion(id, 'contact.social_media', url)) continue;
    if (cite(field, 'contact.social_media')) socials.push(url);
  }
  if (socials.length) contact.social_media = socials;

  const schedule = (out.schedule || '').trim();
  if (schedule && !(market?.operations?.days || []).length) {
    const entries = schedule
      .split(/\s*;\s*/)
      .map((s) => s.trim())
      .filter((s) => s && cleanScheduleEntry(s, id, verifiedAt));
    if (
      entries.length &&
      !hasConflictingUnqualifiedSeasonalHours(entries) &&
      cite('schedule', 'operations.days', { requireNonAggregator: true })
    ) {
      operations.days = entries;
    }
  }

  const season = (out.season || '').trim();
  if (season && !market?.operations?.season) {
    if (cite('season', 'operations.season', { requireNonAggregator: true })) operations.season = season;
  }

  if (Object.keys(contact).length) record.contact = contact;
  if (Object.keys(operations).length) record.operations = operations;
  const sources = [...sourcesByUrl.values()];
  if (!record.contact && !record.operations) {
    stats.no_fields += 1;
    continue;
  }
  record.sources = sources;
  for (const key of ['contact.websites', 'contact.phone_numbers', 'contact.social_media', 'operations.days', 'operations.season']) {
    const present =
      (key === 'contact.websites' && record.contact?.websites) ||
      (key === 'contact.phone_numbers' && record.contact?.phone_numbers) ||
      (key === 'contact.social_media' && record.contact?.social_media) ||
      (key === 'operations.days' && record.operations?.days) ||
      (key === 'operations.season' && record.operations?.season);
    if (present) stats.fields[key] = (stats.fields[key] || 0) + 1;
  }
  records.push(record);
  stats.promoted += 1;
}

records.sort((a, b) => Number(a.id) - Number(b.id));
console.log(JSON.stringify(stats, null, 2));
if (!dryRun) {
  const outPath = path.join(enrichmentDir, outName);
  await fs.writeFile(outPath, JSON.stringify(records, null, 2) + '\n');
  console.log(`Wrote ${records.length} records to ${path.relative(root, outPath)}`);
}
