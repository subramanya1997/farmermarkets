/**
 * Old `/markets/state/{slug}` → new `/farmers-markets/{state}` mapping.
 *
 * The retired route slugged the **raw** `state` value on each record, so the
 * URLs Google has indexed include every spelling the source data uses: the
 * 2-letter code (`ny`), the spelled-out name (`new-york`), sub-national
 * regions from the European feeds (`auvergne-rhône-alpes`,
 * `brussels-capital-region`, `wellington-region`, `dún-laoghaire-rathdown`),
 * and junk that is not a state at all (`usa`, `us`, on 193 records).
 *
 * Resolution runs in two stages:
 *  1. Name lookups — the geo index by slug or code, then the US-state and
 *     Canadian-province name tables. This covers every US/Canadian spelling.
 *  2. A tally over the data itself: the geo index already placed every market
 *     in a state, so a raw slug can be resolved by asking where its markets
 *     ended up. This is what maps a French region onto `france`. A slug whose
 *     markets are scattered across many states (`usa`) has no majority and is
 *     deliberately left unresolved, so the route 404s rather than guessing.
 */

import 'server-only';
import { getCityForMarketSlug, getStateByCode } from './geoIndex';
import { getMarkets } from './data';
import { isCountryToken, provinceAbbreviation, stateAbbreviation, toSlug } from './geo';
import { toStateSlug } from './marketsIndex';

/**
 * Share of a raw slug's placed markets that must agree on one state before the
 * slug is redirected there. A regional spelling ("Occitanie") is ~100% one
 * state; "USA" is spread across dozens and must not be redirected anywhere.
 */
const MAJORITY_THRESHOLD = 0.6;

let tallyPromise: Promise<Map<string, string>> | null = null;

/** Raw state slug → geo state slug, derived from where the markets landed. */
function getPlacementTally(): Promise<Map<string, string>> {
  if (!tallyPromise) {
    tallyPromise = (async () => {
      const markets = await getMarkets();
      const tallies = new Map<string, Map<string, number>>();

      for (const market of markets) {
        const raw = market.state?.trim();
        if (!raw || !market.slug) continue;
        const placement = await getCityForMarketSlug(market.slug);
        if (!placement) continue;

        // Indexed under both the exact old slug ("auvergne-rhône-alpes") and
        // its accent-folded form, because a crawler may send the URL either
        // way and Unicode normalization differs between sources.
        for (const key of new Set([toStateSlug(raw), toSlug(raw)])) {
          let counts = tallies.get(key);
          if (!counts) {
            counts = new Map<string, number>();
            tallies.set(key, counts);
          }
          counts.set(placement.state.slug, (counts.get(placement.state.slug) ?? 0) + 1);
        }
      }

      const resolved = new Map<string, string>();
      for (const [key, counts] of tallies) {
        let total = 0;
        let bestSlug = '';
        let bestCount = 0;
        for (const [slug, count] of counts) {
          total += count;
          if (count > bestCount) {
            bestCount = count;
            bestSlug = slug;
          }
        }
        if (bestSlug && bestCount / total >= MAJORITY_THRESHOLD) {
          resolved.set(key, bestSlug);
        }
      }

      return resolved;
    })().catch((error) => {
      tallyPromise = null;
      throw error;
    });
  }

  return tallyPromise;
}

/**
 * The state hub slug an old `/markets/state/{slug}` URL belongs to, or null
 * when the slug names no single state (→ the route 404s).
 */
export async function resolveLegacyStateSlug(slug: string): Promise<string | null> {
  // Next hands the segment over percent-decoded, but a URL that arrived
  // encoded can still be in a different Unicode normal form than the data.
  const key = (() => {
    try {
      return decodeURIComponent(slug ?? '').trim().toLowerCase().normalize('NFC');
    } catch {
      return (slug ?? '').trim().toLowerCase().normalize('NFC');
    }
  })();
  if (!key) return null;

  // The raw slug is the state value with spaces hyphenated, so undoing that
  // recovers the value the name tables are keyed on.
  const spelled = key.replace(/-/g, ' ');

  // "usa"/"us" name a country, not a state. Those 193 records are spread over
  // the whole directory, so there is nothing to redirect them to.
  if (isCountryToken(spelled)) return null;

  const direct =
    (await getStateByCode(key)) ??
    (await getStateByCode(stateAbbreviation(spelled) ?? '')) ??
    (await getStateByCode(provinceAbbreviation(spelled) ?? '')) ??
    // Accented regions slug differently in the geo index than in the old
    // route ("dún-laoghaire-rathdown" vs "dun-laoghaire-rathdown").
    (await getStateByCode(toSlug(spelled)));
  if (direct) return direct.slug;

  const tally = await getPlacementTally();
  return tally.get(key) ?? tally.get(toSlug(key)) ?? null;
}
