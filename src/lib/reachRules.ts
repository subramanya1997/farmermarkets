/**
 * A vendor's reach: which visits to the stall QR URL count as scans, how a
 * visitor is recognized without keeping their IP address, and how scans and
 * follows add up into the vendor's Footprint. Pure module with no imports
 * beyond the user agent check, so node tests and the Footprint chart (a
 * client component) share it. The visitor hash is in src/lib/visitorHash.ts.
 *
 * What a vendor sees is counts only. Nothing here returns an email, a name
 * or an address, and the shapes below have no place for one.
 */
import { isAutomatedUserAgent } from './automatedBrowser.ts';

/** A second scan of the same code by the same visitor within this window is the same scan. */
export const REPEAT_SCAN_MS = 30 * 60 * 1000;
/** Counted scans one visitor can make in an hour, across every vendor, before we stop counting them. */
export const MAX_SCANS_PER_VISITOR_HOUR = 20;
/** Days in the Footprint series. */
export const FOOTPRINT_DAYS = 30;

/**
 * Link previews and crawlers that announce themselves. A QR code is opened
 * by a phone's camera in a real browser; these only fetch the URL.
 */
const BOT_USER_AGENT =
  /bot\b|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|skype|bitly|vkshare|pinterest|curl\/|wget\/|python-|httpx|aiohttp|go-http-client|java\/|okhttp|node-fetch|axios|undici|postman|insomnia|lighthouse|pagespeed|gtmetrix|monitor|uptime|headless/i;

/** No user agent, a self-declared bot, or an automated browser. */
export function isLikelyBot(userAgent: string | null | undefined): boolean {
  const agent = (userAgent ?? '').trim();
  if (agent.length < 8) return true;
  return BOT_USER_AGENT.test(agent) || isAutomatedUserAgent(agent);
}

/** Next.js and browsers mark prefetches; a prefetch is not a visit. */
export function isPrefetch(headers: { get(name: string): string | null }): boolean {
  const purpose = `${headers.get('purpose') ?? ''} ${headers.get('sec-purpose') ?? ''} ${headers.get('x-purpose') ?? ''}`.toLowerCase();
  return purpose.includes('prefetch') || purpose.includes('prerender') || headers.get('next-router-prefetch') !== null;
}

export type ScanDecision = 'count' | 'bot' | 'repeat' | 'flood';

/**
 * Whether one visit to `/v/<slug>` counts. `lastFromVisitor` is this
 * visitor's last counted scan of this vendor; `visitorScansLastHour` counts
 * their counted scans of any vendor in the past hour.
 */
export function scanDecision(input: {
  bot: boolean;
  lastFromVisitor: Date | null;
  visitorScansLastHour: number;
  now: Date;
}): ScanDecision {
  if (input.bot) return 'bot';
  if (input.lastFromVisitor && input.now.getTime() - input.lastFromVisitor.getTime() < REPEAT_SCAN_MS) return 'repeat';
  if (input.visitorScansLastHour >= MAX_SCANS_PER_VISITOR_HOUR) return 'flood';
  return 'count';
}

/* ------------------------------------------------------------------ *
 * Follows
 * ------------------------------------------------------------------ */

/**
 * Followers counted once each, however many rows say so. The database
 * already keeps one row per vendor and account; counting by key as well
 * means a duplicate can never inflate the number.
 */
export function countFollowers(rows: readonly { followerKey: string }[]): number {
  return new Set(rows.map((row) => row.followerKey)).size;
}

/** Why an account may not follow a vendor, or null when it may. */
export function followRefusal(input: { vendorPublic: boolean; ownVendor: boolean; emailVerified: boolean }): string | null {
  if (!input.vendorPublic) return 'This vendor is not on the site right now.';
  if (input.ownVendor) return 'This is your own business.';
  if (!input.emailVerified) return 'Confirm your email first.';
  return null;
}

/* ------------------------------------------------------------------ *
 * Footprint
 * ------------------------------------------------------------------ */

/** Counts in one clock hour (ISO timestamp of the hour start, UTC). */
export interface HourBucket {
  hour: string;
  scans: number;
  follows: number;
}

export interface FootprintTotals {
  scans: number;
  follows: number;
  scans30: number;
  follows30: number;
}

/** Everything the vendor's Footprint shows. Counts only, by design. */
export interface Footprint {
  totals: FootprintTotals;
  /** The last 31 days by the hour, so the browser can bucket them into its own local days. */
  hours: HourBucket[];
}

export interface DayPoint {
  day: string;
  scans: number;
  follows: number;
}

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Hour buckets as one point per day, oldest first, ending on `lastDay` and
 * `days` long; days without activity are zero. `dayOf` turns an hour into a
 * local calendar day (the browser passes its own).
 */
export function dailySeries(hours: readonly HourBucket[], lastDay: string, dayOf: (iso: string) => string, days = FOOTPRINT_DAYS): DayPoint[] {
  const points = Array.from({ length: days }, (_, index) => ({ day: shiftDay(lastDay, index - days + 1), scans: 0, follows: 0 }));
  const byDay = new Map(points.map((point) => [point.day, point]));
  for (const bucket of hours) {
    const point = byDay.get(dayOf(bucket.hour));
    if (!point) continue;
    point.scans += bucket.scans;
    point.follows += bucket.follows;
  }
  return points;
}
