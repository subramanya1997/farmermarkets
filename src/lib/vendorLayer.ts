/**
 * Published vendors, read for public pages: every vendor whose profile an
 * admin approved, and the markets that approved them.
 *
 * Same loading strategy as the organizer layer (src/lib/marketOverrides.ts):
 * one read for the whole `next build`, one read per render at runtime with
 * React `cache()`, so an approval shows on the very next render. Both tables
 * are small, so reading them whole beats one query per market.
 *
 * Nothing here needs a session, so public pages can import it freely.
 */
import 'server-only';
import { cache } from 'react';
import { and, eq, gte, isNotNull, isNull } from 'drizzle-orm';
import { DatabaseUnavailableError, dbSchema, getDb } from '@/db';
import { offeringsToCarry, readOfferingItems, usToday, type OfferingItem } from './offeringRules';
import { readDays, readVendorProfile, type VendorProfile } from './vendorProfile';
import { confirmedByMarket, resolveMarketId } from './vendorRules';
import mergedMarkets from '../../data/overrides/merged-markets.json';

const { vendors, vendorApplications, vendorOfferings } = dbSchema;

/**
 * A weekly post as public pages carry it. Pages are cached for up to a day,
 * so they carry the posts that are current or about to start and pick the
 * one to show at view time (`currentOffering` in src/lib/offeringRules.ts).
 */
export interface PublicOffering {
  startsOn: string;
  endsOn: string;
  items: OfferingItem[];
  note?: string;
  updatedAt: string;
}

export interface PublishedVendorMarket {
  marketId: string;
  days: string[];
  stallNote?: string;
  /** One of the market's own organizers approved this vendor. */
  confirmed: boolean;
  offerings: PublicOffering[];
}

export interface PublishedVendor {
  id: string;
  slug: string;
  profile: VendorProfile;
  /** YYYY-MM-DD of the last approval. */
  updatedAt: string;
  markets: PublishedVendorMarket[];
}

/** What a market page needs to show one vendor. */
export interface MarketVendorCard {
  slug: string;
  name: string;
  products: string[];
  items: string[];
  cover?: { url: string; width?: number; height?: number; alt?: string };
  days: string[];
  stall_note?: string;
  confirmed: boolean;
  offerings?: PublicOffering[];
}

export interface PublishedVendors {
  bySlug: Map<string, PublishedVendor>;
  byMarket: Map<string, MarketVendorCard[]>;
}

const EMPTY: PublishedVendors = { bySlug: new Map(), byMarket: new Map() };

/** Duplicate listings merged into another market: a vendor approved at the old id shows at the survivor. */
const MERGES: { id: string; into: string }[] = mergedMarkets.merges.map(({ id, into }) => ({ id: String(id), into: String(into) }));

async function queryPublishedVendors(): Promise<PublishedVendors> {
  let db;
  try {
    db = getDb();
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) return EMPTY;
    throw error;
  }

  const today = usToday();
  const [vendorRows, applicationRows, offeringRows] = await Promise.all([
    db
      .select({ id: vendors.id, slug: vendors.slug, profile: vendors.profile, reviewedAt: vendors.reviewedAt, updatedAt: vendors.updatedAt })
      .from(vendors)
      .where(and(isNotNull(vendors.profile), isNull(vendors.suspendedAt))),
    db
      .select({
        vendorId: vendorApplications.vendorId,
        marketId: vendorApplications.marketId,
        days: vendorApplications.days,
        stallNote: vendorApplications.stallNote,
        status: vendorApplications.status,
        decidedRole: vendorApplications.decidedRole,
      })
      .from(vendorApplications)
      .where(eq(vendorApplications.status, 'approved')),
    db
      .select({
        vendorId: vendorOfferings.vendorId,
        marketId: vendorOfferings.marketId,
        startsOn: vendorOfferings.startsOn,
        endsOn: vendorOfferings.endsOn,
        items: vendorOfferings.items,
        note: vendorOfferings.note,
        updatedAt: vendorOfferings.updatedAt,
      })
      .from(vendorOfferings)
      .where(and(isNull(vendorOfferings.withdrawnAt), gte(vendorOfferings.endsOn, today.from))),
  ]);

  // Posts by vendor and market, trimmed to what a cached page needs.
  const offeringsFor = new Map<string, PublicOffering[]>();
  for (const row of offeringRows) {
    const items = readOfferingItems(row.items);
    if (items.length === 0) continue;
    const key = `${row.vendorId}:${row.marketId}`;
    const list = offeringsFor.get(key) ?? [];
    list.push({ startsOn: row.startsOn, endsOn: row.endsOn, items, note: row.note ?? undefined, updatedAt: row.updatedAt.toISOString() });
    offeringsFor.set(key, list);
  }

  const bySlug = new Map<string, PublishedVendor>();
  const byId = new Map<string, PublishedVendor>();
  for (const row of vendorRows) {
    // Stored profiles were validated on the way in; re-validate so a schema
    // change can never put malformed data on a public page.
    const profile = readVendorProfile(row.profile);
    if (!profile) continue;
    const vendor: PublishedVendor = {
      id: row.id,
      slug: row.slug,
      profile,
      updatedAt: (row.reviewedAt ?? row.updatedAt).toISOString().slice(0, 10),
      markets: [],
    };
    bySlug.set(row.slug, vendor);
    byId.set(row.id, vendor);
  }

  const byMarket = new Map<string, MarketVendorCard[]>();
  for (const row of applicationRows) {
    const vendor = byId.get(row.vendorId);
    if (!vendor) continue;
    const days = readDays(row.days);
    const confirmed = confirmedByMarket(row);
    const marketId = resolveMarketId(row.marketId, MERGES);
    if (vendor.markets.some((market) => market.marketId === marketId)) continue;
    // Only reached for a vendor that is publicly listed here (live profile,
    // not suspended, approved application), so posts never leak past that.
    const offerings = offeringsToCarry(offeringsFor.get(`${vendor.id}:${marketId}`) ?? [], today);
    vendor.markets.push({ marketId, days, stallNote: row.stallNote ?? undefined, confirmed, offerings });
    const cover = vendor.profile.photos[0];
    const cards = byMarket.get(marketId) ?? [];
    cards.push({
      slug: vendor.slug,
      name: vendor.profile.name,
      products: vendor.profile.products,
      items: vendor.profile.items,
      cover: cover ? { url: cover.url, width: cover.width, height: cover.height, alt: cover.alt } : undefined,
      days,
      stall_note: row.stallNote ?? undefined,
      confirmed,
      ...(offerings.length ? { offerings } : {}),
    });
    byMarket.set(marketId, cards);
  }
  for (const cards of byMarket.values()) {
    // Vendors the market itself confirmed lead, then by name.
    cards.sort((a, b) => Number(b.confirmed) - Number(a.confirmed) || a.name.localeCompare(b.name));
  }
  return { bySlug, byMarket };
}

let buildVendors: Promise<PublishedVendors> | null = null;

const runtimeVendors = cache(queryPublishedVendors);

/** Every published vendor. Empty when no database is configured or the read fails during a build. */
export async function getPublishedVendors(): Promise<PublishedVendors> {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    buildVendors ??= queryPublishedVendors().catch((error) => {
      console.error('Could not load published vendors during build:', error);
      return EMPTY;
    });
    return buildVendors;
  }
  return runtimeVendors();
}

export async function getPublishedVendorBySlug(slug: string): Promise<PublishedVendor | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  return (await getPublishedVendors()).bySlug.get(slug) ?? null;
}

export async function getMarketVendorCards(marketId: string): Promise<MarketVendorCard[]> {
  return (await getPublishedVendors()).byMarket.get(marketId) ?? [];
}
