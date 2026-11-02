/**
 * "Is it open in winter?" for a market page.
 *
 * Winter is when most searchers find a summer market closed, and when the
 * question the page cannot answer from a schedule grid is "where do I shop
 * instead?". This module answers the first half from the record's own season
 * and setting; the page pairs it with the nearest year-round markets.
 *
 * Same contract as `src/lib/marketFacts.ts`: a pure function of one record,
 * nothing invented. A record with no usable season gets no sentence rather
 * than a guess, and "closed in winter" is only said when the stated season
 * misses December, January and February entirely.
 */

import { displayName, marketSeasonLabel } from './seo.ts';
import { marketSeasonRange, type MarketSchemaRecord } from './schema.ts';
import { settingLabel } from './marketFacts.ts';

export type WinterStatus = 'year_round' | 'winter_season' | 'summer_season';

export interface MarketWinterAnswer {
  status: WinterStatus;
  /** One or two plain sentences that answer the question for this market. */
  text: string;
}

export interface MarketWinterRecord extends MarketSchemaRecord {
  indoor_outdoor?: string | null;
}

const WINTER_MONTHS = new Set([12, 1, 2]);

/** True when any day between the two ISO dates falls in Dec, Jan or Feb. */
function rangeTouchesWinter(validFrom: string, validThrough: string): boolean {
  const [fromYear, fromMonth] = validFrom.split('-').map(Number);
  const [toYear, toMonth] = validThrough.split('-').map(Number);
  if (![fromYear, fromMonth, toYear, toMonth].every(Number.isFinite)) return false;
  let year = fromYear;
  let month = fromMonth;
  // A season is at most a year long; the cap keeps a bad record from looping.
  for (let step = 0; step < 24; step += 1) {
    if (WINTER_MONTHS.has(month)) return true;
    if (year === toYear && month === toMonth) return false;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return false;
}

/** "Indoors" / "partly indoors" from the USDA setting enum, else nothing. */
function indoorClause(market: MarketWinterRecord): string | undefined {
  const setting = settingLabel(market.indoor_outdoor);
  if (setting === 'Indoor') return 'It is held indoors.';
  if (setting === 'Indoor and outdoor') return 'Part of the market moves indoors for some of the year.';
  return undefined;
}

/**
 * The answer for this market, or `undefined` when its season does not say.
 * Closed and between-season records get nothing: the page header already
 * carries that status, and repeating it here would contradict a reopening.
 */
export function marketWinterAnswer(market: MarketWinterRecord, now = new Date()): MarketWinterAnswer | undefined {
  const status = market.first_party?.operations?.status?.value.value;
  if (status === 'permanently_closed' || status === 'temporarily_closed') return undefined;

  const name = displayName(market.name) || 'This market';
  const label = marketSeasonLabel(market);
  if (!label) return undefined;
  const indoor = indoorClause(market);

  if (label === 'Year-round') {
    return {
      status: 'year_round',
      text: [`${name} runs year-round, so it is open in winter too.`, indoor].filter(Boolean).join(' '),
    };
  }

  const range = marketSeasonRange(market, now);
  if (!range) return undefined;

  if (rangeTouchesWinter(range.validFrom, range.validThrough)) {
    return {
      status: 'winter_season',
      text: [`Its listed season is ${label}, which runs into the winter months.`, indoor].filter(Boolean).join(' '),
    };
  }

  return {
    status: 'summer_season',
    text: `${name} is a seasonal market. Its listed season is ${label}, so it does not run in winter.`,
  };
}

/** True when the record states a year-round season, for the nearby filter. */
export function isYearRoundMarket(market: MarketWinterRecord): boolean {
  const status = market.first_party?.operations?.status?.value.value;
  if (status === 'permanently_closed' || status === 'temporarily_closed') return false;
  return marketSeasonLabel(market) === 'Year-round';
}
