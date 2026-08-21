import type { Metadata } from "next";
import { MarketsIndex } from "@/components/MarketsIndex";

/**
 * Page 1 of the market index.
 *
 * This route reads no `searchParams`, so it stays fully static and is
 * revalidated daily like the rest of the site. Pages 2+ live at
 * `/markets/page/[n]` for exactly that reason: a `?page=` query would force
 * every request through dynamic rendering.
 */
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Browse Farmer Markets - Find Fresh Local Produce",
  description:
    "Browse farmers markets, public food markets, cooperatives, and other local-food places by country and region.",
  openGraph: {
    title: "Browse Farmer Markets - Find Fresh Local Produce",
    description:
      "Browse farmers markets, public food markets, cooperatives, and other local-food places by country and region.",
    url: '/markets',
  },
  alternates: {
    canonical: '/markets',
  },
};

export default async function MarketsPage() {
  return <MarketsIndex page={1} />;
}
