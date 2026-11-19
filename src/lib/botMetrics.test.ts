import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBotMetrics, rate, tally, type MetricsInput } from './botMetrics.ts';

function input(overrides: Partial<MetricsInput> = {}): MetricsInput {
  return {
    generatedAt: new Date('2026-11-19T12:00:00Z'),
    dataset: { total: 9133, snapEbt: 3000 },
    overrides: 4,
    marketsWithApprovedPhotos: 3,
    accounts: 10,
    verifiedAccounts: 8,
    managers: 5,
    managedMarkets: 4,
    claimsByStatus: [{ key: 'approved', n: '3' }, { key: 'rejected', n: 1 }],
    claimsApprovedByBot: 2,
    changesByStatus: [{ key: 'pending', n: 2 }],
    photosByStatus: [{ key: 'approved', n: 7 }, { key: 'removed', n: 1 }],
    organizerPhotosApproved: 2,
    submissionsByType: [{ key: 'correction', n: 5 }, { key: 'contact', n: 1 }],
    submissionsByStatus: [{ key: 'pending', n: 4 }, { key: 'reviewed', n: 2 }],
    newsletterByStatus: [{ key: 'confirmed', n: 12 }],
    botActions: [
      { action: 'listing_edit', status: 'applied', n: 6 },
      { action: 'remove_listing', status: 'pending', n: 1 },
      { action: 'remove_photos', status: 'approved', n: 1 },
    ],
    vendors: {
      profiles: 3,
      liveProfiles: 2,
      byStatus: [{ key: 'approved', n: 2 }, { key: 'draft', n: 1 }],
      applicationsByStatus: [{ key: 'pending', n: 2 }, { key: 'approved', n: 5 }],
      applicationsWaitingForAdmin: 1,
      marketsWithApprovedVendors: 2,
    },
    recent: { claims: 1, changeRequests: 2, photos: 3, submissions: 4, botActions: 5, vendorProfiles: 1 },
    ...overrides,
  };
}

/** The documented keys, so a rename or removal fails here before it breaks a bot. */
const SHAPE = {
  top: ['ok', 'schema_version', 'generated_at', 'listings', 'organizers', 'edits', 'bot', 'submissions', 'newsletter', 'vendors', 'last_7_days'],
  listings: ['total', 'snap_ebt', 'with_override', 'with_approved_photos', 'with_manager'],
  organizers: ['accounts', 'verified_accounts', 'managers', 'managed_markets', 'pending_claims', 'approved_claims', 'rejected_claims', 'approved_claims_by_bot', 'claim_approval_rate'],
  edits: ['pending_change_requests', 'approved_change_requests', 'rejected_change_requests', 'pending_photos', 'approved_photos', 'approved_organizer_photos', 'rejected_photos', 'removed_photos'],
  bot: ['by_action', 'by_status', 'pending_requests'],
  submissions: ['total', 'pending', 'by_type', 'by_status'],
  newsletter: ['pending', 'confirmed', 'unsubscribed'],
  vendors: [
    'available', 'profiles', 'live_profiles', 'by_status', 'pending_applications', 'approved_applications',
    'denied_applications', 'withdrawn_applications', 'applications_waiting_for_admin', 'markets_with_approved_vendors', 'reach',
  ],
  last_7_days: ['claims', 'change_requests', 'photos', 'submissions', 'bot_actions', 'vendor_profiles'],
} as const;

test('response has every documented key', () => {
  const metrics = buildBotMetrics(input()) as unknown as Record<string, Record<string, unknown>>;
  assert.deepEqual(Object.keys(metrics), SHAPE.top);
  for (const [block, keys] of Object.entries(SHAPE)) {
    if (block === 'top') continue;
    assert.deepEqual(Object.keys(metrics[block]), keys, block);
  }
  assert.deepEqual(Object.keys(metrics.vendors.reach as object), ['follows', 'qr_scans']);
});

test('counts land where they belong, missing statuses are zero', () => {
  const metrics = buildBotMetrics(input());
  assert.equal(metrics.generated_at, '2026-11-19T12:00:00.000Z');
  assert.equal(metrics.listings.snap_ebt, 3000);
  assert.equal(metrics.organizers.approved_claims, 3);
  assert.equal(metrics.organizers.pending_claims, 0);
  assert.equal(metrics.organizers.claim_approval_rate, 0.75);
  assert.equal(metrics.edits.pending_change_requests, 2);
  assert.equal(metrics.edits.approved_photos, 7);
  assert.equal(metrics.edits.pending_photos, 0);
  assert.deepEqual(metrics.submissions.by_type, { correction: 5, new_market: 0, claim: 0, contact: 1 });
  assert.equal(metrics.submissions.total, 6);
  assert.equal(metrics.submissions.pending, 4);
  assert.deepEqual(metrics.newsletter, { pending: 0, confirmed: 12, unsubscribed: 0 });
  assert.equal(metrics.bot.by_action.listing_edit, 6);
  assert.equal(metrics.bot.by_action.photo_upload, 0);
  assert.equal(metrics.bot.pending_requests, 1);
  assert.equal(metrics.bot.by_status.approved, 1);
  assert.equal(metrics.vendors.available, true);
  assert.equal(metrics.vendors.pending_applications, 2);
  assert.equal(metrics.vendors.denied_applications, 0);
  assert.equal(metrics.vendors.reach.follows, null);
});

test('vendor reach fills in once follows and scans are tracked', () => {
  const base = input();
  const metrics = buildBotMetrics(input({ vendors: { ...base.vendors!, reach: { follows: 4, qrScans: 31 } } }));
  assert.deepEqual(metrics.vendors.reach, { follows: 4, qr_scans: 31 });
  assert.deepEqual(Object.keys(metrics.vendors), SHAPE.vendors);
  // Zero is a real count, not "not tracked".
  const none = buildBotMetrics(input({ vendors: { ...base.vendors!, reach: { follows: 0, qrScans: 0 } } }));
  assert.deepEqual(none.vendors.reach, { follows: 0, qr_scans: 0 });
});

test('a row moves the count it belongs to', () => {
  const before = buildBotMetrics(input());
  const after = buildBotMetrics(input({ claimsByStatus: [{ key: 'approved', n: 3 }, { key: 'rejected', n: 1 }, { key: 'pending', n: 1 }] }));
  assert.equal(after.organizers.pending_claims, before.organizers.pending_claims + 1);
  assert.equal(after.organizers.approved_claims, before.organizers.approved_claims);
});

test('no vendor tables still gives the same shape, zero filled', () => {
  const metrics = buildBotMetrics(input({ vendors: null }));
  assert.equal(metrics.vendors.available, false);
  assert.equal(metrics.vendors.profiles, 0);
  assert.deepEqual(metrics.vendors.by_status, { draft: 0, pending: 0, approved: 0, rejected: 0 });
  assert.deepEqual(Object.keys(metrics.vendors), SHAPE.vendors);
});

test('aggregates only: no strings that could be personal data', () => {
  const text: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === 'string') text.push(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(buildBotMetrics(input()));
  assert.deepEqual(text, ['2026-11-19T12:00:00.000Z']);
});

test('tally and rate helpers', () => {
  assert.deepEqual(tally([{ key: 'b', n: '2' }, { key: null, n: 9 }, { key: 'c', n: 1 }], ['a', 'b'] as const), { a: 0, b: 2, c: 1 });
  assert.equal(rate(0, 0), null);
  assert.equal(rate(2, 1), 0.667);
});
