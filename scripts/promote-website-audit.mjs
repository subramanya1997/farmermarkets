#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateRichEnrichment } from './lib/rich-enrichment-validation.mjs';

const DEFAULT_ROOT = path.join(process.cwd(), 'data/enrichment/site-audit/v1');
const DEFAULT_OUTPUT = path.join(process.cwd(), 'data/enrichment/research-website-audit-rich.json');
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = new Map([
  ['january', 1], ['february', 2], ['march', 3], ['april', 4], ['may', 5], ['june', 6],
  ['july', 7], ['august', 8], ['september', 9], ['october', 10], ['november', 11], ['december', 12],
]);
const WEEKDAYS = new Map([
  ['monday', 'monday'], ['mondays', 'monday'], ['mon', 'monday'],
  ['tuesday', 'tuesday'], ['tuesdays', 'tuesday'], ['tue', 'tuesday'],
  ['wednesday', 'wednesday'], ['wednesdays', 'wednesday'], ['wed', 'wednesday'],
  ['thursday', 'thursday'], ['thursdays', 'thursday'], ['thu', 'thursday'],
  ['friday', 'friday'], ['fridays', 'friday'], ['fri', 'friday'],
  ['saturday', 'saturday'], ['saturdays', 'saturday'], ['sat', 'saturday'],
  ['sunday', 'sunday'], ['sundays', 'sunday'], ['sun', 'sunday'],
]);
const GENERIC_NAME_WORDS = new Set([
  'and', 'association', 'at', 'city', 'community', 'county', 'downtown', 'farm', 'farmer', 'farmers',
  'market', 'markets', 'of', 'public', 'the', 'town', 'village',
]);
const FOOTER_OR_GLOBAL = /\b(?:all rights reserved|copyright|privacy policy|terms (?:of use|and conditions)|site map|website by|powered by|follow us|contact us|subscribe to our|all (?:of )?our markets|at (?:all|participating) markets|market locations|find a market|our markets accept)\b/i;
const NON_MARKET_HOURS = /\b(?:application|breakfast|concert|event|festival|grill|happy hour|information booth hours|music|office|performance|restaurant|shop|store|vendor (?:arrival|check[ -]?in|setup|hours)|volunteer shift|workshop)\b/i;
const QUALIFIED_VENDOR_PAYMENT = /\b(?:a few|some|many|individual|participating) (?:of our )?vendors?\b/i;

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slug(value) {
  return normalize(value).replace(/\s+/g, '-').replace(/^-|-$/g, '');
}

function significantNameWords(value) {
  return normalize(value).split(' ').filter((word) => word.length >= 3 && !GENERIC_NAME_WORDS.has(word));
}

function unique(values) {
  return [...new Set(values)];
}

function cleanExcerpt(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function stringList(value) {
  return Array.isArray(value) ? value : typeof value === 'string' && value.trim() ? [value] : [];
}

function sourceTitle(row, page) {
  const title = cleanExcerpt(page.page_title);
  if (title && !/^(?:home|welcome)(?:\s*[|—-].*)?$/i.test(title)) return title;
  const headings = stringList(page.h1);
  return cleanExcerpt(headings.find((heading) => {
    const words = significantNameWords(row.market_name);
    const normalized = normalize(heading);
    return words.length && words.every((word) => normalized.split(' ').includes(word));
  }) ?? headings[0] ?? title);
}

function realDate(value) {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function marketIdentitySurfaceMatches(row, result) {
  const title = normalize([result.page_title, ...stringList(result.h1)].join(' '));
  const name = normalize(row.market_name);
  if (!title || !name) return false;
  if (title.includes(name)) return true;
  const words = significantNameWords(row.market_name);
  const genericMarketPresent = /\b(?:farmers?|public|community)?\s*markets?\b/.test(title);
  if (!genericMarketPresent || !words.length) return false;
  return words.every((word) => title.split(' ').includes(word));
}

function pageLooksUmbrella(result) {
  const surface = [result.page_title, ...stringList(result.h1), ...stringList(result.headings)].join(' ');
  return /\b(?:all (?:of )?our markets|find a market|market locations|markets we operate|our market locations)\b/i.test(surface);
}

function excerptMentionsSiblingMarket(text, row) {
  const ownWords = new Set(significantNameWords(row.market_name));
  const matches = text.matchAll(/\b([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){0,4})\s+(?:Farmers['’]?\s+|Community\s+|Public\s+)?Market\b/gu);
  for (const match of matches) {
    const mentioned = significantNameWords(match[0]);
    if (mentioned.length && mentioned.some((word) => !ownWords.has(word))) return true;
  }
  return false;
}

function evidenceIsExpired(text, verifiedAt) {
  const verifiedYear = Number(verifiedAt.slice(0, 4));
  const years = [...text.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]));
  if (years.length && Math.max(...years) < verifiedYear) return true;
  const range = text.match(/\b(?:through|thru|to|until|-)\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i);
  if (!range) return false;
  const end = `${range[2]}-${String(monthNumber(range[1])).padStart(2, '0')}-28`;
  return end < verifiedAt;
}

function safeEvidence(result, row, kind) {
  return (result.evidence ?? [])
    .filter((entry) => entry?.kind === kind)
    .map((entry) => cleanExcerpt(entry.excerpt))
    .filter((text) => text && text.length <= 500)
    .filter((text) => kind === 'faq' || !/(?:^|\b)(?:are|can|do|does|how|is|what|when|where|will)\b[^?]{0,300}\?\s*$/i.test(text))
    .filter((text) => !FOOTER_OR_GLOBAL.test(text))
    .filter((text) => !excerptMentionsSiblingMarket(text, row));
}

function sourced(value, sourceId, verifiedAt, id) {
  return {
    ...(id ? { id } : {}),
    value,
    source_ids: [sourceId],
    verified_at: verifiedAt,
  };
}

function parseTime(hourText, minuteText, meridianText) {
  let hour = Number(hourText);
  const minute = Number(minuteText ?? 0);
  const meridian = meridianText.toLowerCase().replace(/\./g, '');
  if (hour < 1 || hour > 12 || minute > 59) return undefined;
  if (meridian === 'pm' && hour !== 12) hour += 12;
  if (meridian === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function findExplicitTimezone(texts) {
  for (const text of texts) {
    const match = text.match(/\b(?:Africa|America|Antarctica|Asia|Atlantic|Australia|Europe|Indian|Pacific)\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?\b/);
    if (!match) continue;
    try {
      new Intl.DateTimeFormat('en', { timeZone: match[0] }).format();
      return match[0];
    } catch {
      // Not an IANA timezone.
    }
  }
  return undefined;
}

function parseSchedules(texts, sourceId, verifiedAt) {
  const timezone = findExplicitTimezone(texts);
  if (!timezone) return undefined;
  const schedules = [];
  for (const text of texts) {
    if (NON_MARKET_HOURS.test(text) || /\bnext market\b/i.test(text)) continue;
    const days = unique([...text.matchAll(/\b(mon(?:day)?s?|tue(?:sday)?s?|wed(?:nesday)?s?|thu(?:rsday)?s?|fri(?:day)?s?|sat(?:urday)?s?|sun(?:day)?s?)\b/gi)]
      .map((match) => WEEKDAYS.get(match[1].toLowerCase()))
      .filter(Boolean));
    const time = text.match(/\b(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\s*(?:-|–|—|to|until)\s*(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
    if (!days.length || !time) continue;
    const opens = parseTime(time[1], time[2], time[3]);
    const closes = parseTime(time[4], time[5], time[6]);
    if (!opens || !closes || closes <= opens) continue;
    const id = `${days.join('-')}-${opens.replace(':', '')}-${closes.replace(':', '')}`;
    schedules.push(sourced({ recurrence: { kind: 'weekly', weekdays: days }, opens, closes }, sourceId, verifiedAt, id));
  }
  if (!schedules.length) return undefined;
  return { timezone: sourced(timezone, sourceId, verifiedAt), schedules };
}

function monthNumber(value) {
  return MONTHS.get(value.toLowerCase());
}

function isoDate(year, month, day) {
  const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return realDate(value) ? value : undefined;
}

function parseSeason(texts, sourceId, verifiedAt) {
  for (const text of texts) {
    if (/\b(?:not|isn['’]?t|no longer)\s+(?:open\s+)?year[- ]round\b/i.test(text)) continue;
    if (/\b(?:market|we)\b.*\b(?:open|operates?|runs?|year[- ]round)\b|\bopen\b.*\byear[- ]round\b/i.test(text) && /\byear[- ]round\b/i.test(text)) {
      return sourced({ kind: 'year_round' }, sourceId, verifiedAt);
    }
    const match = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\s*(?:-|–|—|through|thru|to|until)\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i);
    if (match) {
      const startMonth = monthNumber(match[1]);
      const endMonth = monthNumber(match[4]);
      const year = match[3] ?? match[6];
      if (year) {
        const startDate = isoDate(year, startMonth, match[2]);
        const endDate = isoDate(match[6] ?? year, endMonth, match[5]);
        if (startDate && endDate && endDate >= startDate && endDate >= verifiedAt) {
          return sourced({ kind: 'dated_range', start_date: startDate, end_date: endDate }, sourceId, verifiedAt);
        }
      } else {
        return sourced({
          kind: 'annual_range',
          start: { month: startMonth, day: Number(match[2]) },
          end: { month: endMonth, day: Number(match[5]) },
        }, sourceId, verifiedAt);
      }
    }
    const months = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s*(?:-|–|—|through|thru|to|until)\s*(January|February|March|April|May|June|July|August|September|October|November|December)\b/i);
    if (months) {
      return sourced({ kind: 'annual_range', start: { month: monthNumber(months[1]) }, end: { month: monthNumber(months[2]) } }, sourceId, verifiedAt);
    }
  }
  return undefined;
}

function parsePayments(result, row, sourceId, verifiedAt) {
  const paymentTexts = safeEvidence(result, row, 'payment');
  const assistanceTexts = safeEvidence(result, row, 'assistance');
  const methods = new Map();
  for (const text of paymentTexts) {
    if (QUALIFIED_VENDOR_PAYMENT.test(text) || /\b(?:photo|background) credit\b/i.test(text)) continue;
    if (/\bvendors?\b/i.test(text) && !/\b(?:all|every) vendors?\b/i.test(text)) continue;
    if (/\b(?:for vendors?|vendor applications?|authorized vendors?|become a vendor)\b/i.test(text)) continue;
    if (/\?\s*$/.test(text)) continue;
    if (/\b(?:do|does|did|will) not accept\b|\bno longer accepts?\b|\bnot accepted\b/i.test(text)) continue;
    const accepted = /\b(?:we|market|market booth)\b.{0,35}\b(?:accepts?|takes?|prefers?)\b|\b(?:accepted|cash only)\b/i.test(text);
    if (!accepted) continue;
    const add = (code, label) => methods.set(code, sourced({ code }, sourceId, verifiedAt, label));
    if (/\bcash\b/i.test(text)) add('cash', 'cash');
    if (/\bcredit(?: cards?)?\b/i.test(text)) add('credit_card', 'credit-card');
    if (/\bdebit(?: cards?)?\b/i.test(text)) add('debit_card', 'debit-card');
    if (/\bchecks?\b/i.test(text)) add('check', 'check');
    if (/\b(?:apple pay|google pay|mobile wallet)\b/i.test(text)) add('mobile_wallet', 'mobile-wallet');
    if (/\bcontactless\b/i.test(text)) add('contactless', 'contactless');
    if (/\btokens?\b/i.test(text)) add('market_token', 'market-token');
  }
  const assistance = new Map();
  const assistancePatterns = [
    ['snap-ebt', 'snap_ebt', /\b(?:snap|ebt|calfresh)\b/i],
    ['wic', 'wic', /\bwic\b/i],
    ['sfmnp', 'sfmnp', /\b(?:sfmnp|senior farmers?['’]? market nutrition program)\b/i],
    ['fmnp', 'fmnp', /\b(?:fmnp|farmers?['’]? market nutrition program)\b/i],
    ['p-ebt', 'p_ebt', /\bp-?ebt\b/i],
  ];
  for (const text of assistanceTexts) {
    if (/\?\s*$/.test(text)) continue;
    if (/\bvendors?\b/i.test(text) && !/\b(?:all|every) vendors?\b/i.test(text)) continue;
    if (/\b(?:for vendors?|vendor applications?|authorized vendors?|become a vendor)\b/i.test(text)) continue;
    if (/\b(?:do|does|did|will) not accept\b|\bno longer accepts?\b|\bnot accepted\b|\bcurrently unable to accept\b/i.test(text)) continue;
    if (!/\b(?:accepts?|accepted|redeem|use|welcomes?|available|doubles?|matches?)\b/i.test(text)) continue;
    for (const [id, code, pattern] of assistancePatterns) {
      if (pattern.test(text) && !(code === 'fmnp' && /\b(?:sfmnp|senior)\b/i.test(text))) {
        assistance.set(code, sourced({ code }, sourceId, verifiedAt, id));
      }
    }
  }
  const incentives = [];
  for (const text of assistanceTexts) {
    const amount = text.match(/\b(?:double(?:s|d)?|match(?:es|ed)?)\b.{0,80}?\b(?:up to|max(?:imum)?(?: of)?)\s*\$\s*(\d+(?:\.\d{1,2})?)\b/i);
    const name = text.match(/\b(Double Up Food Bucks|Market Match|Matching Dollars)\b/i)?.[1];
    if (!amount || !name || !/\b(?:snap|ebt|calfresh)\b/i.test(text)) continue;
    incentives.push(sourced({ name, kind: 'match', maximum_amount: Number(amount[1]), currency: 'USD', applies_to: ['SNAP/EBT'] }, sourceId, verifiedAt, slug(name)));
  }
  if (!methods.size && !assistance.size && !incentives.length) return undefined;
  return {
    ...(methods.size ? { methods: [...methods.values()] } : {}),
    ...(assistance.size ? { assistance: [...assistance.values()] } : {}),
    ...(incentives.length ? { incentives } : {}),
  };
}

function parseAccess(result, row, sourceId, verifiedAt) {
  const access = {};
  for (const text of safeEvidence(result, row, 'parking')) {
    if (evidenceIsExpired(text, verifiedAt)) continue;
    if (!/\b(?:parking (?:is )?(?:available|free|paid|limited)|free parking|paid parking|limited(?: [a-z-]+){0,2} parking)\b/i.test(text)) continue;
    const availability = /\blimited(?: [a-z-]+){0,2} parking\b|\bparking (?:is )?limited\b/i.test(text) ? 'limited' : 'yes';
    const parking = { availability: sourced(availability, sourceId, verifiedAt) };
    if (/\bfree parking\b/i.test(text)) parking.cost = sourced('free', sourceId, verifiedAt);
    if (/\bpaid parking\b/i.test(text)) parking.cost = sourced('paid', sourceId, verifiedAt);
    if (text.length <= 240) parking.location_note = sourced(text, sourceId, verifiedAt);
    access.parking = parking;
    break;
  }
  const transit = new Map();
  for (const text of safeEvidence(result, row, 'transit')) {
    if (/\b(?:microgreens?|sponsors?|giveaways?|wholesale|kid['’]?s train|train tracks? \(inactive\)|parking lot|picked .{0,40}truck\/train|metro community|markets? across the (?:city|county|metro))\b/i.test(text)) continue;
    const modes = [];
    if (/\b(?:bus routes?|bus stops?|take (?:the )?bus|by bus|buses? (?:stop|serve|run)|transit planner.{0,100}\bbus)\b/i.test(text)) modes.push('bus');
    if (/\b(?:(?:take|via|by|accessible|served|near|adjacent|midway).{0,60}(?:metro|subway|train|rail)(?: stop| station| line)?|(?:metro|subway|train|rail) (?:stop|station|service|line).{0,60}(?:market|walk|block|nearby))\b/i.test(text)) modes.push('rail');
    if (!/\bferry building\b/i.test(text) && /\b(?:(?:take(?: the)?|via|by|accessible|served).{0,40}ferry|ferry (?:service|terminal|route))\b/i.test(text)) modes.push('ferry');
    if (/\b(?:shuttle (?:bus|service|route|stop)|take (?:the )?shuttle)\b/i.test(text)) modes.push('shuttle');
    const exactModes = modes.includes('shuttle') ? modes.filter((mode) => mode !== 'bus') : modes;
    for (const mode of unique(exactModes)) {
      if (!transit.has(mode)) transit.set(mode, sourced({ mode, note: text.slice(0, 300) }, sourceId, verifiedAt, `${mode}-access`));
    }
    if (transit.size >= 3) break;
  }
  if (transit.size) access.transit = [...transit.values()];
  for (const text of safeEvidence(result, row, 'accessibility')) {
    if (!/\b(?:wheelchair|ada)[ -]?accessible\b/i.test(text)) continue;
    access.accessibility_note = sourced(text.slice(0, 300), sourceId, verifiedAt);
    break;
  }
  return Object.keys(access).length ? access : undefined;
}

function parseAmenitiesAndPolicies(result, row, sourceId, verifiedAt) {
  const amenities = new Map();
  const policies = new Map();
  const amenityRules = [
    ['restrooms', /\b(?:public |ada[- ]accessible )?restrooms? (?:are |is )?(?:available|located|provided)\b|\b(?:available|public) restrooms?\b/i],
    ['seating', /\b(?:seating|seats) (?:is |are )?(?:available|provided)\b/i],
    ['picnic_area', /\bpicnic (?:area|tables?) (?:is |are )?(?:available|provided)\b/i],
    ['shade', /\bshade (?:is )?(?:available|provided)\b|\bshade tent\b/i],
    ['drinking_water', /\bdrinking water (?:is )?(?:available|provided)\b/i],
    ['atm', /\batms? (?:is |are )?(?:available|located)\b/i],
    ['wifi', /\b(?:free )?wi-?fi (?:is )?available\b/i],
    ['information_booth', /\b(?:market )?information booth\b/i],
  ];
  for (const text of safeEvidence(result, row, 'amenities')) {
    if (NON_MARKET_HOURS.test(text) && !/\binformation booth\b/i.test(text)) continue;
    for (const [code, pattern] of amenityRules) {
      if (pattern.test(text)) amenities.set(code, sourced({ code, availability: 'yes', ...(text.length <= 220 ? { note: text } : {}) }, sourceId, verifiedAt, code.replaceAll('_', '-')));
    }
    if (/\blive music (?:at|in) (?:the|our) market\b/i.test(text)) amenities.set('live_music', sourced({ code: 'live_music', availability: 'yes' }, sourceId, verifiedAt, 'live-music'));
    if (/\b(?:kids|children(?:'s)?) activities (?:at|in) (?:the|our) market\b/i.test(text)) amenities.set('kids_activities', sourced({ code: 'kids_activities', availability: 'yes' }, sourceId, verifiedAt, 'kids-activities'));
  }
  for (const text of safeEvidence(result, row, 'pets')) {
    if (/\?\s*$/.test(text) || /\b(?:dog days|pet food|animal feed|hot dogs?)\b/i.test(text)) continue;
    let rule;
    if (/\b(?:service animals? only|no (?:dogs|pets|animals).{0,50}except (?:for )?service animals?|(?:dogs|pets|animals) (?:are )?not allowed.{0,100}service animals? (?:are )?(?:permitted|allowed|welcome)|(?:dogs|pets|animals) (?:are )?not allowed.{0,30}except (?:for )?service animals?)\b/i.test(text)) rule = 'service_animals_only';
    else if (/\b(?:no|do not bring) (?:dogs|pets|animals)\b|\b(?:dogs|pets|animals) (?:are )?(?:not allowed|prohibited)\b/i.test(text)) rule = 'not_allowed';
    else if (/\b(?:the|our) market (?:is )?(?:dog|pet)[ -]?friendly\b|\b(?:dogs|pets) (?:are )?(?:allowed|welcome) (?:at|in) (?:the|our) market\b/i.test(text)) rule = 'allowed';
    else if (/\b(?:dogs|pets).{0,60}(?:leash|walkways?|vendors?)\b/i.test(text)) rule = 'conditional';
    if (rule === 'not_allowed' && /\b(?:indoors?|inside|pavilion|vendor (?:selling )?(?:area|stalls?)|market area)\b/i.test(text)) rule = 'conditional';
    if (rule) {
      policies.set('pets', sourced({ code: 'pets', rule, ...(text.length <= 240 ? { note: text } : {}) }, sourceId, verifiedAt, 'pet-policy'));
      break;
    }
  }
  for (const text of safeEvidence(result, row, 'weather')) {
    if (/\b(?:most|many|some|all) (?:farmers? )?markets?\b/i.test(text)) continue;
    if (/\brain or shine\b/i.test(text)) {
      policies.set('weather', sourced({ code: 'weather', rule: 'rain_or_shine', ...(text.length <= 240 ? { note: text } : {}) }, sourceId, verifiedAt, 'weather-policy'));
      break;
    }
  }
  return {
    amenities: amenities.size ? [...amenities.values()] : undefined,
    policies: policies.size ? [...policies.values()] : undefined,
  };
}

function parseVendors(result, row, sourceId, verifiedAt) {
  let count;
  for (const text of safeEvidence(result, row, 'vendors')) {
    if (/\b(?:applications?|apply|load list|vendor fee|booth fee)\b/i.test(text)) continue;
    if (evidenceIsExpired(text, verifiedAt)) continue;
    if (/\b(?:did we miss|my (?:husband|wife)|only saw|vendor members?|grew to|during the pandemic|re-?establish|space for|capacity|up to)\b/i.test(text)) continue;
    if (/\b(?:winter|holiday|christmas|raffle|special event)\b/i.test(text) && !/\b(?:winter|holiday|christmas|festival|event)\b/i.test(row.market_name)) continue;
    if (/\b\d{1,4}\s*(?:-|–|—|to)\s*\d{1,4}\s+(?:weekly |local )?vendors?\b/i.test(text)) continue;
    const match = text.match(/\b(over|more than|approximately|about)?\s*(\d{1,4})\+?\s+(?:weekly |local )?vendors?\b/i);
    if (!match) continue;
    const numericCount = Number(match[2]);
    if (numericCount < 3 || numericCount > 500 || (numericCount >= 1900 && numericCount <= 2099)) continue;
    const before = text.slice(Math.max(0, match.index - 140), match.index).toLowerCase();
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 140).toLowerCase();
    const contextual = text.length <= 80
      || /\b(?:market|we|with|shop|features?|hosts?|home to|lineup|includes?|return)\b/.test(before)
      || /\b(?:at the market|each week|weekly|offering|selling|return|lineup|market)\b/.test(after);
    if (!contextual) continue;
    count = sourced({ value: numericCount, ...(match[1] || /\+/.test(match[0]) ? { qualifier: (match[1] ?? 'at least').toLowerCase() } : {}) }, sourceId, verifiedAt);
    break;
  }
  const ownWords = significantNameWords(row.market_name);
  const rosterLink = (result.relevant_links ?? []).find((link) => {
    if (!/\b(?:vendor|seller) (?:directory|list|roster)\b/i.test(link.text ?? '')) return false;
    try {
      const urlText = normalize(new URL(link.href).pathname);
      return ownWords.some((word) => urlText.split(' ').includes(word)) || ownWords.some((word) => normalize(link.text).includes(word));
    } catch {
      return false;
    }
  });
  if (!count && !rosterLink) return undefined;
  return {
    ...(count ? { count } : {}),
    ...(rosterLink ? { directory_url: sourced(rosterLink.href, sourceId, verifiedAt) } : {}),
  };
}

function parseProducts(result, row, sourceId, verifiedAt) {
  const categories = new Map();
  const rules = [
    ['fresh_produce', /\b(?:fresh |seasonal )?(?:produce|fruits? and vegetables?)\b/i],
    ['meat', /\b(?:meat|beef|pork|poultry)\b/i], ['dairy', /\b(?:dairy|cheese|milk)\b/i],
    ['eggs', /\beggs?\b/i], ['herbs', /\bherbs?\b/i], ['crafts', /\b(?:crafts?|handmade goods?)\b/i],
    ['prepared_food', /\bprepared foods?\b/i], ['baked_goods', /\b(?:baked goods?|bread|pastries)\b/i],
    ['flowers', /\bflowers?\b/i], ['honey', /\bhoney\b/i], ['preserves', /\b(?:preserves|jams?|jellies)\b/i],
    ['wine', /\b(?:wine|wines)\b/i],
  ];
  for (const text of safeEvidence(result, row, 'products')) {
    if (!/\b(?:(?:the|our) market (?:offers?|features?|sells?|has)|vendors? (?:offer|sell|bring|have)|(?:shop|find|buy).{0,80} at (?:the|our) market)\b/i.test(text)) continue;
    if (/\b(?:vendor spotlight|featured vendor|our farm|our stand|tasting|demo|class|recipe|snap|ebt|tokens?|vouchers?|eligible (?:foods?|items?)|benefits? (?:may|can))\b/i.test(text)) continue;
    for (const [code, pattern] of rules) {
      if (pattern.test(text)) categories.set(code, sourced({ code }, sourceId, verifiedAt, code.replaceAll('_', '-')));
    }
  }
  return categories.size ? { categories: [...categories.values()] } : undefined;
}

function parseEvents(result, row, sourceId, verifiedAt) {
  const events = [];
  for (const text of safeEvidence(result, row, 'programs')) {
    const match = text.match(/\b(?:the|our) market hosts?\s+(.{3,80}?)\s+on\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i);
    if (!match) continue;
    const eventName = cleanExcerpt(match[1]).replace(/[,:;-]+$/, '');
    const date = isoDate(match[4], monthNumber(match[2]), match[3]);
    if (!eventName || !date || date < verifiedAt) continue;
    const lower = eventName.toLowerCase();
    const kind = /music|concert/.test(lower) ? 'music' : /kid|child/.test(lower) ? 'kids' : /workshop|class|demo/.test(lower) ? 'workshop' : /festival/.test(lower) ? 'festival' : 'other';
    events.push(sourced({ name: eventName, kind, start: date }, sourceId, verifiedAt, `${slug(eventName)}-${date}`));
  }
  return events.length ? events : undefined;
}

function parseLanguages(result, row, sourceId, verifiedAt) {
  const languageMap = new Map([
    ['english', 'en'], ['spanish', 'es'], ['french', 'fr'], ['chinese', 'zh'], ['mandarin', 'zh'],
    ['vietnamese', 'vi'], ['russian', 'ru'], ['japanese', 'ja'], ['korean', 'ko'], ['arabic', 'ar'],
    ['portuguese', 'pt'], ['german', 'de'], ['italian', 'it'], ['hindi', 'hi'],
  ]);
  const spoken = new Map();
  const materials = new Map();
  for (const text of safeEvidence(result, row, 'languages')) {
    const spokenSegment = text.match(/\b(?:we|market staff|market team) (?:speak|speaks)\s+(.+?)(?:[.;]|,\s+(?:and\s+)?(?:materials?|information|signage|translation)\b|$)/i)?.[1]
      ?? text.match(/\bse habla\s+(.+?)(?:[.;]|$)/i)?.[1];
    const materialSegment = text.match(/\b(?:materials?|information|signage|translation) (?:is |are )?(?:available|provided|offered) (?:in|for)\s+(.+?)(?:[.;]|$)/i)?.[1];
    if (!spokenSegment && !materialSegment) continue;
    for (const [label, tag] of languageMap) {
      const item = sourced({ tag, label: label[0].toUpperCase() + label.slice(1) }, sourceId, verifiedAt, slug(label));
      if (spokenSegment && new RegExp(`\\b${label}\\b`, 'i').test(spokenSegment)) spoken.set(tag, item);
      if (materialSegment && new RegExp(`\\b${label}\\b`, 'i').test(materialSegment)) materials.set(tag, item);
    }
  }
  if (!spoken.size && !materials.size) return undefined;
  return { ...(spoken.size ? { spoken: [...spoken.values()] } : {}), ...(materials.size ? { materials: [...materials.values()] } : {}) };
}

function parseFaq(result, row, sourceId, verifiedAt) {
  const facts = [];
  for (const text of safeEvidence(result, row, 'faq')) {
    const match = text.match(/^\s*(?:Q(?:uestion)?\s*:\s*)?(.+?\?)\s*(?:A(?:nswer)?\s*:\s*)(.{2,300})$/i);
    if (!match) continue;
    const question = cleanExcerpt(match[1]);
    const answer = cleanExcerpt(match[2])
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => !/\bvendors? (?:are )?(?:permitted|allowed|required) to (?:set up|arrive|check in)\b/i.test(sentence))
      .join(' ');
    if (!answer || answer.length < 12 || /\?\s*$/.test(answer) || /\b(?:near|at|and|or|the|to|from|including)\s*[:;,.-]*$/i.test(answer)) continue;
    if (/^(?:find out how|send us an email|market schedule|mailing address|events directory|prospective vendors?|vendor application|thank you|enter fullscreen|directions to|join our email list|follow .+ on (?:instagram|facebook)|(?:please )?(?:see|visit|click)\b|for information .{0,100}\bvisit\b)/i.test(answer)) continue;
    if (/\b(?:becom(?:e|ing) a vendor|vendor (?:application|community|requirements?|scheduling)|sell(?:ing)? (?:at|my|your)|table at|tabling|promot(?:e|ing) (?:my|your) business|marketing opportunities|volunteer opportunities|host an event|rentals?|professional (?:photo|video)|who (?:owns|runs)|market management|sponsors?|donat(?:e|ion)|support (?:our|the) market|office open|vendor refunds?|booth fees?|electricity available|what do i need to bring)\b/i.test(question)) continue;
    let topic;
    if (/\b(?:pets?|dogs?|animals?)\b/i.test(question) && /\b(?:pets?|dogs?|animals?|service animals?|leash(?:ed)?|allowed|permitted|prohibited)\b/i.test(answer)) topic = 'pets';
    else if (/\bpark(?:ing)?\b/i.test(question) && /\b(?:park(?:ing)?|garage|lot|street|spaces?)\b/i.test(answer)) topic = 'parking';
    else if (/\b(?:pay(?:ment)?|cash|credit|debit|cards?|snap|ebt|wic|benefits?|food assistance|match)\b/i.test(question)
      && /\b(?:cash|credit|debit|cards?|snap|ebt|wic|benefits?|tokens?|vouchers?|match|accept(?:ed|s)?)\b/i.test(answer)) topic = 'payments';
    else if (/\b(?:accessib(?:le|ility)|wheelchairs?|strollers?|mobility|ada)\b/i.test(question)
      && /\b(?:accessib(?:le|ility)|wheelchairs?|strollers?|mobility|paved|gravel|ramps?|elevators?|terrain)\b/i.test(answer)) topic = 'accessibility';
    else if (/\b(?:weather|rain(?:s|ing|y)?|snow(?:s|ing|y)?|inclement|cancel(?:led|lation)?)\b/i.test(question)
      && /\b(?:weather|rain(?:s|ing|y)?|snow(?:s|ing|y)?|storm|shine|cancel(?:led|lation)?|open|closed|delay)\b/i.test(answer)) topic = 'weather';
    else if (/\b(?:what (?:is|can be) sold|what can (?:i|you) (?:buy|find)|products? (?:are|can)|what is available)\b/i.test(question)
      && /\b(?:produce|fruits?|vegetables?|foods?|meat|dairy|eggs?|bread|baked|flowers?|honey|crafts?|products?|vendors?)\b/i.test(answer)) topic = 'products';
    else if (/\b(?:when|where|hours?|open|located|location)\b/i.test(question)
      && /\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|a\.?m\.?|p\.?m\.?|hours?|open|located|street|road|avenue|boulevard|lot|season|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(answer)) topic = 'arrival';
    else if (/\b(?:stay informed|market updates?|keep up to date|latest (?:market )?(?:news|status)|stay in the loop)\b/i.test(question)
      && /\b(?:newsletter|social media|facebook|instagram|email updates?|website)\b/i.test(answer)) topic = 'updates';
    if (!topic) continue;
    facts.push(sourced({ topic, answer }, sourceId, verifiedAt, `${topic}-${facts.length + 1}`));
  }
  return facts.length ? facts : undefined;
}

function socialPlatform(value) {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'facebook.com') return 'facebook';
    if (host === 'instagram.com') return 'instagram';
    if (host === 'linkedin.com') return 'linkedin';
    if (host === 'tiktok.com') return 'tiktok';
    if (host === 'twitter.com' || host === 'x.com') return 'x';
    if (host === 'youtube.com') return 'youtube';
  } catch {
    return undefined;
  }
  return undefined;
}

function marketSpecificSocials(values, row, sourceId, verifiedAt) {
  const marketCompact = normalize(row.market_name).replace(/\b(?:the|of|and)\b/g, '').replace(/\s+/g, '');
  const aliases = unique([
    marketCompact,
    marketCompact.replace(/farmers/g, 'farmer'),
    marketCompact.replace(/farmersmarket/g, 'farmersmkt'),
    marketCompact.replace(/farmersmarket/g, 'fm'),
    marketCompact.replace(/farmers?/g, ''),
  ]).filter((value) => value.length >= 6);
  const profiles = new Map();
  for (const value of values ?? []) {
    let url;
    try { url = new URL(value); } catch { continue; }
    const platform = socialPlatform(value);
    if (!platform || /\/profile\.php$/i.test(url.pathname)) continue;
    const handle = normalize(url.pathname).replace(/\s+/g, '');
    if (!aliases.some((alias) => handle.includes(alias))) continue;
    url.protocol = 'https:';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    const canonical = url.toString();
    const id = `${platform}-${slug(handle).slice(0, 60)}`;
    profiles.set(id, sourced({ platform, url: canonical, scope: 'market' }, sourceId, verifiedAt, id));
  }
  return [...profiles.values()];
}

function marketSpecificNewsletter(values, row, pageUrl, sourceId, verifiedAt) {
  const compact = normalize(row.market_name).replace(/\b(?:the|of|and)\b/g, '').replace(/\s+/g, '');
  const aliases = unique([compact, compact.replace(/farmers?/g, '')]).filter((value) => value.length >= 6);
  for (const value of values ?? []) {
    try {
      const url = new URL(value);
      const base = new URL(pageUrl);
      if (url.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) continue;
      if (!/\b(?:newsletter|subscribe|email updates|mailing list)\b/i.test(`${url.pathname} ${url.search}`)) continue;
      const siteIdentity = normalize(`${base.hostname} ${base.pathname}`).replace(/\s+/g, '');
      if (!aliases.some((alias) => siteIdentity.includes(alias))) continue;
      return sourced({ signup_url: url.toString() }, sourceId, verifiedAt);
    } catch {
      // Ignore malformed audit artifacts.
    }
  }
  return undefined;
}

function pageFacts(page, row, sourceId, verifiedAt, { baseSocials = [], baseNewsletters = [], isBase = true } = {}) {
  const scheduleTexts = safeEvidence(page, row, 'schedule');
  const firstParty = {};
  const detailLabel = `${page.page_title ?? ''} ${stringList(page.h1).slice(-2).join(' ')}`;
  const operationsAllowed = isBase || /\b(?:hours?|schedule|season|visit|location|market map|plan your visit|faq)\b/i.test(detailLabel);
  const visitorAllowed = isBase || /\b(?:faq|visitor|visit|plan|benefits?|payments?|snap|ebt|wic|nutrition|food access|accessibility|parking|directions?|location)\b/i.test(detailLabel);
  const vendorsAllowed = isBase || /\b(?:vendors?|sellers?|products?|market map)\b/i.test(detailLabel);
  const eventsAllowed = isBase || /\b(?:events?|calendar|programs?)\b/i.test(detailLabel);
  const season = operationsAllowed ? parseSeason([...scheduleTexts, ...safeEvidence(page, row, 'weather')], sourceId, verifiedAt) : undefined;
  const operations = operationsAllowed ? { ...parseSchedules(scheduleTexts, sourceId, verifiedAt), ...(season ? { season } : {}) } : {};
  if (Object.keys(operations).length) firstParty.operations = operations;
  const payments = visitorAllowed ? parsePayments(page, row, sourceId, verifiedAt) : undefined;
  if (payments) firstParty.payments = payments;
  const access = visitorAllowed ? parseAccess(page, row, sourceId, verifiedAt) : undefined;
  if (access) firstParty.access = access;
  const { amenities, policies } = visitorAllowed ? parseAmenitiesAndPolicies(page, row, sourceId, verifiedAt) : {};
  if (amenities) firstParty.amenities = amenities;
  if (policies) firstParty.policies = policies;
  const vendors = vendorsAllowed ? parseVendors(page, row, sourceId, verifiedAt) : undefined;
  if (vendors) firstParty.vendors = vendors;
  const products = vendorsAllowed ? parseProducts(page, row, sourceId, verifiedAt) : undefined;
  if (products) firstParty.products = products;
  const events = eventsAllowed ? parseEvents(page, row, sourceId, verifiedAt) : undefined;
  if (events) firstParty.events = events;
  const languages = visitorAllowed ? parseLanguages(page, row, sourceId, verifiedAt) : undefined;
  if (languages) firstParty.languages = languages;
  const faq = (isBase || /\bfaq\b/i.test(detailLabel)) ? parseFaq(page, row, sourceId, verifiedAt) : undefined;
  if (faq) firstParty.faq_facts = faq;
  const socialProfiles = marketSpecificSocials(baseSocials, row, sourceId, verifiedAt);
  const newsletter = marketSpecificNewsletter(baseNewsletters, row, page.final_url, sourceId, verifiedAt);
  if (socialProfiles.length || newsletter) firstParty.contact = {
    ...(socialProfiles.length ? { social_profiles: socialProfiles } : {}),
    ...(newsletter ? { newsletter } : {}),
  };
  return firstParty;
}

function mergeFacts(target, addition) {
  for (const [key, value] of Object.entries(addition)) {
    if (!Object.hasOwn(target, key)) {
      target[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      const existingIds = new Set(target[key].map((item) => item.id));
      target[key].push(...value.filter((item) => !existingIds.has(item.id)));
      continue;
    }
    if (value && typeof value === 'object' && !Object.hasOwn(value, 'source_ids')) {
      mergeFacts(target[key], value);
    }
    // Conflicting sourced scalars retain the first page's value.
  }
  return target;
}

function detailPages(detail, row) {
  if (!detail || detail.disposition !== 'detail_audited' || !detail.matched_row_keys?.includes(row.row_key)) return undefined;
  const pages = (detail.pages ?? []).map((page) => ({
    final_url: page.url,
    page_title: page.title,
    h1: page.h1 ?? [],
    headings: [],
    evidence: page.evidence ?? [],
    relevant_links: [],
    social_profiles: page.social_profiles ?? [],
    newsletter_urls: page.newsletter_urls ?? [],
  }));
  if (!pages.length || !marketIdentitySurfaceMatches(row, pages[0])) return [];
  return pages.filter((page) => marketIdentitySurfaceMatches(row, page));
}

function fieldsFor(firstParty) {
  return Object.keys(firstParty).map((key) => `first_party.${key}`);
}

function referencedSourceIds(value, found = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((entry) => referencedSourceIds(entry, found));
  } else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'source_ids' && Array.isArray(entry)) entry.forEach((id) => found.add(id));
      else referencedSourceIds(entry, found);
    }
  }
  return found;
}

function eligibleContext(row, target, result, duplicateMarketIds) {
  if (!row || !target || !result) return 'missing_input';
  if (duplicateMarketIds.has(String(row.market_id))) return 'duplicate_market_id';
  if (result.disposition !== 'rendered_identity_matched') return result.disposition ?? 'unknown_disposition';
  if (target.linked_markets !== 1 || target.risk_class !== 'single_market_page' || target.row_keys?.length !== 1) return 'shared_or_umbrella_target';
  const matching = (result.identity_decisions ?? []).filter((decision) => decision.identity_match === true);
  if (matching.length !== 1 || matching[0].row_key !== row.row_key) return 'identity_not_unique';
  if (!marketIdentitySurfaceMatches(row, result)) return 'weak_identity_surface';
  if (pageLooksUmbrella(result)) return 'umbrella_page_surface';
  if (!/^https?:\/\//i.test(result.final_url ?? '')) return 'missing_final_url';
  return undefined;
}

export function promoteWebsiteAudit({ rows, targets, results, details = [], verifiedAt }) {
  if (!realDate(verifiedAt)) throw new Error('verifiedAt must be a real YYYY-MM-DD date');
  const rowsByKey = new Map(rows.map((row) => [row.row_key, row]));
  const targetsById = new Map(targets.map((target) => [target.target_id, target]));
  const detailsByTarget = new Map(details.map((detail) => [detail.target_id, detail]));
  const ids = new Map();
  for (const row of rows) ids.set(String(row.market_id), (ids.get(String(row.market_id)) ?? 0) + 1);
  const duplicateMarketIds = new Set([...ids].filter(([, count]) => count > 1).map(([id]) => id));
  const records = [];
  const promotedMarketIds = new Set();
  const dispositions = {};
  const disposition = (name) => { dispositions[name] = (dispositions[name] ?? 0) + 1; };

  const orderedResults = [...results].sort((left, right) => {
    const detailScore = (result) => (detailsByTarget.get(result.target_id)?.pages ?? []).reduce((sum, page) => sum + (page.evidence?.length ?? 0), 0);
    return detailScore(right) - detailScore(left)
      || (right.evidence?.length ?? 0) - (left.evidence?.length ?? 0)
      || left.target_id.localeCompare(right.target_id, 'en');
  });
  for (const result of orderedResults) {
    const target = targetsById.get(result.target_id);
    const rowKey = target?.row_keys?.[0];
    const row = rowsByKey.get(rowKey);
    const ineligible = eligibleContext(row, target, result, duplicateMarketIds);
    if (ineligible) {
      disposition(ineligible);
      continue;
    }
    if (promotedMarketIds.has(String(row.market_id))) {
      disposition('duplicate_promoted_market_id');
      continue;
    }
    const firstParty = {};
    const detail = detailsByTarget.get(result.target_id);
    const safeDetailPages = detailPages(detail, row);
    if (detail && !safeDetailPages?.length) {
      disposition('detail_identity_not_exact');
      continue;
    }
    const pages = safeDetailPages ?? [result];
    const sources = [];
    for (const [pageIndex, page] of pages.entries()) {
      const sourceId = `website-audit-${result.target_id.slice(0, 12)}-${pageIndex + 1}`;
      const facts = pageFacts(page, row, sourceId, verifiedAt, {
        baseSocials: pageIndex === 0 ? page.social_profiles : [],
        baseNewsletters: pageIndex === 0 ? page.newsletter_urls : [],
        isBase: pageIndex === 0,
      });
      if (!Object.keys(facts).length) continue;
      mergeFacts(firstParty, facts);
      sources.push({
        id: sourceId,
        title: sourceTitle(row, page),
        url: page.final_url,
        fields: fieldsFor(facts),
        kind: 'first_party',
        scope: 'market',
        accessed_at: verifiedAt,
      });
    }
    const usedSourceIds = referencedSourceIds(firstParty);
    const usedSources = sources.filter((source) => usedSourceIds.has(source.id));
    if (!Object.keys(firstParty).length) {
      disposition('no_promotable_market_scoped_facts');
      continue;
    }
    const record = {
      id: String(row.market_id),
      market_name: row.market_name,
      verified_at: verifiedAt,
      verification_scope: 'partial',
      schema_version: 2,
      first_party: firstParty,
      sources: usedSources,
    };
    validateRichEnrichment(record, `promoted ${row.row_key}`, (message) => { throw new Error(message); });
    records.push(record);
    promotedMarketIds.add(record.id);
    disposition('promoted');
  }
  records.sort((left, right) => left.id.localeCompare(right.id, 'en'));
  return { records, dispositions };
}

async function readJsonl(file) {
  const text = await fs.readFile(file, 'utf8');
  return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch (error) { throw new Error(`${file}:${index + 1}: ${error.message}`); }
  });
}

async function readJsonlDirectory(directory) {
  try {
    const names = await fs.readdir(directory);
    const records = [];
    for (const name of names.filter((value) => value.endsWith('.jsonl')).sort()) {
      records.push(...await readJsonl(path.join(directory, name)));
    }
    return records;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function existingRichIds(output) {
  const directory = path.join(process.cwd(), 'data/enrichment');
  const outputPath = path.resolve(output);
  const ids = new Set();
  for (const name of (await fs.readdir(directory)).filter((value) => /^research-.+\.json$/.test(value)).sort()) {
    const filePath = path.join(directory, name);
    if (path.resolve(filePath) === outputPath) continue;
    const records = JSON.parse(await fs.readFile(filePath, 'utf8'));
    for (const record of records) if (record?.first_party) ids.add(String(record.id));
  }
  return ids;
}

function option(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

async function main() {
  const auditRoot = path.resolve(option('audit-root', DEFAULT_ROOT));
  const output = path.resolve(option('output', DEFAULT_OUTPUT));
  const verifiedAt = option('verified-at', new Date().toISOString().slice(0, 10));
  const [rows, targets, results, details] = await Promise.all([
    readJsonl(path.join(auditRoot, 'rows.jsonl')),
    readJsonl(path.join(auditRoot, 'targets.jsonl')),
    readJsonlDirectory(path.join(auditRoot, 'results')),
    readJsonlDirectory(path.join(auditRoot, 'details')),
  ]);
  const duplicateTargetIds = results.map((result) => result.target_id).filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateTargetIds.length) throw new Error(`duplicate target results: ${unique(duplicateTargetIds).join(', ')}`);
  const duplicateDetailIds = details.map((detail) => detail.target_id).filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateDetailIds.length) throw new Error(`duplicate detail results: ${unique(duplicateDetailIds).join(', ')}`);
  const promoted = promoteWebsiteAudit({ rows, targets, results, details, verifiedAt });
  const existing = await existingRichIds(output);
  const records = promoted.records.filter((record) => !existing.has(record.id));
  const excluded = promoted.records.length - records.length;
  if (excluded) promoted.dispositions.existing_rich_record = excluded;
  await fs.writeFile(output, `${JSON.stringify(records, null, 2)}\n`);
  console.log(JSON.stringify({ input_results: results.length, input_details: details.length, output_records: records.length, dispositions: promoted.dispositions, output }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
