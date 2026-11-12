/**
 * The markets closest to a point, for `/markets/near-me`.
 *
 * One request scans every geocoded market (about nine thousand haversine
 * calls, well under a millisecond of work), so there is no index to keep in
 * step with the data. Which markets make the list follows the rest of the
 * site (a well documented listing counts as up to 15 miles closer than an
 * empty one, `effectiveDistance`); the list is then ordered by real distance.
 *
 * Nothing is invented. A market with no coordinates, a hidden map pin or a
 * closed status is left out, and each row carries only what its record states:
 * weekdays, hours and a season the browser can test "today" against.
 */

import 'server-only';
import { getMarkets } from './data';
import { haversineKm } from './geo';
import { displayName, marketHours, marketLocationLine, marketWeekdays } from './seo';
import { marketSeasonRange } from './schema';
import { isYearRoundMarket } from './marketWinter';
import { effectiveDistance, RICHNESS_REACH_MILES } from './marketRichness';
import { tidyHours } from './topicCopy';
import type { NearMeMarket } from './nearMeFilter';

const KM_PER_MILE = 1.609344;
/** Past this a market is not "near me" in any sense the reader means. */
export const NEAR_ME_RADIUS_MILES = 60;
/** Enough that the Today and Year-round tabs still have rows after filtering. */
export const NEAR_ME_LIMIT = 60;

export async function getMarketsNear(lat: number, lon: number, now = new Date()): Promise<NearMeMarket[]> {
  const markets = await getMarkets();
  const hits: (NearMeMarket & { rank: number })[] = [];
  const seenNames = new Set<string>();

  for (const market of markets) {
    if (!market.slug || market.suppress_map || !market.location) continue;
    const { lat: marketLat, lon: marketLon } = market.location;
    if (!Number.isFinite(marketLat) || !Number.isFinite(marketLon)) continue;
    const status = market.first_party?.operations?.status?.value.value;
    if (status === 'permanently_closed' || status === 'temporarily_closed') continue;

    const distanceMiles = haversineKm(lat, lon, marketLat, marketLon) / KM_PER_MILE;
    if (distanceMiles > NEAR_ME_RADIUS_MILES) continue;

    const days = marketWeekdays(market);
    const hours = days.length > 0 ? marketHours(market) : undefined;
    const yearRound = isYearRoundMarket(market);
    const season = yearRound ? undefined : marketSeasonRange(market, now);

    hits.push({
      slug: market.slug,
      name: displayName(market.name),
      href: `/markets/${market.slug}`,
      place: marketLocationLine(market),
      distanceMiles: Math.round(distanceMiles * 10) / 10,
      days,
      ...(hours ? { hours: tidyHours(hours) } : {}),
      yearRound,
      ...(season ? { seasonFrom: season.validFrom, seasonThrough: season.validThrough } : {}),
      rank: effectiveDistance(distanceMiles, market.richness, RICHNESS_REACH_MILES),
    });
  }

  hits.sort((left, right) => left.rank - right.rank || left.name.localeCompare(right.name, 'en'));

  // The data holds a few markets twice under different slugs. The better
  // ranked copy of a name and place is kept, as on the market pages.
  const rows: NearMeMarket[] = [];
  for (const hit of hits) {
    const key = `${hit.name.toLowerCase()}|${hit.place ?? ''}`;
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    const { rank, ...row } = hit;
    void rank;
    rows.push(row);
    if (rows.length === NEAR_ME_LIMIT) break;
  }
  // Richness decides which markets make the cut in a dense area; the list
  // itself prints a distance on every row, so it reads strictly nearest first.
  return rows.sort((left, right) => left.distanceMiles - right.distanceMiles);
}
