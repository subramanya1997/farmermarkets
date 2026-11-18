/**
 * Which organizer photos a market page shows. The gallery, the page's JSON-LD
 * and the sitemap's `<image:image>` entries all read this one rule, so search
 * engines are only ever pointed at photos a visitor can actually see on the
 * page. No imports: the gallery is a client component.
 */

/** The most photos one market page shows. */
export const MAX_MARKET_PHOTOS = 12;

/** The photos a market page shows, in the organizer's order. */
export function shownMarketPhotos<P>(photos: P[] | undefined): P[] {
  return (photos ?? []).slice(0, MAX_MARKET_PHOTOS);
}
