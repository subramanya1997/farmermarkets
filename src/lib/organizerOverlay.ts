/**
 * Turns approved organizer edits (`ListingEdits`) into the same shapes the
 * research pipeline writes, so every existing consumer (Plan card, hours,
 * filters, highlights, JSON-LD) reads organizer facts without knowing where
 * they came from.
 *
 * - `applyListingEdits(raw, edits, meta)` writes a NEW raw market record:
 *   sourced `first_party` facts (source id `organizer`) plus the flat fields
 *   `data.ts` derives filters from. The input record is never mutated.
 * - `listingEditsFromMarket(market)` goes the other way, to prefill the
 *   editor and to show the admin what is published now.
 *
 * Pure: no server-only imports, so node tests can run it.
 */
import type {
  MarketEnrichmentMetadata,
  MarketEnrichmentSource,
  MarketFirstPartyFacts,
  SourcedItem,
  SourcedValue,
} from './enrichment.ts';
import { formatStructuredSchedule, formatStructuredSeason } from './enrichment.ts';
import {
  AMENITY_CODES,
  ASSISTANCE_CODES,
  LISTING_SECTIONS,
  PAYMENT_CODES,
  PRODUCT_CODES,
  SOCIAL_PLATFORMS,
  changedSections,
  emailSchema,
  eventSchema,
  httpUrl,
  incentiveSchema,
  listingEditsSchema,
  phoneSchema,
  programSchema,
  socialProfileSchema,
  vendorSchema,
  type ListingEdits,
  type ListingSection,
  type Weekday,
} from './listingEdits.ts';

export const ORGANIZER_SOURCE_ID = 'organizer';

/** The slice of a raw dataset record the overlay writes. Structural on purpose. */
export interface OverlayableMarket {
  name?: string;
  location?: {
    address?: string;
    city?: string;
    state?: string;
    zip_code?: string;
    coordinates?: { latitude: number; longitude: number };
    description?: string;
    [key: string]: unknown;
  };
  suppress_map?: boolean;
  schema_version?: 2;
  visitor_note?: string;
  organization?: { types?: string[]; description?: string };
  contact?: { phone_numbers?: string[]; emails?: string[]; websites?: string[]; social_media?: string[] };
  operations?: { season?: string; days?: string[]; vendor_count?: number };
  products?: {
    items?: string[];
    production_methods?: string[];
    categories?: Record<string, boolean | undefined>;
  };
  payment?: {
    methods?: string[];
    food_assistance?: { wic?: boolean; sfmnp?: boolean; fmnp?: boolean; snap?: boolean; snap_option?: string };
  };
  sales_channels?: {
    online_ordering?: { available?: boolean; links?: string[] };
    [key: string]: unknown;
  };
  amenities?: {
    description?: string;
    features?: string[];
    parking?: boolean;
    restrooms?: boolean;
    picnic_area?: boolean;
    wheelchair_accessible?: boolean;
    pet_friendly?: boolean;
  };
  first_party?: MarketFirstPartyFacts;
  enrichment?: MarketEnrichmentMetadata;
}

export interface OverlayMeta {
  /** Date the latest change was approved, YYYY-MM-DD. */
  approvedAt: string;
  /** Public listing URL, used when the organizer gives no website of their own. */
  listingUrl: string;
  /** Who stands behind the published edits: a verified organizer, or Farmer Markets editors. */
  editor?: 'organizer' | 'farmer_markets';
}

const PAYMENT_LABELS: Record<(typeof PAYMENT_CODES)[number], string> = {
  cash: 'Cash',
  credit_card: 'Credit Card',
  debit_card: 'Debit Card',
  check: 'Check',
  mobile_wallet: 'Mobile Wallet',
  contactless: 'Contactless Payment',
  market_token: 'Market Tokens',
};

export const AMENITY_LABELS: Record<(typeof AMENITY_CODES)[number], string> = {
  restrooms: 'Restrooms',
  seating: 'Seating',
  picnic_area: 'Picnic area',
  shade: 'Shade',
  drinking_water: 'Drinking water',
  atm: 'ATM',
  wifi: 'Wi-Fi',
  live_music: 'Live music',
  kids_activities: 'Kids activities',
  information_booth: 'Information booth',
};

function slugPart(value: string, fallback: string): string {
  const slug = value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return slug || fallback;
}

/** Stable, unique kebab-case ids within one collection. */
function itemIds(names: string[], prefix: string): string[] {
  const seen = new Map<string, number>();
  return names.map((name, index) => {
    const base = `${prefix}-${slugPart(name, String(index + 1))}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base}-${count + 1}` : base;
  });
}

/**
 * New raw record with the organizer's published sections applied. Sections
 * absent from `edits` keep the dataset's values untouched.
 */
export function applyListingEdits<T extends OverlayableMarket>(raw: T, edits: ListingEdits, meta: OverlayMeta): T {
  const sections = changedSections(edits);
  if (sections.length === 0) return raw;

  const verifiedAt = meta.approvedAt;
  const sv = <V,>(value: V): SourcedValue<V> => ({ value, source_ids: [ORGANIZER_SOURCE_ID], verified_at: verifiedAt });
  const items = <V,>(values: V[], ids: string[]): SourcedItem<V>[] =>
    values.map((value, index) => ({ id: ids[index], value, source_ids: [ORGANIZER_SOURCE_ID], verified_at: verifiedAt }));

  const firstParty: MarketFirstPartyFacts = structuredClone(raw.first_party ?? {});
  const next: T = {
    ...raw,
    schema_version: 2,
    organization: { ...raw.organization },
    contact: { ...raw.contact },
    operations: { ...raw.operations },
    products: { ...raw.products, categories: { ...raw.products?.categories } },
    payment: { ...raw.payment, food_assistance: { ...raw.payment?.food_assistance } },
    sales_channels: { ...raw.sales_channels },
    amenities: { ...raw.amenities },
  };

  if (edits.identity) {
    next.name = edits.identity.name;
  }

  if (edits.location) {
    const { address, zip_code, location_description, coordinates, suppress_map } = edits.location;
    next.location = {
      ...raw.location,
      address,
      zip_code,
      description: location_description,
      coordinates: coordinates ? { latitude: coordinates.lat, longitude: coordinates.lon } : raw.location?.coordinates,
    };
    if (suppress_map !== undefined) next.suppress_map = suppress_map;
  }

  if (edits.status) {
    firstParty.operations = { ...firstParty.operations, status: sv({ ...edits.status }) };
  }

  if (edits.season) {
    firstParty.operations = { ...firstParty.operations, season: sv(edits.season) };
    next.operations!.season = formatStructuredSeason(edits.season);
  }

  if (edits.schedules) {
    const schedules = edits.schedules.map((schedule) => ({
      ...(schedule.label ? { label: schedule.label } : {}),
      recurrence: { kind: 'weekly' as const, weekdays: schedule.weekdays as Weekday[] },
      opens: schedule.opens,
      closes: schedule.closes,
    }));
    firstParty.operations = {
      ...firstParty.operations,
      schedules: items(schedules, itemIds(schedules.map((s) => s.recurrence.weekdays.join('-')), 'organizer-hours')),
      // Old one-off exceptions came from a different source and may contradict new hours.
      exceptions: firstParty.operations?.exceptions?.filter((item) => item.source_ids.includes(ORGANIZER_SOURCE_ID)),
    };
    next.operations!.days = schedules.flatMap((schedule) => formatStructuredSchedule(schedule));
  }

  if (edits.about) {
    next.organization!.description = edits.about.description;
    next.visitor_note = edits.about.visitor_note;
  }

  if (edits.contact) {
    const { websites, phone_numbers, emails, social_profiles, newsletter_url, online_ordering_url } = edits.contact;
    next.contact = { ...next.contact, websites, phone_numbers, emails, social_media: social_profiles.map((p) => p.url) };
    firstParty.contact = {
      ...firstParty.contact,
      social_profiles: items(
        social_profiles.map((profile) => ({ ...profile, scope: 'market' as const })),
        itemIds(social_profiles.map((p) => p.platform), 'organizer-social'),
      ),
      newsletter: newsletter_url ? sv({ signup_url: newsletter_url }) : undefined,
    };
    next.sales_channels = {
      ...next.sales_channels,
      online_ordering: online_ordering_url ? { available: true, links: [online_ordering_url] } : { available: false, links: [] },
    };
  }

  if (edits.payments) {
    const { methods, assistance, incentives } = edits.payments;
    firstParty.payments = {
      methods: items(methods.map((code) => ({ code })), methods.map((code) => `organizer-${code.replaceAll('_', '-')}`)),
      assistance: items(assistance.map((code) => ({ code })), assistance.map((code) => `organizer-${code.replaceAll('_', '-')}`)),
      incentives: items(
        incentives.map((incentive) => ({
          name: incentive.name,
          kind: incentive.kind,
          ...(incentive.note ? { note: incentive.note } : {}),
          ...(incentive.url ? { url: incentive.url } : {}),
        })),
        itemIds(incentives.map((i) => i.name), 'organizer-incentive'),
      ),
    };
    const has = new Set<string>(assistance);
    next.payment = {
      ...next.payment,
      methods: methods.map((code) => PAYMENT_LABELS[code]),
      food_assistance: {
        snap: has.has('snap_ebt'),
        wic: has.has('wic'),
        fmnp: has.has('fmnp'),
        sfmnp: has.has('sfmnp'),
        ...(has.has('snap_ebt') && raw.payment?.food_assistance?.snap_option
          ? { snap_option: raw.payment.food_assistance.snap_option }
          : {}),
      },
    };
  }

  if (edits.products) {
    const { categories, items: productItems } = edits.products;
    firstParty.products = {
      ...firstParty.products,
      categories: items(categories.map((code) => ({ code })), categories.map((code) => `organizer-${code.replaceAll('_', '-')}`)),
      items: items(productItems, itemIds(productItems, 'organizer-item')),
    };
    const flags: Record<string, boolean> = {};
    for (const code of PRODUCT_CODES) flags[code === 'preserves' ? 'jams' : code] = categories.includes(code);
    next.products = { ...next.products, items: productItems, categories: flags };
  }

  if (edits.amenities) {
    const { available, parking, parking_note, accessibility_note, pets } = edits.amenities;
    firstParty.amenities = items(
      available.map((code) => ({ code, availability: 'yes' as const })),
      available.map((code) => `organizer-${code.replaceAll('_', '-')}`),
    );
    firstParty.access = {
      ...firstParty.access,
      parking: {
        ...(parking ? { availability: sv(parking) } : {}),
        ...(parking_note ? { location_note: sv(parking_note) } : {}),
      },
      accessibility_note: accessibility_note ? sv(accessibility_note) : undefined,
    };
    const otherPolicies = (firstParty.policies ?? []).filter((item) => item.value.code !== 'pets');
    firstParty.policies = pets
      ? [...otherPolicies, ...items([{ code: 'pets' as const, rule: pets }], ['organizer-pets'])]
      : otherPolicies;
    // Replaces the free-text description too: data.ts sniffs it for amenity
    // words, which would otherwise outvote the organizer's own answers.
    next.amenities = {
      features: available.map((code) => AMENITY_LABELS[code]),
      parking: parking === 'yes' || parking === 'limited',
      restrooms: available.includes('restrooms'),
      picnic_area: available.includes('picnic_area'),
      wheelchair_accessible: Boolean(accessibility_note),
      pet_friendly: pets === 'allowed',
    };
  }

  if (edits.vendors) {
    const { count, directory_url, roster } = edits.vendors;
    firstParty.vendors = {
      ...(count !== undefined ? { count: sv({ value: count, as_of: verifiedAt }) } : {}),
      ...(directory_url ? { directory_url: sv(directory_url) } : {}),
      roster: items(
        roster.map((vendor) => ({
          name: vendor.name,
          ...(vendor.category ? { categories: [vendor.category] } : {}),
          ...(vendor.website ? { website: vendor.website } : {}),
        })),
        itemIds(roster.map((v) => v.name), 'organizer-vendor'),
      ),
      ...(roster.length ? { roster_context: sv({ as_of: verifiedAt, non_exhaustive: true }) } : {}),
    };
    next.operations!.vendor_count = count;
  }

  if (edits.events) {
    firstParty.events = items(
      edits.events.map((event) => ({
        name: event.name,
        kind: event.kind,
        start: event.start,
        ...(event.end ? { end: event.end } : {}),
        ...(event.opens && event.closes ? { local_hours: { opens: event.opens, closes: event.closes } } : {}),
        ...(event.description ? { description: event.description } : {}),
        ...(event.url ? { url: event.url } : {}),
        status: 'scheduled' as const,
      })),
      itemIds(edits.events.map((e) => `${e.start}-${e.name}`), 'organizer-event'),
    );
  }

  if (edits.programs) {
    firstParty.programs = items(
      edits.programs.map((program) => ({
        name: program.name,
        kind: program.kind,
        ...(program.description ? { description: program.description } : {}),
        ...(program.url ? { url: program.url } : {}),
      })),
      itemIds(edits.programs.map((p) => p.name), 'organizer-program'),
    );
  }

  next.first_party = firstParty;

  const website = next.contact?.websites?.[0];
  const source: MarketEnrichmentSource = {
    id: ORGANIZER_SOURCE_ID,
    url: website ?? meta.listingUrl,
    title: meta.editor === 'farmer_markets' ? 'Farmer Markets editors' : 'The market organizer, verified by Farmer Markets',
    fields: sections,
    kind: 'first_party',
    scope: 'market',
    accessed_at: verifiedAt,
  };
  const otherSources = (raw.enrichment?.sources ?? []).filter((s) => s.id !== ORGANIZER_SOURCE_ID);
  next.enrichment = {
    verified_at: raw.enrichment?.verified_at ?? verifiedAt,
    verification_scope: raw.enrichment?.verification_scope ?? 'partial',
    sources: [...otherSources, source],
  };

  return next;
}

/* ------------------------------------------------------------------ *
 * Current listing → editor values
 * ------------------------------------------------------------------ */

/** The fields of a mapped `FarmerMarket` the prefill reads. */
export interface PrefillableMarket {
  name?: string;
  address?: string;
  zip_code?: string;
  location_description?: string;
  location?: { lat: number; lon: number };
  suppress_map?: boolean;
  organization_description?: string;
  visitor_note?: string;
  websites?: string[];
  phone_numbers?: string[];
  emails?: string[];
  social_media?: string[];
  online_ordering_links?: string[];
  accepts_cash?: boolean;
  accepts_credit_debit?: boolean;
  accepts_checks?: boolean;
  snap?: boolean;
  wic?: boolean;
  fmnp?: boolean;
  sfmnp?: boolean;
  products?: string[];
  vendor_count?: number;
  has_parking?: boolean;
  has_restrooms?: boolean;
  has_picnic_area?: boolean;
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
  first_party?: MarketFirstPartyFacts;
}

const PRODUCT_FLAGS: Record<(typeof PRODUCT_CODES)[number], keyof PrefillableMarket> = {
  fresh_produce: 'has_fresh_produce',
  meat: 'has_meat',
  dairy: 'has_dairy',
  eggs: 'has_eggs',
  herbs: 'has_herbs',
  crafts: 'has_crafts',
  prepared_food: 'has_prepared_food',
  baked_goods: 'has_baked_goods',
  flowers: 'has_flowers',
  honey: 'has_honey',
  preserves: 'has_jams',
  wine: 'has_wine',
};

function platformFor(url: string): (typeof SOCIAL_PLATFORMS)[number] {
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  })();
  if (host.endsWith('facebook.com') || host === 'fb.com') return 'facebook';
  if (host.endsWith('instagram.com')) return 'instagram';
  if (host.endsWith('linkedin.com')) return 'linkedin';
  if (host.endsWith('tiktok.com')) return 'tiktok';
  if (host === 'x.com' || host.endsWith('twitter.com')) return 'x';
  if (host.endsWith('youtube.com') || host === 'youtu.be') return 'youtube';
  return 'other';
}

/** Keep only the entries a schema accepts, cleaned, up to `max`. */
function keepValid<S extends { safeParse: (v: unknown) => { success: boolean; data?: unknown } }>(
  schema: S,
  values: unknown[],
  max: number,
): unknown[] {
  const kept: unknown[] = [];
  for (const value of values) {
    const parsed = schema.safeParse(value);
    if (parsed.success) kept.push(parsed.data);
    if (kept.length >= max) break;
  }
  return kept;
}

/**
 * What the listing says now, as editor values. Each section is validated on
 * its own; a section the current data cannot express cleanly is left out, so
 * the editor starts it empty rather than failing.
 */
export function listingEditsFromMarket(market: PrefillableMarket, today = new Date().toISOString().slice(0, 10)): ListingEdits {
  const fp = market.first_party;
  const ops = fp?.operations;
  const draft: Record<ListingSection, unknown> = {
    identity: market.name ? { name: market.name } : undefined,
    location: {
      address: market.address ?? '',
      zip_code: market.zip_code ?? '',
      location_description: market.location_description ?? '',
      ...(market.location ? { coordinates: { lat: market.location.lat, lon: market.location.lon } } : {}),
      suppress_map: Boolean(market.suppress_map),
    },
    status: ops?.status?.value,
    season:
      ops?.season && (ops.season.value.kind === 'year_round' || ops.season.value.kind === 'annual_range')
        ? ops.season.value
        : undefined,
    schedules: (ops?.schedules ?? [])
      .filter((item) => item.value.recurrence.kind === 'weekly')
      .map((item) => ({
        weekdays: item.value.recurrence.kind === 'weekly' ? item.value.recurrence.weekdays : [],
        opens: item.value.opens,
        closes: item.value.closes,
        label: item.value.label,
      })),
    about: { description: market.organization_description, visitor_note: market.visitor_note },
    contact: {
      websites: keepValid(httpUrl, market.websites ?? [], 3),
      phone_numbers: keepValid(phoneSchema, market.phone_numbers ?? [], 3),
      emails: keepValid(emailSchema, market.emails ?? [], 3),
      social_profiles: keepValid(
        socialProfileSchema,
        fp?.contact?.social_profiles?.length
          ? fp.contact.social_profiles.map((item) => ({ platform: item.value.platform, url: item.value.url }))
          : (market.social_media ?? []).map((url) => ({ platform: platformFor(url), url })),
        8,
      ),
      newsletter_url: fp?.contact?.newsletter?.value.signup_url,
      online_ordering_url: market.online_ordering_links?.[0],
    },
    payments: {
      methods: fp?.payments?.methods?.length
        ? fp.payments.methods.map((item) => item.value.code).filter((code) => (PAYMENT_CODES as readonly string[]).includes(code))
        : [
            ...(market.accepts_cash ? ['cash'] : []),
            ...(market.accepts_credit_debit ? ['credit_card', 'debit_card'] : []),
            ...(market.accepts_checks ? ['check'] : []),
          ],
      assistance: fp?.payments?.assistance?.length
        ? fp.payments.assistance.map((item) => item.value.code).filter((code) => (ASSISTANCE_CODES as readonly string[]).includes(code))
        : [
            ...(market.snap ? ['snap_ebt'] : []),
            ...(market.wic ? ['wic'] : []),
            ...(market.fmnp ? ['fmnp'] : []),
            ...(market.sfmnp ? ['sfmnp'] : []),
          ],
      incentives: keepValid(
        incentiveSchema,
        (fp?.payments?.incentives ?? []).map((item) => ({
          name: item.value.name,
          kind: item.value.kind,
          note: item.value.note,
          url: item.value.url,
        })),
        5,
      ),
    },
    products: {
      categories: fp?.products?.categories?.length
        ? fp.products.categories.map((item) => item.value.code).filter((code) => (PRODUCT_CODES as readonly string[]).includes(code))
        : PRODUCT_CODES.filter((code) => market[PRODUCT_FLAGS[code]] === true),
      items: (market.products ?? []).filter((item) => item.trim().length > 0 && item.length <= 60).slice(0, 40),
    },
    amenities: {
      available: fp?.amenities?.length
        ? fp.amenities
            .filter((item) => item.value.availability === 'yes')
            .map((item) => item.value.code)
            .filter((code) => (AMENITY_CODES as readonly string[]).includes(code))
        : [
            ...(market.has_restrooms ? ['restrooms'] : []),
            ...(market.has_picnic_area ? ['picnic_area'] : []),
          ],
      parking: fp?.access?.parking?.availability?.value ?? (market.has_parking ? 'yes' : undefined),
      parking_note: fp?.access?.parking?.location_note?.value,
      accessibility_note: fp?.access?.accessibility_note?.value,
      pets: (() => {
        const rule = fp?.policies?.find((item) => item.value.code === 'pets')?.value.rule;
        if (rule === 'allowed' || rule === 'not_allowed' || rule === 'service_animals_only') return rule;
        return market.pet_friendly ? 'allowed' : undefined;
      })(),
    },
    vendors: {
      count: fp?.vendors?.count?.value.value ?? market.vendor_count,
      directory_url: fp?.vendors?.directory_url?.value,
      roster: keepValid(
        vendorSchema,
        (fp?.vendors?.roster ?? []).map((item) => ({
          name: item.value.name,
          category: item.value.categories?.[0],
          website: item.value.website,
        })),
        100,
      ),
    },
    events: keepValid(eventSchema, (fp?.events ?? [])
      .filter((item) => item.value.status !== 'cancelled')
      .map((item) => ({
        name: item.value.name,
        kind: item.value.kind,
        start: item.value.start?.slice(0, 10),
        end: item.value.end?.slice(0, 10),
        opens: item.value.local_hours?.opens,
        closes: item.value.local_hours?.closes,
        description: item.value.description,
        url: item.value.url,
      }))
      .filter((event) => event.start && (event.end ?? event.start) >= today), 30),
    programs: keepValid(
      programSchema,
      (fp?.programs ?? []).map((item) => ({
        name: item.value.name,
        kind: item.value.kind,
        description: item.value.description,
        url: item.value.url,
      })),
      15,
    ),
  };

  const result: Record<string, unknown> = {};
  const shape = listingEditsSchema.shape;
  for (const section of LISTING_SECTIONS) {
    if (draft[section] === undefined) continue;
    const parsed = shape[section].safeParse(draft[section]);
    if (parsed.success && parsed.data !== undefined) result[section] = parsed.data;
  }
  return result as ListingEdits;
}
