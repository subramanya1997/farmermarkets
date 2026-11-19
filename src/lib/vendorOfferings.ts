/**
 * Weekly offerings on the vendor desk: a vendor with an approved
 * application at a market posts what they are bringing on a day or a short
 * run of days. The rules live in src/lib/offeringRules.ts; this module reads
 * and writes rows and refreshes the public pages that show them.
 *
 * Every write loads the vendor from the signed-in user, never from the
 * form, and every row by id AND vendor, so an id from someone else's page
 * does nothing.
 */
import 'server-only';
import { and, desc, eq, gte, isNull, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { dbSchema, getDb } from '@/db';
import { getMarketsByIds, getPublishedMarket, revalidateMarket, type SessionUser } from './organizer';
import {
  MAX_OPEN_OFFERINGS,
  offeringRefusal,
  parseOfferingInput,
  readOfferingItems,
  usToday,
  type OfferingItem,
} from './offeringRules';
import { readDays } from './vendorProfile';
import { resolveMarketId, type ApplicationStatus } from './vendorRules';
import { getVendorForUser, type VendorActionResult } from './vendors';
import mergedMarkets from '../../data/overrides/merged-markets.json';

const { vendorApplications, vendorOfferings } = dbSchema;

const UUID = /^[0-9a-f-]{36}$/;
const MERGES: { id: string; into: string }[] = mergedMarkets.merges.map(({ id, into }) => ({ id: String(id), into: String(into) }));

export interface DeskOffering {
  id: string;
  startsOn: string;
  endsOn: string;
  items: OfferingItem[];
  note: string | null;
  updatedAt: string;
}

export interface OfferingMarket {
  /** Canonical dataset id. */
  id: string;
  slug: string;
  name: string;
  city?: string;
  state?: string;
  /** Weekday codes from the application, to suggest market days. */
  days: string[];
  /** Posts that are not withdrawn and not over, soonest first. */
  offerings: DeskOffering[];
  /** Items of the latest post here, even an old one, to start the next post from. */
  lastItems: OfferingItem[];
}

export interface OfferingsDesk {
  /** Markets that approved the vendor: the only ones they can post for. */
  markets: OfferingMarket[];
  /** The vendor's page is public, so posts reach shoppers. */
  public: boolean;
}

/** The vendor's applications keyed by canonical market id (a merged market answers to its survivor). */
async function applicationsByMarket(vendorId: string) {
  const rows = await getDb()
    .select({ marketId: vendorApplications.marketId, status: vendorApplications.status, days: vendorApplications.days, updatedAt: vendorApplications.updatedAt })
    .from(vendorApplications)
    .where(eq(vendorApplications.vendorId, vendorId));
  const byMarket = new Map<string, { status: ApplicationStatus; days: string[] }>();
  for (const row of rows) {
    const marketId = resolveMarketId(row.marketId, MERGES);
    const seen = byMarket.get(marketId);
    // Two applications can meet at one market after a merge: approved wins.
    if (seen?.status === 'approved') continue;
    byMarket.set(marketId, { status: row.status, days: readDays(row.days) });
  }
  return byMarket;
}

function deskOffering(row: typeof vendorOfferings.$inferSelect): DeskOffering {
  return {
    id: row.id,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    items: readOfferingItems(row.items),
    note: row.note,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** What the vendor desk shows: approved markets and their open posts. Creates nothing. */
export async function offeringsDesk(user: SessionUser): Promise<OfferingsDesk> {
  const vendor = await getVendorForUser(user.id);
  if (!vendor) return { markets: [], public: false };
  const today = usToday();
  const [applications, rows, recent] = await Promise.all([
    applicationsByMarket(vendor.id),
    getDb()
      .select()
      .from(vendorOfferings)
      .where(and(eq(vendorOfferings.vendorId, vendor.id), isNull(vendorOfferings.withdrawnAt), gte(vendorOfferings.endsOn, today.from)))
      .orderBy(vendorOfferings.startsOn, desc(vendorOfferings.updatedAt)),
    // Newest post per market, withdrawn or over included: last week's list is the best start for this week's.
    getDb()
      .selectDistinctOn([vendorOfferings.marketId], { marketId: vendorOfferings.marketId, items: vendorOfferings.items })
      .from(vendorOfferings)
      .where(eq(vendorOfferings.vendorId, vendor.id))
      .orderBy(vendorOfferings.marketId, desc(vendorOfferings.createdAt)),
  ]);
  const lastItems = new Map(recent.map((row) => [row.marketId, readOfferingItems(row.items)]));
  const approved = [...applications].filter(([, application]) => application.status === 'approved');
  const markets = new Map((await getMarketsByIds(approved.map(([marketId]) => marketId))).map((market) => [market.id, market]));
  return {
    public: vendor.profile !== null && vendor.suspendedAt === null,
    markets: approved
      .flatMap(([marketId, application]) => {
        const market = markets.get(marketId);
        if (!market) return [];
        return [
          {
            id: market.id,
            slug: market.slug,
            name: market.name,
            city: market.city || undefined,
            state: market.state || undefined,
            days: application.days,
            offerings: rows.filter((row) => row.marketId === market.id).map(deskOffering),
            lastItems: lastItems.get(market.id) ?? [],
          },
        ];
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

async function refreshPages(vendorSlug: string, marketSlug: string) {
  revalidatePath(`/vendors/${vendorSlug}`);
  revalidatePath('/vendor', 'layout');
  await revalidateMarket(marketSlug);
}

/**
 * Post what the vendor is bringing. Posting again for the same market and
 * days replaces that post. `replaces` is the post being edited: when the
 * edit moves it to other days, the old one is withdrawn.
 */
export async function postOffering(user: SessionUser, input: unknown, replaces?: string): Promise<VendorActionResult> {
  const vendor = await getVendorForUser(user.id);
  if (!vendor) return { ok: false, error: offeringRefusal({ ownVendor: true, applicationStatus: null })! };

  const today = usToday();
  const parsed = parseOfferingInput(input, today.from);
  if (!parsed.ok) return { ok: false, error: 'Check the highlighted fields.', fieldErrors: parsed.errors };
  const { offering } = parsed;

  const market = await getPublishedMarket(offering.market);
  if (!market) return { ok: false, error: 'We could not find that market.' };
  const application = (await applicationsByMarket(vendor.id)).get(market.id);
  const refusal = offeringRefusal({ ownVendor: true, applicationStatus: application?.status ?? null });
  if (refusal) return { ok: false, error: refusal };

  const db = getDb();
  const editing = replaces && UUID.test(replaces) ? replaces : null;
  if (!editing) {
    const open = await db
      .select({ id: vendorOfferings.id })
      .from(vendorOfferings)
      .where(and(eq(vendorOfferings.vendorId, vendor.id), isNull(vendorOfferings.withdrawnAt), gte(vendorOfferings.endsOn, today.from)))
      .limit(MAX_OPEN_OFFERINGS + 1);
    if (open.length >= MAX_OPEN_OFFERINGS) return { ok: false, error: `You have ${MAX_OPEN_OFFERINGS} posts up. Take one down first.` };
  }

  const now = new Date();
  const values = {
    vendorId: vendor.id,
    marketId: market.id,
    startsOn: offering.startsOn,
    endsOn: offering.endsOn,
    items: offering.items,
    note: offering.note ?? null,
    updatedAt: now,
    withdrawnAt: null,
  };
  const [saved] = await db
    .insert(vendorOfferings)
    .values(values)
    .onConflictDoUpdate({
      target: [vendorOfferings.vendorId, vendorOfferings.marketId, vendorOfferings.startsOn, vendorOfferings.endsOn],
      set: { items: values.items, note: values.note, updatedAt: now, withdrawnAt: null },
    })
    .returning({ id: vendorOfferings.id });

  let movedFrom: string | null = null;
  if (editing && saved && saved.id !== editing) {
    const [old] = await db
      .update(vendorOfferings)
      .set({ withdrawnAt: now, updatedAt: now })
      .where(and(eq(vendorOfferings.id, editing), eq(vendorOfferings.vendorId, vendor.id), isNull(vendorOfferings.withdrawnAt), ne(vendorOfferings.id, saved.id)))
      .returning({ marketId: vendorOfferings.marketId });
    movedFrom = old?.marketId ?? null;
  }

  await refreshPages(vendor.slug, market.slug);
  if (movedFrom && movedFrom !== market.id) {
    const [previous] = await getMarketsByIds([movedFrom]);
    if (previous) await revalidateMarket(previous.slug);
  }
  const live = vendor.profile !== null && vendor.suspendedAt === null;
  return { ok: true, message: live ? 'Posted. Shoppers see it on your page and the market page.' : 'Saved. Shoppers see it once your page is live.' };
}

/** Take a post down. */
export async function withdrawOffering(user: SessionUser, offeringId: string): Promise<VendorActionResult> {
  if (!UUID.test(offeringId)) return { ok: false, error: 'Unknown post.' };
  const vendor = await getVendorForUser(user.id);
  if (!vendor) return { ok: false, error: 'Unknown post.' };
  const now = new Date();
  const [row] = await getDb()
    .update(vendorOfferings)
    .set({ withdrawnAt: now, updatedAt: now })
    .where(and(eq(vendorOfferings.id, offeringId), eq(vendorOfferings.vendorId, vendor.id), isNull(vendorOfferings.withdrawnAt)))
    .returning({ marketId: vendorOfferings.marketId });
  if (!row) return { ok: false, error: 'This post was already taken down.' };
  const [market] = await getMarketsByIds([row.marketId]);
  revalidatePath(`/vendors/${vendor.slug}`);
  revalidatePath('/vendor', 'layout');
  if (market) await revalidateMarket(market.slug);
  return { ok: true, message: 'Taken down.' };
}
