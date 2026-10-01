import { stateAbbreviation, stateFullName } from './geo.ts';

interface PostalMarket {
  country_code?: string;
  location?: { address?: string | null; state?: string | null; zip_code?: string | null };
}

/** Repair only the known street-number-as-ZIP error using the same source address.
 * The original snapshot and its verification date remain unchanged.
 */
export function normalizeSourcePostalCode<T extends PostalMarket>(market: T): T {
  if (market.country_code !== 'US' || !market.location) return market;
  const { address, state, zip_code: stored } = market.location;
  if (!address || !stored || !/^\d{5}$/.test(stored) || !address.trim().startsWith(`${stored} `)) return market;
  const abbreviation = stateAbbreviation(state);
  const fullName = stateFullName(state);
  if (!abbreviation || !fullName) return market;
  const escaped = fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tail = new RegExp(`(?:^|[\\s,])(?:${abbreviation}|${escaped})[\\s,]+(\\d{5}(?:-\\d{4})?)\\s*$`, 'i').exec(address);
  if (!tail || tail[1] === stored) return market;
  return { ...market, location: { ...market.location, zip_code: tail[1] } };
}
