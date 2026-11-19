/**
 * Collects the counts for `GET /api/bot/metrics` from the database and the
 * published dataset, and shapes them with `buildBotMetrics`. Every query is
 * a count or a `group by`: no row content leaves this module.
 */
import 'server-only';
import { and, count, countDistinct, eq, gte, isNotNull, sql, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { dbSchema, getDb } from '@/db';
import { marketService } from '@/app/api/markets/data';
import { buildBotMetrics, type GroupRows, type MetricsInput } from './botMetrics';
import { OUTREACH_BOT_REVIEWER } from './organizer';
import { vendorCounts } from './vendors';

const {
  user: userTable,
  marketManagers,
  marketClaims,
  marketChangeRequests,
  marketOverrides,
  marketPhotos,
  submissions,
  newsletterSubscribers,
  botActions,
  vendors,
  vendorApplications,
} = dbSchema;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function groupBy(table: PgTable, column: PgColumn): Promise<GroupRows> {
  return getDb()
    .select({ key: sql<string | null>`${column}::text`, n: count() })
    .from(table)
    .groupBy(column);
}

async function total(table: PgTable, where?: SQL): Promise<number> {
  const query = getDb().select({ n: count() }).from(table);
  const [row] = await (where ? query.where(where) : query);
  return Number(row?.n ?? 0);
}

async function datasetTotals(): Promise<MetricsInput['dataset']> {
  const markets = await marketService.getAllMarkets();
  return { total: markets.length, snapEbt: markets.filter((market) => market.snap).length };
}

async function vendorBlock(since: Date): Promise<{ block: MetricsInput['vendors']; recent: number }> {
  const db = getDb();
  try {
    const [counts, byStatus, applicationsByStatus, [withVendors], recent] = await Promise.all([
      vendorCounts(),
      groupBy(vendors, vendors.status),
      groupBy(vendorApplications, vendorApplications.status),
      db
        .select({ n: countDistinct(vendorApplications.marketId) })
        .from(vendorApplications)
        .where(eq(vendorApplications.status, 'approved')),
      total(vendors, gte(vendors.createdAt, since)),
    ]);
    return {
      block: {
        profiles: counts.total,
        liveProfiles: counts.live,
        byStatus,
        applicationsByStatus,
        applicationsWaitingForAdmin: counts.applicationsForAdmin,
        marketsWithApprovedVendors: Number(withVendors?.n ?? 0),
      },
      recent,
    };
  } catch (error) {
    // A database without the vendor tables still answers the rest.
    console.error('Bot metrics: vendor counts unavailable:', error);
    return { block: null, recent: 0 };
  }
}

export async function collectBotMetrics(now = new Date()) {
  const db = getDb();
  const since = new Date(now.getTime() - WEEK_MS);
  const [
    dataset,
    overrides,
    [photoMarkets],
    accounts,
    verifiedAccounts,
    managers,
    [managedMarkets],
    claimsByStatus,
    claimsApprovedByBot,
    changesByStatus,
    photosByStatus,
    organizerPhotosApproved,
    submissionsByType,
    submissionsByStatus,
    newsletterByStatus,
    botRows,
    vendorPart,
    recentClaims,
    recentChanges,
    recentPhotos,
    recentSubmissions,
    recentBot,
  ] = await Promise.all([
    datasetTotals(),
    total(marketOverrides),
    db.select({ n: countDistinct(marketPhotos.marketId) }).from(marketPhotos).where(eq(marketPhotos.status, 'approved')),
    total(userTable),
    total(userTable, eq(userTable.emailVerified, true)),
    total(marketManagers),
    db.select({ n: countDistinct(marketManagers.marketId) }).from(marketManagers),
    groupBy(marketClaims, marketClaims.status),
    total(marketClaims, and(eq(marketClaims.status, 'approved'), eq(marketClaims.reviewedBy, OUTREACH_BOT_REVIEWER))),
    groupBy(marketChangeRequests, marketChangeRequests.status),
    groupBy(marketPhotos, marketPhotos.status),
    total(marketPhotos, and(eq(marketPhotos.status, 'approved'), isNotNull(marketPhotos.uploadedBy))),
    groupBy(submissions, submissions.type),
    groupBy(submissions, submissions.status),
    groupBy(newsletterSubscribers, newsletterSubscribers.status),
    db
      .select({ action: botActions.action, status: sql<string>`${botActions.status}::text`, n: count() })
      .from(botActions)
      .groupBy(botActions.action, botActions.status),
    vendorBlock(since),
    total(marketClaims, gte(marketClaims.createdAt, since)),
    total(marketChangeRequests, gte(marketChangeRequests.createdAt, since)),
    total(marketPhotos, gte(marketPhotos.createdAt, since)),
    total(submissions, gte(submissions.createdAt, since)),
    total(botActions, gte(botActions.createdAt, since)),
  ]);

  return buildBotMetrics({
    generatedAt: now,
    dataset,
    overrides,
    marketsWithApprovedPhotos: Number(photoMarkets?.n ?? 0),
    accounts,
    verifiedAccounts,
    managers,
    managedMarkets: Number(managedMarkets?.n ?? 0),
    claimsByStatus,
    claimsApprovedByBot,
    changesByStatus,
    photosByStatus,
    organizerPhotosApproved,
    submissionsByType,
    submissionsByStatus,
    newsletterByStatus,
    botActions: botRows,
    vendors: vendorPart.block,
    recent: {
      claims: recentClaims,
      changeRequests: recentChanges,
      photos: recentPhotos,
      submissions: recentSubmissions,
      botActions: recentBot,
      vendorProfiles: vendorPart.recent,
    },
  });
}
