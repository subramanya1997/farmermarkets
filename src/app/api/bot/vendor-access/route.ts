import { NextResponse } from 'next/server';
import { z } from 'zod';
import { DatabaseUnavailableError } from '@/db';
import { botAuthorized } from '@/lib/botAuth';
import { resolveMarketSlug } from '@/lib/marketSlug';
import { getPublishedMarket } from '@/lib/organizer';
import { inviteVendor } from '@/lib/vendors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/bot/vendor-access
 *
 * The outreach bot sets up a vendor it has been talking to: an account for
 * their email and a draft profile with what is already known (business
 * name, website, the markets they sell at). Nothing becomes public: the
 * vendor signs in with an emailed code, finishes the profile, and it is
 * reviewed like any other. Authorized by `Authorization: Bearer
 * $ORGANIZER_BOT_TOKEN`; see docs/vendor-bot.md for the contract.
 */

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  business_name: z.string().trim().max(120).optional(),
  website: z.string().trim().max(500).optional(),
  /** Market slugs or market page URLs the vendor sells at. */
  markets: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  notify: z.boolean().optional(),
});

export async function POST(request: Request) {
  if (!botAuthorized(request)) {
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

  const markets = [];
  for (const value of parsed.data.markets ?? []) {
    const slug = resolveMarketSlug(value);
    const market = slug ? await getPublishedMarket(slug) : null;
    if (!market) return NextResponse.json({ error: `No market found for "${value}".` }, { status: 404 });
    markets.push(market);
  }

  try {
    const result = await inviteVendor({
      email: parsed.data.email,
      businessName: parsed.data.business_name,
      website: parsed.data.website,
      markets,
      notify: parsed.data.notify,
      source: 'outreach-bot',
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({
      ok: true,
      email: parsed.data.email,
      vendor_id: result.vendorId,
      invite_url: result.inviteUrl,
      markets: markets.map((market) => ({ id: market.id, slug: market.slug, name: market.name })),
      created_account: result.createdAccount,
      already_vendor: result.alreadyVendor,
      notified: result.notified,
    });
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) {
      return NextResponse.json({ error: 'The database is not available right now.' }, { status: 503 });
    }
    console.error('Vendor access request failed:', error);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
