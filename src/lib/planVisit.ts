/**
 * The "Plan your visit" summary at the top of a market page.
 *
 * A visitor searching a market's name wants five answers fast: when it is
 * open, how to get there and park, how to pay, what is sold, and who sells it.
 * This module answers each from source-backed fields only, one short line per
 * fact, and returns nothing for a question the record cannot answer. When too
 * few questions can be answered the caller skips the block entirely and the
 * page falls back to the full "Market details" list, so thin records never
 * get an empty or "unknown" summary.
 *
 * Pure functions of one record, unit tested in `planVisit.test.ts`.
 */

import { clean } from './geo.ts';
import type { MarketFirstPartyFacts } from './enrichment.ts';
import {
  paymentLabels,
  productLabels,
  structuredScheduleLabels,
  type MarketFactsRecord,
} from './marketFacts.ts';
import { compactClock, marketHours, marketScheduleLabels, marketSeasonLabel, marketWeekdays, shortDayList } from './seo.ts';

export interface PlanVisitItem {
  text: string;
  /** Absolute http(s) URL when the line is a link. */
  href?: string;
}

export interface PlanVisitRow {
  /** Stable key, also used to tell `MarketFacts` which rows are covered. */
  key: 'when' | 'getting-there' | 'paying' | 'sold' | 'vendors' | 'good-to-know';
  term: string;
  items: PlanVisitItem[];
}

/** `MarketFacts` terms the summary already answers, so they are not repeated. */
export const PLAN_VISIT_COVERED_TERMS: Record<PlanVisitRow['key'], string[]> = {
  when: ['Schedule', 'Days', 'Hours', 'Season', 'Current status'],
  'getting-there': ['Transit', 'Parking', 'Bike parking'],
  paying: ['Payment', 'Save with'],
  sold: ['Sold here'],
  vendors: ['Vendors'],
  'good-to-know': ['Accessibility', 'Visitor policies'],
};

/**
 * Terms the card covers whenever it renders: amenities become chips (their
 * notes go to "More details"), the visitor note restates the hours, and the
 * legacy setting is superseded by the researched access facts.
 */
export const PLAN_VISIT_CARD_TERMS = ['Amenities', 'Before you go', 'Setting'];

/** Fewest answered questions for the summary to be worth showing. */
export const PLAN_VISIT_MIN_ROWS = 3;

type FirstParty = MarketFirstPartyFacts;

function httpUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function sentence(value?: string | null): string {
  const text = clean(value).replace(/\s+/g, ' ').trim().replace(/[\s:;,]+$/, '');
  if (!text) return '';
  return /[.!?)]$/.test(text) ? text : `${text}.`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDate(iso: string): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return undefined;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${Number(match[3])}` : undefined;
}

function clock(value: string): string | undefined {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return `${hour % 12 || 12}${minute ? `:${match[2]}` : ''}${hour < 12 ? 'am' : 'pm'}`;
}

/**
 * Upcoming closures and holiday openings, soonest first. Date-only strings are
 * compared as dates, so an exception stays listed through its own day; the
 * page revalidates daily, which drops it the day after.
 */
export function upcomingExceptions(firstParty: FirstParty | undefined, today: string, limit = 3): string[] {
  const items = (firstParty?.operations?.exceptions ?? [])
    .map((item) => item.value)
    .filter((value) => (value.end_date ?? value.start_date) >= today)
    .sort((left, right) => left.start_date.localeCompare(right.start_date));
  const lines: string[] = [];
  for (const value of items.slice(0, limit)) {
    const start = shortDate(value.start_date);
    if (!start) continue;
    const end = value.end_date && value.end_date !== value.start_date ? shortDate(value.end_date) : undefined;
    const when = end ? `${start}-${end}` : start;
    const note = value.note ? ` (${clean(value.note).replace(/\.$/, '')})` : '';
    if (value.status === 'closed') {
      lines.push(`Closed ${when}${note}`);
    } else {
      const opens = clock(value.opens);
      const closes = clock(value.closes);
      if (opens && closes) lines.push(`${when}: open ${opens}-${closes}${note}`);
    }
  }
  return lines;
}

/**
 * "Tue-Fri 9am-6pm, Sat 8am-6pm" per labelled group, so a market with a
 * separate farmers market inside it reads as two short lines instead of five.
 * Dated or non-weekly windows fall back to the full labels, which keep them.
 */
export function compactScheduleLines(firstParty?: FirstParty): string[] {
  const schedules = firstParty?.operations?.schedules ?? [];
  if (!schedules.length) return [];
  const status = firstParty?.operations?.status?.value.value;
  if (status === 'permanently_closed' || status === 'temporarily_closed') return [];
  if (schedules.some((item) => item.value.recurrence.kind !== 'weekly' || item.value.recurrence.interval_weeks === 2 || item.value.start_date || item.value.end_date)) {
    return structuredScheduleLabels(firstParty);
  }
  const groups = new Map<string, Map<string, string[]>>();
  for (const item of schedules) {
    const value = item.value;
    const opens = compactClock(value.opens);
    const closes = compactClock(value.closes);
    if (!opens || !closes || value.recurrence.kind !== 'weekly') return structuredScheduleLabels(firstParty);
    const label = clean(value.label);
    const ranges = groups.get(label) ?? new Map<string, string[]>();
    const range = `${opens}-${closes}`;
    ranges.set(range, [...(ranges.get(range) ?? []), ...value.recurrence.weekdays]);
    groups.set(label, ranges);
  }
  const order = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  return [...groups.entries()].map(([label, ranges]) => {
    const parts = [...ranges.entries()]
      .sort(([, left], [, right]) => order.indexOf(left[0]) - order.indexOf(right[0]))
      .map(([range, days]) => `${shortDayList(days)} ${range}`)
      .join(', ');
    return label ? `${label[0].toUpperCase()}${label.slice(1)}: ${parts}` : parts;
  });
}

function whenRow(market: MarketFactsRecord, today: string): PlanVisitItem[] {
  const items: PlanVisitItem[] = [];
  const rich = compactScheduleLines(market.first_party);
  if (rich.length) {
    items.push(...rich.map((text) => ({ text })));
  } else {
    const labels = marketScheduleLabels({ ...market, season: undefined });
    if (labels.length) {
      items.push(...[...new Set(labels)].map((text) => ({ text: clean(text) })));
    } else {
      const days = marketWeekdays(market);
      const hours = marketHours(market);
      if (days.length || hours) {
        items.push({ text: [days.map((day) => `${day}s`).join(', '), hours].filter(Boolean).join(', ') });
      }
    }
  }
  // A dated season is already spelled out on each dated schedule line.
  const datedSeason = rich.length && market.first_party?.operations?.season?.value.kind === 'dated_range';
  const season = datedSeason ? undefined : marketSeasonLabel(market);
  if (items.length && season) items.push({ text: /^year[\s-]?round$/i.test(season) ? 'Open year-round' : `Season: ${season}` });
  const weather = market.first_party?.operations?.weather_policy?.value;
  if (items.length && weather && !/year[\s-]?round/i.test(weather)) items.push({ text: sentence(weather) });
  else if (items.length && /rain or shine/i.test(weather ?? '')) items.push({ text: 'Rain or shine' });
  if (items.length) items.push(...upcomingExceptions(market.first_party, today).map((text) => ({ text })));
  return items;
}

const MODE_LABELS: Record<string, string> = {
  bus: 'Bus',
  rail: 'Rail',
  ferry: 'Ferry',
  bike: 'Bike',
  walk: 'Walk',
  shuttle: 'Shuttle',
};

function gettingThereRow(firstParty?: FirstParty): PlanVisitItem[] {
  const access = firstParty?.access;
  if (!access) return [];
  const items: PlanVisitItem[] = [];
  for (const item of access.transit ?? []) {
    const value = item.value;
    const mode = MODE_LABELS[value.mode] ?? value.mode;
    const routes = value.routes?.length ? value.routes.map(clean).filter(Boolean).join(', ') : '';
    const where = [routes, clean(value.stop_name)].filter(Boolean).join(', ');
    const note = value.note ? sentence(value.note) : '';
    const head = where ? `${mode}: ${where}` : mode;
    items.push({ text: note ? `${head}. ${note}` : head, href: httpUrl(value.url) });
  }
  const parking = access.parking;
  if (parking?.availability) {
    const availability = parking.availability.value;
    const cost = parking.cost?.value;
    const head = availability === 'no'
      ? 'No parking at the market'
      : availability === 'limited'
        ? `Limited${cost === 'free' ? ' free' : cost === 'paid' ? ' paid' : ''} parking`
        : cost === 'free'
          ? 'Free parking'
          : cost === 'paid'
            ? 'Paid parking'
            : cost === 'mixed'
              ? 'Free and paid parking'
              : 'Parking available';
    const note = parking.location_note ? ` ${sentence(parking.location_note.value)}` : '';
    items.push({ text: `${head}.${note}`.replace(/\.\./g, '.'), href: httpUrl(parking.url?.value) });
  }
  if (access.bicycle_parking?.value === 'yes') items.push({ text: 'Bike parking available.' });
  if (access.drop_off_note) items.push({ text: sentence(access.drop_off_note.value) });
  return items;
}

function payingRow(market: MarketFactsRecord): PlanVisitItem[] {
  const firstParty = market.first_party;
  const items: PlanVisitItem[] = [];
  const snap = firstParty?.payments?.assistance?.find((item) => item.value.code === 'snap_ebt')?.value;
  const snapName = clean(snap?.name) || 'SNAP/EBT';
  // The how-to line below already names SNAP, so the method list skips it.
  const labels = paymentLabels(market).filter((label) =>
    !snap?.redemption_instructions || (label !== snapName && label !== 'SNAP/EBT')
  );
  if (labels.length) items.push({ text: labels.join(', ') });
  if (snap?.redemption_instructions) {
    items.push({ text: `${snapName}: ${sentence(snap.redemption_instructions)}` });
  }
  for (const item of firstParty?.payments?.incentives ?? []) {
    const value = item.value;
    const amount = value.input_amount !== undefined && value.benefit_amount !== undefined
      ? `$${value.benefit_amount} extra for every $${value.input_amount}${value.maximum_amount !== undefined ? `, up to $${value.maximum_amount} a day` : ''}`
      : '';
    // Without amounts the name alone says it; skip it if the list has it.
    if (!amount && labels.includes(clean(value.name))) continue;
    const note = !amount && value.note ? sentence(value.note) : '';
    items.push({
      text: [`${clean(value.name)}${amount ? `: ${amount}` : ''}`, note].filter(Boolean).join(': '),
      href: httpUrl(value.url),
    });
  }
  return items;
}

const CATEGORY_LABELS: Record<string, string> = {
  fresh_produce: 'Fresh produce',
  meat: 'Meat',
  dairy: 'Dairy',
  eggs: 'Eggs',
  herbs: 'Herbs',
  crafts: 'Crafts',
  prepared_food: 'Prepared food',
  baked_goods: 'Baked goods',
  flowers: 'Flowers',
  honey: 'Honey',
  preserves: 'Jams and preserves',
  wine: 'Wine',
};

function soldRow(market: MarketFactsRecord): PlanVisitItem[] {
  const products = market.first_party?.products;
  const categories = (products?.categories ?? [])
    .map((item) => clean(item.value.label) || CATEGORY_LABELS[item.value.code] || '')
    .filter(Boolean);
  const list = categories.length ? categories : productLabels(market);
  const items: PlanVisitItem[] = [];
  if (list.length) items.push({ text: [...new Set(list)].join(', ') });
  if (products?.availability_note) items.push({ text: `In season: ${sentence(products.availability_note.value)}` });
  return items;
}

function vendorsRow(market: MarketFactsRecord): PlanVisitItem[] {
  const vendors = market.first_party?.vendors;
  const items: PlanVisitItem[] = [];
  const count = vendors?.count?.value;
  if (count?.value) {
    const qualifier = clean(count.qualifier);
    const [lead, ...rest] = qualifier.split(',').map((part) => part.trim());
    const tail = rest.length ? ` ${rest.join(', ')}` : '';
    const leadText = lead ? `${lead[0].toUpperCase()}${lead.slice(1)} ${count.value}` : `${count.value}`;
    items.push({ text: `${leadText} vendors${tail}` });
  } else if (typeof market.vendor_count === 'number' && market.vendor_count > 0) {
    items.push({ text: `${market.vendor_count} vendors` });
  }
  const directory = httpUrl(vendors?.directory_url?.value);
  const roster = httpUrl(vendors?.weekly_roster_url?.value);
  if (vendors?.attendance_is_dynamic?.value) items.push({ text: 'Vendors vary by day.' });
  if (directory) items.push({ text: 'Vendor directory', href: directory });
  if (roster) items.push({ text: 'Weekly vendor roster', href: roster });
  return items;
}

function goodToKnowRow(firstParty?: FirstParty): PlanVisitItem[] {
  const items: PlanVisitItem[] = [];
  const accessibility = firstParty?.access?.accessibility_note?.value;
  if (accessibility) items.push({ text: sentence(accessibility) });
  for (const item of firstParty?.policies ?? []) {
    const value = item.value;
    if (value.code === 'weather') continue; // already in "When"
    const pets = value.code === 'pets' || value.code === 'service_animals';
    const rule = pets
      ? value.rule === 'allowed'
        ? 'Pets are welcome'
        : value.rule === 'not_allowed'
          ? 'No pets'
          : value.rule === 'service_animals_only'
            ? 'Service animals only'
            : value.rule === 'discouraged'
              ? 'Please leave pets at home'
              : 'Pets allowed with conditions'
      : value.code === 'smoking' && value.rule === 'not_allowed'
        ? 'No smoking'
        : `${value.code[0].toUpperCase()}${value.code.slice(1).replaceAll('_', ' ')}: ${value.rule.replaceAll('_', ' ')}`;
    items.push({ text: value.note ? `${rule}. ${sentence(value.note)}` : `${rule}.` });
  }
  return items;
}

/**
 * Every summary row this record can fill, in reading order. `today` is the
 * market's local date as YYYY-MM-DD (callers pass the build/revalidate date).
 */
export function planVisitRows(market: MarketFactsRecord, today: string): PlanVisitRow[] {
  const rows: PlanVisitRow[] = [
    { key: 'when', term: 'When', items: whenRow(market, today) },
    { key: 'getting-there', term: 'Getting there', items: gettingThereRow(market.first_party) },
    { key: 'paying', term: 'Paying', items: payingRow(market) },
    { key: 'sold', term: 'What you will find', items: soldRow(market) },
    { key: 'vendors', term: 'Vendors', items: vendorsRow(market) },
    { key: 'good-to-know', term: 'Good to know', items: goodToKnowRow(market.first_party) },
  ];
  return rows
    .map((row) => ({ ...row, items: row.items.filter((item) => item.text.trim()) }))
    .filter((row) => row.items.length);
}

/**
 * The summary rows, or `[]` when the record answers too few questions for a
 * summary to help. Only records with hand-checked structured schedules
 * qualify, so the 9,000 thin pages keep their existing layout unchanged.
 */
export function planVisitSummary(market: MarketFactsRecord, today: string): PlanVisitRow[] {
  // Structured, timezone-backed schedules only come from hand-checked
  // research. Records whose first-party facts are bulk website extracts
  // (truncated notes, conflicting policy codes) keep the plain details list
  // rather than having those fragments promoted to the top of the page.
  if (!market.first_party?.operations?.schedules?.length) return [];
  const rows = planVisitRows(market, today);
  // Hours plus at least two other practical answers; a page that can only
  // say when it is open gains nothing from a second copy of its schedule.
  if (rows.length < PLAN_VISIT_MIN_ROWS || !rows.some((row) => row.key === 'when')) return [];
  return rows;
}

/** The `MarketFacts` terms to leave out because the summary answers them. */
export function planVisitCoveredTerms(rows: PlanVisitRow[]): Set<string> {
  if (!rows.length) return new Set();
  return new Set([...PLAN_VISIT_CARD_TERMS, ...rows.flatMap((row) => PLAN_VISIT_COVERED_TERMS[row.key])]);
}
