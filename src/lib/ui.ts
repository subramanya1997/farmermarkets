/**
 * The one site frame.
 *
 * Every page-level container on the site uses this string, so the header, the
 * footer and every section of every page share a single left and right edge at
 * every viewport. The frame is deliberately near edge-to-edge — 1920px with a
 * small gutter — rather than the 1280px box the site used to draw, which left a
 * third of a large display empty.
 *
 * Width is the frame's only job. Nothing inside it is allowed to stretch just
 * because the frame is wide: grids add columns at the wide breakpoints, and
 * running text carries its own measure (`max-w-3xl` openers, `max-w-4xl` FAQ
 * rows, explicit `max-w-[75ch]` on body copy) so a line never runs past a
 * readable length on a 1920px screen.
 */
export const SITE_FRAME = 'mx-auto w-full max-w-[1920px] px-4 sm:px-6 lg:px-10 2xl:px-16';

/**
 * The frame's gutter on its own, for the handful of reference pages that are a
 * single reading column rather than a full-width layout (`/about-the-data`).
 * Pairing it with a `max-w-*` cap puts that column's left edge exactly where
 * `SITE_FRAME` puts everything else, so a document page still lines up with
 * the header, the footer and the rest of the site.
 */
export const SITE_FRAME_GUTTER = 'px-4 sm:px-6 lg:px-10 2xl:px-16';
