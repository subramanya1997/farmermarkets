import { getMarkets } from "@/lib/data";
import { Markets } from "@/components/Markets";
import type { Metadata } from "next";

// Canonical only. The title/description in ./metadata.ts is still orphaned and
// gets wired up in issue #14; adding it here is out of scope for this change.
export const metadata: Metadata = {
  alternates: {
    canonical: '/markets',
  },
  openGraph: {
    url: '/markets',
  },
};

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function MarketsPage() {
  // Fetch all markets
  const markets = await getMarkets();
  
  return <Markets markets={markets} />;
} 