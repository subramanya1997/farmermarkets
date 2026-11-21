import { NotFoundContent } from "@/components/NotFoundContent";

// `notFound()` from a page with no closer not-found boundary.
//
// Next sends the root not-found UI with every page of the site, inside each
// page's RSC payload, not only with 404s. When this file wrapped the body in
// `SiteChrome`, every one of the ~14,000 prerendered pages carried a second,
// unused copy of the header and footer: about 10% of each page's bytes and of
// the build's render time (measured November 2026). So it stays this small.
//
// Unmatched URLs, the 404 most visitors and crawlers see, are answered by
// `src/app/global-not-found.tsx`, which has the full public frame. The route
// groups have their own: `(site)/not-found.tsx` and `(auth)/not-found.tsx`, and
// the dashboards under `(app)`.
export default function NotFound() {
  return <NotFoundContent />;
}
