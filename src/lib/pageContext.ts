/**
 * Which kind of page an analytics event happened on, read from the URL.
 *
 * `instrumentation-client.ts` merges this into every PostHog event (page
 * views included) through `before_send`, so any event can be broken down by
 * page type, state or city without regexing `$current_url`.
 */

export type PageType =
  | 'home'
  | 'markets_index'
  | 'market'
  | 'state'
  | 'city'
  | 'topic'
  | 'blog_index'
  | 'blog_post'
  | 'operators'
  | 'about'
  | 'legal'
  | 'other';

export interface PageContext {
  page_type: PageType;
  page_state?: string;
  page_city?: string;
  page_market?: string;
  page_topic?: string;
  page_blog_post?: string;
}

/** First path segments that are fixed routes, so never a state slug. */
const STATIC_SECTIONS: Record<string, PageType> = {
  markets: 'markets_index',
  'farmers-markets': 'topic',
  blog: 'blog_index',
  'for-market-operators': 'operators',
  about: 'about',
  'about-the-data': 'about',
  privacy: 'legal',
  terms: 'legal',
  ingest: 'other',
  api: 'other',
};

const SLUG = /^[a-z0-9-]+$/;

export function pageContextForPath(pathname: string): PageContext {
  const segments = pathname.split(/[?#]/)[0].split('/').filter(Boolean);
  const [first, second, third] = segments;

  if (!first) return { page_type: 'home' };

  const section = STATIC_SECTIONS[first];
  if (section === 'markets_index') {
    // /markets, /markets/page/2 and /markets/state/ny are listings; anything
    // else under /markets is one market's detail page.
    if (!second || second === 'page') return { page_type: 'markets_index' };
    if (second === 'state') return { page_type: 'markets_index', ...(third ? { page_state: third } : {}) };
    return { page_type: 'market', page_market: second };
  }
  if (section === 'topic') return second ? { page_type: 'topic', page_topic: second } : { page_type: 'other' };
  if (section === 'blog_index') return second ? { page_type: 'blog_post', page_blog_post: second } : { page_type: 'blog_index' };
  if (section) return { page_type: section };

  // Everything else at the top level is /{state} or /{state}/{city}. A path
  // that is not slug-shaped or is deeper than that is a 404 or a stray asset.
  if (!SLUG.test(first) || segments.length > 2) return { page_type: 'other' };
  if (!second) return { page_type: 'state', page_state: first };
  if (!SLUG.test(second)) return { page_type: 'other' };
  return { page_type: 'city', page_state: first, page_city: second };
}

/**
 * Extra properties a page knows that its URL does not, such as the state and
 * city a market detail page belongs to. Held for one path only, so they never
 * leak onto events from the next page after a client-side navigation.
 */
let pageExtras: { path: string; properties: Record<string, string> } | null = null;

export function setPageExtras(path: string, properties: Record<string, string | undefined>) {
  const defined = Object.fromEntries(
    Object.entries(properties).filter((entry): entry is [string, string] => Boolean(entry[1]))
  );
  pageExtras = { path, properties: defined };
}

/** The context for `pathname`, with that page's extras when they are for it. */
export function currentPageProperties(pathname: string): Record<string, string> {
  return {
    ...pageContextForPath(pathname),
    ...(pageExtras?.path === pathname ? pageExtras.properties : {}),
  };
}
