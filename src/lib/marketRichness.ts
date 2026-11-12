/**
 * How much a listing can tell a visitor, as one number from 0 to 100, and
 * the ranking helpers built on it.
 *
 * The idea: a market with hours, a website, a phone number and social pages
 * is the one a visitor can actually plan around, and it is usually the better
 * known one. So everywhere the site orders markets (the explorer, search,
 * "nearby" blocks, city, state and topic pages) richer listings lead, inside
 * the reader's own area. Distance still decides between areas: richness can
 * move a market ahead by at most `RICHNESS_REACH_MILES`.
 *
 * Pure functions of the record, unit tested in `marketRichness.test.ts`.
 */

export interface RichnessRecord {
  websites?: string[];
  phone_numbers?: string[];
  social_media?: string[];
  days?: string[];
  season?: string;
  vendor_count?: number | null;
  products?: string[];
  payment_methods?: string[];
  snap?: boolean;
  wic?: boolean;
  fmnp?: boolean;
  sfmnp?: boolean;
  address?: string;
  location?: { lat?: number | null; lon?: number | null } | null;
  location_description?: string;
  organization_description?: string;
  visitor_note?: string;
  first_party?: unknown;
  verified?: boolean;
  unverified?: boolean;
}

export interface RichnessSchedule {
  /** The listing states opening hours, not only a weekday. */
  hasHours: boolean;
  /** The listing states at least one market day. */
  hasDays: boolean;
}

/** Points per fact. They add up to `RICHNESS_TOTAL`; the score is the share earned. */
const POINTS = {
  hours: 22,
  daysOnly: 12,
  website: 14,
  firstParty: 10,
  verified: 8,
  phone: 6,
  season: 6,
  place: 6,
  instagram: 5,
  otherSocial: 5,
  benefits: 5,
  products: 5,
  vendorCount: 4,
  payments: 3,
  description: 3,
} as const;

const RICHNESS_TOTAL =
  POINTS.hours + POINTS.website + POINTS.firstParty + POINTS.verified + POINTS.phone + POINTS.season +
  POINTS.place + POINTS.instagram + POINTS.otherSocial + POINTS.benefits + POINTS.products +
  POINTS.vendorCount + POINTS.payments + POINTS.description;

const has = (value: unknown[] | undefined) => Boolean(value && value.length > 0);
const text = (value: string | undefined) => Boolean(value && value.trim());

/** 0 (a bare name) to 100 (everything a visitor could ask for). */
export function marketRichness(market: RichnessRecord, schedule: RichnessSchedule): number {
  const socials = market.social_media ?? [];
  const instagram = socials.some((url) => /instagram\.com/i.test(url));
  const otherSocial = socials.some((url) => !/instagram\.com/i.test(url));
  const located =
    text(market.address) ||
    (typeof market.location?.lat === 'number' && typeof market.location?.lon === 'number');

  const points =
    (schedule.hasHours ? POINTS.hours : schedule.hasDays ? POINTS.daysOnly : 0) +
    (has(market.websites) ? POINTS.website : 0) +
    (market.first_party ? POINTS.firstParty : 0) +
    (market.verified ? POINTS.verified : 0) +
    (has(market.phone_numbers) ? POINTS.phone : 0) +
    (text(market.season) ? POINTS.season : 0) +
    (located ? POINTS.place : 0) +
    (instagram ? POINTS.instagram : 0) +
    (otherSocial ? POINTS.otherSocial : 0) +
    (market.snap || market.wic || market.fmnp || market.sfmnp ? POINTS.benefits : 0) +
    (has(market.products) ? POINTS.products : 0) +
    (market.vendor_count ? POINTS.vendorCount : 0) +
    (has(market.payment_methods) ? POINTS.payments : 0) +
    (text(market.location_description) || text(market.organization_description) || text(market.visitor_note)
      ? POINTS.description
      : 0);

  const score = Math.round((points / RICHNESS_TOTAL) * 100);
  // A record the upstream directory dropped may no longer exist, whatever it lists.
  return market.unverified ? Math.round(score * 0.3) : score;
}

/**
 * The most a full listing can be moved ahead of an empty one, in miles. Sized
 * to a metro area: within a city the best documented markets lead, and a rich
 * market across the state never outranks the one down the road.
 */
export const RICHNESS_REACH_MILES = 15;

/**
 * Distance with the listing's richness folded in: a full listing counts at
 * its real distance, an empty one as if it were `RICHNESS_REACH_MILES`
 * farther. Never less than the real distance.
 */
export function effectiveDistance(
  distance: number,
  richness: number | undefined,
  reach: number = RICHNESS_REACH_MILES
): number {
  const share = Math.min(100, Math.max(0, richness ?? 0)) / 100;
  return distance + (1 - share) * reach;
}
