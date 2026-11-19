// Server market data layer shared by API routes and server-rendered pages.

import { promises as fs } from 'fs';
import path from 'path';
import { generateSlug, calculateDistance } from '@/lib/utils';
import type {
  MarketAuditMetadata,
  MarketEnrichmentMetadata,
  MarketFirstPartyFacts,
} from '@/lib/enrichment';
import { mergeEnrichment } from '@/lib/enrichment';
import { marketHours, marketWeekdays } from '@/lib/seo';
import { cardDates } from '@/lib/marketDisplay';
import { effectiveDistance, listingStrength, marketRichness } from '@/lib/marketRichness';
// Type only: erased at compile time, so the `server-only` module is never
// bundled into the client components that read `FarmerMarket`.
import type { MarketVendorCard } from '@/lib/vendorLayer';
import marketPopularity from '../../../../data/market-popularity.json';
export { mergeEnrichment };

/** Human visits per market page in the last 30 days, refreshed daily by `scripts/build-market-popularity.mjs`. */
const RECENT_VISITS: Record<string, number> = marketPopularity.markets;

// FarmerMarket interface for TypeScript typing
export interface FarmerMarket {
  id: string;
  slug: string;
  name: string;
  last_updated?: string;
  /** Set by the data refresh on records the upstream USDA directory dropped. */
  unverified?: boolean;
  /**
   * Recently supported by verified research or a current official source:
   * the audit statuses `verified_update`, `official_source_reviewed`, and
   * `already_enriched`. Derived here so ranking never ships audit blobs.
   */
  verified?: boolean;
  /** 0 to 100 ranking strength: how much the listing can tell a visitor, plus a small bonus for recent visits (`marketRichness.ts`). */
  richness?: number;
  country?: string;
  country_code?: string;
  distance?: number;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  location?: {
    lat: number;
    lon: number;
  };
  location_description?: string;
  site_type?: string;
  indoor_outdoor?: string;
  organization_types?: string[];
  organization_description?: string;
  phone_numbers?: string[];
  emails?: string[];
  websites?: string[];
  social_media?: string[];
  google_maps_url?: string;
  suppress_map?: boolean;
  visitor_note?: string;
  schema_version?: 2;
  first_party?: MarketFirstPartyFacts;
  enrichment?: MarketEnrichmentMetadata;
  audit?: MarketAuditMetadata;
  season?: string;
  days?: string[];
  vendor_count?: number;
  products?: string[];
  production_methods?: string[];
  payment_methods?: string[];
  wic?: boolean;
  sfmnp?: boolean;
  fmnp?: boolean;
  snap?: boolean;
  snap_option?: string;
  online_ordering_available?: boolean;
  online_ordering_links?: string[];
  phone_ordering?: boolean;
  csa_available?: boolean;
  csa_description?: string;
  delivery_available?: boolean;
  delivery_methods?: string;
  accepts_cash?: boolean;
  accepts_credit_debit?: boolean;
  accepts_checks?: boolean;
  has_organic?: boolean;
  has_naturally_grown?: boolean;
  has_chemical_free?: boolean;
  has_grass_fed?: boolean;
  has_free_range?: boolean;
  has_hormone_free?: boolean;
  has_gmo_free?: boolean;
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
  has_parking?: boolean;
  has_restrooms?: boolean;
  has_picnic_area?: boolean;
  wheelchair_accessible?: boolean;
  pet_friendly?: boolean;
  /** Set when the market's verified organizer has published edits (src/lib/marketOverrides.ts). */
  organizer?: { updated_at: string; sections: string[]; verified?: boolean };
  /** Organizer photos an admin approved, in display order. */
  photos?: { url: string; width?: number; height?: number; alt?: string; caption?: string }[];
  /** The lead approved photo, attached to list records so cards can show it. */
  cover_photo?: { url: string; width?: number; height?: number; alt?: string };
  /** Slim API only: the season as a card shows it (see `cardDates`); empty when none fits. */
  season_label?: string;
  /**
   * Vendors with an approved account and an approved application here
   * (src/lib/vendorLayer.ts). Kept apart from `first_party.vendors.roster`:
   * that roster is what the organizer typed, and the listing editor prefills
   * from it.
   */
  vendor_profiles?: MarketVendorCard[];
  provenance?: {
    official: boolean;
    source_id: string;
    source_record_id: string;
    publisher: string;
    dataset_name: string;
    catalog_url: string;
    data_url: string;
    license: string;
    retrieved_at?: string;
    scope_note?: string;
  };
}

// Interface for raw market data from JSON
export interface RawMarketData {
  id?: string | number;
  slug?: string;
  name: string;
  last_updated?: string;
  unverified?: boolean;
  country?: string;
  country_code?: string;
  location?: {
    address?: string;
    city?: string;
    state?: string;
    zip_code?: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
    description?: string;
    site_type?: string;
    indoor_outdoor?: string;
  };
  organization?: {
    types?: string[];
    description?: string;
  };
  contact?: {
    phone_numbers?: string[];
    emails?: string[];
    websites?: string[];
    social_media?: string[];
  };
  google_maps_url?: string;
  suppress_map?: boolean;
  visitor_note?: string;
  schema_version?: 2;
  first_party?: MarketFirstPartyFacts;
  enrichment?: MarketEnrichmentMetadata;
  audit?: MarketAuditMetadata;
  operations?: {
    season?: string;
    days?: string[];
    vendor_count?: number;
  };
  products?: {
    items?: string[];
    production_methods?: string[];
    categories?: {
      fresh_produce?: boolean;
      meat?: boolean;
      dairy?: boolean;
      eggs?: boolean;
      herbs?: boolean;
      crafts?: boolean;
      prepared_food?: boolean;
      baked_goods?: boolean;
      flowers?: boolean;
      honey?: boolean;
      jams?: boolean;
      wine?: boolean;
    };
  };
  payment?: {
    methods?: string[];
    food_assistance?: {
      wic?: boolean;
      sfmnp?: boolean;
      fmnp?: boolean;
      snap?: boolean;
      snap_option?: string;
    };
  };
  sales_channels?: {
    online_ordering?: {
      available?: boolean;
      links?: string[];
    };
    phone_ordering?: boolean;
    csa?: {
      available?: boolean;
      description?: string;
    };
    delivery?: {
      available?: boolean;
      methods?: string;
    };
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
  provenance?: {
    official: boolean;
    source_id: string;
    source_record_id: string;
    publisher: string;
    dataset_name: string;
    catalog_url: string;
    data_url: string;
    license: string;
    retrieved_at?: string;
    scope_note?: string;
  };
}

/** Audit statuses that count as recent positive confirmation of a market. */
const VERIFIED_AUDIT_STATUSES = new Set([
  'verified_update',
  'official_source_reviewed',
  'already_enriched',
]);

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
// Kept in step with `MAX_LIMIT` in `route.ts`: the service clamps again, so a
// lower value here would silently cap the route's larger limit.
const MAX_LIMIT = 1000;

function isGoogleMapsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.hostname === 'maps.app.goo.gl' ||
      (/(^|\.)google\.[a-z.]+$/i.test(url.hostname) && url.pathname.toLowerCase().includes('/maps'))
    );
  } catch {
    return false;
  }
}

function googleMapsSearchUrl(market: RawMarketData): string {
  const coordinates = market.location?.coordinates;
  const query =
    coordinates && Number.isFinite(coordinates.latitude) && Number.isFinite(coordinates.longitude)
      ? `${coordinates.latitude},${coordinates.longitude}`
      : [market.name, market.location?.address].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER
): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(value as number), 1), max);
}

function hasValidCoordinates(userLat?: number, userLon?: number): userLat is number {
  return (
    Number.isFinite(userLat) &&
    Number.isFinite(userLon) &&
    Math.abs(userLat as number) <= 90 &&
    Math.abs(userLon as number) <= 180
  );
}

/** One raw dataset record → the flat record every page reads (before scoring). */
export function mapRawMarket(market: RawMarketData, index: number): FarmerMarket {
  const sourceMapsUrl = market.contact?.websites?.find(isGoogleMapsUrl);
  const marketWebsites = (market.contact?.websites ?? []).filter((url) => !isGoogleMapsUrl(url));
  // Extract payment methods and check for specific payment types
  const paymentMethods = market.payment?.methods || [];
  const acceptsCash = paymentMethods.some((method: string) =>
    method.toLowerCase().includes('cash')
  );
  const acceptsCredit = paymentMethods.some((method: string) =>
    method.toLowerCase().includes('credit') ||
    method.toLowerCase().includes('debit') ||
    method.toLowerCase().includes('card')
  );
  const acceptsChecks = paymentMethods.some((method: string) =>
    method.toLowerCase().includes('check')
  );

  // Extract production methods and check for specific types
  const productionMethods = market.products?.production_methods || [];
  const hasOrganic = productionMethods.some((method: string) =>
    method.toLowerCase().includes('organic')
  );
  const hasNaturallyGrown = productionMethods.some((method: string) =>
    method.toLowerCase().includes('naturally grown') ||
    method.toLowerCase().includes('natural growing')
  );
  const hasChemicalFree = productionMethods.some((method: string) =>
    method.toLowerCase().includes('chemical free') ||
    method.toLowerCase().includes('no chemicals')
  );
  const hasGrassFed = productionMethods.some((method: string) =>
    method.toLowerCase().includes('grass fed') ||
    method.toLowerCase().includes('grass-fed')
  );
  const hasFreeRange = productionMethods.some((method: string) =>
    method.toLowerCase().includes('free range') ||
    method.toLowerCase().includes('free-range')
  );
  const hasHormoneFree = productionMethods.some((method: string) =>
    method.toLowerCase().includes('hormone free') ||
    method.toLowerCase().includes('no hormones')
  );
  const hasGmoFree = productionMethods.some((method: string) =>
    method.toLowerCase().includes('gmo free') ||
    method.toLowerCase().includes('non-gmo') ||
    method.toLowerCase().includes('no gmo')
  );

  // Extract amenities from both amenities object and description
  const amenitiesText = [
    market.amenities?.description,
    market.location?.description,
    ...(market.amenities?.features || [])
  ].filter(Boolean).join(' ').toLowerCase();

  const hasParking = amenitiesText.includes('parking') || market.amenities?.parking === true;
  const hasRestrooms = (
    amenitiesText.includes('restroom') ||
    amenitiesText.includes('bathroom') ||
    amenitiesText.includes('facilities') ||
    market.amenities?.restrooms === true
  );
  const hasPicnicArea = (
    amenitiesText.includes('picnic') ||
    amenitiesText.includes('seating') ||
    market.amenities?.picnic_area === true
  );
  const isWheelchairAccessible = (
    amenitiesText.includes('wheelchair') ||
    amenitiesText.includes('accessible') ||
    amenitiesText.includes('ada') ||
    market.amenities?.wheelchair_accessible === true
  );
  const isPetFriendly = (
    amenitiesText.includes('pet friendly') ||
    amenitiesText.includes('dog friendly') ||
    amenitiesText.includes('pets welcome') ||
    market.amenities?.pet_friendly === true
  );

  const marketId = market.id?.toString() || (index + 1).toString();
  // Use existing slug from data if available, otherwise generate it
  const slug = market.slug || generateSlug(market.name, market.location?.city);

  return {
    id: marketId,
    slug: slug,
    name: market.name,
    last_updated: market.last_updated,
    unverified: market.unverified,
    verified: market.audit ? VERIFIED_AUDIT_STATUSES.has(market.audit.status) : false,
    country: market.country,
    country_code: market.country_code,
    address: market.location?.address,
    city: market.location?.city,
    state: market.location?.state,
    zip_code: market.location?.zip_code,
    location: !market.suppress_map && market.location?.coordinates ? {
      lat: market.location.coordinates.latitude,
      lon: market.location.coordinates.longitude
    } : undefined,
    location_description: market.location?.description,
    site_type: market.location?.site_type,
    indoor_outdoor: market.location?.indoor_outdoor,
    organization_types: market.organization?.types || [],
    organization_description: market.organization?.description,
    phone_numbers: market.contact?.phone_numbers || [],
    emails: market.contact?.emails || [],
    websites: marketWebsites,
    social_media: market.contact?.social_media || [],
    google_maps_url: market.suppress_map
      ? undefined
      : market.google_maps_url || sourceMapsUrl || googleMapsSearchUrl(market),
    suppress_map: market.suppress_map,
    visitor_note: market.visitor_note,
    schema_version: market.schema_version,
    first_party: market.first_party,
    enrichment: market.enrichment,
    audit: market.audit,
    season: market.operations?.season,
    days: market.operations?.days || [],
    vendor_count: market.operations?.vendor_count,
    products: market.products?.items || [],
    production_methods: productionMethods,
    payment_methods: paymentMethods,
    wic: market.payment?.food_assistance?.wic || false,
    sfmnp: market.payment?.food_assistance?.sfmnp || false,
    fmnp: market.payment?.food_assistance?.fmnp || false,
    snap: market.payment?.food_assistance?.snap || false,
    snap_option: market.payment?.food_assistance?.snap_option,
    accepts_cash: acceptsCash,
    accepts_credit_debit: acceptsCredit,
    accepts_checks: acceptsChecks,
    online_ordering_available: market.sales_channels?.online_ordering?.available || false,
    online_ordering_links: market.sales_channels?.online_ordering?.links || [],
    phone_ordering: market.sales_channels?.phone_ordering || false,
    csa_available: market.sales_channels?.csa?.available || false,
    csa_description: market.sales_channels?.csa?.description,
    delivery_available: market.sales_channels?.delivery?.available || false,
    delivery_methods: market.sales_channels?.delivery?.methods,
    has_organic: hasOrganic,
    has_naturally_grown: hasNaturallyGrown,
    has_chemical_free: hasChemicalFree,
    has_grass_fed: hasGrassFed,
    has_free_range: hasFreeRange,
    has_hormone_free: hasHormoneFree,
    has_gmo_free: hasGmoFree,
    has_fresh_produce: market.products?.categories?.fresh_produce || false,
    has_meat: market.products?.categories?.meat || false,
    has_dairy: market.products?.categories?.dairy || false,
    has_eggs: market.products?.categories?.eggs || false,
    has_herbs: market.products?.categories?.herbs || false,
    has_crafts: market.products?.categories?.crafts || false,
    has_prepared_food: market.products?.categories?.prepared_food || false,
    has_baked_goods: market.products?.categories?.baked_goods || false,
    has_flowers: market.products?.categories?.flowers || false,
    has_honey: market.products?.categories?.honey || false,
    has_jams: market.products?.categories?.jams || false,
    has_wine: market.products?.categories?.wine || false,
    has_parking: hasParking,
    has_restrooms: hasRestrooms,
    has_picnic_area: hasPicnicArea,
    wheelchair_accessible: isWheelchairAccessible,
    pet_friendly: isPetFriendly,
    provenance: market.provenance
  };
}

/** Scored once per record so every ordering on the site reads the same number. */
function scoreMarket(market: FarmerMarket): FarmerMarket {
  const hasDays = marketWeekdays(market).length > 0;
  const richness = marketRichness(market, { hasDays, hasHours: hasDays && Boolean(marketHours(market)) });
  return {
    ...market,
    richness: listingStrength(richness, RECENT_VISITS[market.slug], market.unverified),
  };
}

/**
 * The inverse of `mapRawMarket` for the fields it reads, so a published
 * organizer layer can be applied to a raw-shaped record and mapped again
 * without keeping 22 MB of raw records in memory. Derived flags go back as
 * explicit values, so mapping the result reproduces them.
 */
export function rawFromMarket(market: FarmerMarket): RawMarketData {
  return {
    id: market.id,
    slug: market.slug,
    name: market.name,
    last_updated: market.last_updated,
    unverified: market.unverified,
    country: market.country,
    country_code: market.country_code,
    location: {
      address: market.address,
      city: market.city,
      state: market.state,
      zip_code: market.zip_code,
      coordinates: market.location ? { latitude: market.location.lat, longitude: market.location.lon } : undefined,
      description: market.location_description,
      site_type: market.site_type,
      indoor_outdoor: market.indoor_outdoor,
    },
    organization: { types: market.organization_types, description: market.organization_description },
    contact: {
      phone_numbers: market.phone_numbers,
      emails: market.emails,
      websites: market.websites,
      social_media: market.social_media,
    },
    google_maps_url: market.google_maps_url,
    suppress_map: market.suppress_map,
    visitor_note: market.visitor_note,
    schema_version: market.schema_version,
    first_party: market.first_party,
    enrichment: market.enrichment,
    audit: market.audit,
    operations: { season: market.season, days: market.days, vendor_count: market.vendor_count },
    products: {
      items: market.products,
      production_methods: market.production_methods,
      categories: {
        fresh_produce: market.has_fresh_produce,
        meat: market.has_meat,
        dairy: market.has_dairy,
        eggs: market.has_eggs,
        herbs: market.has_herbs,
        crafts: market.has_crafts,
        prepared_food: market.has_prepared_food,
        baked_goods: market.has_baked_goods,
        flowers: market.has_flowers,
        honey: market.has_honey,
        jams: market.has_jams,
        wine: market.has_wine,
      },
    },
    payment: {
      methods: market.payment_methods,
      food_assistance: {
        wic: market.wic,
        sfmnp: market.sfmnp,
        fmnp: market.fmnp,
        snap: market.snap,
        snap_option: market.snap_option,
      },
    },
    sales_channels: {
      online_ordering: { available: market.online_ordering_available, links: market.online_ordering_links },
      phone_ordering: market.phone_ordering,
      csa: { available: market.csa_available, description: market.csa_description },
      delivery: { available: market.delivery_available, methods: market.delivery_methods },
    },
    amenities: {
      parking: market.has_parking,
      restrooms: market.has_restrooms,
      picnic_area: market.has_picnic_area,
      wheelchair_accessible: market.wheelchair_accessible,
      pet_friendly: market.pet_friendly,
    },
    provenance: market.provenance,
  };
}

/**
 * Applies the published organizer layer (approved edits and photos) to one
 * market. Loaded lazily so this module stays importable outside Next (bun
 * tests, scripts): any failure there means "no layer", never a broken page.
 */
async function withOrganizerLayer(market: FarmerMarket | null | undefined): Promise<FarmerMarket | null> {
  if (!market) return null;
  let layered = market;
  try {
    const { applyPublishedLayer } = await import('@/lib/marketOverrides');
    layered = await applyPublishedLayer(market, {
      toRaw: rawFromMarket,
      fromRaw: (raw) => scoreMarket(mapRawMarket(raw, 0)),
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('Organizer layer unavailable:', error);
  }
  // After the organizer layer, never before: that layer rebuilds the record
  // from its raw form, which has no place for account vendors.
  return withVendorCards(layered);
}

/**
 * Attaches the market's published account vendors, for every market that
 * has any (with or without an organizer). Same contract as the organizer
 * layer: a failure to load them leaves the market as it was.
 */
async function withVendorCards(market: FarmerMarket): Promise<FarmerMarket> {
  try {
    const { getMarketVendorCards } = await import('@/lib/vendorLayer');
    const cards = await getMarketVendorCards(market.id);
    return cards.length ? { ...market, vendor_profiles: cards } : market;
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('Vendor layer unavailable:', error);
    return market;
  }
}

/**
 * A page of list records with their organizer layers applied (edits and the
 * cover photo), from one cached read of the layer table; see `getListLayers`.
 */
export async function withListLayers(markets: FarmerMarket[]): Promise<FarmerMarket[]> {
  try {
    const { applyListLayers } = await import('@/lib/marketOverrides');
    const published = await applyListLayers(markets, {
      toRaw: rawFromMarket,
      fromRaw: (raw) => scoreMarket(mapRawMarket(raw, 0)),
    });
    // Re-mapping an edited record drops the reader's distance; keep it.
    return published.map((market, index) =>
      market === markets[index] || markets[index].distance === undefined
        ? market
        : { ...market, distance: markets[index].distance }
    );
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') console.error('Organizer layers unavailable for list:', error);
    return markets;
  }
}

// Load the one canonical, already consolidated market dataset.
async function readMarketsData(): Promise<FarmerMarket[]> {
  try {
    const dataPath = path.join(process.cwd(), 'public/data/farmers_markets.json');
    const fileContents = await fs.readFile(/*turbopackIgnore: true*/ dataPath, 'utf8');
    if (!fileContents.trim()) throw new Error('canonical market file is empty');
    const data = JSON.parse(fileContents) as RawMarketData[];
    if (!Array.isArray(data)) throw new Error('canonical market file must contain a top-level array');

    try {
      console.log(`Loaded ${data.length} consolidated markets from ${path.basename(dataPath)}`);

      // Transform the data to match our schema
      return data.map(mapRawMarket).map(scoreMarket);
    } catch (error) {
      console.error('Error parsing market data:', error);
      return [];
    }
  } catch (error) {
    console.error('Error loading market data:', error);
    return [];
  }
}

/**
 * Memoized dataset.
 *
 * The two JSON snapshots are ~12.3 MB combined. Reading and parsing them on
 * every request dominated TTFB, so the parse is hoisted into a module-level
 * promise that is built once per server process (same pattern as
 * `getLegacyIdSlugMap` below). A rejected — or empty, which is how
 * `readMarketsData` reports a failed read — result is not cached, so the next
 * caller retries instead of being stuck with a broken dataset for the life of
 * the process.
 */
let marketsDataPromise: Promise<FarmerMarket[]> | null = null;

function loadMarketsData(): Promise<FarmerMarket[]> {
  if (!marketsDataPromise) {
    marketsDataPromise = readMarketsData()
      .then((markets) => {
        if (markets.length === 0) {
          marketsDataPromise = null;
        }
        return markets;
      })
      .catch((error) => {
        marketsDataPromise = null;
        throw error;
      });
  }

  return marketsDataPromise;
}

/**
 * Slug → record map, so `getMarketBySlug` is O(1) instead of a linear scan over
 * 8,800+ records on every detail-page render. Built lazily from the memoized
 * dataset and reset whenever the dataset itself has to be reloaded.
 */
let slugIndexPromise: Promise<Map<string, FarmerMarket>> | null = null;

function getSlugIndex(): Promise<Map<string, FarmerMarket>> {
  if (!slugIndexPromise) {
    slugIndexPromise = loadMarketsData()
      .then((markets) => {
        if (markets.length === 0) {
          slugIndexPromise = null;
        }
        const map = new Map<string, FarmerMarket>();
        for (const market of markets) {
          if (market.slug && !map.has(market.slug)) {
            map.set(market.slug, market);
          }
        }
        return map;
      })
      .catch((error) => {
        slugIndexPromise = null;
        throw error;
      });
  }

  return slugIndexPromise;
}

/**
 * Legacy numeric-ID → slug map.
 *
 * The site used to serve `/markets/{numericId}` URLs and Google still has some
 * of them indexed. The map is built once per server process (module-level
 * memoized promise) so redirect lookups never re-scan the dataset per request.
 * Only all-digit IDs are included: official government records use opaque
 * string IDs (`gov:...`) that were never part of a public URL.
 */
let legacyIdSlugMapPromise: Promise<Map<string, string>> | null = null;

async function buildLegacyIdSlugMap(): Promise<Map<string, string>> {
  const markets = await loadMarketsData();
  const map = new Map<string, string>();

  for (const market of markets) {
    if (market.slug && /^\d+$/.test(market.id)) {
      map.set(market.id, market.slug);
    }
  }

  console.log(`Built legacy market ID map with ${map.size} numeric IDs`);
  return map;
}

export function getLegacyIdSlugMap(): Promise<Map<string, string>> {
  if (!legacyIdSlugMapPromise) {
    legacyIdSlugMapPromise = buildLegacyIdSlugMap().catch((error) => {
      // Don't cache a failed build; let the next request retry.
      legacyIdSlugMapPromise = null;
      throw error;
    });
  }

  return legacyIdSlugMapPromise;
}

/**
 * Fields the interactive map/filter UI actually reads.
 *
 * `/markets` no longer serializes the dataset into its HTML — the explorer
 * fetches it from this API instead — so the wire size of a record is now the
 * thing that matters. Dropping the long free-text fields (organization and
 * location descriptions, amenity blurbs, CSA/delivery copy, phone/email lists,
 * full provenance blocks) and every `false` boolean takes a record from
 * ~1.4 KB to ~0.35 KB without changing a pixel of the UI, because the filter
 * predicates all test `=== true` and treat a missing key as false.
 */
const SLIM_STRING_FIELDS = [
  'id', 'slug', 'name', 'country', 'country_code', 'address', 'city', 'state', 'zip_code', 'season'
] as const;

const SLIM_ARRAY_FIELDS = [
  'days', 'products', 'payment_methods', 'websites', 'social_media', 'organization_types'
] as const;

const SLIM_BOOLEAN_FIELDS = [
  'verified', 'unverified', 'suppress_map',
  'wic', 'sfmnp', 'fmnp', 'snap',
  'accepts_cash', 'accepts_credit_debit', 'accepts_checks',
  'has_organic', 'has_naturally_grown', 'has_chemical_free', 'has_grass_fed',
  'has_free_range', 'has_hormone_free', 'has_gmo_free',
  'has_fresh_produce', 'has_meat', 'has_dairy', 'has_eggs', 'has_herbs',
  'has_crafts', 'has_prepared_food', 'has_baked_goods', 'has_flowers',
  'has_honey', 'has_jams', 'has_wine'
] as const;

/** Project one record down to the fields the client UI renders or filters on. */
export function slimMarket(market: FarmerMarket): Partial<FarmerMarket> {
  const slim: Record<string, unknown> = {};

  for (const field of SLIM_STRING_FIELDS) {
    if (market[field]) slim[field] = market[field];
  }
  for (const field of SLIM_ARRAY_FIELDS) {
    const value = market[field];
    if (value && value.length > 0) slim[field] = value;
  }
  for (const field of SLIM_BOOLEAN_FIELDS) {
    if (market[field] === true) slim[field] = true;
  }

  if (market.richness) slim.richness = market.richness;
  if (market.cover_photo) slim.cover_photo = market.cover_photo;
  // The structured first-party season is dropped above; the card's dates come from it.
  slim.season_label = cardDates(market) ?? '';
  if (!market.suppress_map && market.location) slim.location = market.location;
  if (!market.suppress_map && market.distance !== undefined) slim.distance = market.distance;
  // Only the source id is read (one analytics property); the rest of the
  // provenance block is licence/catalog metadata the UI never shows.
  if (market.provenance?.source_id) {
    slim.provenance = { source_id: market.provenance.source_id };
  }

  // The client cannot read `first_party` (dropped above), so the schedule the
  // explorer filters and prints ("Today", "Sat 8am-1pm") is parsed here from
  // the full record. Always present, possibly empty, so the client knows not
  // to re-parse the raw `days` text. See `weekdaysFor` in marketDisplay.ts.
  const weekdays = marketWeekdays(market);
  slim.weekdays = weekdays;
  const hours = weekdays.length > 0 ? marketHours(market) : undefined;
  if (hours) slim.hours = hours;

  return slim as Partial<FarmerMarket>;
}

// Our API data service
export const marketService = {
  // Resolve a legacy numeric market ID to its current slug (for 301 redirects)
  getSlugByLegacyId: async (id: string) => {
    const map = await getLegacyIdSlugMap();
    return map.get(id) ?? null;
  },

  getAllMarkets: async () => {
    return await loadMarketsData();
  },

  // Get all markets with optional filtering
  getMarkets: async (options: {
    search?: string;
    country?: string;
    state?: string;
    page?: number;
    limit?: number;
    userLat?: number;
    userLon?: number;
  } = {}) => {
    const {
      search = '',
      country = '',
      state = '',
      page: rawPage = DEFAULT_PAGE,
      limit: rawLimit = DEFAULT_LIMIT,
      userLat,
      userLon
    } = options;
    const page = normalizePositiveInteger(rawPage, DEFAULT_PAGE);
    const limit = normalizePositiveInteger(rawLimit, DEFAULT_LIMIT, MAX_LIMIT);
    const markets = await loadMarketsData();

    // Apply filters
    let filteredMarkets = markets;

    if (search) {
      const searchLower = search.toLowerCase();
      filteredMarkets = filteredMarkets.filter(market => {
        return market.name.toLowerCase().includes(searchLower) ||
               (market.city && market.city.toLowerCase().includes(searchLower)) ||
               (market.state && market.state.toLowerCase().includes(searchLower)) ||
               (market.country && market.country.toLowerCase().includes(searchLower)) ||
               (market.country_code && market.country_code.toLowerCase() === searchLower);
      });
    }

    if (country) {
      const countryLower = country.toLowerCase();
      filteredMarkets = filteredMarkets.filter(market =>
        market.country?.toLowerCase() === countryLower ||
        market.country_code?.toLowerCase() === countryLower
      );
    }

    if (state) {
      filteredMarkets = filteredMarkets.filter(market =>
        market.state && market.state.toLowerCase() === state.toLowerCase()
      );
    }

    // Near the reader first, with richer listings ahead inside the same area
    // (see `effectiveDistance`); without a location, richest first.
    if (hasValidCoordinates(userLat, userLon)) {
      const lat = userLat;
      const lon = userLon as number;
      filteredMarkets = filteredMarkets
        .map(market => {
          // Calculate distance if market has coordinates
          const distance = market.location?.lat && market.location?.lon
            ? calculateDistance(lat, lon, market.location.lat, market.location.lon)
            : Infinity;

          return { ...market, distance };
        })
        .sort(
          (a, b) =>
            effectiveDistance(a.distance, a.richness) - effectiveDistance(b.distance, b.richness)
        );
    } else {
      filteredMarkets = [...filteredMarkets].sort(
        (a, b) => (b.richness ?? 0) - (a.richness ?? 0)
      );
    }

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const paginatedMarkets = filteredMarkets.slice(startIndex, startIndex + limit);

    // Return with pagination info
    return {
      data: paginatedMarkets,
      pagination: {
        total: filteredMarkets.length,
        page,
        limit,
        totalPages: Math.ceil(filteredMarkets.length / limit)
      }
    };
  },

  // Get a single market by ID
  getMarketById: async (id: string) => {
    const markets = await loadMarketsData();
    const market = markets.find(m => String(m.id) === id);
    return withOrganizerLayer(market);
  },

  // Get a single market by slug (O(1) lookup through the memoized slug index)
  getMarketBySlug: async (slug: string) => {
    const index = await getSlugIndex();
    return withOrganizerLayer(index.get(slug));
  },

  // The dataset record alone, without the organizer layer: what the editor
  // and the admin diff compare organizer edits against.
  getBaseMarketBySlug: async (slug: string) => {
    const index = await getSlugIndex();
    return index.get(slug) ?? null;
  }
};
