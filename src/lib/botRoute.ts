/**
 * Shared plumbing for the outreach bot's routes under /api/bot: the same
 * error shapes and status codes everywhere (docs/organizer-bot.md).
 */
import 'server-only';
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { DatabaseUnavailableError } from '@/db';
import type { FarmerMarket } from '@/app/api/markets/data';
import { resolveMarketSlug } from './marketSlug';
import { getPublishedMarket } from './organizer';
import { issuesOf } from './botRequests';

export function botError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

export const UNAUTHORIZED = () => botError(401, 'Unauthorized');

export function invalid(error: z.ZodError | { path: string; message: string }[]) {
  return botError(400, 'Invalid request.', { issues: Array.isArray(error) ? error : issuesOf(error) });
}

/** The live market (organizer edits applied) for a slug or URL, following old slugs. */
export async function findMarket(value: string): Promise<FarmerMarket | null> {
  const slug = resolveMarketSlug(value);
  return slug ? getPublishedMarket(slug) : null;
}

export function marketNotFound(value: string) {
  return botError(404, `No market found for "${value}".`);
}

export function marketJson(market: FarmerMarket) {
  return { id: market.id, slug: market.slug, name: market.name };
}

/** 503 when the database is down, 500 (logged) for anything else. */
export function serverError(error: unknown, what: string) {
  if (error instanceof DatabaseUnavailableError) return botError(503, 'Database unavailable. Try again later.');
  console.error(`${what} failed:`, error);
  return botError(500, 'Something went wrong.');
}
