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
