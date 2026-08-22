#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  hasConflictingUnqualifiedSeasonalHours,
  isCanonicalSocialProfileUrl,
  isGenericSingaporeNeaWebsite,
  isKnownContaminatedPromotion,
  isNonMarketSchedule,
  isPastDatedSchedule,
} from './lib/enrichment-audit-quality.mjs';

const root = process.cwd();
const auditDir = path.join(root, 'data/enrichment/audit');
const progressOnly = process.argv.includes('--progress');
const writeReport = process.argv.includes('--write-report');
const shardArgument = process.argv.find((argument) => argument.startsWith('--shard='));
const selectedShard = shardArgument ? Number(shardArgument.split('=')[1]) : undefined;
const checkedAt = '2026-08-21';
const allowedStatuses = new Set([
  'already_enriched',
  'verified_update',
  'official_source_reviewed',
  'checked_no_verified_update',
  'identity_ambiguous',
  'blocked',
]);
const allowedEvidenceKinds = new Set([
  'official_catalog',
  'google_maps_result',
  'first_party_site',
]);

function fail(message) {
  throw new Error(message);
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string`);
}

function requireUrls(values, label) {
  if (!Array.isArray(values)) fail(`${label} must be an array`);
  for (const [index, value] of values.entries()) {
    requireString(value, `${label}[${index}]`);
    let url;
    try {
      url = new URL(value);
    } catch {
      fail(`${label}[${index}] is not a valid URL: ${value}`);
    }
    if (!['http:', 'https:'].includes(url.protocol)) fail(`${label}[${index}] must be http(s)`);
  }
}

function nonEmptyObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

function likelyEmail(value) {
  const email = String(value).trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@(?:[a-z0-9-]+\.)+[a-z]{2,24}$/.test(email)) return false;
  const local = email.split('@')[0];
  if (/^\d{5,}/.test(local) || /^\d{3}[-.)]\d/.test(local)) return false;
  return !/\.(?:com|org|net|edu|gov|ca)(?:on|farmers|voicemail|like|send|market|phone|success|tel)$/.test(email);
}

function phoneIdentity(value) {
  const base = String(value).replace(/\b(?:ext(?:ension)?|x)\b.*$/i, '').replace(/\D/g, '');
  return base.length === 11 && base.startsWith('1') ? base.slice(1) : base;
}

function likelyMarketSchedule(value) {
  const text = String(value).trim();
  const hasDay = /\b(?:mo|tu|we|th|fr|sa|su|mon(?:day)?s?|tue(?:sday)?s?|wed(?:nesday)?s?|thu(?:rsday)?s?|fri(?:day)?s?|sat(?:urday)?s?|sun(?:day)?s?|daily|weekdays?|weekends?|every|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i.test(text);
  const hasTime = /\b(?:[01]?\d|2[0-3]):\d{2}(?::\d{2})?\b|\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i.test(text);
  const nonMarketEvent = isNonMarketSchedule(text);
  return (hasDay || hasTime) && !nonMarketEvent && !/\d{4}\d{1,2}:\d{2}|fill out the form|come visit/i.test(text);
}

function isSocialUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    return /^(?:facebook|instagram|twitter|x|tiktok|youtube)\.com$/.test(host);
  } catch {
    return false;
  }
}

function isSocialNavigationUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'facebook.com') {
      return /\/(?:posts?|photos?|reels?|events?|watch|share|redirect|login|profile\.php)(?:\/|$)/i.test(url.pathname);
    }
    if (host === 'instagram.com') return /\/(?:p|reels?|stories)(?:\/|$)/i.test(url.pathname);
    if (host === 'twitter.com' || host === 'x.com') return /\/status(?:\/|$)/i.test(url.pathname);
    if (host === 'youtube.com') return /\/watch(?:\/|$)/i.test(url.pathname);
    return false;
  } catch {
    return false;
  }
}

function normalizeLocation(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const usStateAbbreviations = new Map(Object.entries({
  alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar', california: 'ca',
  colorado: 'co', connecticut: 'ct', delaware: 'de', florida: 'fl', georgia: 'ga',
  hawaii: 'hi', idaho: 'id', illinois: 'il', indiana: 'in', iowa: 'ia', kansas: 'ks',
  kentucky: 'ky', louisiana: 'la', maine: 'me', maryland: 'md', massachusetts: 'ma',
  michigan: 'mi', minnesota: 'mn', mississippi: 'ms', missouri: 'mo', montana: 'mt',
  nebraska: 'ne', nevada: 'nv', 'new hampshire': 'nh', 'new jersey': 'nj',
  'new mexico': 'nm', 'new york': 'ny', 'north carolina': 'nc', 'north dakota': 'nd',
  ohio: 'oh', oklahoma: 'ok', oregon: 'or', pennsylvania: 'pa', 'rhode island': 'ri',
  'south carolina': 'sc', 'south dakota': 'sd', tennessee: 'tn', texas: 'tx', utah: 'ut',
  vermont: 'vt', virginia: 'va', washington: 'wa', 'west virginia': 'wv',
  wisconsin: 'wi', wyoming: 'wy', 'district of columbia': 'dc',
}));

function verifiedLocationMatches(input, observedAddress) {
  const observed = normalizeLocation(observedAddress);
  if (!observed) return false;
  const zip = normalizeLocation(input.location_parts?.zip_code);
  if (zip && observed.includes(zip)) return true;
  const city = normalizeLocation(input.location_parts?.city);
  const state = normalizeLocation(input.location_parts?.state);
  const stateAbbreviation = usStateAbbreviations.get(state);
  const stateMatches = !state || observed.includes(state) || (
    stateAbbreviation && new RegExp(`\\b${stateAbbreviation}\\b`).test(observed)
  );
  if (city && observed.includes(city) && stateMatches) return true;
  return false;
}

const genericNameTokens = new Set([
  'and', 'at', 'the', 'of', 'in',
  'farm', 'farmer', 'farmers', 'market', 'markets', 'marketplace',
  'community', 'downtown', 'local', 'county', 'association',
]);

function normalizeNameToken(token) {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

function verifiedNameMatches(input, observedTitle) {
  const expected = normalizeLocation(input.market_name);
  const observed = normalizeLocation(observedTitle);
  if (!expected || !observed) return false;
  if (expected === observed) return true;

  const cityTokens = new Set(
    normalizeLocation(input.location_parts?.city).split(' ').map(normalizeNameToken).filter(Boolean),
  );
  const significant = (value) => value.split(' ')
    .map(normalizeNameToken)
    .filter((token) => token && !genericNameTokens.has(token) && !cityTokens.has(token));
  const expectedTokens = significant(expected.replace(/\bcity of\b/g, ''));
  const observedTokens = new Set(significant(observed.replace(/\bcity of\b/g, '')));
  if (!/\bmarket(?:s|place)?\b/.test(observed)) return false;
  if (expectedTokens.length === 0) {
    const observedNameTokens = new Set(observed.split(' ').map(normalizeNameToken));
    return [...cityTokens].some((token) => token.length > 2 && observedNameTokens.has(token));
  }
  const matches = expectedTokens.filter((token) => observedTokens.has(token)).length;
  return matches / expectedTokens.length >= 0.75;
}

function validateRow(row, label, input, independentlyEnriched) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) fail(`${label} must be an object`);
  requireString(row.id, `${label}.id`);
  requireString(row.market_name, `${label}.market_name`);
  if (row.id !== input.id) fail(`${label}.id does not match its shard input`);
  if (row.market_name !== input.market_name) fail(`${label}.market_name does not match ${row.id}`);
  if (row.checked_at !== checkedAt) fail(`${label}.checked_at must be ${checkedAt}`);
  if (!allowedStatuses.has(row.status)) fail(`${label}.status is unsupported: ${row.status}`);
  requireUrls(row.checked_urls, `${label}.checked_urls`);
  requireString(row.note, `${label}.note`);

  if (!['already_enriched', 'blocked'].includes(row.status)) {
    if (!nonEmptyObject(row.evidence)) fail(`${label}.evidence must record rendered-page inspection`);
    if (!allowedEvidenceKinds.has(row.evidence.kind)) {
      fail(`${label}.evidence.kind is unsupported: ${row.evidence.kind}`);
    }
    requireString(row.evidence.page_title, `${label}.evidence.page_title`);
    if (typeof row.evidence.identity_match !== 'boolean') {
      fail(`${label}.evidence.identity_match must be a boolean`);
    }
    for (const key of ['observed_address', 'observed_website', 'observed_phone', 'observed_hours']) {
      if (row.evidence[key] !== undefined) requireString(row.evidence[key], `${label}.evidence.${key}`);
    }
    if (['verified_update', 'official_source_reviewed', 'checked_no_verified_update'].includes(row.status)
      && !row.evidence.identity_match) {
      fail(`${label}.${row.status} requires evidence.identity_match=true`);
    }
    if (row.status === 'identity_ambiguous' && row.evidence.identity_match) {
      fail(`${label}.identity_ambiguous requires evidence.identity_match=false`);
    }
  }

  if (row.google_maps_url !== undefined) {
    requireUrls([row.google_maps_url], `${label}.google_maps_url`);
    const host = new URL(row.google_maps_url).hostname;
    if (!/(^|\.)google\.[a-z.]+$/i.test(host) && host !== 'maps.app.goo.gl') {
      fail(`${label}.google_maps_url must use a Google Maps host`);
    }
  }

  if (row.verified_fields !== undefined && !nonEmptyObject(row.verified_fields)) {
    fail(`${label}.verified_fields must be omitted or a non-empty object`);
  }
  if (row.verified_fields?.contact?.emails !== undefined) {
    if (!Array.isArray(row.verified_fields.contact.emails)) {
      fail(`${label}.verified_fields.contact.emails must be an array`);
    }
    for (const [emailIndex, email] of row.verified_fields.contact.emails.entries()) {
      requireString(email, `${label}.verified_fields.contact.emails[${emailIndex}]`);
      if (!likelyEmail(email)) {
        fail(`${label}.verified_fields.contact.emails[${emailIndex}] is not an email address`);
      }
    }
  }
  for (const [websiteIndex, website] of (row.verified_fields?.contact?.websites ?? []).entries()) {
    requireUrls([website], `${label}.verified_fields.contact.websites[${websiteIndex}]`);
    if (isSocialUrl(website)) {
      fail(`${label}.verified_fields.contact.websites[${websiteIndex}] is a social profile`);
    }
    if (isGenericSingaporeNeaWebsite(website)) {
      fail(`${label}.verified_fields.contact.websites[${websiteIndex}] is a generic NEA overview`);
    }
    if (isKnownContaminatedPromotion(row.id, 'contact.websites', website)) {
      fail(`${label}.verified_fields.contact.websites[${websiteIndex}] is a known non-market page`);
    }
  }
  if (row.verified_fields?.contact?.social_media !== undefined) {
    requireUrls(row.verified_fields.contact.social_media, `${label}.verified_fields.contact.social_media`);
    for (const [socialIndex, social] of row.verified_fields.contact.social_media.entries()) {
      if (isSocialNavigationUrl(social) || !isCanonicalSocialProfileUrl(social)) {
        fail(`${label}.verified_fields.contact.social_media[${socialIndex}] is not a canonical profile URL`);
      }
      if (isKnownContaminatedPromotion(row.id, 'contact.social_media', social)) {
        fail(`${label}.verified_fields.contact.social_media[${socialIndex}] is a known shared operator profile`);
      }
    }
  }
  if (row.verified_fields?.contact?.phone_numbers !== undefined) {
    const phones = row.verified_fields.contact.phone_numbers;
    if (!Array.isArray(phones)) fail(`${label}.verified_fields.contact.phone_numbers must be an array`);
    const seenPhones = new Set();
    for (const [phoneIndex, phone] of phones.entries()) {
      requireString(phone, `${label}.verified_fields.contact.phone_numbers[${phoneIndex}]`);
      const identity = phoneIdentity(phone);
      if (identity && seenPhones.has(identity)) {
        fail(`${label}.verified_fields.contact.phone_numbers contains duplicate number ${phone}`);
      }
      if (identity) seenPhones.add(identity);
      if (isKnownContaminatedPromotion(row.id, 'contact.phone_numbers', phone)) {
        fail(`${label}.verified_fields.contact.phone_numbers[${phoneIndex}] is a known municipality footer number`);
      }
    }
  }
  if (row.verified_fields?.operations?.days !== undefined) {
    const days = row.verified_fields.operations.days;
    if (!Array.isArray(days)) fail(`${label}.verified_fields.operations.days must be an array`);
    for (const [dayIndex, day] of days.entries()) {
      requireString(day, `${label}.verified_fields.operations.days[${dayIndex}]`);
      if (
        day.length > 180 ||
        (day.match(/[\p{L}\p{N}]/gu) ?? []).length < 3 ||
        !likelyMarketSchedule(day) ||
        isPastDatedSchedule(day, row.checked_at) ||
        /\b(?:next market|end day|frequency):/i.test(day)
      ) {
        fail(`${label}.verified_fields.operations.days[${dayIndex}] is not a clean schedule string`);
      }
    }
    if (hasConflictingUnqualifiedSeasonalHours(days)) {
      fail(`${label}.verified_fields.operations.days has conflicting hours without season context`);
    }
  }
  for (const [featureIndex, feature] of (row.verified_fields?.amenities?.features ?? []).entries()) {
    requireString(feature, `${label}.verified_fields.amenities.features[${featureIndex}]`);
    if (feature.length > 180 || /\?\s*$/.test(feature)) {
      fail(`${label}.verified_fields.amenities.features[${featureIndex}] is not a clean amenity statement`);
    }
  }
  if (!Array.isArray(row.sources)) fail(`${label}.sources must be an array`);
  const seenSourceUrls = new Set();
  for (const [sourceIndex, source] of row.sources.entries()) {
    const sourceLabel = `${label}.sources[${sourceIndex}]`;
    requireString(source?.title, `${sourceLabel}.title`);
    requireUrls([source?.url], `${sourceLabel}.url`);
    if (!Array.isArray(source?.fields) || source.fields.length === 0) {
      fail(`${sourceLabel}.fields must be a non-empty array`);
    }
    if (!row.checked_urls.includes(source.url)) {
      fail(`${sourceLabel}.url was not recorded as an actually checked URL`);
    }
    const sourceUrl = new URL(source.url).href;
    if (seenSourceUrls.has(sourceUrl)) fail(`${label}.sources contains duplicate URL ${source.url}`);
    seenSourceUrls.add(sourceUrl);
    source.fields.forEach((field, fieldIndex) => requireString(field, `${sourceLabel}.fields[${fieldIndex}]`));
  }

  if (row.status === 'verified_update') {
    if (!nonEmptyObject(row.verified_fields)) fail(`${label} verified_update needs verified_fields`);
    if (row.sources.length === 0) fail(`${label} verified_update needs sources`);
    if (!input.official_source) {
      requireString(row.evidence?.observed_address, `${label}.evidence.observed_address`);
      if (!verifiedLocationMatches(input, row.evidence.observed_address)) {
        fail(`${label}.verified_update location does not match the shard input`);
      }
      if (!verifiedNameMatches(input, row.evidence.page_title)) {
        fail(`${label}.verified_update title does not confidently match the shard input`);
      }
    }
  } else if (row.verified_fields !== undefined || row.sources.length > 0) {
    fail(`${label} can only contain verified facts when status is verified_update`);
  }

  if (row.status === 'already_enriched' && !independentlyEnriched.has(row.id)) {
    fail(`${label} claims already_enriched but ${row.id} is absent from the current overlay`);
  }
  if (row.status === 'official_source_reviewed' && !input.official_source) {
    fail(`${label} claims official_source_reviewed without government provenance`);
  }
  if (!['already_enriched', 'blocked'].includes(row.status) && row.checked_urls.length === 0) {
    fail(`${label} needs at least one actually checked URL`);
  }
}

async function readJsonLines(file) {
  const body = await fs.readFile(file, 'utf8');
  if (!body.trim()) return [];
  return body.trimEnd().split('\n').map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      fail(`${path.basename(file)} line ${index + 1} is invalid JSON: ${error.message}`);
    }
  });
}

async function readIndependentlyEnrichedIds() {
  const enrichmentDir = path.join(root, 'data/enrichment');
  const names = (await fs.readdir(enrichmentDir))
    .filter((name) => /^research-(?!audit-).+\.json$/.test(name));
  const batches = await Promise.all(names.map((name) =>
    fs.readFile(path.join(enrichmentDir, name), 'utf8').then(JSON.parse)
  ));
  return new Set(batches.flat().map((record) => String(record.id)));
}

const [manifest, independentlyEnriched] = await Promise.all([
  fs.readFile(path.join(auditDir, 'manifest.json'), 'utf8').then(JSON.parse),
  readIndependentlyEnrichedIds(),
]);

const totals = Object.fromEntries([...allowedStatuses].map((status) => [status, 0]));
let completed = 0;
const shardReports = [];
const globalRowsById = new Map();
const duplicateSourceIds = new Set();

const shards = selectedShard === undefined
  ? manifest.shards
  : manifest.shards.filter((shard) => shard.shard === selectedShard);
if (selectedShard !== undefined && shards.length !== 1) fail(`unknown shard: ${selectedShard}`);
const expectedTotal = shards.reduce((sum, shard) => sum + shard.count, 0);

for (const shard of shards) {
  const inputPath = path.join(auditDir, `shard-${shard.shard}-input.json`);
  const resultPath = path.join(auditDir, `shard-${shard.shard}-results.jsonl`);
  const inputs = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  let rows = [];
  try {
    rows = await readJsonLines(resultPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const inputsById = new Map(inputs.map((input) => [input.id, input]));
  const seen = new Set();
  const shardStatuses = Object.fromEntries([...allowedStatuses].map((status) => [status, 0]));
  for (const [index, row] of rows.entries()) {
    const input = inputsById.get(row.id);
    if (!input) fail(`shard-${shard.shard}-results.jsonl[${index}] has unexpected id ${row.id}`);
    if (seen.has(row.id)) fail(`shard ${shard.shard} repeats id ${row.id}`);
    seen.add(row.id);
    validateRow(row, `shard-${shard.shard}-results.jsonl[${index}]`, input, independentlyEnriched);
    const prior = globalRowsById.get(row.id);
    if (prior) {
      if (prior.market_name !== row.market_name) fail(`duplicate source id ${row.id} has conflicting names`);
      duplicateSourceIds.add(row.id);
    } else {
      globalRowsById.set(row.id, row);
    }
    totals[row.status] += 1;
    shardStatuses[row.status] += 1;
  }

  if (!progressOnly && rows.length !== inputs.length) {
    fail(`shard ${shard.shard} is incomplete: ${rows.length}/${inputs.length}`);
  }

  completed += rows.length;
  shardReports.push({
    shard: shard.shard,
    completed: rows.length,
    total: inputs.length,
    remaining: inputs.length - rows.length,
    statuses: shardStatuses,
  });
}

const report = {
  checked_at: checkedAt,
  completed,
  total: expectedTotal,
  remaining: expectedTotal - completed,
  complete: completed === expectedTotal,
  unique_ids: globalRowsById.size,
  duplicate_source_ids: [...duplicateSourceIds].sort(),
  statuses: totals,
  shards: shardReports,
};

if (!progressOnly && totals.blocked > 0) {
  fail(`audit still contains ${totals.blocked} blocked checks; retry them before completion`);
}

if (writeReport) {
  await fs.writeFile(path.join(auditDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
}

console.log(JSON.stringify(report, null, 2));
if (!progressOnly && !report.complete) fail('the enrichment audit is incomplete');
