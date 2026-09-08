import 'server-only';
import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export type Db = NeonHttpDatabase<typeof schema>;

let cached: Db | undefined;

/**
 * The Drizzle client, created on first use.
 *
 * Deliberately lazy: `next build` evaluates every route module while
 * collecting page data, and a module that throws when `DATABASE_URL` is
 * unset fails the whole build on any machine without the secret — CI, a
 * fresh clone, a contributor's laptop. The variable is only needed when a
 * request actually reaches the database, so that is when it is checked.
 */
export function getDb(): Db {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new DatabaseUnavailableError();
  }
  cached = drizzle(neon(url), { schema });
  return cached;
}

/** Thrown when no database is configured; routes turn it into a 503. */
export class DatabaseUnavailableError extends Error {
  constructor() {
    super('DATABASE_URL is not set');
    this.name = 'DatabaseUnavailableError';
  }
}

export * as dbSchema from './schema';
