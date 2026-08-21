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

// This page still hands the full dataset to a client component (that payload
// is issue #14). ISR at least means the giant RSC payload is built once a day
// instead of on every request.
export const revalidate = 86400;

export default async function MarketsPage() {
  // Fetch all markets
  const markets = await getMarkets();
  
  return <Markets markets={markets} />;
} 