import { NextResponse } from 'next/server';
import { botAuthorized } from '@/lib/botAuth';
import { collectBotMetrics } from '@/lib/botMetricsServer';
import { UNAUTHORIZED, serverError } from '@/lib/botRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/bot/metrics
 *
 * A snapshot the growth bots store and compare over time: listings,
 * organizers, edits and photos, bot activity, submissions, newsletter and
 * vendors. Aggregate counts from the database and the published dataset
 * only; no emails, names or message text, and no PostHog visitor counts.
 * Authorized by `Authorization: Bearer $ORGANIZER_BOT_TOKEN`; see
 * docs/organizer-bot.md.
 */
export async function GET(request: Request) {
  if (!botAuthorized(request)) return UNAUTHORIZED();
  try {
    return NextResponse.json(await collectBotMetrics(), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return serverError(error, 'Bot metrics');
  }
}
