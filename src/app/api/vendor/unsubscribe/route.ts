/**
 * Stops announcement emails for one vendor. Three callers:
 * - the "Stop these emails" link in an announcement opens the page
 *   `/vendor-emails?token=...`; if an old link points here with GET, it is
 *   sent to that page. Opening a link never changes anything, so a mail
 *   scanner that follows every link does not unsubscribe anyone;
 * - the button on that page, a form post, which opts out and returns to the
 *   page to show the result;
 * - a mail client's one-click unsubscribe (RFC 8058), which posts
 *   `List-Unsubscribe=One-Click` to this URL and only needs a 200.
 *
 * No origin check and no sign-in: the token is the authorization. Unknown
 * tokens get the same answer as known ones.
 */
import { NextResponse } from 'next/server';
import { DatabaseUnavailableError } from '@/db';
import { unsubscribeVendorByToken } from '@/lib/vendors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  const page = new URL('/vendor-emails', request.url);
  if (/^[A-Za-z0-9_-]{20,100}$/.test(token)) page.searchParams.set('token', token);
  return NextResponse.redirect(page, 303);
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const oneClick = form?.get('List-Unsubscribe') === 'One-Click';
  const token = new URL(request.url).searchParams.get('token') ?? String(form?.get('token') ?? '');

  let done = true;
  try {
    await unsubscribeVendorByToken(token);
  } catch (error) {
    if (!(error instanceof DatabaseUnavailableError)) throw error;
    done = false;
  }
  if (oneClick) return new NextResponse(done ? 'Unsubscribed' : 'Try again later', { status: done ? 200 : 503 });
  return NextResponse.redirect(new URL(`/vendor-emails?status=${done ? 'stopped' : 'unavailable'}`, request.url), 303);
}
