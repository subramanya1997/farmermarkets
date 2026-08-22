#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateRichEnrichment } from './lib/rich-enrichment-validation.mjs';
import {
  hasConflictingUnqualifiedSeasonalHours,
  isCanonicalSocialProfileUrl,
  isGenericSingaporeNeaWebsite,
  isKnownContaminatedPromotion,
  isNonMarketSchedule,
  isPastDatedSchedule,
} from './lib/enrichment-audit-quality.mjs';

const root = process.cwd();
const enrichmentDir = path.join(root, 'data/enrichment');
const legacySourcePath = path.join(root, 'data/sources/legacy_markets.json');
const governmentSourcePath = path.join(root, 'data/sources/government_markets.json');

const HTTP_URL = /^https?:\/\//i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_FIELDS = new Set([
  'google_maps_url',
  'suppress_map',
  'contact.websites',
  'contact.social_media',
  'contact.phone_numbers',
  'contact.emails',
  'operations.days',
  'operations.season',
  'payment.methods',
  'payment.food_assistance.wic',
  'payment.food_assistance.sfmnp',
  'payment.food_assistance.fmnp',
  'payment.food_assistance.snap',
  'amenities.features',
  'amenities.parking',
  'amenities.restrooms',
  'amenities.picnic_area',
  'amenities.wheelchair_accessible',
  'amenities.pet_friendly',
  'visitor_note',
  'first_party.identity',
  'first_party.operations',
  'first_party.operations.timezone',
  'first_party.operations.status',
  'first_party.operations.season',
  'first_party.operations.schedules',
  'first_party.operations.exceptions',
  'first_party.operations.weather_policy',
  'first_party.operations.cancellation_policy',
  'first_party.payments',
  'first_party.payments.methods',
  'first_party.payments.assistance',
  'first_party.payments.incentives',
  'first_party.access',
  'first_party.amenities',
  'first_party.policies',
  'first_party.vendors',
  'first_party.products',
  'first_party.events',
  'first_party.programs',
  'first_party.languages',
  'first_party.contact',
  'first_party.contact.newsletter',
  'first_party.contact.social_profiles',
  'first_party.faq_facts',
]);

function fail(message) {
  throw new Error(message);
}

function requireStrings(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    fail(`${label} must be an array of non-empty strings`);
  }
}

function requireUrls(values, label) {
  requireStrings(values, label);
  for (const value of values) {
    if (!HTTP_URL.test(value)) fail(`${label} contains a non-http(s) URL: ${value}`);
    try {
      new URL(value);
    } catch {
      fail(`${label} contains an invalid URL: ${value}`);
    }
  }
}

function requireOptionalBoolean(value, label) {
  if (value !== undefined && typeof value !== 'boolean') fail(`${label} must be a boolean`);
}

function likelyEmail(value) {
  const email = String(value).trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@(?:[a-z0-9-]+\.)+[a-z]{2,24}$/.test(email)) return false;
  const local = email.split('@')[0];
  if (/^\d{5,}/.test(local) || /^\d{3}[-.)]\d/.test(local)) return false;
  return !/\.(?:com|org|net|edu|gov|ca)(?:on|farmers|voicemail|like|send|market|phone|success|tel)$/.test(email);
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

function valueAtPath(record, field) {
  return field.split('.').reduce((value, key) => value?.[key], record);
}

function mergeSources(left = [], right = []) {
  const byUrl = new Map();
  for (const source of [...left, ...right]) {
    const key = new URL(source.url).href;
    const existing = byUrl.get(key);
    if (!existing) {
      byUrl.set(key, source);
      continue;
    }
    // Rich facts reference source IDs, so prefer the ID-bearing copy while
    // retaining every field path cited by either research pass.
    const preferred = source.id ? source : existing;
    byUrl.set(key, {
      ...existing,
      ...preferred,
      fields: [...new Set([...(existing.fields ?? []), ...(source.fields ?? [])])],
    });
  }
  return [...byUrl.values()];
}

function validateRecord(record, label, marketsById) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) fail(`${label} is not an object`);
  if (typeof record.id !== 'string' && typeof record.id !== 'number') fail(`${label}.id is missing`);
  const id = String(record.id);
  const market = marketsById.get(id);
  if (!market) fail(`${label}.id does not exist in a market snapshot: ${id}`);
  if (record.market_name !== market.name) {
    fail(`${label}.market_name does not match ${id}: expected ${JSON.stringify(market.name)}`);
  }
  if (!DATE.test(record.verified_at)) fail(`${label}.verified_at must be YYYY-MM-DD`);
  if (
    record.verification_scope !== undefined &&
    record.verification_scope !== 'partial'
  ) {
    fail(`${label}.verification_scope must be partial`);
  }
  if (!Array.isArray(record.sources) || record.sources.length === 0) fail(`${label}.sources must not be empty`);

  if (record.google_maps_url) {
    requireUrls([record.google_maps_url], `${label}.google_maps_url`);
    const url = new URL(record.google_maps_url);
    if (!/(^|\.)google\.[a-z.]+$/i.test(url.hostname) && url.hostname !== 'maps.app.goo.gl') {
      fail(`${label}.google_maps_url is not a Google Maps host`);
    }
  }
  requireOptionalBoolean(record.suppress_map, `${label}.suppress_map`);
  if (record.google_maps_url && record.suppress_map) {
    fail(`${label} cannot set both google_maps_url and suppress_map`);
  }

  for (const field of ['websites', 'social_media']) {
    if (record.contact?.[field]) requireUrls(record.contact[field], `${label}.contact.${field}`);
  }
  for (const [websiteIndex, website] of (record.contact?.websites ?? []).entries()) {
    if (isSocialUrl(website)) fail(`${label}.contact.websites[${websiteIndex}] is a social profile`);
    if (isGenericSingaporeNeaWebsite(website)) {
      fail(`${label}.contact.websites[${websiteIndex}] is a generic NEA overview`);
    }
    if (isKnownContaminatedPromotion(String(record.id), 'contact.websites', website)) {
      fail(`${label}.contact.websites[${websiteIndex}] is a known non-market page`);
    }
  }
  for (const [socialIndex, social] of (record.contact?.social_media ?? []).entries()) {
    if (isSocialNavigationUrl(social) || !isCanonicalSocialProfileUrl(social)) {
      fail(`${label}.contact.social_media[${socialIndex}] is not a canonical profile URL`);
    }
    if (isKnownContaminatedPromotion(String(record.id), 'contact.social_media', social)) {
      fail(`${label}.contact.social_media[${socialIndex}] is a known shared operator profile`);
    }
  }
  for (const field of ['phone_numbers', 'emails']) {
    if (record.contact?.[field]) requireStrings(record.contact[field], `${label}.contact.${field}`);
  }
  for (const [emailIndex, email] of (record.contact?.emails ?? []).entries()) {
    if (!likelyEmail(email)) fail(`${label}.contact.emails[${emailIndex}] is not a plausible email`);
  }
  for (const [phoneIndex, phone] of (record.contact?.phone_numbers ?? []).entries()) {
    if (isKnownContaminatedPromotion(String(record.id), 'contact.phone_numbers', phone)) {
      fail(`${label}.contact.phone_numbers[${phoneIndex}] is a known municipality footer number`);
    }
  }
  if (record.operations?.days) requireStrings(record.operations.days, `${label}.operations.days`);
  for (const [dayIndex, day] of (record.operations?.days ?? []).entries()) {
    if (
      day.length > 180 ||
      (day.match(/[\p{L}\p{N}]/gu) ?? []).length < 3 ||
      !likelyMarketSchedule(day) ||
      isPastDatedSchedule(day, record.verified_at) ||
      /\b(?:next market|end day|frequency):/i.test(day)
    ) {
      fail(`${label}.operations.days[${dayIndex}] is not a clean schedule string`);
    }
  }
  if (hasConflictingUnqualifiedSeasonalHours(record.operations?.days ?? [])) {
    fail(`${label}.operations.days has conflicting hours without season context`);
  }
  if (record.operations?.season !== undefined && typeof record.operations.season !== 'string') {
    fail(`${label}.operations.season must be a string`);
  }
  if (record.payment?.methods) requireStrings(record.payment.methods, `${label}.payment.methods`);
  if (record.amenities?.features) requireStrings(record.amenities.features, `${label}.amenities.features`);
  for (const [featureIndex, feature] of (record.amenities?.features ?? []).entries()) {
    if (feature.length > 180 || /\?\s*$/.test(feature)) {
      fail(`${label}.amenities.features[${featureIndex}] is not a clean amenity statement`);
    }
  }
  if (record.visitor_note !== undefined && typeof record.visitor_note !== 'string') {
    fail(`${label}.visitor_note must be a string`);
  }
  for (const [key, value] of Object.entries(record.payment?.food_assistance ?? {})) {
    requireOptionalBoolean(value, `${label}.payment.food_assistance.${key}`);
  }
  for (const key of ['parking', 'restrooms', 'picnic_area', 'wheelchair_accessible', 'pet_friendly']) {
    requireOptionalBoolean(record.amenities?.[key], `${label}.amenities.${key}`);
  }

  const seenSourceUrls = new Set();
  for (const [sourceIndex, source] of record.sources.entries()) {
    const sourceLabel = `${label}.sources[${sourceIndex}]`;
    if (!source || typeof source !== 'object') fail(`${sourceLabel} is not an object`);
    requireUrls([source.url], `${sourceLabel}.url`);
    const sourceUrl = new URL(source.url).href;
    if (seenSourceUrls.has(sourceUrl)) fail(`${label}.sources contains duplicate URL ${source.url}`);
    seenSourceUrls.add(sourceUrl);
    if (typeof source.title !== 'string' || !source.title.trim()) fail(`${sourceLabel}.title is missing`);
    requireStrings(source.fields, `${sourceLabel}.fields`);
    for (const field of source.fields) {
      if (!ALLOWED_FIELDS.has(field)) fail(`${sourceLabel}.fields has unsupported path: ${field}`);
      if (valueAtPath(record, field) === undefined) {
        fail(`${sourceLabel}.fields cites ${field}, but the record does not contain that field`);
      }
    }
  }

  validateRichEnrichment(record, label, fail);
}

export async function buildMarketEnrichment() {
  const [legacy, government, names] = await Promise.all([
    fs.readFile(legacySourcePath, 'utf8').then(JSON.parse),
    fs.readFile(governmentSourcePath, 'utf8').then(JSON.parse),
    fs.readdir(enrichmentDir),
  ]);
  const marketsById = new Map([...legacy, ...government].map((market) => [String(market.id), market]));
  const files = names.filter((name) => /^research-.+\.json$/.test(name)).sort();
  if (!files.length) fail('No data/enrichment/research-*.json files found');

  const recordsById = new Map();
  for (const file of files) {
    const parsed = JSON.parse(await fs.readFile(path.join(enrichmentDir, file), 'utf8'));
    if (!Array.isArray(parsed)) fail(`${file} must contain a top-level array`);
    for (const [index, record] of parsed.entries()) {
      validateRecord(record, `${file}[${index}]`, marketsById);
      const id = String(record.id);
      const normalized = { ...record, id };
      const existing = recordsById.get(id);
      if (!existing) {
        recordsById.set(id, normalized);
        continue;
      }

      // Rich website research is an additive namespace that can augment one
      // existing v1 contact/schedule record for the same market. Two v1
      // records or two rich records remain an error, so file order can never
      // silently decide which facts win.
      const rich = normalized.first_party && !existing.first_party
        ? normalized
        : existing.first_party && !normalized.first_party
          ? existing
          : undefined;
      const base = rich === normalized ? existing : normalized;
      if (!rich) fail(`Duplicate enrichment id ${id}`);
      recordsById.set(id, {
        ...base,
        schema_version: 2,
        first_party: rich.first_party,
        verified_at: [base.verified_at, rich.verified_at].sort().at(-1),
        verification_scope: 'partial',
        sources: mergeSources(base.sources, rich.sources),
      });
    }
  }

  const records = [...recordsById.values()];
  records.sort((left, right) => left.id.localeCompare(right.id, 'en'));
  records.forEach((record, index) => validateRecord(record, `compiled[${index}]`, marketsById));

  console.log(`validated ${records.length} independently enriched markets from ${files.length} research batches`);
  return records;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildMarketEnrichment();
}
