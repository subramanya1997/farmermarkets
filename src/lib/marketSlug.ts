/**
 * A market slug from whatever someone pasted or the outreach bot sent: a
 * full URL, `/markets/<slug>`, a claim or apply link, or the bare slug. Old
 * slugs follow `data/slug-redirects.json`, so a link shared last season
 * still finds the market.
 */
import slugRedirects from '../../data/slug-redirects.json';
import { marketSlugFrom } from './vendorRules';

const redirects: Record<string, string> = slugRedirects.redirects;

export function resolveMarketSlug(value: string): string | null {
  return marketSlugFrom(value, redirects);
}
