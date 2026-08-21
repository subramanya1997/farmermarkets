import { getMarkets } from "@/lib/data";
import { Markets } from "@/components/Markets";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { absoluteUrl } from "@/lib/site";

export const revalidate = 86400;
// Every state present in the dataset is prerendered below; anything else is
// rendered on demand so it can 404 (or pick up a state added by a data update).
export const dynamicParams = true;

interface StatePageProps {
  params: Promise<{
    state: string;
  }>;
}

// Slugify a state name the same way the filter below un-slugifies it.
function toStateSlug(state: string): string {
  return state.toLowerCase().replace(/\s+/g, '-');
}

// Prerender one page per state that actually has markets (~67 pages).
export async function generateStaticParams() {
  const markets = await getMarkets();
  const states = new Set<string>();

  for (const market of markets) {
    if (market.state) {
      states.add(toStateSlug(market.state));
    }
  }

  return Array.from(states, (state) => ({ state }));
}

// Helper to format state name
function formatStateName(stateSlug: string): string {
  return stateSlug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export async function generateMetadata({ params }: StatePageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const stateName = formatStateName(resolvedParams.state);
  
  return {
    title: `Farmers Markets in ${stateName} - Find Local Markets`,
    description: `Discover farmers markets in ${stateName}. Find fresh, local produce and support local farmers. Browse ${stateName} farmers markets by location, products, and payment options.`,
    openGraph: {
      title: `Farmers Markets in ${stateName}`,
      description: `Discover farmers markets in ${stateName}. Find fresh, local produce and support local farmers.`,
      url: `/markets/state/${resolvedParams.state}`,
    },
    alternates: {
      canonical: `/markets/state/${resolvedParams.state}`,
    },
  };
}

export default async function StatePage({ params }: StatePageProps) {
  const resolvedParams = await params;
  const stateSlug = resolvedParams.state;
  const stateName = formatStateName(stateSlug);
  
  // Get all markets
  const allMarkets = await getMarkets();
  
  // Filter markets by state (case-insensitive)
  const stateMarkets = allMarkets.filter(market => 
    market.state?.toLowerCase().replace(/\s+/g, '-') === stateSlug.toLowerCase()
  );
  
  if (stateMarkets.length === 0) {
    notFound();
  }
  
  // Generate state-specific schema
  const stateSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Farmers Markets in ${stateName}`,
    description: `Directory of farmers markets in ${stateName}`,
    url: absoluteUrl(`/markets/state/${stateSlug}`),
    about: {
      '@type': 'Place',
      name: stateName,
      '@id': `https://www.wikidata.org/wiki/${stateName.replace(/\s+/g, '_')}`
    },
    numberOfItems: stateMarkets.length
  };
  
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(stateSchema) }}
      />
      <Markets 
        markets={stateMarkets}
        title={`Farmers Markets in ${stateName}`}
        description={`Discover ${stateMarkets.length} local farmers markets across ${stateName}. Find fresh produce, support local farmers, and connect with your community.`}
      />
    </>
  );
}

