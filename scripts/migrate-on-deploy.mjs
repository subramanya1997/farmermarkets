/**
 * Apply pending Drizzle migrations (`drizzle/`) to the production database
 * before a production build, so new tables exist before the code that uses
 * them goes live.
 *
 * Runs only when Vercel builds the production environment. Local builds, CI
 * and preview deployments skip it: production has the only database, and a
 * preview must never change it.
 *
 * Migrations are additive by convention in this repo. A failure fails the
 * build, which keeps the previous deployment live instead of shipping code
 * that expects a table the database does not have.
 *
 *   node scripts/migrate-on-deploy.mjs          # no-op outside Vercel production
 *   FORCE_MIGRATE=1 node scripts/migrate-on-deploy.mjs   # run it by hand
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';

const isProductionBuild = process.env.VERCEL_ENV === 'production';
if (!isProductionBuild && process.env.FORCE_MIGRATE !== '1') {
  console.log('[migrate] skipped (not a Vercel production build)');
  process.exit(0);
}

// The unpooled connection is the one Neon recommends for schema changes.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error('[migrate] DATABASE_URL is not set for this production build');
  process.exit(1);
}

const started = Date.now();
try {
  await migrate(drizzle(neon(url)), { migrationsFolder: 'drizzle' });
  console.log(`[migrate] database is up to date (${Date.now() - started}ms)`);
} catch (error) {
  console.error('[migrate] failed:', error);
  process.exit(1);
}
