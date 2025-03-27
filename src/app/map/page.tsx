import { getMarkets } from "@/lib/data";
import { MapContent } from "@/components/MapContent";

// Ensure this page is rendered dynamically and not statically generated at build time
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function MapPage() {
  // Fetch all markets with coordinates
  const allMarkets = await getMarkets();
  
  // Filter markets that have valid coordinates
  const marketsWithCoords = allMarkets.filter(market => {
    return market.location?.lat && market.location?.lon;
  });
  
  return <MapContent markets={marketsWithCoords} />;
} 