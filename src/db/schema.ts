import {
  pgTable,
  text,
  timestamp,
  jsonb,
  doublePrecision,
  uuid,
  index,
  pgEnum,
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
