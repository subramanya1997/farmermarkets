import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { MarketsIndex } from "@/components/MarketsIndex";
import {
  PRERENDERED_PAGE_COUNT,
  getTotalMarketPages,
  marketsPagePath,
} from "@/lib/marketsIndex";

export const revalidate = 86400;
/**
 * Only the first `PRERENDERED_PAGE_COUNT` pages are built ahead of time; the
 * rest render on demand and are then held in the ISR cache. Out-of-range page
 * numbers 404 via `getMarketsPage` inside `MarketsIndex`.
 */
export const dynamicParams = true;

interface MarketsPageNProps {
  params: Promise<{ n: string }>;
}

export async function generateStaticParams() {
  const totalPages = await getTotalMarketPages();
  const count = Math.min(PRERENDERED_PAGE_COUNT, totalPages);
  // Page 1 lives at `/markets`, so this route starts at 2.
  return Array.from({ length: Math.max(0, count - 1) }, (_, index) => ({
    n: String(index + 2),
  }));
}

/** Strict parse: "02", "2.5" and "2e0" must not resolve to page 2. */
function parsePageNumber(value: string): number | null {
  if (!/^[1-9][0-9]*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function generateMetadata({ params }: MarketsPageNProps): Promise<Metadata> {
  const page = parsePageNumber((await params).n);
  if (page === null) return {};

  const path = marketsPagePath(page);

  return {
    title: `Farmers Markets Directory — Page ${page}`,
    description: `Page ${page} of the farmers market directory: browse local-food markets, cooperatives, and public food markets A–Z.`,
    openGraph: {
      title: `Farmers Markets Directory — Page ${page}`,
      description: `Page ${page} of the farmers market directory.`,
      url: path,
    },
    alternates: {
      // Self-canonical: each page is a distinct set of markets, so pointing
      // them all at page 1 would tell Google to drop the other 180 pages of
      // links it is meant to follow.
      canonical: path,
    },
  };
  // Note: no rel=prev/next link tags. Next's Metadata API cannot emit `<link
  // rel="prev">`, and Google stopped using those signals in 2019 — the real
  // prev/next `<a>` links in `MarketsPagination` are what carries crawl depth.
}

export default async function MarketsPageN({ params }: MarketsPageNProps) {
  const page = parsePageNumber((await params).n);
  if (page === null) notFound();
  // `/markets/page/1` is a duplicate of `/markets`; send it home rather than
  // serving the same list at two URLs.
  if (page === 1) redirect('/markets');

  return <MarketsIndex page={page} />;
}
