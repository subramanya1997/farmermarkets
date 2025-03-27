import { getMarkets } from "@/lib/data";
import { Markets } from "@/components/Markets";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function MarketsPage() {
  // Fetch all markets
  const markets = await getMarkets();
  
  return <Markets markets={markets} />;
} 