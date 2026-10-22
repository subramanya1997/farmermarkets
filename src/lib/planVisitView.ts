/**
 * The visual "Plan your visit" card: the same source-backed facts as
 * `planVisit.ts`, reshaped from sentences into glanceable parts.
 *
 * The rows in `planVisit.ts` answer each question in prose. That reads fine
 * one at a time but becomes a wall of text on a market with good data. This
 * view keeps every fact and moves it to the lightest form that still carries
 * it: a week grid for hours, a one or two word headline per tile (Free, Paid,
 * 140), chips for lists (payment methods, products, house rules), and the
 * explanatory sentences into one collapsible "details" list at the bottom.
 *
 * Built only from structured fields (enums, amounts, weekdays, clocks). Free
 * text is never shortened into a headline, because a truncated source
 * sentence can say something the source did not; it goes to `details` whole.
 *
 * Pure functions of one record, unit tested in `planVisit.test.ts`.
 */

import { clean } from './geo.ts';
import type { MarketFirstPartyFacts, MarketWeekday } from './enrichment.ts';
import { amenityLabels, paymentLabels, plainFact, productLabels, type MarketFactsRecord } from './marketFacts.ts';
import { compactScheduleLines } from './planVisit.ts';
import { marketSeasonLabel } from './seo.ts';

type FirstParty = MarketFirstPartyFacts;

export const WEEK: MarketWeekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

/** One labelled line of the week grid ("Market house", "Farm sheds"). */
export interface WeekRow {
  label?: string;
  /** Monday first; undefined on a closed day. */
  days: ({ opens: string; closes: string } | undefined)[];
}

export interface DateChip {
  /** "Nov 26" */
  date: string;
  /** "Closed" or "9am-3pm" */
  value: string;
  closed: boolean;
  /** First clause of the source note, e.g. "Holiday Market". */
  label?: string;
}

export interface Tile {
  key: 'parking' | 'transit' | 'vendors';
  /** One to three words: "Free", "Paid", "140". */
  headline: string;
  /** A structured qualifier: "2 lots", "Streetcar", "in peak season". */
  caption?: string;
  href?: string;
  hrefLabel?: string;
  /** A second link, e.g. the weekly roster beside the directory. */
  extraHref?: string;
  extraLabel?: string;
}

export type ChipIcon =
  | 'card'
  | 'cash'
  | 'snap'
  | 'benefit'
  | 'produce'
  | 'meat'
  | 'fish'
  | 'dairy'
  | 'eggs'
  | 'bread'
  | 'flowers'
  | 'honey'
  | 'jar'
  | 'wine'
  | 'craft'
  | 'food'
  | 'herbs'
  | 'basket'
  | 'accessible'
  | 'dog'
  | 'no-dog'
  | 'no-smoking'
  | 'restroom'
  | 'seating'
  | 'music'
  | 'kids'
  | 'info'
  | 'atm'
  | 'water'
  | 'bike'
  | 'rain';

export interface Chip {
  label: string;
  icon: ChipIcon;
}

export interface Perk {
  /** "Double Up Food Bucks" */
  name: string;
  /** "+$1 per $1" */
  value?: string;
  /** "up to $50 a day" */
  limit?: string;
  href?: string;
}

export interface DetailLine {
  term: string;
  text: string;
  href?: string;
}

export interface PlanVisitView {
  /** The main schedule as a grid (one row). */
  week?: WeekRow[];
  /** Other labelled schedules, one compact line each ("Farm Shed: Sat 8am-2pm"). */
  otherSchedules: string[];
  /** Used instead of `week` when the schedule is not a plain weekly one. */
  scheduleLines: string[];
  /** "Year-round", "Rain or shine", "May-Oct". */
  badges: string[];
  upcoming: DateChip[];
  tiles: Tile[];
  pay: Chip[];
  perks: Perk[];
  products: Chip[];
  inSeason?: string;
  rules: Chip[];
  details: DetailLine[];
}

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
  const text = plainFact(value).replace(/[\s:;,]+$/, '');
  if (!text) return '';
  return /[.!?)]$/.test(text) ? text : `${text}.`;
}

/** "09:00" -> "9am", "17:30" -> "5:30pm". */
export function shortClock(value?: string): string | undefined {
  const match = /^(\d{2}):(\d{2})$/.exec(value ?? '');
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return `${hour % 12 || 12}${minute ? `:${match[2]}` : ''}${hour < 12 ? 'am' : 'pm'}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDate(iso: string): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return undefined;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${Number(match[3])}` : undefined;
}

/**
 * The week as a grid, one row per labelled schedule. Only for plain weekly
 * schedules with clocks; anything dated or fortnightly keeps the text lines.
 */
export function weekRows(firstParty?: FirstParty): WeekRow[] | undefined {
  const schedules = firstParty?.operations?.schedules ?? [];
  if (!schedules.length) return undefined;
  const rows = new Map<string, WeekRow>();
  for (const item of schedules) {
    const value = item.value;
    if (
      value.recurrence.kind !== 'weekly' ||
      value.recurrence.interval_weeks === 2 ||
      value.start_date ||
      value.end_date
    ) {
      return undefined;
    }
    const opens = shortClock(value.opens);
    const closes = shortClock(value.closes);
    if (!opens || !closes) return undefined;
    const label = clean(value.label);
    const row = rows.get(label) ?? { label: label || undefined, days: WEEK.map(() => undefined) };
    for (const day of value.recurrence.weekdays) {
      const index = WEEK.indexOf(day);
      // Two windows on one day in one row would need a second line in a
      // 40px cell; the text lines say it better.
      if (index < 0 || row.days[index]) return undefined;
      row.days[index] = { opens, closes };
    }
    rows.set(label, row);
  }
  const list = [...rows.values()];
  return list.length > 0 && list.length <= 3 ? list : undefined;
}

export function upcomingChips(firstParty: FirstParty | undefined, today: string, limit = 4): DateChip[] {
  return (firstParty?.operations?.exceptions ?? [])
    .map((item) => item.value)
    .filter((value) => (value.end_date ?? value.start_date) >= today)
    .sort((left, right) => left.start_date.localeCompare(right.start_date))
    .slice(0, limit)
    .flatMap((value): DateChip[] => {
      const start = shortDate(value.start_date);
      if (!start) return [];
      const end =
        value.end_date && value.end_date !== value.start_date ? shortDate(value.end_date) : undefined;
      const date = end ? `${start}-${end}` : start;
      // The note's first clause names the occasion ("Thanksgiving",
      // "Holiday Market"); the rest stays in the source.
      const label = clean(value.note).split(/[,;(]/)[0].replace(/\.$/, '').trim() || undefined;
      if (value.status === 'closed') return [{ date, value: 'Closed', closed: true, label }];
      const opens = shortClock(value.opens);
      const closes = shortClock(value.closes);
      return opens && closes ? [{ date, value: `${opens}-${closes}`, closed: false, label }] : [];
    });
}

const TRANSIT_LABELS: Record<string, string> = {
  bus: 'Bus',
  rail: 'Rail',
  ferry: 'Ferry',
  bike: 'Bike',
  walk: 'On foot',
  shuttle: 'Shuttle',
};

function tiles(market: MarketFactsRecord): Tile[] {
  const firstParty = market.first_party;
  const result: Tile[] = [];

  const parking = firstParty?.access?.parking;
  if (parking?.availability) {
    const availability = parking.availability.value;
    const cost = parking.cost?.value;
    const headline =
      availability === 'no'
        ? 'None on site'
        : cost === 'free'
          ? availability === 'limited'
            ? 'Free, limited'
            : 'Free'
          : cost === 'paid'
            ? availability === 'limited'
              ? 'Paid, limited'
              : 'Paid'
            : cost === 'mixed'
              ? 'Free and paid'
              : availability === 'limited'
                ? 'Limited'
                : 'Available';
    result.push({
      key: 'parking',
      headline,
      caption: parking.accessible_spaces?.value === 'yes' ? 'Accessible spaces' : undefined,
      href: httpUrl(parking.url?.value),
      hrefLabel: 'Parking map',
    });
  }

  const transit = firstParty?.access?.transit ?? [];
  if (transit.length) {
    const modes = [...new Set(transit.map((item) => TRANSIT_LABELS[item.value.mode] ?? item.value.mode))];
    const routes = [
      ...new Set(transit.flatMap((item) => (item.value.routes ?? []).map((route) => clean(route)))),
    ].filter(Boolean);
    const first = transit.find((item) => httpUrl(item.value.url));
    result.push({
      key: 'transit',
      headline: modes.length > 1 ? `${modes.slice(0, -1).join(', ')} and ${modes.at(-1)}` : modes[0],
      // Route names are short structured values ("Cincinnati Bell
      // Connector", "M14"); stop descriptions are prose and go to details.
      caption: routes.slice(0, 2).join(', ') || undefined,
      href: httpUrl(first?.value.url),
      hrefLabel: 'Route info',
    });
  }

  const vendors = firstParty?.vendors;
  const count = vendors?.count?.value;
  const vendorCount = count?.value ?? (typeof market.vendor_count === 'number' ? market.vendor_count : 0);
  const directoryUrl = httpUrl(vendors?.directory_url?.value);
  const rosterUrl = httpUrl(vendors?.weekly_roster_url?.value);
  const directory = directoryUrl ?? rosterUrl;
  if (vendorCount > 0 || directory) {
    const qualifier = clean(count?.qualifier).toLowerCase();
    const prefix = /^(up to|more than|over|about|around|nearly)\b/.exec(qualifier)?.[0];
    const rest = clean(prefix ? qualifier.slice(prefix.length) : qualifier).replace(/^,\s*/, '');
    const headline =
      vendorCount <= 0
        ? 'Directory'
        : prefix === 'more than' || prefix === 'over'
          ? `${vendorCount}+`
          : prefix
            ? `${prefix[0].toUpperCase()}${prefix.slice(1)} ${vendorCount}`
            : `${vendorCount}`;
    result.push({
      key: 'vendors',
      headline,
      caption: vendorCount > 0 ? `vendors${rest ? `, ${rest}` : ''}` : undefined,
      href: directory,
      hrefLabel: 'See who sells',
      ...(directoryUrl && rosterUrl && rosterUrl !== directoryUrl
        ? { extraHref: rosterUrl, extraLabel: "This week's vendors" }
        : {}),
    });
  }

  return result;
}

function payChips(market: MarketFactsRecord): Chip[] {
  return paymentLabels(market).map((label): Chip => {
    const lower = label.toLowerCase();
    const icon: ChipIcon = /snap|ebt|bridge/.test(lower)
      ? 'snap'
      : /cash|token|coin/.test(lower)
        ? 'cash'
        : /card|contactless|wallet|pay\b/.test(lower)
          ? 'card'
          : 'benefit';
    // "SNAP / Bridge Card" and similar keep their name; only spacing changes.
    // "Farmers Market Nutrition Program (FMNP)" reads as "FMNP" in a chip.
    const short = /\(([A-Z][A-Z-]{1,7})\)$/.exec(label)?.[1];
    return { label: (short ?? label).replace(/\s*\/\s*/g, '/'), icon };
  });
}

function perks(firstParty?: FirstParty): Perk[] {
  return (firstParty?.payments?.incentives ?? []).map((item) => {
    const value = item.value;
    const amounts = value.input_amount !== undefined && value.benefit_amount !== undefined;
    return {
      name: clean(value.name),
      value: amounts ? `+$${value.benefit_amount} per $${value.input_amount}` : undefined,
      limit: amounts && value.maximum_amount !== undefined ? `up to $${value.maximum_amount} a day` : undefined,
      href: httpUrl(value.url),
    };
  });
}

const PRODUCT_ICONS: [RegExp, ChipIcon][] = [
  [/produce|vegetable|fruit/i, 'produce'],
  [/meat|poultry|butcher/i, 'meat'],
  [/fish|seafood/i, 'fish'],
  [/dairy|cheese|milk/i, 'dairy'],
  [/egg/i, 'eggs'],
  [/bak|bread|pastr/i, 'bread'],
  [/flower|plant|nursery/i, 'flowers'],
  [/honey/i, 'honey'],
  [/jam|preserve|pickle|packaged|pantry/i, 'jar'],
  [/wine|cider|beer|spirit/i, 'wine'],
  [/craft|art|handmade|handcrafted/i, 'craft'],
  [/prepared|deli|food|ethnic|hot/i, 'food'],
  [/herb/i, 'herbs'],
];

const CATEGORY_LABELS: Record<string, string> = {
  fresh_produce: 'Produce',
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

function productChips(market: MarketFactsRecord): Chip[] {
  const categories = (market.first_party?.products?.categories ?? [])
    .map((item) => clean(item.value.label) || CATEGORY_LABELS[item.value.code] || '')
    .filter(Boolean);
  const labels = [...new Set(categories.length ? categories : productLabels(market))];
  return labels.map((label) => ({
    // "Fresh produce" reads as "Produce" next to "Meat" and "Flowers".
    label: label.replace(/^fresh produce$/i, 'Produce'),
    icon: PRODUCT_ICONS.find(([pattern]) => pattern.test(label))?.[1] ?? 'basket',
  }));
}

const AMENITY_CHIPS: Partial<Record<string, Chip>> = {
  restrooms: { label: 'Restrooms', icon: 'restroom' },
  seating: { label: 'Seating', icon: 'seating' },
  picnic_area: { label: 'Picnic area', icon: 'seating' },
  drinking_water: { label: 'Drinking water', icon: 'water' },
  atm: { label: 'ATM', icon: 'atm' },
  live_music: { label: 'Live music', icon: 'music' },
  kids_activities: { label: 'Kids activities', icon: 'kids' },
  information_booth: { label: 'Info booth', icon: 'info' },
};

function ruleChips(market: MarketFactsRecord): Chip[] {
  const firstParty = market.first_party;
  const chips: Chip[] = [];
  const accessibility = clean(firstParty?.access?.accessibility_note?.value);
  // Only a note that names wheelchairs earns the chip; anything subtler
  // stays as the source sentence in details.
  if (/wheelchair/i.test(accessibility) && !/not (wheelchair )?accessible|inaccessible/i.test(accessibility)) {
    chips.push({ label: 'Wheelchair friendly', icon: 'accessible' });
  }
  for (const item of firstParty?.policies ?? []) {
    const value = item.value;
    if (value.code === 'pets' || value.code === 'service_animals') {
      if (value.rule === 'allowed') chips.push({ label: 'Dogs welcome', icon: 'dog' });
      else if (value.rule === 'service_animals_only') chips.push({ label: 'Service animals only', icon: 'no-dog' });
      else if (value.rule === 'not_allowed' || value.rule === 'discouraged') chips.push({ label: 'No pets', icon: 'no-dog' });
    } else if (value.code === 'smoking' && value.rule === 'not_allowed') {
      chips.push({ label: 'No smoking', icon: 'no-smoking' });
    }
  }
  for (const item of firstParty?.amenities ?? []) {
    const chip = AMENITY_CHIPS[item.value.code];
    if (chip && item.value.availability === 'yes') chips.push(chip);
  }
  if (firstParty?.access?.bicycle_parking?.value === 'yes') chips.push({ label: 'Bike parking', icon: 'bike' });
  // Listing amenities the researched facts do not already settle. Parking is
  // a tile, and pet flags never override a stated pet policy.
  const legacy = amenityLabels(market);
  if (legacy.includes('Restrooms') && !firstParty?.amenities?.some((item) => item.value.code === 'restrooms')) {
    chips.push(AMENITY_CHIPS.restrooms!);
  }
  if (legacy.includes('Picnic area') && !firstParty?.amenities?.some((item) => item.value.code === 'picnic_area')) {
    chips.push(AMENITY_CHIPS.picnic_area!);
  }
  if (legacy.includes('Wheelchair accessible') && !firstParty?.access?.accessibility_note) {
    chips.push({ label: 'Wheelchair friendly', icon: 'accessible' });
  }
  const seen = new Set<string>();
  return chips.filter((chip) => !seen.has(chip.label) && Boolean(seen.add(chip.label)));
}

const ASSISTANCE_TERMS: Record<string, string> = {
  snap_ebt: 'SNAP/EBT',
  wic: 'WIC',
  fmnp: 'FMNP',
  sfmnp: 'SFMNP',
  p_ebt: 'P-EBT',
};

const AMENITY_TERMS: Record<string, string> = {
  information_booth: 'Info booth',
  purchase_holding: 'Purchase holding',
  live_music: 'Live music',
  kids_activities: 'Kids activities',
  restrooms: 'Restrooms',
  atm: 'ATM',
  drinking_water: 'Drinking water',
  seating: 'Seating',
  picnic_area: 'Picnic area',
  wifi: 'Wi-Fi',
};

/** A one-sentence policy note that only restates its chip ("No pets"). */
function restatesChip(note: string): boolean {
  const sentences = note.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.length === 1 && !/stall|shed|vendor|walkway|leash|elsewhere|area|vap/i.test(note);
}

/** Every explanatory sentence the chips and tiles leave out, whole. */
function details(market: MarketFactsRecord, directions: string[]): DetailLine[] {
  const firstParty = market.first_party;
  const lines: DetailLine[] = [];
  const push = (term: string, text?: string | null, href?: string) => {
    const value = sentence(text);
    if (value && !lines.some((line) => line.text === value)) lines.push({ term, text: value, href });
  };

  const parking = firstParty?.access?.parking;
  push('Parking', parking?.location_note?.value, httpUrl(parking?.url?.value));
  for (const paragraph of directions) push('Directions', paragraph);
  for (const item of firstParty?.access?.transit ?? []) {
    const value = item.value;
    const where = clean(value.stop_name);
    push(
      TRANSIT_LABELS[value.mode] ?? 'Transit',
      [where, clean(value.note)].filter(Boolean).join('. '),
      httpUrl(value.url)
    );
  }
  push('Drop-off', firstParty?.access?.drop_off_note?.value);

  for (const item of firstParty?.payments?.assistance ?? []) {
    const value = item.value;
    // Labelled by the program it is about, never a SNAP fallback for WIC.
    push(clean(value.name) || ASSISTANCE_TERMS[value.code] || 'Benefits', value.redemption_instructions);
  }
  for (const item of firstParty?.payments?.incentives ?? []) {
    const eligibility = clean(item.value.eligibility);
    push(
      clean(item.value.name),
      [eligibility ? `For ${eligibility.replace(/\.$/, '')}` : '', plainFact(item.value.note)].filter(Boolean).join('. '),
      httpUrl(item.value.url)
    );
  }

  for (const item of firstParty?.amenities ?? []) {
    if (item.value.availability !== 'no' && item.value.note) {
      push(AMENITY_TERMS[item.value.code] ?? 'Amenities', item.value.note);
    }
  }

  push('Accessibility', firstParty?.access?.accessibility_note?.value);
  const chipped = new Set(ruleChips(market).map((chip) => chip.icon));
  for (const item of firstParty?.policies ?? []) {
    const value = item.value;
    if (value.code === 'weather' || !value.note) continue;
    const term = value.code === 'smoking' ? 'Smoking' : value.code === 'bags' ? 'Bags' : 'Pets';
    const hasChip = term === 'Pets' ? chipped.has('dog') || chipped.has('no-dog') : term === 'Smoking' && chipped.has('no-smoking');
    if (hasChip && restatesChip(clean(value.note))) continue;
    push(term, value.note);
  }
  const weather = clean(firstParty?.operations?.weather_policy?.value);
  // "Year-round, rain or shine" is already two badges.
  const weatherRest = weather
    .replace(/^the market (?:operates|is open|runs)\s*/i, '')
    .replace(/year[\s-]?round|rain or shine|[\s,.]+/gi, '');
  if (weatherRest) push('Weather', weather);
  return lines;
}

function badges(market: MarketFactsRecord, hasWeek: boolean): string[] {
  const result: string[] = [];
  const firstParty = market.first_party;
  const datedSeason = firstParty?.operations?.season?.value.kind === 'dated_range';
  const season = datedSeason && !hasWeek ? undefined : marketSeasonLabel(market);
  if (season) result.push(/^year[\s-]?round$/i.test(season) ? 'Open year-round' : season);
  const weather = clean(firstParty?.operations?.weather_policy?.value);
  const rainRule = firstParty?.policies?.some((item) => item.value.code === 'weather' && item.value.rule === 'rain_or_shine');
  if (/rain or shine/i.test(weather) || rainRule) result.push('Rain or shine');
  return result;
}

/**
 * The grid holds the main schedule only: a second labelled schedule (a farm
 * shed inside a market hall) is mostly closed days, so it reads better as
 * one line beside the grid.
 */
function splitWeek(firstParty?: FirstParty): { week?: WeekRow[]; otherSchedules: string[] } {
  const rows = weekRows(firstParty);
  if (!rows) return { otherSchedules: [] };
  if (rows.length === 1) return { week: rows, otherSchedules: [] };
  const openDays = (row: WeekRow) => row.days.filter(Boolean).length;
  const primary = rows.reduce((best, row) => (openDays(row) > openDays(best) ? row : best));
  const label = (line: string) => line.split(':')[0].trim().toLowerCase();
  const otherSchedules = compactScheduleLines(firstParty).filter(
    (line) => line.includes(':') && label(line) !== (primary.label ?? '').toLowerCase()
  );
  return { week: [primary], otherSchedules };
}

export interface PlanVisitViewOptions {
  /** The listing's own directions ("Finding the market"), folded into details. */
  directions?: string[];
}

export function planVisitView(
  market: MarketFactsRecord,
  today: string,
  { directions = [] }: PlanVisitViewOptions = {}
): PlanVisitView {
  const { week, otherSchedules } = splitWeek(market.first_party);
  const perkList = perks(market.first_party);
  return {
    week,
    otherSchedules,
    scheduleLines: week ? [] : compactScheduleLines(market.first_party),
    badges: badges(market, Boolean(week)),
    upcoming: upcomingChips(market.first_party, today),
    tiles: tiles(market),
    // An incentive gets its own perk row, so it is not also a chip.
    pay: payChips(market).filter((chip) => !perkList.some((perk) => perk.name.toLowerCase() === chip.label.toLowerCase())),
    perks: perkList,
    products: productChips(market),
    inSeason: sentence(market.first_party?.products?.availability_note?.value) || undefined,
    rules: ruleChips(market),
    details: details(market, directions),
  };
}
