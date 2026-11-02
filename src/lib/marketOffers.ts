/**
 * "What this market offers": every amenity, house rule, payment method and
 * ordering option the record states, as one list of icon rows.
 *
 * The page used to print these as fact rows, and a researched record's
 * amenities came out as one run-on line ("Restrooms - Fixed restrooms at
 * Alden Town Park, Seating - A covered pavilion to sit…"). Here each item is a
 * short label with its source sentence as a note underneath, in the shape a
 * reader already knows from holiday-rental listings.
 *
 * Same contract as `src/lib/marketFacts.ts`: a pure function of one record and
 * nothing invented. An amenity the source says is missing is kept, marked
 * unavailable, because "no restrooms" is worth knowing before a long drive.
 */

import { clean } from './geo.ts';
import type { MarketFirstPartyFacts } from './enrichment.ts';
import { amenityLabels, orderingLabels, plainFact, type MarketFactsRecord } from './marketFacts.ts';
import { payChips, type ChipIcon } from './planVisitView.ts';

export type OfferIcon =
  | ChipIcon
  | 'parking'
  | 'wifi'
  | 'shade'
  | 'bag'
  | 'csa'
  | 'delivery'
  | 'online'
  | 'phone';

export type OfferGroup = 'Amenities' | 'Good to know' | 'Payment' | 'Ordering';

export interface Offer {
  label: string;
  icon: OfferIcon;
  group: OfferGroup;
  /** The source's own sentence, when it adds something to the label. */
  note?: string;
  /** The source says this is not available. Drawn struck through. */
  unavailable?: boolean;
}

type AmenityCode = NonNullable<MarketFirstPartyFacts['amenities']>[number]['value']['code'];

const AMENITIES: Record<AmenityCode, { label: string; icon: OfferIcon }> = {
  restrooms: { label: 'Restrooms', icon: 'restroom' },
  seating: { label: 'Seating', icon: 'seating' },
  picnic_area: { label: 'Picnic area', icon: 'seating' },
  shade: { label: 'Shade', icon: 'shade' },
  drinking_water: { label: 'Drinking water', icon: 'water' },
  atm: { label: 'ATM', icon: 'atm' },
  wifi: { label: 'Wi-Fi', icon: 'wifi' },
  live_music: { label: 'Live music', icon: 'music' },
  kids_activities: { label: 'Kids activities', icon: 'kids' },
  information_booth: { label: 'Information booth', icon: 'info' },
  purchase_holding: { label: 'Purchase holding', icon: 'bag' },
};

const ORDERING_ICONS: Record<string, OfferIcon> = {
  'CSA subscriptions': 'csa',
  Delivery: 'delivery',
  'Online ordering': 'online',
  'Phone ordering': 'phone',
};

const COST_WORDS = { free: 'Free', paid: 'Paid', mixed: 'Free and paid' } as const;

/** A note only when it says more than the label already does. */
function noteFor(label: string, value?: string | null): string | undefined {
  const text = plainFact(value);
  if (!text) return undefined;
  const bare = text.toLowerCase().replace(/[^a-z]/g, '');
  return bare === label.toLowerCase().replace(/[^a-z]/g, '') ? undefined : text;
}

/**
 * Every offer this record states, available ones first within each group,
 * in the group order of the section. `[]` for a record that states none.
 */
export function marketOffers(market: MarketFactsRecord): Offer[] {
  const firstParty = market.first_party;
  const offers: Offer[] = [];
  const seen = new Set<string>();
  const push = (offer: Offer) => {
    const key = offer.label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    offers.push(offer);
  };

  // Amenities: the researched list first, then the legacy flags it does not
  // already settle.
  for (const item of firstParty?.amenities ?? []) {
    const meta = AMENITIES[item.value.code];
    if (!meta) continue;
    const limited = item.value.availability === 'limited';
    push({
      label: limited ? `${meta.label} (limited)` : meta.label,
      icon: meta.icon,
      group: 'Amenities',
      note: noteFor(meta.label, item.value.note),
      unavailable: item.value.availability === 'no',
    });
    seen.add(meta.label.toLowerCase());
  }

  const parking = firstParty?.access?.parking;
  if (parking?.availability) {
    const availability = parking.availability.value;
    const cost = parking.cost ? COST_WORDS[parking.cost.value] : undefined;
    push({
      label: availability === 'limited' ? 'Limited parking' : cost && availability === 'yes' ? `${cost} parking` : 'Parking',
      icon: 'parking',
      group: 'Amenities',
      note: noteFor('Parking', parking.location_note?.value),
      unavailable: availability === 'no',
    });
    seen.add('parking');
  }
  const bike = firstParty?.access?.bicycle_parking?.value;
  if (bike) {
    push({ label: bike === 'limited' ? 'Bike parking (limited)' : 'Bike parking', icon: 'bike', group: 'Amenities', unavailable: bike === 'no' });
  }
  const accessibility = clean(firstParty?.access?.accessibility_note?.value);
  if (/wheelchair|accessible|ada\b/i.test(accessibility)) {
    const negative = /not (wheelchair )?accessible|inaccessible/i.test(accessibility);
    push({
      label: 'Wheelchair accessible',
      icon: 'accessible',
      group: 'Amenities',
      note: noteFor('Wheelchair accessible', accessibility),
      unavailable: negative,
    });
  }

  const legacyIcons: Record<string, OfferIcon> = {
    Parking: 'parking',
    Restrooms: 'restroom',
    'Wheelchair accessible': 'accessible',
    'Pet friendly': 'dog',
    'Picnic area': 'seating',
  };
  const petPolicy = firstParty?.policies?.some((item) => item.value.code === 'pets');
  for (const label of amenityLabels(market)) {
    // A stated pet policy wins over the legacy keyword flag.
    if (label === 'Pet friendly' && petPolicy) continue;
    push({ label, icon: legacyIcons[label] ?? 'info', group: 'Amenities' });
  }

  // House rules.
  for (const item of firstParty?.policies ?? []) {
    const { code, rule, note } = item.value;
    if (code === 'pets' || code === 'service_animals') {
      if (rule === 'allowed') push({ label: 'Dogs welcome', icon: 'dog', group: 'Good to know', note: noteFor('Dogs welcome', note) });
      else if (rule === 'service_animals_only') push({ label: 'Service animals only', icon: 'no-dog', group: 'Good to know', note: noteFor('Service animals only', note) });
      else if (rule === 'not_allowed' || rule === 'discouraged') push({ label: 'No pets', icon: 'no-dog', group: 'Good to know', note: noteFor('No pets', note) });
      else if (rule === 'conditional' && note) push({ label: 'Pets with conditions', icon: 'dog', group: 'Good to know', note: plainFact(note) });
    } else if (code === 'smoking' && rule === 'not_allowed') {
      push({ label: 'No smoking', icon: 'no-smoking', group: 'Good to know', note: noteFor('No smoking', note) });
    } else if (code === 'weather' && rule === 'rain_or_shine') {
      push({ label: 'Rain or shine', icon: 'rain', group: 'Good to know', note: noteFor('Rain or shine', note) });
    }
  }

  for (const chip of payChips(market)) push({ label: chip.label, icon: chip.icon, group: 'Payment' });
  // The USDA checkbox answers ("Curbside pickup;Delivery to customers' home;")
  // read as a phrase once the separators are commas.
  const tidy = (value?: string | null) =>
    clean(value).replace(/[;,]\s*$/, '').split(/\s*;\s*/).filter(Boolean).join(', ') || undefined;
  const orderingNotes: Record<string, string | undefined> = {
    'CSA subscriptions': tidy(market.csa_description),
    Delivery: tidy(market.delivery_methods),
  };
  for (const label of orderingLabels(market)) {
    push({ label, icon: ORDERING_ICONS[label] ?? 'basket', group: 'Ordering', note: orderingNotes[label] });
  }

  const order: OfferGroup[] = ['Amenities', 'Good to know', 'Payment', 'Ordering'];
  return order.flatMap((group) => {
    const inGroup = offers.filter((offer) => offer.group === group);
    return [...inGroup.filter((offer) => !offer.unavailable), ...inGroup.filter((offer) => offer.unavailable)];
  });
}

/** Fact-list terms the offers section answers, so the list skips them. */
export const OFFER_COVERED_TERMS = [
  'Amenities',
  'Payment',
  'Ordering',
  'Visitor policies',
  'Parking',
  'Bike parking',
  'Accessibility',
];

/** The rows shown before "Show all": the stated, available ones first. */
export const OFFERS_PREVIEW_COUNT = 10;
