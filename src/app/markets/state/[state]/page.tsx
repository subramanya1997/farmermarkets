import { notFound, permanentRedirect } from 'next/navigation';
import { resolveLegacyStateSlug } from '@/lib/legacyStateRedirects';
import { statePath } from '@/lib/statePage';

export const revalidate = 86400;
export const dynamicParams = true;

/**
 * Retired route: the state hub now lives at `/farmers-markets/{state}`.
 *
 * This file exists only to 308 the URLs Google already has. It rendered a page
 * filtered on the **raw** `state` value, which meant `/markets/state/ny` and
 * `/markets/state/new-york` were two different pages holding two different
 * halves of one state — the duplication the hub exists to end. Nothing links
 * here any more and these URLs are not in the sitemap; see
 * `src/lib/legacyStateRedirects.ts` for how a raw slug resolves to a hub.
 */
export async function generateStaticParams() {
  // Nothing is prerendered: every response is a redirect, and the redirect
  // targets are prerendered instead.
  return [];
}

interface LegacyStatePageProps {
  params: Promise<{ state: string }>;
}

export default async function LegacyStatePage({ params }: LegacyStatePageProps) {
  const { state } = await params;
  const target = await resolveLegacyStateSlug(state);

  // "usa"/"us" (193 records) name no single state, so there is nothing to
  // redirect to and a 404 is the honest answer.
  if (!target) notFound();

  permanentRedirect(statePath(target));
}
