/**
 * Pure presentation rules for the city pages, kept free of `server-only` and
 * Next.js imports so they run under plain `node --test` and inside the client
 * list component alike. `cityPage.ts` gathers the data; these decide what is
 * worth showing from it.
 */

import { haversineKm } from './geo.ts';
import type { Weekday } from './schedule.ts';

export interface DayCount {
  day: Weekday;
  count: number;
}

/** A busiest day has to be a clear answer, not a coin toss between two markets. */
export const BUSIEST_DAY_MIN_MARKETS = 3;

/**
 * The single weekday most markets trade on, or undefined when that day has
 * fewer than `BUSIEST_DAY_MIN_MARKETS` markets or ties with another day.
 */
export function busiestDay(days: DayCount[]): DayCount | undefined {
  const sorted = [...days].sort((left, right) => right.count - left.count);
  const [top, runnerUp] = sorted;
  if (!top || top.count < BUSIEST_DAY_MIN_MARKETS) return undefined;
  if (runnerUp && runnerUp.count === top.count) return undefined;
  return top;
}

interface ScheduleLike {
  days: Weekday[];
  hours?: string;
  season?: string;
}

/** True when a market states at least a day, hours or a season. */
export function hasSchedule(row: ScheduleLike): boolean {
  return row.days.length > 0 || Boolean(row.hours) || Boolean(row.season);
}

/**
 * Markets with a schedule get full cards; the rest go in a compact "also
 * listed" list. When nothing in the city has a schedule, every market stays a
 * card: hiding the whole list behind a disclosure would hide the answer.
 */
export function splitBySchedule<T extends ScheduleLike>(rows: T[]): { documented: T[]; thin: T[] } {
  const documented = rows.filter(hasSchedule);
  if (documented.length === 0) return { documented: rows, thin: [] };
  return { documented, thin: rows.filter((row) => !hasSchedule(row)) };
}

export function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The one sentence under a multi-market city's stat chips: which markets run
 * all year, the fact a searcher most often cannot tell from a list of summer
 * markets. Undefined when no market says so, rather than a filler line.
 */
export function yearRoundSentence(rows: { name: string; season?: string }[]): string | undefined {
  if (rows.length < 2) return undefined;
  const names: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.season || !/^year-round$/i.test(row.season)) continue;
    const key = row.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(row.name);
  }
  if (names.length === 0) return undefined;
  if (names.length === 1) return `${names[0]} runs year-round.`;
  if (names.length === 2) return `${joinWithAnd(names)} run year-round.`;
  return `${names.length} markets run year-round, including ${joinWithAnd(names.slice(0, 2))}.`;
}

export interface Point {
  lat: number;
  lon: number;
}

/** Mean position of a set of points; fine at city scale. */
export function centroid(points: Point[]): Point | undefined {
  if (points.length === 0) return undefined;
  const sum = points.reduce((acc, point) => ({ lat: acc.lat + point.lat, lon: acc.lon + point.lon }), {
    lat: 0,
    lon: 0,
  });
  return { lat: sum.lat / points.length, lon: sum.lon / points.length };
}

/** Other cities worth a link: two or more markets of their own. */
export const SIBLING_MIN_MARKETS = 2;
export const SIBLING_LIMIT = 8;

export interface SiblingCandidate {
  slug: string;
  marketCount: number;
  /** Where the city's markets are; empty when none has coordinates. */
  points: Point[];
}

/**
 * The nearest `limit` cities with at least `SIBLING_MIN_MARKETS` markets.
 * Without an origin (no market here has coordinates) it falls back to the
 * largest ones, which is the order the candidates arrive in.
 */
export function nearestCities<T extends SiblingCandidate>(
  origin: Point | undefined,
  candidates: T[],
  limit = SIBLING_LIMIT
): T[] {
  const eligible = candidates.filter((candidate) => candidate.marketCount >= SIBLING_MIN_MARKETS);
  if (!origin) return eligible.slice(0, limit);
  return eligible
    .map((candidate) => {
      const center = centroid(candidate.points);
      return {
        candidate,
        distance: center ? haversineKm(origin.lat, origin.lon, center.lat, center.lon) : Infinity,
      };
    })
    .sort((left, right) => left.distance - right.distance)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

/** "#day-saturday" / "#snap": the list filter a stat chip or URL points at. */
export function dayHash(day: Weekday): string {
  return `day-${day.toLowerCase()}`;
}
export const SNAP_HASH = 'snap';
