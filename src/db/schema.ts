import {
  pgTable,
  text,
  timestamp,
  jsonb,
  doublePrecision,
  uuid,
  index,
  pgEnum,
  primaryKey,
  date,
  boolean,
  integer,
  bigint,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// Mirror of the canonical dataset (public/data/farmers_markets.json), synced
// by scripts/db-sync.mjs. The file pipeline stays the source of truth for
// published facts; this table exists so production can query markets and so
// submissions can reference them.
export const markets = pgTable(
  'markets',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    city: text('city'),
    state: text('state'),
    country: text('country'),
    countryCode: text('country_code'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    record: jsonb('record').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('markets_slug_idx').on(t.slug), index('markets_state_idx').on(t.state)],
);

// Per-field provenance from data/enrichment research batches, queryable in SQL.
export const marketFacts = pgTable(
  'market_facts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    marketId: text('market_id')
      .notNull()
      .references(() => markets.id, { onDelete: 'cascade' }),
    field: text('field').notNull(),
    value: jsonb('value').notNull(),
    sourceUrl: text('source_url'),
    sourceTitle: text('source_title'),
    verifiedAt: text('verified_at'),
    batch: text('batch').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('market_facts_market_idx').on(t.marketId), index('market_facts_field_idx').on(t.field)],
);

// Queryable projections of canonical first_party collections. Stable item IDs
// are scoped to a market; complete values and provenance stay available in JSON.
const sourcedItemColumns = () => ({
  marketId: text('market_id').notNull().references(() => markets.id, { onDelete: 'cascade' }),
  itemId: text('item_id').notNull(),
  name: text('name').notNull(),
  payload: jsonb('payload').notNull(),
  provenance: jsonb('provenance').notNull(),
  verifiedAt: date('verified_at', { mode: 'string' }).notNull(),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
});

export const marketEvents = pgTable('market_events', {
  ...sourcedItemColumns(),
  kind: text('kind').notNull(),
  // A date is never converted to a midnight UTC timestamp. Unknown-offset
  // local datetimes remain in sourceStart/sourceEnd and the original payload.
  sourceStart: text('source_start'),
  sourceEnd: text('source_end'),
  startPrecision: text('start_precision').notNull(),
  endPrecision: text('end_precision').notNull(),
  startDate: date('start_date', { mode: 'string' }),
  endDate: date('end_date', { mode: 'string' }),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  url: text('url'),
}, (t) => [
  primaryKey({ columns: [t.marketId, t.itemId] }),
  index('market_events_date_idx').on(t.startDate),
  index('market_events_timestamp_idx').on(t.startsAt),
  index('market_events_kind_idx').on(t.kind),
]);

export const marketVendors = pgTable('market_vendors', {
  ...sourcedItemColumns(),
  website: text('website'),
  socialUrl: text('social_url'),
  categories: jsonb('categories').notNull(),
  seasonal: boolean('seasonal'),
}, (t) => [
  primaryKey({ columns: [t.marketId, t.itemId] }),
  index('market_vendors_name_idx').on(t.name),
]);

export const marketPrograms = pgTable('market_programs', {
  ...sourcedItemColumns(),
  kind: text('kind').notNull(),
  eligibility: text('eligibility'),
  url: text('url'),
}, (t) => [
  primaryKey({ columns: [t.marketId, t.itemId] }),
  index('market_programs_kind_idx').on(t.kind),
]);

export const submissionType = pgEnum('submission_type', [
  'correction',
  'new_market',
  'claim',
  'contact',
]);

export const submissionStatus = pgEnum('submission_status', [
  'pending',
  'reviewed',
  'applied',
  'rejected',
]);

// Visitor/operator form submissions collected in production. Reviewed
// submissions get promoted into data/enrichment batches by hand or script;
// they are never merged into the published dataset automatically.
export const submissions = pgTable(
  'submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: submissionType('type').notNull(),
    marketId: text('market_id').references(() => markets.id, { onDelete: 'set null' }),
    payload: jsonb('payload').notNull(),
    email: text('email'),
    status: submissionStatus('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
  },
  (t) => [index('submissions_status_idx').on(t.status), index('submissions_market_idx').on(t.marketId)],
);

export const newsletterStatus = pgEnum('newsletter_status', ['pending', 'confirmed', 'unsubscribed']);

// Newsletter list with double opt-in. A row starts `pending` when someone
// signs up and becomes `confirmed` only when they click the link in the
// confirmation email; nothing is sent to a pending or unsubscribed address
// except that one confirmation. Confirmed contacts are mirrored to Resend for
// sending, but this table is the record of who consented, when and where.
export const newsletterSubscribers = pgTable(
  'newsletter_subscribers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Lower-cased and trimmed. */
    email: text('email').notNull().unique(),
    status: newsletterStatus('status').notNull().default('pending'),
    /** Optional US ZIP, so emails can be about markets near the reader. */
    zip: text('zip'),
    /** Which signup box: home, blog_index, blog_post, city, market. */
    source: text('source').notNull(),
    /** The page the signup came from, e.g. `/new-york/albany`. */
    sourcePath: text('source_path'),
    marketSlug: text('market_slug'),
    /** SHA-256 of the pending confirmation token; the token itself is only in the email. */
    confirmTokenHash: text('confirm_token_hash'),
    confirmExpiresAt: timestamp('confirm_expires_at', { withTimezone: true }),
    confirmSentAt: timestamp('confirm_sent_at', { withTimezone: true }),
    /** Long-lived, goes in every email's unsubscribe link. */
    unsubscribeToken: text('unsubscribe_token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
  },
  (t) => [
    index('newsletter_status_idx').on(t.status),
    index('newsletter_confirm_token_idx').on(t.confirmTokenHash),
  ],
);

/* ------------------------------------------------------------------ *
 * Organizer accounts (Better Auth) and reviewed listing edits
 * ------------------------------------------------------------------ */

// Better Auth core tables. Column names follow Better Auth's model fields
// (the Drizzle adapter maps by these JS keys); see src/lib/auth.ts.
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_idx').on(t.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('account_user_idx').on(t.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

// Better Auth rate limiting, stored here because serverless instances do not
// share memory.
export const rateLimit = pgTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});

export const reviewStatus = pgEnum('review_status', ['pending', 'approved', 'rejected']);

// Market ids are the canonical dataset's ids. They are not foreign keys to
// the `markets` mirror, which can lag the deployed file; the app checks them
// against the dataset instead.

/** Who may edit which market. Created when an admin approves a claim. */
export const marketManagers = pgTable(
  'market_managers',
  {
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    marketId: text('market_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    approvedBy: text('approved_by'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.marketId] }), index('market_managers_market_idx').on(t.marketId)],
);

/** A signed-in organizer asking to manage a market. */
export const marketClaims = pgTable(
  'market_claims',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    marketId: text('market_id').notNull(),
    role: text('role').notNull(),
    phone: text('phone'),
    message: text('message'),
    evidenceUrl: text('evidence_url'),
    status: reviewStatus('status').notNull().default('pending'),
    reviewNote: text('review_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: text('reviewed_by'),
  },
  (t) => [
    index('market_claims_status_idx').on(t.status),
    index('market_claims_user_idx').on(t.userId),
    index('market_claims_market_idx').on(t.marketId),
  ],
);

/**
 * Proposed listing edits. `changes` is a `ListingEdits` object
 * (src/lib/listingEdits.ts): each section present replaces that section.
 */
export const marketChangeRequests = pgTable(
  'market_change_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    marketId: text('market_id').notNull(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    changes: jsonb('changes').notNull(),
    status: reviewStatus('status').notNull().default('pending'),
    reviewNote: text('review_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: text('reviewed_by'),
  },
  (t) => [
    index('market_change_requests_status_idx').on(t.status),
    index('market_change_requests_market_idx').on(t.marketId),
  ],
);

/**
 * The published organizer layer: approved `ListingEdits`, merged section by
 * section, applied over the canonical record when market pages render
 * (src/lib/marketOverrides.ts). The file pipeline stays the base dataset.
 */
export const marketOverrides = pgTable('market_overrides', {
  marketId: text('market_id').primaryKey(),
  data: jsonb('data').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by'),
});

export const photoStatus = pgEnum('photo_status', ['pending', 'approved', 'rejected', 'removed']);

/** Organizer photos in Vercel Blob. Only `approved` ones are published. */
export const marketPhotos = pgTable(
  'market_photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    marketId: text('market_id').notNull(),
    blobUrl: text('blob_url').notNull(),
    pathname: text('pathname').notNull(),
    width: integer('width'),
    height: integer('height'),
    alt: text('alt'),
    caption: text('caption'),
    sort: integer('sort').notNull().default(0),
    status: photoStatus('status').notNull().default('pending'),
    uploadedBy: text('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  },
  (t) => [
    index('market_photos_market_idx').on(t.marketId),
    index('market_photos_status_idx').on(t.status),
    uniqueIndex('market_photos_pathname_idx').on(t.pathname),
  ],
);

/**
 * Short notes from a market's managers to shoppers ("Closed Saturday for the
 * parade"). Shown on the market page between `starts_at` and `ends_at`
 * unless withdrawn. They sit beside the listing: they never touch
 * `market_overrides` or the dataset. Rules in src/lib/marketUpdateRules.ts.
 */
export const marketUpdates = pgTable(
  'market_updates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    marketId: text('market_id').notNull(),
    body: text('body').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
  },
  (t) => [index('market_updates_market_idx').on(t.marketId), index('market_updates_ends_idx').on(t.endsAt)],
);

/* ------------------------------------------------------------------ *
 * Vendor accounts (src/lib/vendors.ts)
 *
 * A vendor is a business (a farm, a baker, a maker) run by one account. It
 * has nothing to do with `market_vendors` above, which mirrors the vendor
 * names found in the dataset.
 * ------------------------------------------------------------------ */

/** Describes the vendor's latest proposal, not whether a profile is live. */
export const vendorStatus = pgEnum('vendor_status', ['draft', 'pending', 'approved', 'rejected']);

export const vendors = pgTable(
  'vendors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    /** The live `VendorProfile` (src/lib/vendorProfile.ts); null until an admin approves one. */
    profile: jsonb('profile'),
    /** The profile being edited or waiting for review; null when it matches `profile`. */
    proposed: jsonb('proposed'),
    status: vendorStatus('status').notNull().default('draft'),
    reviewNote: text('review_note'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: text('reviewed_by'),
    /** 'self', 'outreach-bot' or 'admin-invite'. */
    source: text('source').notNull().default('self'),
    /** Market ids suggested by the bot or an admin invite, shown as one-tap picks. */
    invitedMarkets: jsonb('invited_markets'),
    /** Set when an admin takes the vendor off the public site. */
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    announcementsOptOut: boolean('announcements_opt_out').notNull().default(false),
    unsubscribeToken: text('unsubscribe_token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('vendors_user_idx').on(t.userId),
    uniqueIndex('vendors_slug_idx').on(t.slug),
    uniqueIndex('vendors_unsubscribe_token_idx').on(t.unsubscribeToken),
    index('vendors_status_idx').on(t.status),
  ],
);

export const vendorApplicationStatus = pgEnum('vendor_application_status', ['pending', 'approved', 'denied', 'withdrawn']);

/**
 * A vendor asking to be listed at a market. The market's organizer decides
 * when it has one, otherwise an admin. `market_id` is the dataset's id, not
 * a foreign key (see the note above `market_managers`).
 */
export const vendorApplications = pgTable(
  'vendor_applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
    marketId: text('market_id').notNull(),
    /** Weekday codes the vendor attends. */
    days: jsonb('days').notNull().default([]),
    stallNote: text('stall_note'),
    message: text('message'),
    status: vendorApplicationStatus('status').notNull().default('pending'),
    decidedBy: text('decided_by'),
    /** 'organizer' or 'admin': an organizer's approval shows the public badge. */
    decidedRole: text('decided_role'),
    decisionNote: text('decision_note'),
    /** When the market's organizers were last emailed about this application. */
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('vendor_applications_vendor_market_idx').on(t.vendorId, t.marketId),
    index('vendor_applications_market_idx').on(t.marketId),
    index('vendor_applications_status_idx').on(t.status),
  ],
);

/** What a market's organizer asks vendors for: `items` and `settings` are described in src/lib/vendorProfile.ts. */
export const marketVendorChecklists = pgTable('market_vendor_checklists', {
  marketId: text('market_id').primaryKey(),
  items: jsonb('items').notNull().default([]),
  settings: jsonb('settings').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by'),
});

/** A vendor's own files, kept in a private Blob store and reused across markets. */
export const vendorDocuments = pgTable(
  'vendor_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    pathname: text('pathname').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    expiresOn: date('expires_on'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('vendor_documents_vendor_idx').on(t.vendorId), uniqueIndex('vendor_documents_pathname_idx').on(t.pathname)],
);

/** A document attached to one checklist item of one application, and the organizer's verdict on it. */
export const vendorDocumentSubmissions = pgTable(
  'vendor_document_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id').notNull().references(() => vendorApplications.id, { onDelete: 'cascade' }),
    requirementKey: text('requirement_key').notNull(),
    documentId: uuid('document_id').notNull().references(() => vendorDocuments.id, { onDelete: 'cascade' }),
    status: reviewStatus('status').notNull().default('pending'),
    note: text('note'),
    decidedBy: text('decided_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('vendor_document_submissions_item_idx').on(t.applicationId, t.requirementKey),
    index('vendor_document_submissions_document_idx').on(t.documentId),
  ],
);

/**
 * What a vendor is bringing to one market on one day or a short run of days
 * (src/lib/vendorOfferings.ts). Only a vendor with an approved application
 * at the market may post. `market_id` is the canonical dataset id (merges
 * already followed). Posting again for the same days replaces the post.
 */
export const vendorOfferings = pgTable(
  'vendor_offerings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
    marketId: text('market_id').notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    /** `[{ name, note? }]`, plain text, at most 30 (src/lib/offeringRules.ts). */
    items: jsonb('items').notNull().default([]),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('vendor_offerings_vendor_market_days_idx').on(t.vendorId, t.marketId, t.startsOn, t.endsOn),
    index('vendor_offerings_market_idx').on(t.marketId),
    index('vendor_offerings_ends_on_idx').on(t.endsOn),
  ],
);

/** A record of each announcement an admin sent to vendors. */
export const vendorAnnouncements = pgTable('vendor_announcements', {
  id: uuid('id').primaryKey().defaultRandom(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  audience: text('audience').notNull(),
  recipientCount: integer('recipient_count').notNull().default(0),
  sentBy: text('sent_by'),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ *
 * Outreach bot audit log (src/lib/botActions.ts, docs/organizer-bot.md)
 * ------------------------------------------------------------------ */

/**
 * `applied`: the bot published it. `pending`: a removal or closure the bot
 * may not publish, waiting for an admin. `approved` / `dismissed`: an
 * admin's decision on a pending one.
 */
export const botActionStatus = pgEnum('bot_action_status', ['applied', 'pending', 'approved', 'dismissed']);

/**
 * Everything the outreach bot did or asked for, one row per call. `details`
 * holds a summary (sections, photo ids, the requested change for pending
 * items), never raw image bytes.
 */
export const botActions = pgTable(
  'bot_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    action: text('action').notNull(),
    marketId: text('market_id').notNull(),
    actor: text('actor').notNull().default('outreach-bot'),
    note: text('note').notNull(),
    operatorEmail: text('operator_email'),
    details: jsonb('details').notNull(),
    status: botActionStatus('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: text('reviewed_by'),
    reviewNote: text('review_note'),
  },
  (t) => [
    index('bot_actions_market_idx').on(t.marketId),
    index('bot_actions_status_idx').on(t.status),
    index('bot_actions_created_idx').on(t.createdAt),
  ],
);
