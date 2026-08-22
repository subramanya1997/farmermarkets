/**
 * Body copy and fact rows for market detail pages.
 *
 * Same contract as `src/lib/seo.ts`: every function here is a pure function of
 * one market record, so the whole thing is unit tested against the real messy
 * source values (`src/lib/marketFacts.test.ts`) without Next.js, the
 * filesystem, or the data layer.
 *
 * The rules this module encodes:
 *
 *  - Nothing is invented. Every sentence and every fact row is assembled from
 *    a field the record actually carries; a missing field drops its clause or
 *    its row instead of rendering a placeholder, an empty state, or filler
 *    about vibrant communities. The two paragraphs this replaces were
 *    byte-identical on all 8,807 pages, which is what made them worthless.
 *  - Source strings are shown, not re-worded. `production_methods` already
 *    reads like English ("Organic (USDA Certified)"), so it is cleaned and
 *    printed rather than mapped through booleans that lose the qualifier.
 *  - The messy enumerations (`indoor_outdoor`, `site_type`) are normalized,
 *    and a value that says nothing ("Unknown") is dropped rather than shown.
 */

import { clean } from './geo.ts';
import type {
  MarketFirstPartyFacts,
  MarketWeekday,
  StructuredMarketSchedule,
} from './enrichment.ts';
import {
  displayName,
  marketHours,
  marketSeasonLabel,
  marketWeekdays,
  nameSaysMarket,
  resolveLocation,
  type MarketSeoRecord,
} from './seo.ts';

/** The subset of a market record this module reads. */
export interface MarketFactsRecord extends MarketSeoRecord {
  organization_description?: string | null;
  location_description?: string | null;
  site_type?: string | null;
  indoor_outdoor?: string | null;
  vendor_count?: number | null;
  products?: string[] | null;
  production_methods?: string[] | null;
  payment_methods?: string[] | null;
  accepts_cash?: boolean;
  accepts_credit_debit?: boolean;
  accepts_checks?: boolean;
  csa_available?: boolean;
  csa_description?: string | null;
  delivery_available?: boolean;
  delivery_methods?: string | null;
  online_ordering_available?: boolean;
  phone_ordering?: boolean;
  has_parking?: boolean;
  has_restrooms?: boolean;
  has_picnic_area?: boolean;
  wheelchair_accessible?: boolean;
  pet_friendly?: boolean;
  has_fresh_produce?: boolean;
  has_meat?: boolean;
  has_dairy?: boolean;
  has_eggs?: boolean;
  has_herbs?: boolean;
  has_crafts?: boolean;
  has_prepared_food?: boolean;
  has_baked_goods?: boolean;
  has_flowers?: boolean;
  has_honey?: boolean;
  has_jams?: boolean;
  has_wine?: boolean;
  last_updated?: string | null;
  visitor_note?: string | null;
  first_party?: MarketFirstPartyFacts;
}

/* ------------------------------------------------------------------ *
 * Source prose
 * ------------------------------------------------------------------ */

/**
 * The USDA export round-tripped through a spreadsheet, so its descriptions
 * carry literal `_x000d_` escapes where a carriage return used to be, plus the
 * odd stray control character.
 */
const CARRIAGE_RETURN_ESCAPE = /_x000d_/gi;

/**
 * A record's own description, split into paragraphs.
 *
 * Returns `[]` when the record has none, so the caller renders the composed
 * summary instead of an empty `<p>`. Paragraph breaks in the source are kept
 * (a blank line, or the escaped carriage returns above); every other run of
 * whitespace is collapsed.
 */
export function descriptionParagraphs(value?: string | null): string[] {
  if (!value) return [];

  return value
    .replace(CARRIAGE_RETURN_ESCAPE, '\n')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n+/)
    .map((paragraph) => clean(paragraph))
    .filter(Boolean);
}

/* ------------------------------------------------------------------ *
 * Enumerations
 * ------------------------------------------------------------------ */

/**
 * "Outdoor" / "Indoor" / "Indoor and outdoor" from the seven spellings the
 * USDA export uses ("No Indoor;", "Yes, part of the time the market is open
 * indoor;"). "Unknown" — and anything unrecognized — returns `undefined` so
 * the row disappears instead of printing the raw enum at the reader.
 */
export function settingLabel(value?: string | null): string | undefined {
  const text = clean(value).toLowerCase().replace(/[;.]+$/, '').trim();
  if (!text || text === 'unknown') return undefined;

  if (/part of the time/.test(text)) return 'Indoor and outdoor';
  if (/entire time/.test(text)) return 'Indoor';
  if (/^(no|no indoor)$/.test(text)) return 'Outdoor';
  if (/^yes$/.test(text)) return 'Indoor';
  return undefined;
}

/**
 * `site_type` is half a controlled vocabulary ("Closed-off public street;")
 * and half free text a market manager typed ("field by train depot"). Both are
 * printable once the trailing separator is gone and the first letter is
 * upper-cased; nothing is re-worded, because "On a farm from;" is the
 * publisher's phrasing and we cannot know what it was truncated from.
 */
export function siteTypeLabel(value?: string | null): string | undefined {
  const text = clean(value).replace(/[;,.]+$/, '').trim();
  if (!text || /^(unknown|n\/?a|to be determined|tbd)$/i.test(text)) return undefined;
  return text[0].toUpperCase() + text.slice(1);
}

/* ------------------------------------------------------------------ *
 * Fact rows
 * ------------------------------------------------------------------ */

function labelsFrom(pairs: [boolean | undefined | null, string][]): string[] {
  return pairs.filter(([present]) => present === true).map(([, label]) => label);
}

/** "Parking", "Restrooms", … — only the amenities the record reports. */
export function amenityLabels(market: MarketFactsRecord): string[] {
  return labelsFrom([
    [market.has_parking, 'Parking'],
    [market.has_restrooms, 'Restrooms'],
    [market.wheelchair_accessible, 'Wheelchair accessible'],
    [market.pet_friendly, 'Pet friendly'],
    [market.has_picnic_area, 'Picnic area'],
  ]);
}

/**
 * The production methods the record lists, in the publisher's own words
 * ("Organic (USDA Certified)", "Certified Naturally Grown"), deduplicated
 * case-insensitively.
 */
export function productionLabels(market: MarketFactsRecord): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const raw of market.production_methods ?? []) {
    const label = clean(raw);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels;
}

/**
 * What is sold: the record's own product list when it has one (95 records),
 * otherwise the product-category flags. Empty for a record that reports
 * neither — the row is then dropped, which is the whole point: the old
 * "No product information available." empty state rendered on 8,712 pages.
 */
export function productLabels(market: MarketFactsRecord): string[] {
  const items = (market.products ?? []).map((item) => clean(item)).filter(Boolean);
  if (items.length) return items;

  return labelsFrom([
    [market.has_fresh_produce, 'Fresh produce'],
    [market.has_meat, 'Meat'],
    [market.has_dairy, 'Dairy'],
    [market.has_eggs, 'Eggs'],
    [market.has_herbs, 'Herbs'],
    [market.has_baked_goods, 'Baked goods'],
    [market.has_prepared_food, 'Prepared food'],
    [market.has_honey, 'Honey'],
    [market.has_jams, 'Jams and preserves'],
    [market.has_flowers, 'Flowers'],
    [market.has_wine, 'Wine'],
    [market.has_crafts, 'Crafts'],
  ]);
}

/** "CSA", "Delivery", "Online ordering", "Phone ordering". */
export function orderingLabels(market: MarketFactsRecord): string[] {
  return labelsFrom([
    [market.csa_available, 'CSA subscriptions'],
    [market.delivery_available, 'Delivery'],
    [market.online_ordering_available, 'Online ordering'],
    [market.phone_ordering, 'Phone ordering'],
  ]);
}

/**
 * The four food-assistance programs, each with the spellings that reach us
 * from a `payment_methods` string and from the boolean flag, so a record that
 * ships both does not print the program twice under two different names.
 * SFMNP is tested before FMNP, since it contains it.
 */
const ASSISTANCE_PROGRAMS: { key: string; label: string; pattern: RegExp }[] = [
  {
    key: 'snap',
    label: 'SNAP/EBT',
    pattern: /^(snap|ebt|snapebt|snap\/ebt(?: tokens?)?|calfresh ebt|bridge card\/ebt|food\s*stamps?)$/i,
  },
  { key: 'wic', label: 'WIC', pattern: /^wic(?: (checks?|vouchers?))?$/i },
  {
    key: 'sfmnp',
    label: 'Senior Farmers Market Nutrition Program (SFMNP)',
    pattern: /^(sfmnp|senior fmnp(?: checks?)?|senior farmers'? market nutrition program)$/i,
  },
  {
    key: 'fmnp',
    label: 'Farmers Market Nutrition Program (FMNP)',
    pattern: /^(fmnp|fmnp vouchers?|farmers'? market nutrition program)$/i,
  },
];

/**
 * Payment methods and food-assistance programs in one row: the record's own
 * `payment_methods` strings first, then the four program flags.
 *
 * A program is printed once under one name however it arrives — the USDA
 * export lists "SFMNP" as a payment method *and* sets the `sfmnp` flag — and
 * "Other", which several feeds use as a catch-all, is dropped, because it
 * tells the reader nothing about what they can pay with.
 */
export function paymentLabels(market: MarketFactsRecord): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  const push = (value: string, explicitKey?: string) => {
    const cleaned = clean(value);
    if (!cleaned || /^(other|n\/?a|unknown)$/i.test(cleaned)) return;
    if (/\bwic\b.*\bfmnp\b|\bfmnp\b.*\bwic\b/i.test(cleaned)) {
      push('WIC');
      push('FMNP');
      return;
    }

    const program = ASSISTANCE_PROGRAMS.find(({ pattern }) => pattern.test(cleaned));
    const normalized = cleaned.toLowerCase().replace(/[^a-z]/g, '');
    const methodKey = /^(?:creditcard|creditcards)$/.test(normalized)
      ? 'credit_card'
      : /^(?:debitcard|debitcards)$/.test(normalized)
        ? 'debit_card'
        : /^contactlesspayments?/.test(normalized)
          ? 'contactless'
          : /^(?:marketcoins?|markettokens?|woodenmarketcoins?)$/.test(normalized)
            ? 'market_token'
            : normalized;
    const key = explicitKey ?? (program ? program.key : methodKey);
    if (seen.has(key)) return;
    seen.add(key);
    labels.push(program ? program.label : cleaned);
  };

  const richMethods = market.first_party?.payments?.methods ?? [];
  const methodLabels: Record<
    NonNullable<NonNullable<MarketFirstPartyFacts['payments']>['methods']>[number]['value']['code'],
    string
  > = {
    cash: 'Cash',
    credit_card: 'Credit Card',
    debit_card: 'Debit Card',
    check: 'Check',
    mobile_wallet: 'Mobile Wallet',
    contactless: 'Contactless Payment',
    market_token: 'Market Tokens',
    other: 'Other',
  };
  for (const method of richMethods) {
    push(method.value.label || methodLabels[method.value.code], method.value.code);
  }

  // A rich first-party method list is more precise than an older combined
  // "Credit/Debit" value. Keep independently stated legacy methods, but do
  // not let that lossy umbrella label broaden the verified list again.
  for (const method of market.payment_methods ?? []) {
    if (richMethods.length && /^credit\s*[/&+-]\s*debit(?: cards?)?$/i.test(clean(method))) continue;
    push(method);
  }

  // These flags are useful on legacy records. The combined card flag is not
  // used when v2 provides an exact method list because it cannot distinguish
  // credit from debit and would invent one of them.
  if (market.accepts_cash) push('Cash');
  if (market.accepts_credit_debit && !richMethods.length) {
    push('Credit Card');
    push('Debit Card');
  }
  if (market.accepts_checks) push('Check');

  const assistanceLabels = {
    snap_ebt: 'SNAP/EBT',
    wic: 'WIC',
    fmnp: 'FMNP',
    sfmnp: 'SFMNP',
    p_ebt: 'P-EBT',
    other: 'Other',
  } as const;
  for (const assistance of market.first_party?.payments?.assistance ?? []) {
    push(
      assistance.value.name || assistanceLabels[assistance.value.code],
      assistance.value.code === 'snap_ebt' ? 'snap' : assistance.value.code
    );
  }
  if (market.snap) push('SNAP/EBT');
  if (market.wic) push('WIC');
  if (market.fmnp) push('FMNP');
  if (market.sfmnp) push('SFMNP');

  return labels;
}

/**
 * The free-text notes (`csa_description`, `delivery_methods`) are
 * semicolon-delimited checkbox answers in the USDA export
 * ("Curbside pickup/on-site pickup;Delivery to customers' home;"). Turning the
 * separators into commas and dropping the trailing one makes them read as a
 * phrase; the wording itself is left alone.
 */
function tidyNote(value?: string | null): string {
  const text = clean(value).replace(/[;,]\s*$/, '');
  if (!text) return '';
  return text
    .split(/\s*;\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
}

/** One row of the facts block: a term and the values that answer it. */
export interface MarketFact {
  term: string;
  values: string[];
  /** A sentence the source supplies for this row, e.g. the CSA description. */
  note?: string;
}

const STATUS_LABELS = {
  active: 'Active',
  seasonal_break: 'Closed for the season',
  temporarily_closed: 'Temporarily closed',
  permanently_closed: 'Permanently closed',
} as const;

function titleWords(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const RICH_WEEKDAY_LABELS: Record<MarketWeekday, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

function pluralWeekdays(days: MarketWeekday[]): string {
  return joinWithAnd(days.map((day) => `${RICH_WEEKDAY_LABELS[day]}s`));
}

function humanClock(value: string): string | undefined {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return undefined;
  const clockHour = hour % 12 || 12;
  return `${clockHour}${minute ? `:${String(minute).padStart(2, '0')}` : ''}${hour < 12 ? 'am' : 'pm'}`;
}

function scheduleRecurrenceLabel(schedule: StructuredMarketSchedule): string | undefined {
  const recurrence = schedule.recurrence;
  if (recurrence.kind === 'dates') {
    const dates = recurrence.dates.map((date) => formatDate(date)).filter((date): date is string => Boolean(date));
    return dates.length ? joinWithAnd(dates) : undefined;
  }

  if (!recurrence.weekdays.length) return undefined;
  const days = pluralWeekdays(recurrence.weekdays);
  if (recurrence.kind === 'weekly') {
    return recurrence.interval_weeks === 2 ? `Every other ${days.replace(/s\b/g, '')}` : days;
  }

  const ordinals: Record<number, string> = {
    1: 'first',
    2: 'second',
    3: 'third',
    4: 'fourth',
    5: 'fifth',
    [-1]: 'last',
  };
  const weeks = joinWithAnd(recurrence.week_numbers.map((week) => ordinals[week]));
  return weeks ? `${weeks} ${days}` : undefined;
}

/** Human-readable, non-lossy labels for source-backed v2 schedule windows. */
export function structuredScheduleLabels(firstParty?: MarketFirstPartyFacts): string[] {
  const labels: string[] = [];
  for (const item of firstParty?.operations?.schedules ?? []) {
    const recurrence = scheduleRecurrenceLabel(item.value);
    const opens = humanClock(item.value.opens);
    const closes = humanClock(item.value.closes);
    if (!recurrence || !opens || !closes) continue;
    const label = `${recurrence}, ${opens}\u2013${closes}`;
    if (!labels.includes(label)) labels.push(label);
  }
  return labels;
}

function richFactRows(firstParty?: MarketFirstPartyFacts): MarketFact[] {
  if (!firstParty) return [];
  const rows: MarketFact[] = [];
  const push = (term: string, values: string[], note?: string) => {
    const cleaned = [...new Set(values.map((value) => clean(value)).filter(Boolean))];
    if (cleaned.length) rows.push(note ? { term, values: cleaned, note: clean(note) } : { term, values: cleaned });
  };

  const status = firstParty.operations?.status?.value;
  if (status) push('Current status', [STATUS_LABELS[status.value]], status.note);

  const incentives = firstParty.payments?.incentives?.map((item) => {
    const value = item.value;
    const amounts = value.input_amount !== undefined && value.benefit_amount !== undefined
      ? ` (${value.input_amount}:${value.benefit_amount}${value.maximum_amount !== undefined ? `, up to ${value.maximum_amount}` : ''})`
      : '';
    return `${value.name}${amounts}`;
  }) ?? [];
  push('Save with', incentives);

  const transit = firstParty.access?.transit?.map((item) => {
    const value = item.value;
    return [titleWords(value.mode), value.routes?.join('/'), value.stop_name, value.note]
      .filter(Boolean)
      .join(' - ');
  }) ?? [];
  push('Transit', transit);

  const parking = firstParty.access?.parking;
  if (parking?.availability) {
    const values = [
      titleWords(parking.availability.value),
      parking.cost ? titleWords(parking.cost.value) : undefined,
    ].filter((value): value is string => Boolean(value));
    push('Parking', values, parking.location_note?.value);
  }
  if (firstParty.access?.bicycle_parking) {
    push('Bike parking', [titleWords(firstParty.access.bicycle_parking.value)]);
  }
  if (firstParty.access?.accessibility_note) {
    push('Accessibility', [firstParty.access.accessibility_note.value]);
  }

  const amenityNames: Partial<Record<NonNullable<MarketFirstPartyFacts['amenities']>[number]['value']['code'], string>> = {
    atm: 'ATM',
    wifi: 'Wi-Fi',
    restrooms: 'Restrooms',
    picnic_area: 'Picnic area',
    drinking_water: 'Drinking water',
    live_music: 'Live music',
    kids_activities: 'Kids activities',
    information_booth: 'Information booth',
    purchase_holding: 'Purchase holding',
  };
  const amenities = firstParty.amenities?.map((item) => {
    const value = item.value;
    const label = amenityNames[value.code] || titleWords(value.code);
    const availability = value.availability === 'yes'
      ? ''
      : value.availability === 'limited'
        ? ': Limited'
        : ': Not available';
    return `${label}${availability}${value.note ? ` - ${value.note}` : ''}`;
  }) ?? [];
  push('Amenities', amenities);

  const policies = firstParty.policies?.map((item) => {
    const value = item.value;
    return `${titleWords(value.code)}: ${titleWords(value.rule)}${value.note ? ` - ${value.note}` : ''}`;
  }) ?? [];
  push('Visitor policies', policies);

  push('Programs', firstParty.programs?.map((item) => item.value.name) ?? []);
  push('Events', firstParty.events?.map((item) => item.value.name) ?? []);

  const languages = [
    ...(firstParty.languages?.spoken?.map((item) => item.value.label || item.value.tag) ?? []),
    ...(firstParty.languages?.materials?.map((item) => item.value.label || item.value.tag) ?? []),
  ];
  push('Languages', languages);

  return rows;
}

/**
 * Every fact row this record can fill, in reading order.
 *
 * Text only: the phone, website and social rows are links, so the component
 * builds those itself. A record that can fill nothing gets `[]` and the block
 * is not rendered at all.
 */
export function marketFacts(market: MarketFactsRecord): MarketFact[] {
  const facts: MarketFact[] = [];
  const push = (term: string, values: string[], note?: string) => {
    if (values.length) facts.push(note ? { term, values, note } : { term, values });
  };

  const richSchedule = structuredScheduleLabels(market.first_party);
  const exactSchedule = (market.days ?? [])
    .map((value) => clean(value))
    .filter((value) => value && marketHours({ name: market.name, days: [value] }));
  const days = marketWeekdays(market);
  const hours = marketHours(market);
  const season = marketSeasonLabel(market);

  if (richSchedule.length) {
    push('Schedule', richSchedule);
  } else if (exactSchedule.length) {
    push('Schedule', [...new Set(exactSchedule)]);
  } else {
    push('Days', days.length ? [days.join(', ')] : []);
    push('Hours', hours ? [hours] : []);
  }
  push('Season', season ? [season] : []);

  const vendorCount = market.vendor_count;
  push(
    'Vendors',
    typeof vendorCount === 'number' && Number.isFinite(vendorCount) && vendorCount > 0
      ? [`${vendorCount}`]
      : []
  );

  const setting = [settingLabel(market.indoor_outdoor), siteTypeLabel(market.site_type)].filter(
    (value): value is string => Boolean(value)
  );
  push('Setting', setting);

  push('Sold here', productLabels(market));
  push('Growing practices', productionLabels(market));
  push('Amenities', amenityLabels(market));
  push('Payment', paymentLabels(market));

  const note = [market.csa_description, market.delivery_methods]
    .map((value) => tidyNote(value))
    .filter(Boolean)
    .join('. ');
  push('Ordering', orderingLabels(market), note || undefined);
  push('Before you go', market.visitor_note ? [clean(market.visitor_note)] : []);

  for (const richFact of richFactRows(market.first_party)) {
    const existing = facts.find((fact) => fact.term === richFact.term);
    if (existing) {
      const combined = [...new Set([...existing.values, ...richFact.values])];
      existing.values = richFact.term === 'Amenities'
        ? combined.filter((value) => !combined.some((other) => other !== value && other.startsWith(`${value} -`)))
        : combined;
      existing.note ||= richFact.note;
    } else {
      facts.push(richFact);
    }
  }

  return facts;
}

/* ------------------------------------------------------------------ *
 * Contact links
 * ------------------------------------------------------------------ */

/**
 * `tel:` target for a phone number, or `undefined` when the field holds
 * something that is not dialable ("call the office", an extension on its own).
 * The visible text stays the source string; only the href is normalized.
 */
export function telHref(value?: string | null): string | undefined {
  const text = clean(value);
  if (!text) return undefined;
  const leadingPlus = text.trimStart().startsWith('+');
  const digits = text.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return undefined;
  return `tel:${leadingPlus ? '+' : ''}${digits}`;
}

const SOCIAL_HOSTS: [RegExp, string][] = [
  [/(^|\.)facebook\.com$/i, 'Facebook'],
  [/(^|\.)instagram\.com$/i, 'Instagram'],
  [/(^|\.)twitter\.com$/i, 'X (Twitter)'],
  [/(^|\.)x\.com$/i, 'X (Twitter)'],
  [/(^|\.)youtube\.com$/i, 'YouTube'],
  [/(^|\.)tiktok\.com$/i, 'TikTok'],
  [/(^|\.)linkedin\.com$/i, 'LinkedIn'],
];

/** A social profile we can actually link to. */
export interface SocialLink {
  label: string;
  href: string;
}

/**
 * The `social_media` field is free text: a full URL on some records, a bare
 * handle ("@farmersmarketsw", "Rparkfm") on others, and "Instagram: @handle" on
 * a few. A handle with a named platform is resolvable to a profile URL; a bare
 * handle is not — we would be guessing which network it belongs to — so it is
 * dropped rather than linked at the wrong site.
 */
export function socialLinks(values?: string[] | null): SocialLink[] {
  const links: SocialLink[] = [];
  const seen = new Set<string>();

  const add = (label: string, href: string) => {
    if (seen.has(href)) return;
    seen.add(href);
    links.push({ label, href });
  };

  for (const raw of values ?? []) {
    const text = clean(raw);
    if (!text) continue;

    if (/^https?:\/\//i.test(text)) {
      let host: string;
      try {
        host = new URL(text).hostname.replace(/^www\./i, '');
      } catch {
        continue;
      }
      const known = SOCIAL_HOSTS.find(([pattern]) => pattern.test(host));
      add(known ? known[1] : host, text);
      continue;
    }

    const named = /^(facebook|instagram|twitter|x|youtube|tiktok|linkedin)\s*[:@\-–]\s*@?([A-Za-z0-9._-]+)$/i.exec(
      text
    );
    if (!named) continue;
    const platform = named[1].toLowerCase();
    const handle = named[2];
    const host =
      platform === 'x' || platform === 'twitter'
        ? 'x.com'
        : platform === 'youtube'
          ? 'youtube.com/@'
          : `${platform}.com`;
    const label =
      platform === 'x' || platform === 'twitter'
        ? 'X (Twitter)'
        : platform[0].toUpperCase() + platform.slice(1);
    add(label, `https://${host.endsWith('@') ? host : `${host}/`}${handle}`);
  }

  return links;
}

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

/**
 * "3 August 2020" style date from an ISO string, or `undefined` when the value
 * is not a date. Rendered as the record's own last-updated stamp — no
 * `Date.now()` anywhere, because a "verified today" line the data does not
 * support is exactly the fake freshness this page is being cleaned up for.
 */
export function formatDate(value?: string | null): string | undefined {
  const text = clean(value);
  if (!text) return undefined;
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z` : text);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return DATE_FORMAT.format(parsed);
}

/** Kilometres as miles, at the precision the number deserves: "0.8 mi", "12 mi". */
export function formatMiles(kilometres: number): string {
  const miles = kilometres * 0.621371;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

/* ------------------------------------------------------------------ *
 * Composed summary
 * ------------------------------------------------------------------ */

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function weekdayPhrase(days: string[]): string {
  return joinWithAnd(days.map((day) => `${day}s`));
}

function lowerFirst(value: string): string {
  return value ? value[0].toLowerCase() + value.slice(1) : value;
}

/**
 * The body summary for a record with no description of its own.
 *
 * Two to four short sentences, each one built from a field this record has:
 * where it is, when it opens, how big it is and what it takes at the till.
 * Because the inputs differ market to market, so does the paragraph — that is
 * the point. A record that can only fill the first clause gets one honest
 * sentence and leans on the facts block for the rest.
 *
 * Returns `[]` when the record cannot fill a single clause, which is rare
 * enough to be worth rendering nothing for.
 */
export function composedSummary(market: MarketFactsRecord): string[] {
  const name = displayName(market.name) || 'This market';
  const location = resolveLocation(market);
  const place =
    (location.city && location.state
      ? `${location.city}, ${location.state}`
      : location.city || location.state) || undefined;
  // A handful of records carry a whole paragraph in the address field; anything
  // that long is left to the address row rather than run into a sentence.
  const street = location.street && location.street.length <= 60 ? location.street : undefined;

  const sentences: string[] = [];

  const subject = nameSaysMarket(name) ? name : `${name}, a farmers market,`;
  const where = [street ? `at ${street}` : undefined, place ? `in ${place}` : undefined]
    .filter(Boolean)
    .join(' ');
  if (where) {
    sentences.push(`${subject} is ${where}.`);
  } else if (!nameSaysMarket(name)) {
    sentences.push(`${name} is a farmers market.`);
  }

  const richSchedule = structuredScheduleLabels(market.first_party);
  const days = marketWeekdays(market);
  const hours = marketHours(market);
  const season = marketSeasonLabel(market);
  const seasonTail = !season
    ? ''
    : /^year[\s-]?round$/i.test(season)
      ? ', year-round'
      : `, ${/^(?:January|February|March|April|May|June|July|August|September|October|November|December|\d)/.test(season) ? season : lowerFirst(season)}`;

  if (richSchedule.length === 1) {
    sentences.push(`It is open ${richSchedule[0]}${seasonTail}.`);
  } else if (richSchedule.length > 1) {
    sentences.push(`Its schedule is ${richSchedule.join('; ')}${seasonTail}.`);
  } else if (days.length && hours) {
    sentences.push(`It is open ${weekdayPhrase(days)} from ${hours}${seasonTail}.`);
  } else if (days.length) {
    sentences.push(`It is open ${weekdayPhrase(days)}${seasonTail}.`);
  } else if (hours) {
    sentences.push(`It is open ${hours}${seasonTail}.`);
  } else if (season) {
    sentences.push(
      /^year[\s-]?round$/i.test(season) ? 'It is open year-round.' : `The season runs ${season}.`
    );
  }

  const vendorCount = market.vendor_count;
  const setting = settingLabel(market.indoor_outdoor);
  if (typeof vendorCount === 'number' && Number.isFinite(vendorCount) && vendorCount > 0) {
    const scale = `${vendorCount} vendor${vendorCount === 1 ? '' : 's'}`;
    sentences.push(
      setting
        ? `${scale} are listed at this ${lowerFirst(setting)} market.`
        : `${scale} are listed at this market.`
    );
  } else if (setting) {
    sentences.push(
      setting === 'Indoor and outdoor'
        ? 'The market runs both indoors and outdoors.'
        : `The market is held ${setting.toLowerCase() === 'indoor' ? 'indoors' : 'outdoors'}.`
    );
  }

  const programs = [
    market.snap ? 'SNAP/EBT' : undefined,
    market.wic ? 'WIC' : undefined,
    market.fmnp ? 'FMNP' : undefined,
    market.sfmnp ? 'SFMNP' : undefined,
  ].filter((program): program is string => Boolean(program));
  if (programs.length) {
    sentences.push(`It accepts ${joinWithAnd(programs)}.`);
  }

  return sentences;
}
