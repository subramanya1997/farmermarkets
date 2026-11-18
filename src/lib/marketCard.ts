/**
 * What one market card shows, built once from a market record so the landing
 * page, the explorer, city pages and state pages all render the same card
 * from the same rules. Plain JSON, so a server page can hand it to a client
 * list (the city page's map-linked list) unchanged.
 */

import type { FarmerMarket } from '@/lib/api';
import {
  cardDates,
  cardHours,
  cardPlace,
  getSocialLinks,
  notableMarketType,
  weekdaysFor,
  type SlimScheduleFields,
} from './marketDisplay.ts';
import { displayName, type MarketSeoRecord, type Weekday } from './seo.ts';

/** Logos and graphics are usually PNG or SVG, often transparent, and read as a blank box on a card. */
const GRAPHIC_FILE = /\.(png|svg)(?:$|[?#])/i;

/**
 * The photo a card leads with: the organizer's first photo that is a
 * photograph rather than a logo, else their first image.
 */
export function pickCover<P extends { url: string }>(photos: P[] | undefined): P | undefined {
  if (!photos?.length) return undefined;
  return photos.find((photo) => !GRAPHIC_FILE.test(photo.url)) ?? photos[0];
}

/**
 * The grid span for a market's card in a multi-column list: a card with a
 * photo takes two columns (photo beside the text) so it stays as tall as its
 * neighbours. `span` is the list's own breakpoint class, the one at which it
 * first has two columns.
 */
export function photoSpan(market: Pick<FarmerMarket, 'cover_photo' | 'photos'>, span: string): string | undefined {
  return market.cover_photo?.url || pickCover(market.photos) ? span : undefined;
}

export interface MarketCardData {
  slug: string;
  name: string;
  href: string;
  /** A market type worth naming ("Public market"); plain farmers markets get none. */
  kind?: string;
  /** "Palo Alto, CA" by default; a street on a city page, a city on a state page. */
  place?: string;
  /** Makes the place a link of its own (the state page links each city). */
  placeHref?: string;
  /** Miles from the reader, when the list is sorted by distance. */
  distance?: number;
  days: Weekday[];
  hours?: string;
  /** When in the year it runs: "Year-round", "May-Oct", "June 4-October 1, 2026". */
  dates?: string;
  snap: boolean;
  instagram?: string;
  directions?: string;
  website?: string;
  /** The market's lead approved photo. */
  cover?: { url: string };
}

type CardSource = MarketSeoRecord &
  SlimScheduleFields &
  Pick<
    FarmerMarket,
    | 'slug'
    | 'name'
    | 'snap'
    | 'organization_types'
    | 'social_media'
    | 'websites'
    | 'google_maps_url'
    | 'suppress_map'
    | 'location'
    | 'distance'
    | 'photos'
    | 'cover_photo'
    | 'city'
    | 'state'
    | 'address'
    | 'zip_code'
    | 'country'
    | 'country_code'
  > & { season_label?: string };

export function marketCardData(
  market: CardSource,
  overrides: { place?: string; placeHref?: string } = {}
): MarketCardData {
  const lat = market.location?.lat;
  const lon = market.location?.lon;
  const directions = market.suppress_map
    ? undefined
    : market.google_maps_url ??
      (lat && lon ? `https://www.google.com/maps/dir/?api=1&destination=${lat}%2C${lon}` : undefined);
  const coverUrl = market.cover_photo?.url ?? pickCover(market.photos)?.url;
  const place = 'place' in overrides ? overrides.place : cardPlace(market).join(', ');
  const distance = market.distance !== undefined && Number.isFinite(market.distance) ? market.distance : undefined;

  // Optional keys are left out rather than set to undefined, so the record
  // stays small when a server page serializes a list of them to the client.
  const card: MarketCardData = {
    slug: market.slug,
    name: displayName(market.name),
    href: `/markets/${market.slug}`,
    days: weekdaysFor(market),
    snap: market.snap === true,
  };
  const optional: Partial<MarketCardData> = {
    kind: notableMarketType(market),
    place: place || undefined,
    placeHref: overrides.placeHref,
    distance,
    hours: cardHours(market),
    dates: cardDates(market),
    instagram: getSocialLinks(market).find((link) => link.platform === 'instagram')?.href,
    directions,
    website: (market.websites ?? []).find((url) => /^https?:\/\//i.test(url)),
    cover: coverUrl ? { url: coverUrl } : undefined,
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) (card as unknown as Record<string, unknown>)[key] = value;
  }
  return card;
}
