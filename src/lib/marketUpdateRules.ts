/**
 * The rules of shopper updates: short notes a market's managers post on
 * their market page ("Closed Saturday for the parade"). Who may post, what a
 * valid update looks like, and which ones shoppers see right now. Kept free
 * of database and framework imports so node tests cover them directly.
 *
 * Updates sit beside the listing. They never change `market_overrides` or
 * the dataset, and they go away on their own when `endsAt` passes.
 */
import { z } from 'zod';

/** About two tweets' worth: room for a closure and a reason, not an article. */
export const MAX_UPDATE_LENGTH = 280;
/** Live and scheduled updates a market can have at once. */
export const MAX_OPEN_UPDATES = 3;
/** The longest an update can stay up. Longer news belongs in the listing. */
export const MAX_UPDATE_DAYS = 62;
/** How far ahead an update can be scheduled. */
export const MAX_SCHEDULE_AHEAD_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;

export type MarketUpdateState = 'scheduled' | 'live' | 'ended' | 'withdrawn';

export interface MarketUpdateTiming {
  startsAt: Date;
  endsAt: Date;
  withdrawnAt: Date | null;
}

/**
 * Posting, editing and withdrawing updates is for people who run the market:
 * a confirmed manager or an admin, signed in with a verified email. Someone
 * whose claim is still being checked can edit the listing, but cannot speak
 * to shoppers yet.
 */
export function canPostMarketUpdates(access: { emailVerified: boolean; isAdmin: boolean; managesMarket: boolean }): boolean {
  return access.emailVerified && (access.isAdmin || access.managesMarket);
}

export function marketUpdateState(update: MarketUpdateTiming, now: Date): MarketUpdateState {
  if (update.withdrawnAt) return 'withdrawn';
  if (update.endsAt.getTime() <= now.getTime()) return 'ended';
  if (update.startsAt.getTime() > now.getTime()) return 'scheduled';
  return 'live';
}

/** Still to come or showing now: what counts against MAX_OPEN_UPDATES. */
export function isOpenUpdate(update: MarketUpdateTiming, now: Date): boolean {
  const state = marketUpdateState(update, now);
  return state === 'live' || state === 'scheduled';
}

/** What shoppers see right now: live updates, the newest first, at most MAX_OPEN_UPDATES. */
export function currentMarketUpdates<T extends MarketUpdateTiming>(updates: readonly T[], now: Date): T[] {
  return updates
    .filter((update) => marketUpdateState(update, now) === 'live')
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
    .slice(0, MAX_OPEN_UPDATES);
}

/** Plain text only: control characters out, at most one blank line, no surrounding space. */
export function cleanUpdateBody(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const instant = z
  .string()
  .max(40)
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Pick a date')
  .transform((value) => new Date(value));

export const marketUpdateInputSchema = z.object({
  body: z
    .string()
    .max(MAX_UPDATE_LENGTH * 2)
    .transform(cleanUpdateBody)
    .pipe(
      z
        .string()
        .min(3, 'Write a short update for shoppers')
        .max(MAX_UPDATE_LENGTH, `Keep it under ${MAX_UPDATE_LENGTH} characters`),
    ),
  startsAt: instant,
  endsAt: instant,
});

export interface MarketUpdateInput {
  body: string;
  startsAt: Date;
  endsAt: Date;
}

export type ParsedMarketUpdate = { ok: true; data: MarketUpdateInput } | { ok: false; error: string };

/**
 * Checks an update from the form. `startsAt` and `endsAt` are instants the
 * browser computed from the dates the organizer picked, in their own time
 * zone, so "until Saturday" means the end of Saturday where the market is.
 */
export function parseMarketUpdate(input: unknown, now: Date): ParsedMarketUpdate {
  const parsed = marketUpdateInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the update and try again.' };
  const { body, startsAt, endsAt } = parsed.data;
  if (endsAt.getTime() <= startsAt.getTime()) return { ok: false, error: 'The end date has to be after the start date.' };
  if (endsAt.getTime() <= now.getTime()) return { ok: false, error: 'Pick an end date that has not passed yet.' };
  if (endsAt.getTime() - startsAt.getTime() > MAX_UPDATE_DAYS * DAY_MS) {
    return { ok: false, error: `An update can stay up for ${MAX_UPDATE_DAYS} days at most. For lasting changes, edit the listing.` };
  }
  if (startsAt.getTime() - now.getTime() > MAX_SCHEDULE_AHEAD_DAYS * DAY_MS) {
    return { ok: false, error: 'Pick a start date within the next year.' };
  }
  return { ok: true, data: { body, startsAt, endsAt } };
}
