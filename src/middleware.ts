import { NextResponse, type NextRequest } from 'next/server';

/**
 * Case normalization.
 *
 * Uppercase URL variants (e.g. `/MARKETS/durham-farmers-market-durham`) used to
 * serve a 200 alongside the canonical lowercase URL, which splits crawl budget
 * and link equity across duplicates. Redirect them permanently to lowercase.
 *
 * Only the pathname is lowercased — query strings and hashes are untouched, and
 * the matcher below keeps `/_next`, `/api` and any path with a file extension
 * (static assets) out of the way.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const lowercased = pathname.toLowerCase();

  if (pathname === lowercased) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = lowercased;
  // 308 = permanent + method preserving (Next's own permanentRedirect status).
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ['/((?!_next/|api/|.*\\.[^/]+$).*)'],
};
