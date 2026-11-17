import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DatabaseUnavailableError } from '@/db';
import { getPublishedMarket, grantMarketAccessFromBot } from '@/lib/organizer';
import slugRedirects from '../../../../../data/slug-redirects.json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/bot/organizer-access
 *
 * The outreach bot gives someone it has been talking to manager access to a
 * market: an account for their email and an approved claim, ready the moment
 * they sign in with an emailed code at /markets/<slug>/claim.
 * Authorized by `Authorization: Bearer $ORGANIZER_BOT_TOKEN`; see
 * docs/organizer-bot.md for the contract the bot follows.
 */

const bodySchema = z.object({
  /** Market slug, or the market page URL. */
  market: z.string().trim().min(1).max(500),
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().max(120).optional(),
  role: z.string().trim().max(80).optional(),
  note: z.string().trim().max(1000).optional(),
  notify: z.boolean().optional(),
});

const redirects: Record<string, string> = slugRedirects.redirects;

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function authorized(request: Request): boolean {
  const expected = process.env.ORGANIZER_BOT_TOKEN?.trim();
  if (!expected || expected.length < 32) return false;
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;
  // Hash both sides so the comparison is constant time whatever the length.
  return timingSafeEqual(digest(match[1].trim()), digest(expected));
}

/** A slug, `/markets/<slug>` or a full market URL, following merged-listing redirects. */
function slugFrom(value: string): string | null {
  let path = value;
  try {
    path = new URL(value).pathname;
  } catch {
    // Not a URL: a slug or a path.
  }
  const slug = path.replace(/^\/?(markets\/)?/, '').replace(/\/(claim)?\/?$/, '').toLowerCase();
  if (!/^[a-z0-9-]{1,200}$/.test(slug)) return null;
  const moved = redirects[slug];
  return moved?.startsWith('/markets/') ? moved.slice('/markets/'.length) : slug;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid request.',
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      },
      { status: 400 },
    );
  }

  const slug = slugFrom(parsed.data.market);
  const market = slug ? await getPublishedMarket(slug) : null;
  if (!market) {
    return NextResponse.json({ error: `No market found for "${parsed.data.market}".` }, { status: 404 });
  }

  try {
    const result = await grantMarketAccessFromBot(market, parsed.data);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({
      ok: true,
      market: { id: market.id, slug: market.slug, name: market.name },
      email: parsed.data.email,
      claim_url: result.claimUrl,
      created_account: result.createdAccount,
      already_manager: result.alreadyManager,
      notified: result.notified,
    });
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) {
      return NextResponse.json({ error: 'Database unavailable. Try again later.' }, { status: 503 });
    }
    console.error('Bot organizer access failed:', error);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
