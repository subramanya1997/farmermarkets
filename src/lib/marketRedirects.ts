/**
 * Runtime market merges (`market_redirects`), as server code reads them:
 * the market page answers a merged slug with a redirect even before the
 * proxy's minute-long cache (src/lib/redirectCache.ts) has caught up, and
 * the bot API reports them. Read once per render; during `next build`
 * once for the whole build.
 */
import 'server-only';
import { cache } from 'react';
import { DatabaseUnavailableError, dbSchema, getDb } from '@/db';

export interface RuntimeRedirect {
  fromSlug: string;
  toSlug: string;
  approvedBy: string;
  createdAt: Date;
}

async function queryRedirects(): Promise<Map<string, RuntimeRedirect>> {
  let db;
  try {
    db = getDb();
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) return new Map();
    throw error;
  }
  try {
    const rows = await db.select().from(dbSchema.marketRedirects);
    return new Map(rows.map((row) => [row.fromSlug, row]));
  } catch (error) {
    console.error('Could not load runtime market redirects:', error);
    return new Map();
  }
}

let buildRedirects: Promise<Map<string, RuntimeRedirect>> | null = null;
const runtimeRedirects = cache(queryRedirects);

export async function getRuntimeRedirects(): Promise<Map<string, RuntimeRedirect>> {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    buildRedirects ??= queryRedirects();
    return buildRedirects;
  }
  return runtimeRedirects();
}

/** The page a merged slug now points at, or undefined. */
export async function runtimeRedirectFor(slug: string): Promise<RuntimeRedirect | undefined> {
  return (await getRuntimeRedirects()).get(slug);
}
