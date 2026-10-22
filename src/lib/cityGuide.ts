/**
 * Lookup for the optional city visitor guides in `data/city-guides.json`.
 *
 * The JSON is imported rather than read from disk so it ships inside the
 * bundle: an ISR re-render on Vercel cannot see files outside the trace, and a
 * guide that vanished on revalidation would be worse than no guide at all.
 */

import guidesFile from '../../data/city-guides.json';
import type { CityGuide, CityGuideFile, CityGuideSource } from './cityGuideSchema';

const file = guidesFile as CityGuideFile;

export function getCityGuide(stateSlug: string, citySlug: string): CityGuide | undefined {
  return file.guides[`${stateSlug}/${citySlug}`];
}

/** The sources one tip or answer cites, in the order it cites them. */
export function citedSources(guide: CityGuide, ids: string[]): CityGuideSource[] {
  return ids
    .map((id) => guide.sources.find((source) => source.id === id))
    .filter((source): source is CityGuideSource => Boolean(source));
}
