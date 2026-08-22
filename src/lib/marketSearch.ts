/**
 * Search relevance and listing rank for the market explorer.
 *
 * Pure functions of market records (unit tested in
 * `src/lib/marketSearch.test.ts`), so the ranking rules live in one place:
 *
 *  - Text relevance: every query token must match some field, and matches are
 *    weighted by field (name over city over address) and by quality (exact
 *    over prefix over substring).
 *  - Verification: records recently supported by verified research or a
 *    current official source rank above unconfirmed ones; records the
 *    upstream directory dropped rank below them.
 *  - Distance: closer markets get a bounded boost, so proximity breaks ties
 *    between comparable text matches without drowning out a much better one.
 */

import type { FarmerMarket } from '@/lib/api';

/** Query text → lowercase tokens; punctuation splits, empty tokens drop. */
export function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}&']+/u)
    .filter(Boolean);
}

interface WeightedField {
  value: string | undefined;
  weight: number;
}

function fieldsFor(market: FarmerMarket): WeightedField[] {
  return [
    { value: market.name, weight: 10 },
    { value: market.city, weight: 8 },
    { value: market.zip_code, weight: 8 },
    { value: market.state, weight: 6 },
    { value: market.country, weight: 5 },
    { value: market.country_code, weight: 5 },
    { value: market.address, weight: 3 },
  ];
}

/**
 * How well one token matches one field: 3 for the whole field, 2 for a field
 * prefix, 1.5 for a word prefix inside the field, 1 for a bare substring,
 * 0 for no match.
 */
function matchQuality(field: string, token: string): number {
  if (field === token) return 3;
  if (field.startsWith(token)) return 2;
  const at = field.indexOf(token);
  if (at === -1) return 0;
  return /[^\p{L}\p{N}]/u.test(field.charAt(at - 1)) ? 1.5 : 1;
}

/**
 * Text relevance of one market for the tokenized query, or 0 when any token
 * fails to match (AND semantics — "palo alto honey" should not return every
 * market in Palo Alto).
 */
export function textRelevance(market: FarmerMarket, tokens: string[]): number {
  let total = 0;
  for (const token of tokens) {
    let best = 0;
    for (const { value, weight } of fieldsFor(market)) {
      if (!value) continue;
      const quality = matchQuality(value.toLowerCase(), token);
      if (quality * weight > best) best = quality * weight;
    }
    if (best === 0) return 0;
    total += best;
  }

  // Whole-phrase bonus on the name, so "downtown palo alto" ranks the market
  // actually named that over three incidental token hits.
  const name = market.name.toLowerCase();
  const phrase = tokens.join(' ');
  if (phrase.length > 0) {
    if (name === phrase) total += 40;
    else if (name.startsWith(phrase)) total += 25;
    else if (name.includes(phrase)) total += 15;
  }

  return total;
}

/**
 * Rank adjustment for the record's verification standing. Sized against the
 * text weights above: enough to reorder comparable matches, not enough to
 * push a poor match past a good one.
 */
export function verificationBoost(market: Pick<FarmerMarket, 'verified' | 'unverified'>): number {
  if (market.unverified) return -30;
  if (market.verified) return 12;
  return 0;
}

/**
 * Bounded proximity boost: 30 points at the reader's doorstep, half that at
 * 50 miles, approaching 0 far away. Missing distances contribute nothing.
 * Sized above the verification boost so a same-name market 30 miles away
 * outranks a verified namesake 700 miles away, while a distinctly better
 * text match still wins overall.
 */
export function proximityBoost(distance: number | undefined): number {
  if (distance === undefined || !Number.isFinite(distance)) return 0;
  return 30 / (1 + distance / 50);
}

/**
 * Markets matching `query`, best first. Non-matching records drop out.
 * Assumes the caller's input order is a sensible tie-break (the explorer
 * passes its distance-sorted list); the sort is stable so equal scores keep
 * that order.
 */
export function searchMarkets(markets: FarmerMarket[], query: string): FarmerMarket[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return markets;

  const scored: Array<{ market: FarmerMarket; score: number }> = [];
  for (const market of markets) {
    const relevance = textRelevance(market, tokens);
    if (relevance <= 0) continue;
    scored.push({
      market,
      score: relevance + verificationBoost(market) + proximityBoost(market.distance),
    });
  }

  return scored.sort((a, b) => b.score - a.score).map((entry) => entry.market);
}

/**
 * Sort key for the browse listing (no query, "nearest first"): distance in
 * miles, with a 15 mile handicap on records lacking recent positive
 * confirmation and a hard demotion for ones the upstream directory dropped.
 * Without a location every distance is missing, so the listing becomes
 * verified first, then unconfirmed, then unverified, each keeping the
 * caller's order.
 */
export function listingSortKey(
  market: Pick<FarmerMarket, 'distance' | 'verified' | 'unverified'>
): number {
  const distance =
    market.distance !== undefined && Number.isFinite(market.distance) ? market.distance : 25000;
  return distance + (market.verified ? 0 : 15) + (market.unverified ? 100000 : 0);
}
