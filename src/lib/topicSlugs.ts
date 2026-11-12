/**
 * The topic pages' slugs, paths and labels.
 *
 * Kept free of imports so three very different callers can share one list:
 * `next.config.ts` (redirects), `pageContext.ts` (analytics, runs in the
 * browser) and `topicPage.ts` (server view models).
 *
 * Topic pages live at `/markets/{topic}`, next to the market detail pages at
 * `/markets/{slug}`. A static segment wins over `[slug]`, so every name here
 * is reserved: a market whose slug matched one would be unreachable.
 * `topicSlugs.test.ts` fails the data checks if that ever happens.
 *
 * They lived under `/farmers-markets/` until November 2026; `next.config.ts`
 * 308s the four addresses that existed there.
 */

export const DAY_TOPIC_SLUGS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;
export type DayTopicSlug = (typeof DAY_TOPIC_SLUGS)[number];

export const TOPIC_SLUGS = [
  'near-me',
  'year-round',
  'snap-ebt',
  'online',
  'hours',
  ...DAY_TOPIC_SLUGS,
] as const;
export type TopicSlug = (typeof TOPIC_SLUGS)[number];

/**
 * The topics the header menu, the footer and `/markets` advertise. The other
 * weekday pages are reached from the hours page and from each other; seven day
 * links in every footer would crowd out the rest.
 */
export const NAV_TOPIC_SLUGS: readonly TopicSlug[] = [
  'near-me',
  'year-round',
  'snap-ebt',
  'online',
  'hours',
  'saturday',
];

/** The four topics that had a `/farmers-markets/{topic}` address. */
export const LEGACY_TOPIC_SLUGS: readonly TopicSlug[] = ['snap-ebt', 'online', 'hours', 'saturday'];

/** Canonical path for a topic page. */
export function topicPath(slug: TopicSlug): string {
  return `/markets/${slug}`;
}

export function isTopicSlug(value: string): value is TopicSlug {
  return (TOPIC_SLUGS as readonly string[]).includes(value);
}

/** Breadcrumb, menu and footer label for each topic. */
export const TOPIC_LABELS: Record<TopicSlug, string> = {
  'near-me': 'Markets near me',
  'year-round': 'Year-round markets',
  'snap-ebt': 'SNAP/EBT markets',
  online: 'Online ordering & delivery',
  hours: 'Market hours',
  monday: 'Monday markets',
  tuesday: 'Tuesday markets',
  wednesday: 'Wednesday markets',
  thursday: 'Thursday markets',
  friday: 'Friday markets',
  saturday: 'Saturday markets',
  sunday: 'Sunday markets',
};

/**
 * Every first segment under `/markets/` that is a fixed route, so never a
 * market: the topics plus the listing routes (`/markets/page/2`,
 * `/markets/state/ny`).
 */
export const RESERVED_MARKET_SLUGS: readonly string[] = [...TOPIC_SLUGS, 'page', 'state'];
