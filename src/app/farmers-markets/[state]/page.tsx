import { notFound, permanentRedirect } from 'next/navigation';
import { getStateByCode } from '@/lib/geoIndex';
import { getStateSummaries } from '@/lib/marketsIndex';

export const revalidate = 86400;
export const dynamicParams = true;

/**
 * Placeholder for the state hub at `/farmers-markets/{state}`.
 *
 * The city pages sit under this segment, so the segment itself has to resolve
 * to something: until issue #17 builds the real state hub here, a recognised
 * state permanently redirects to the existing `/markets/state/{state}` page
 * and anything else 404s. A 301 (rather than a soft link page) keeps the two
 * URLs from competing for the same query while the hub is being built.
 */
export async function generateStaticParams() {
  return [];
}

interface StateSegmentProps {
  params: Promise<{ state: string }>;
}

export default async function StateSegmentPage({ params }: StateSegmentProps) {
  const { state: stateSlug } = await params;
  const state = await getStateByCode(stateSlug);

  if (!state) notFound();

  // `/markets/state/[state]` filters on the raw `state` value in the records,
  // so only a slug that really occurs in the data has a page to redirect to.
  const slugs = new Set((await getStateSummaries()).map((summary) => summary.slug));
  const target = [state.slug, state.code?.toLowerCase()]
    .filter((slug): slug is string => Boolean(slug))
    .find((slug) => slugs.has(slug));

  if (!target) notFound();

  permanentRedirect(`/markets/state/${target}`);
}
