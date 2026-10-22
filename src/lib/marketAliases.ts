/**
 * Records that describe the same physical market as another record.
 *
 * The directory merges two upstream feeds (the legacy USDA export and the
 * official state/government datasets) without deduplicating them, and some
 * feeds publish one row per market day. Famous markets therefore end up with
 * several pages ("Union Square Mon Greenmarket", "... Wed ...", "... Fri ...")
 * that split search signals between them while each says less than the main
 * listing.
 *
 * Nothing is deleted: an alias keeps its page, its data and its API record.
 * Its page declares the main listing as its canonical URL, links to it, and is
 * left out of the sitemap (which lists canonical URLs only). Entries are keyed
 * by the stable market ID, never by slug, and each names the record it was
 * checked against so a data refresh that reassigns an ID fails the test
 * instead of silently pointing a page at the wrong market.
 *
 * Add an entry only when the two records are verifiably the same market at
 * the same address, run by the same operator. Different markets that share a
 * name (Eastern Market in Detroit vs. Washington, DC) are not aliases.
 */
export interface MarketAlias {
  /** Stable ID of the main listing this record duplicates. */
  canonicalId: string;
  /** The alias record's own name, as a guard against ID reuse. */
  name: string;
  /** Why the two records are the same market. */
  reason: string;
}

export const MARKET_ALIASES: Readonly<Record<string, MarketAlias>> = {
  // Eastern Market, Detroit: two legacy USDA rows for the same market
  // (2934 Russell Street; the other row's 2943 is a typo per easternmarket.org).
  '310967': {
    canonicalId: '310950',
    name: 'Eastern Market',
    reason: 'Second USDA listing for Detroit Eastern Market, 2934 Russell Street.',
  },
  // Union Square Greenmarket: the NY State dataset lists each market day as
  // its own row. GrowNYC runs one market, Mon/Wed/Fri/Sat, at one location.
  'gov:us_ny_farmers_markets:e49d3b6b5d7b1c87': {
    canonicalId: '312120',
    name: 'Union Square Mon Greenmarket',
    reason: 'Monday row of the Union Square Greenmarket in the New York State dataset.',
  },
  'gov:us_ny_farmers_markets:489c05376be6918d': {
    canonicalId: '312120',
    name: 'Union Square Wed Greenmarket',
    reason: 'Wednesday row of the Union Square Greenmarket in the New York State dataset.',
  },
  'gov:us_ny_farmers_markets:1eaf6b3db4da6524': {
    canonicalId: '312120',
    name: 'Union Square Fri Greenmarket',
    reason: 'Friday row of the Union Square Greenmarket in the New York State dataset.',
  },
  'gov:us_ny_farmers_markets:ee7765f71f365664': {
    canonicalId: '312120',
    name: 'Union Square Sat Greenmarket',
    reason: 'Saturday row of the Union Square Greenmarket in the New York State dataset.',
  },
  // Ferry Plaza Farmers Market: the California WIC dataset lists each market
  // day as its own row. Foodwise runs one market, Tue/Thu/Sat, at the Ferry Building.
  'gov:us_ca_wic_farmers_markets:55b06bca83863300': {
    canonicalId: '301318',
    name: 'Ferry Plaza Tuesday Fm',
    reason: 'Tuesday row of the Ferry Plaza Farmers Market in the California WIC dataset.',
  },
  'gov:us_ca_wic_farmers_markets:a9a57b35778bb537': {
    canonicalId: '301318',
    name: 'Ferry Plaza Thursday Fm',
    reason: 'Thursday row of the Ferry Plaza Farmers Market in the California WIC dataset.',
  },
  'gov:us_ca_wic_farmers_markets:52b402e955c8abb9': {
    canonicalId: '301318',
    name: 'Ferry Plaza Saturday Fm',
    reason: 'Saturday row of the Ferry Plaza Farmers Market in the California WIC dataset.',
  },
};

/** The alias entry for a market ID, or undefined for a main listing. */
export function marketAlias(id: string | number | undefined | null): MarketAlias | undefined {
  if (id === undefined || id === null) return undefined;
  return MARKET_ALIASES[String(id)];
}

/** True when the record's page should not be listed or self-canonical. */
export function isMarketAlias(id: string | number | undefined | null): boolean {
  return Boolean(marketAlias(id));
}
