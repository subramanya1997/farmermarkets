import { NextResponse, type NextRequest } from 'next/server';

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
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const normalized = pathname.toLowerCase().replace(/(?!^)\/+$/, '');

  if (pathname === normalized) {
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
