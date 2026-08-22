/**
 * Presentation helpers shared by the market cards (server summary card and the
 * client explorer card), so both render schedule and social details the same
 * way from the same raw fields.
 */

import type { FarmerMarket } from '@/lib/api';

const WEEKDAY_ORDER = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

const WEEKDAY_SHORT: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

/**
 * "saturday" → "Sat", ["wednesday","saturday"] → "Wed & Sat",
 * all seven days → "Open daily", Sat+Sun → "Weekends".
 * Unknown values pass through capitalized so nothing silently disappears.
 */
export function formatMarketDays(days: string[] | undefined): string | undefined {
  if (!days || days.length === 0) return undefined;

  const normalized = [...new Set(days.map((day) => day.trim().toLowerCase()))];
  const known = WEEKDAY_ORDER.filter((day) => normalized.includes(day));
  const unknown = normalized.filter((day) => !WEEKDAY_ORDER.includes(day as typeof WEEKDAY_ORDER[number]));

  if (known.length === 7) return 'Open daily';
  if (known.length === 2 && known.includes('saturday') && known.includes('sunday') && unknown.length === 0) {
    return 'Weekends';
  }

  // Unknown entries are free text ("wednesdays, 8:30 am – 12:30 pm,"): apply
  // the same dash/trailing-punctuation cleanup the season formatter does.
  const labels = [
    ...known.map((day) => WEEKDAY_SHORT[day]),
    ...unknown
      .map((entry) => entry.replace(/[–—]/g, '-').replace(/[\s,;]+$/, ''))
      .filter(Boolean)
      .map(capitalize),
  ];
  if (labels.length === 0) return undefined;
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} & ${labels[labels.length - 1]}`;
}

/** "year-round" → "Year-round", "summer, fall" → "Summer to fall". */
export function formatMarketSeason(season: string | undefined): string | undefined {
  if (!season) return undefined;
  // Source strings are free text: normalize en/em dashes to hyphens (site copy
  // style) and drop trailing punctuation left by upstream concatenation.
  const trimmed = season
    .trim()
    .replace(/[–—]/g, '-')
    .replace(/[\s,;]+$/, '');
  if (!trimmed) return undefined;

  const parts = trimmed.split(/\s*,\s*/).filter(Boolean);
  if (parts.length === 2) {
    return capitalize(`${parts[0]} to ${parts[1]}`);
  }
  return capitalize(parts.join(', '));
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export type SocialPlatform =
  | 'facebook'
  | 'instagram'
  | 'x'
  | 'youtube'
  | 'tiktok'
  | 'linkedin';

export interface SocialLink {
  platform: SocialPlatform;
  label: string;
  href: string;
}

const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  x: 'X (Twitter)',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
};

function platformForHost(host: string): SocialPlatform | undefined {
  if (host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.com') return 'facebook';
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram';
  if (host === 'twitter.com' || host.endsWith('.twitter.com') || host === 'x.com') return 'x';
  if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') return 'youtube';
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return 'linkedin';
  return undefined;
}

/**
 * The `social_media` field is free text: full URLs on most records, but also
 * bare handles ("@market") that can't be attributed to a platform. Only
 * absolute http(s) URLs on a recognized platform become icon links, one per
 * platform so a record with three Facebook URLs doesn't render three icons.
 */
export function getSocialLinks(market: Pick<FarmerMarket, 'social_media'>): SocialLink[] {
  const links: SocialLink[] = [];
  const seen = new Set<SocialPlatform>();

  for (const raw of market.social_media ?? []) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;

    const platform = platformForHost(url.hostname.replace(/^www\./, '').toLowerCase());
    if (!platform || seen.has(platform)) continue;

    seen.add(platform);
    links.push({ platform, label: PLATFORM_LABELS[platform], href: url.toString() });
  }

  return links;
}
