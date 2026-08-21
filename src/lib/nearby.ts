/**
 * "Markets near this one" — the nearest few markets to a given record.
 *
 * Every one of the 8,807 market pages asks this question at build time, so the
 * naive answer (sort all 8,451 geocoded markets by distance, per page) is 74
 * million haversine calls. Instead the markets are bucketed once per server
 * process into a half-degree grid, and a query walks outward ring by ring
 * until the k-th best hit is provably closer than the edge of the searched
 * box. In practice that is one or two rings — a few dozen distance
 * calculations per page — and the answer is exact, not approximate.
 *
 * Nothing here invents a neighbour: a record with no coordinates gets `[]`,
 * and so does one whose nearest neighbour is beyond `MAX_DISTANCE_KM`, because
 * a market 200 km away is not "nearby" in any sense the reader means.
 */

import 'server-only';
import { getMarkets } from './data';
import { haversineKm } from './geo';
import { displayName, marketLocationLine } from './seo';

/** Grid resolution. Half a degree is ~56 km of latitude. */
const CELL_DEGREES = 0.5;
const CELLS_PER_TURN = Math.round(360 / CELL_DEGREES);
const KM_PER_LATITUDE_DEGREE = 111.32;
/** Past this, "nearby" stops being true. ~62 miles. */
export const MAX_DISTANCE_KM = 100;
/** Hard stop for the ring walk, so a market alone in the ocean terminates. */
const MAX_RINGS = 64;

interface GridEntry {
  slug: string;
  name: string;
  locationLine?: string;
  lat: number;
  lon: number;
}

/** One entry of the nearby block. */
export interface NearbyMarket {
  slug: string;
  /** Cleaned-up display name, matching the H1 of the page it links to. */
  name: string;
  href: string;
  /** "Durham, North Carolina", when the record resolves to a place. */
  locationLine?: string;
  distanceKm: number;
}

function cellKey(latIndex: number, lonIndex: number): string {
  return `${latIndex}:${((lonIndex % CELLS_PER_TURN) + CELLS_PER_TURN) % CELLS_PER_TURN}`;
}

function isUsableCoordinate(lat?: number | null, lon?: number | null): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    // (0, 0) is the null-island default a few feeds ship instead of omitting
    // the field; linking every one of them to each other would be nonsense.
    !(lat === 0 && lon === 0)
  );
}

/**
 * Built once per server process, like the data layer and the geo index, and
 * dropped again on failure so the next caller retries rather than caching a
 * broken grid.
 */
let gridPromise: Promise<Map<string, GridEntry[]>> | null = null;

function getGrid(): Promise<Map<string, GridEntry[]>> {
  if (!gridPromise) {
    gridPromise = getMarkets()
      .then((markets) => {
        const grid = new Map<string, GridEntry[]>();
        for (const market of markets) {
          const lat = market.location?.lat;
          const lon = market.location?.lon;
          if (!market.slug || !isUsableCoordinate(lat, lon)) continue;

          const entry: GridEntry = {
            slug: market.slug,
            name: displayName(market.name),
            locationLine: marketLocationLine(market),
            lat: lat as number,
            lon: lon as number,
          };
          const key = cellKey(
            Math.floor(entry.lat / CELL_DEGREES),
            Math.floor(entry.lon / CELL_DEGREES)
          );
          const cell = grid.get(key);
          if (cell) cell.push(entry);
          else grid.set(key, [entry]);
        }
        return grid;
      })
      .catch((error) => {
        gridPromise = null;
        throw error;
      });
  }

  return gridPromise;
}

/**
 * Shortest distance, in km, from a point to the edge of the box covered after
 * walking `rings` rings. Anything closer than this is guaranteed to have been
 * seen already, which is what makes the early exit exact.
 */
function guaranteedRadiusKm(lat: number, rings: number): number {
  const latitudeKm = rings * CELL_DEGREES * KM_PER_LATITUDE_DEGREE;
  // Longitude degrees shrink toward the poles; use the highest latitude the
  // searched box reaches, so the guarantee is never optimistic.
  const worstLatitude = Math.min(89.9, Math.abs(lat) + rings * CELL_DEGREES);
  const longitudeKm =
    rings * CELL_DEGREES * KM_PER_LATITUDE_DEGREE * Math.cos((worstLatitude * Math.PI) / 180);
  return Math.min(latitudeKm, longitudeKm);
}

/** The record a nearby lookup starts from. */
export interface NearbyOrigin {
  slug: string;
  location?: { lat?: number | null; lon?: number | null } | null;
}

/**
 * The `limit` markets nearest to `origin`, closest first, excluding itself and
 * anything past `MAX_DISTANCE_KM`.
 */
export async function getNearbyMarkets(
  origin: NearbyOrigin,
  limit = 5
): Promise<NearbyMarket[]> {
  const lat = origin.location?.lat;
  const lon = origin.location?.lon;
  if (limit < 1 || !isUsableCoordinate(lat, lon)) return [];

  const grid = await getGrid();
  const originLat = lat as number;
  const originLon = lon as number;
  const latIndex = Math.floor(originLat / CELL_DEGREES);
  const lonIndex = Math.floor(originLon / CELL_DEGREES);

  // Best `limit` seen so far, kept sorted ascending by distance.
  const best: NearbyMarket[] = [];
  const consider = (entry: GridEntry) => {
    if (entry.slug === origin.slug) return;
    const distanceKm = haversineKm(originLat, originLon, entry.lat, entry.lon);
    if (distanceKm > MAX_DISTANCE_KM) return;
    if (best.length === limit && distanceKm >= best[best.length - 1].distanceKm) return;

    // Both snapshots hold the same market twice under different slugs in a few
    // places. Listing "For Oak Cliff Farmers Market — 27 mi away" twice in a
    // row looks broken, so the nearer copy of a name replaces the other.
    const nameKey = entry.name.toLowerCase();
    const duplicate = best.findIndex((candidate) => candidate.name.toLowerCase() === nameKey);
    if (duplicate !== -1) {
      if (best[duplicate].distanceKm <= distanceKm) return;
      best.splice(duplicate, 1);
    }

    const hit: NearbyMarket = {
      slug: entry.slug,
      name: entry.name,
      href: `/markets/${entry.slug}`,
      locationLine: entry.locationLine,
      distanceKm,
    };
    const at = best.findIndex((candidate) => candidate.distanceKm > distanceKm);
    best.splice(at === -1 ? best.length : at, 0, hit);
    if (best.length > limit) best.pop();
  };

  for (let rings = 0; rings <= MAX_RINGS; rings += 1) {
    // Ring 0 is the origin cell; every later ring is only its new perimeter,
    // so no cell is scanned twice.
    for (let dLat = -rings; dLat <= rings; dLat += 1) {
      const onLatEdge = Math.abs(dLat) === rings;
      for (let dLon = -rings; dLon <= rings; dLon += 1) {
        if (!onLatEdge && Math.abs(dLon) !== rings) continue;
        const cell = grid.get(cellKey(latIndex + dLat, lonIndex + dLon));
        if (cell) for (const entry of cell) consider(entry);
      }
    }

    const covered = guaranteedRadiusKm(originLat, rings);
    if (covered >= MAX_DISTANCE_KM) break;
    if (best.length === limit && best[best.length - 1].distanceKm <= covered) break;
  }

  return best;
}
