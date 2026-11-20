import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import { runtimeRedirectTarget } from '@/lib/redirectCache';

/**
 * Organizer, vendor and admin areas: a visitor with no session cookie goes
 * straight to sign-in. `/vendor` is the signed-in area; public vendor pages
 * live under `/vendors/` and are not matched.
 */
const SIGNED_IN_AREAS = /^\/(dashboard|admin|vendor)(\/|$)/;

/**
 * URL normalization: lowercase paths, no trailing slash.
 *
 * Uppercase URL variants (e.g. `/MARKETS/durham-farmers-market-durham`) used to
 * serve a 200 alongside the canonical lowercase URL, which splits crawl budget
 * and link equity across duplicates. Redirect them permanently to lowercase.
 *
 * Trailing slashes get the same treatment. Next used to strip them on its own,
 * but `skipTrailingSlashRedirect` is on (the PostHog ingestion proxy needs its
 * slash-terminated API paths left alone), so `/markets/` -> `/markets` is done
 * here instead. Both fixes land in a single hop.
 *
 * Only the pathname is touched — query strings and hashes are untouched, and
 * the matcher below keeps `/_next`, `/api`, `/ingest` and any path with a file
 * extension (static assets) out of the way.
 */
/** A market page or its claim/apply page: `/markets/<slug>[/claim|/apply]`. */
const MARKET_PAGE = /^\/markets\/([a-z0-9-]{1,200})(\/(?:claim|apply))?$/;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const normalized = pathname.toLowerCase().replace(/(?!^)\/+$/, '');

  // Duplicates the listing bot merged into another page (market_redirects)
  // answer with a 301, like the build-time merges in next.config.ts.
  const market = MARKET_PAGE.exec(normalized);
  if (market) {
    const target = await runtimeRedirectTarget(market[1]);
    if (target && target !== market[1]) {
      const url = new URL(request.url);
      url.pathname = `/markets/${target}${market[2] ?? ''}`;
      return NextResponse.redirect(url, 301);
    }
  }

  if (pathname === normalized) {
    // Only a cheap cookie-presence check. Pages and server actions verify
    // the session (and admin rights) themselves; this just saves a render.
    if (SIGNED_IN_AREAS.test(pathname) && !getSessionCookie(request)) {
      const signIn = new URL('/sign-in', request.url);
      signIn.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(signIn, 307);
    }
    return NextResponse.next();
  }

  // A plain URL, not `nextUrl.clone()`: NextURL remembers that the request
  // had a trailing slash and would put it straight back.
  const url = new URL(request.url);
  url.pathname = normalized;
  // 308 = permanent + method preserving (Next's own permanentRedirect status).
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ['/((?!_next/|api/|ingest/|.*\\.[^/]+$).*)'],
};
