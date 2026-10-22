import type { Metadata } from "next";
import { MarketsIndex } from "@/components/MarketsIndex";
import { INDEX_NAME } from "@/lib/marketsIndex";

const DESCRIPTION =
  "Search farmers markets by town or name, then filter by market day, SNAP/EBT and card payment.";

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
  title: INDEX_NAME,
  description: DESCRIPTION,
  openGraph: {
    title: INDEX_NAME,
    description: DESCRIPTION,
    url: '/markets',
  },
  alternates: {
    canonical: '/markets',
  },
};

export default async function MarketsPage() {
  return <MarketsIndex page={1} />;
}
