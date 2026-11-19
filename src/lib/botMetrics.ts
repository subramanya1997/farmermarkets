/**
 * The scoreboard behind `GET /api/bot/metrics` (docs/organizer-bot.md):
 * aggregate counts only, never emails, names or message text. This module
 * is pure (it shapes counts the server collects in botMetricsServer.ts) so
 * the response shape is unit-tested and stays stable.
 *
 * Adding a field is fine; renaming or removing one breaks the bots that
 * store and compare snapshots, so bump METRICS_SCHEMA_VERSION if that ever
 * has to happen.
 */

export const METRICS_SCHEMA_VERSION = 1;

/** `[{ key, n }]` rows from a `group by`, as the database returns them. */
export type GroupRows = { key: string | null; n: number | string }[];

/** Every expected key present (0 when absent), plus any key the database adds later. */
export function tally<K extends string>(rows: GroupRows, keys: readonly K[]): Record<K, number> {
  const out = Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
  for (const row of rows) {
    if (row.key === null) continue;
    (out as Record<string, number>)[row.key] = ((out as Record<string, number>)[row.key] ?? 0) + Number(row.n);
  }
  return out;
}

/** approved / (approved + rejected), rounded to 3 places; null before anything was decided. */
export function rate(approved: number, rejected: number): number | null {
  const decided = approved + rejected;
  return decided === 0 ? null : Math.round((approved / decided) * 1000) / 1000;
}

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;
export const PHOTO_STATUSES = ['pending', 'approved', 'rejected', 'removed'] as const;
export const SUBMISSION_TYPES = ['correction', 'new_market', 'claim', 'contact'] as const;
export const SUBMISSION_STATUSES = ['pending', 'reviewed', 'applied', 'rejected'] as const;
export const NEWSLETTER_STATUSES = ['pending', 'confirmed', 'unsubscribed'] as const;
export const VENDOR_STATUSES = ['draft', 'pending', 'approved', 'rejected'] as const;
export const VENDOR_APPLICATION_STATUSES = ['pending', 'approved', 'denied', 'withdrawn'] as const;
export const BOT_ACTIONS = ['listing_edit', 'photo_upload', 'remove_listing', 'close_listing', 'remove_photos'] as const;
export const BOT_ACTION_STATUSES = ['applied', 'pending', 'approved', 'dismissed'] as const;

export interface MetricsInput {
  generatedAt: Date;
  /** From the published dataset file (the base listings, before organizer edits). */
  dataset: { total: number; snapEbt: number };
  overrides: number;
  marketsWithApprovedPhotos: number;
  accounts: number;
  verifiedAccounts: number;
  managers: number;
  managedMarkets: number;
  claimsByStatus: GroupRows;
  /** Approved claims the outreach bot recorded through /api/bot/organizer-access. */
  claimsApprovedByBot: number;
  changesByStatus: GroupRows;
  photosByStatus: GroupRows;
  /** Approved photos uploaded by a signed-in organizer (the rest are editorial or bot uploads). */
  organizerPhotosApproved: number;
  submissionsByType: GroupRows;
  submissionsByStatus: GroupRows;
  newsletterByStatus: GroupRows;
  botActions: { action: string | null; status: string | null; n: number | string }[];
  /** Null when the vendor tables are not there (an old database). */
  vendors: {
    profiles: number;
    liveProfiles: number;
    byStatus: GroupRows;
    applicationsByStatus: GroupRows;
    /** Waiting on an admin because the market has no organizer. */
    applicationsWaitingForAdmin: number;
    marketsWithApprovedVendors: number;
    /** Shopper follows and counted QR scans, all time. Null when those tables are not there yet. */
    reach?: { follows: number; qrScans: number } | null;
  } | null;
  /** Created in the last 7 days. */
  recent: { claims: number; changeRequests: number; photos: number; submissions: number; botActions: number; vendorProfiles: number };
}

export function buildBotMetrics(input: MetricsInput) {
  const claims = tally(input.claimsByStatus, REVIEW_STATUSES);
  const changes = tally(input.changesByStatus, REVIEW_STATUSES);
  const photos = tally(input.photosByStatus, PHOTO_STATUSES);
  const submissionStatus = tally(input.submissionsByStatus, SUBMISSION_STATUSES);

  const botByAction = Object.fromEntries(BOT_ACTIONS.map((action) => [action, 0])) as Record<(typeof BOT_ACTIONS)[number], number>;
  const botByStatus = tally([], BOT_ACTION_STATUSES);
  for (const row of input.botActions) {
    const n = Number(row.n);
    if (row.action) (botByAction as Record<string, number>)[row.action] = ((botByAction as Record<string, number>)[row.action] ?? 0) + n;
    if (row.status) (botByStatus as Record<string, number>)[row.status] = ((botByStatus as Record<string, number>)[row.status] ?? 0) + n;
  }

  const vendorApplications = input.vendors ? tally(input.vendors.applicationsByStatus, VENDOR_APPLICATION_STATUSES) : null;

  return {
    ok: true as const,
    schema_version: METRICS_SCHEMA_VERSION,
    generated_at: input.generatedAt.toISOString(),
    listings: {
      total: input.dataset.total,
      snap_ebt: input.dataset.snapEbt,
      with_override: input.overrides,
      with_approved_photos: input.marketsWithApprovedPhotos,
      with_manager: input.managedMarkets,
    },
    organizers: {
      accounts: input.accounts,
      verified_accounts: input.verifiedAccounts,
      managers: input.managers,
      managed_markets: input.managedMarkets,
      pending_claims: claims.pending,
      approved_claims: claims.approved,
      rejected_claims: claims.rejected,
      approved_claims_by_bot: input.claimsApprovedByBot,
      claim_approval_rate: rate(claims.approved, claims.rejected),
    },
    edits: {
      pending_change_requests: changes.pending,
      approved_change_requests: changes.approved,
      rejected_change_requests: changes.rejected,
      pending_photos: photos.pending,
      approved_photos: photos.approved,
      approved_organizer_photos: input.organizerPhotosApproved,
      rejected_photos: photos.rejected,
      removed_photos: photos.removed,
    },
    bot: {
      by_action: botByAction,
      by_status: botByStatus,
      pending_requests: botByStatus.pending,
    },
    submissions: {
      total: Object.values(submissionStatus).reduce((sum, n) => sum + n, 0),
      pending: submissionStatus.pending,
      by_type: tally(input.submissionsByType, SUBMISSION_TYPES),
      by_status: submissionStatus,
    },
    newsletter: tally(input.newsletterByStatus, NEWSLETTER_STATUSES),
    vendors: {
      available: input.vendors !== null,
      profiles: input.vendors?.profiles ?? 0,
      live_profiles: input.vendors?.liveProfiles ?? 0,
      by_status: tally(input.vendors?.byStatus ?? [], VENDOR_STATUSES),
      pending_applications: vendorApplications?.pending ?? 0,
      approved_applications: vendorApplications?.approved ?? 0,
      denied_applications: vendorApplications?.denied ?? 0,
      withdrawn_applications: vendorApplications?.withdrawn ?? 0,
      applications_waiting_for_admin: input.vendors?.applicationsWaitingForAdmin ?? 0,
      markets_with_approved_vendors: input.vendors?.marketsWithApprovedVendors ?? 0,
      /**
       * Shopper reach: vendor follows and counted stall QR scans, all time.
       * Null means not tracked (no such tables yet), which is not zero.
       */
      reach: {
        follows: (input.vendors?.reach?.follows ?? null) as number | null,
        qr_scans: (input.vendors?.reach?.qrScans ?? null) as number | null,
      },
    },
    last_7_days: {
      claims: input.recent.claims,
      change_requests: input.recent.changeRequests,
      photos: input.recent.photos,
      submissions: input.recent.submissions,
      bot_actions: input.recent.botActions,
      vendor_profiles: input.recent.vendorProfiles,
    },
  };
}

export type BotMetrics = ReturnType<typeof buildBotMetrics>;
