/**
 * Presentation helpers shared by the market cards (server summary card and the
 * client explorer card), so both render a schedule the same way from the same
 * raw fields.
 */

import type { FarmerMarket } from '@/lib/api';
import {
  compactClock,
  marketHours,
  marketSeasonLabel,
  marketWeekdays,
  shortDayList,
  type MarketSeoRecord,
  type Weekday,
} from './seo.ts';
import { clean, resolveLocation, stateFullName, tidyCityName } from './geo.ts';

/**
 * Schedule fields the slim API precomputes from the full record (first-party
 * schedules included), since the client payload omits `first_party`. Server
 * callers pass full records and these are simply absent.
 */
export interface SlimScheduleFields {
  weekdays?: Weekday[];
  hours?: string;
}

/** Parsed weekdays: the precomputed slim field when present, else parsed here. */
export function weekdaysFor(market: MarketSeoRecord & SlimScheduleFields): Weekday[] {
  return market.weekdays ?? marketWeekdays(market);
}

function hoursFor(market: MarketSeoRecord & SlimScheduleFields): string | undefined {
  return market.weekdays ? market.hours : marketHours(market);
}

const STREET_WORDS = /\d|&|\b(and|at|avenue|ave|street|st|road|rd|boulevard|blvd|lane|ln|drive|dr|way|plaza|park and|parking|lot|corner|behind|between)\b\.?/i;

function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

/**
 * "Palo Alto, CA" for a card: the town from `resolveLocation` (which trims
 * "At El Camino, Palo Alto" to "Palo Alto"), never the state repeated as the
 * town. When the record's city field is really the state ("California"), the
 * last segment of the street line is used if it reads as a town ("Menlo
 * Park"); otherwise the raw city is kept only if it is 1-4 words.
 */
export function cardPlace(
  market: Pick<FarmerMarket, 'city' | 'state' | 'address' | 'zip_code' | 'country' | 'country_code'>
): string[] {
  const location = resolveLocation(market);
  const stateNames = new Set(
    [market.state, location.state, stateFullName(location.state)]
      .map((value) => clean(value).toLowerCase())
      .filter(Boolean)
  );
  const isTown = (value: string | undefined): value is string =>
    Boolean(value) && !stateNames.has(value!.toLowerCase()) && wordCount(value!) <= 4 && !STREET_WORDS.test(value!);

  let city = isTown(location.city) ? location.city : undefined;
  if (!city) {
    const tail = tidyCityName(location.street?.split(',').at(-1));
    if (isTown(tail)) city = tail;
  }
  if (!city) {
    const raw = clean(market.city);
    if (raw && wordCount(raw) <= 4 && !stateNames.has(raw.toLowerCase())) city = raw;
  }

  const parts = [
    city,
    location.state ?? clean(market.state),
    market.country_code === 'US' ? undefined : market.country,
  ];
  return parts.filter((part, index): part is string =>
    Boolean(part) &&
    parts.findIndex((candidate) => candidate?.toLowerCase() === part?.toLowerCase()) === index
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Clock ranges the schedule reader passes through untouched: 24-hour
 * government feeds ("11:00-19:00") and a stray trailing period ("11am-5pm.").
 * A range is rewritten only when it is unambiguous, i.e. it carries no am/pm
 * and its closing hour is past noon; "7:30-12:30" stays as written.
 *
 * TODO: belongs in `marketHours` (seo.ts) so every surface formats alike.
 */
export function tidyHours(hours: string | undefined): string | undefined {
  if (!hours) return undefined;
  const trimmed = hours.trim().replace(/[\s.,;]+$/, '').replace(/([AP])M\b/g, (_m, letter: string) => `${letter.toLowerCase()}m`)
    // French feeds: "07h30" -> "07:30"
    .replace(/\b(\d{1,2})h(\d{2})\b/g, '$1:$2');
  const match = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (match && Number(match[3]) >= 13 && Number(match[3]) <= 23) {
    const pad = (hour: string, minute: string) => `${hour.padStart(2, '0')}:${minute}`;
    const opens = compactClock(pad(match[1], match[2]));
    const closes = compactClock(pad(match[3], match[4]));
    if (opens && closes) return `${opens}-${closes}`;
  }
  return trimmed || undefined;
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

function monthIndex(token: string): number {
  const key = token.toLowerCase().replace(/\.$/, '');
  return key.length >= 3 ? MONTHS.findIndex((month) => month.startsWith(key)) : -1;
}

/**
 * The season, only when it fits a card: "Year-round" or a month span
 * ("May-Oct"). Dated ranges and prose stay on the market page.
 */
export function cardSeason(market: MarketSeoRecord): string | undefined {
  const label = marketSeasonLabel(market);
  if (!label) return undefined;
  if (/year[\s-]*round|all year|^january\s*-\s*december$/i.test(label)) return 'Year-round';
  const span = /^([a-z]+\.?)\s*(?:-|to|thru|through)\s*([a-z]+\.?)$/i.exec(label.trim());
  if (!span) return undefined;
  const from = monthIndex(span[1]);
  const to = monthIndex(span[2]);
  if (from < 0 || to < 0) return undefined;
  if ((to + 1) % 12 === from) return 'Year-round';
  const short = (index: number) => capitalize(MONTHS[index].slice(0, 3));
  return `${short(from)}-${short(to)}`;
}

/**
 * The card's one schedule line: "Sat 8am-1pm", "Tue, Sat · May-October",
 * "Year-round". Built from the parsed weekdays and the single common opening
 * time, so the noisy free text in `days` ("Saturdays, old market, 8am...")
 * never reaches a card. Undefined when nothing clean can be said.
 */
export function cardScheduleLine(market: MarketSeoRecord & SlimScheduleFields): string | undefined {
  const weekdays = weekdaysFor(market);
  const hours = weekdays.length > 0 ? tidyHours(hoursFor(market)) : undefined;
  const days =
    weekdays.length === 7
      ? 'Daily'
      : weekdays.length > 0
        ? shortDayList(weekdays.map((day) => day.toLowerCase()))
        : undefined;
  const when = [days, hours].filter(Boolean).join(' ');
  const season = cardSeason(market);
  const line = [when, season].filter(Boolean).join(' · ');
  return line || undefined;
}

/**
 * Organization types that say something a reader would not assume. Most
 * records are plain farmers markets run by a non-profit or a council, which a
 * label would only repeat; a hawker centre or a co-op pickup is worth naming.
 */
const UNREMARKABLE_TYPES = new Set([
  'official government dataset',
  'non-profit organization',
  'local government agency',
  'state government agency',
  'economic development organization',
  'farmers market',
  'other',
]);

export function notableMarketType(market: Pick<FarmerMarket, 'organization_types'>): string | undefined {
  return market.organization_types?.find((type) => !UNREMARKABLE_TYPES.has(type.trim().toLowerCase()));
}

/* ------------------------------------------------------------------ *
 * When filters ("Today", "This weekend")
 * ------------------------------------------------------------------ */

/** `Date#getDay()` order: Sunday first. */
const DAY_BY_INDEX: Weekday[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** The reader's weekday, from their own clock. */
export function weekdayOf(date: Date): Weekday {
  return DAY_BY_INDEX[date.getDay()];
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
