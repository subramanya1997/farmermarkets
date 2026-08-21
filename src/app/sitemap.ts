import { getMarkets } from "@/lib/data";
import { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { getStateSummaries, getTotalMarketPages, marketsPagePath } from "@/lib/marketsIndex";

// Generated at build time and revalidated daily rather than rebuilt per crawl.
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const markets = await getMarkets();
  const baseUrl = SITE_URL;

  // Function to format dates properly for sitemap
  const formatDate = (date: Date | string | null | undefined): string => {
    if (!date) {
      return new Date().toISOString();
    }

    // If it's already a string, try to parse it
    if (typeof date === 'string') {
      const parsedDate = new Date(date);
      // Check if parsed date is valid
      return isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
    }

    // Otherwise it's a Date object
    return date.toISOString();
  };

  // Generate market URLs
  const marketUrls = markets.map((market) => ({
    url: `${baseUrl}/markets/${market.slug}`,
    lastModified: formatDate(market.last_updated),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  // Static routes
  const routes = [
    '',
    '/markets',
    '/about',
    '/privacy',
    '/terms',
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: formatDate(new Date()),
    changeFrequency: 'daily' as const,
    priority: 1.0,
  }));

  // Index pages 2+ (`/markets` itself is already in `routes` above) and the
  // state directory pages, both of which are now linked from `/markets`.
  const totalPages = await getTotalMarketPages();
  const indexPageUrls = Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => ({
    url: `${baseUrl}${marketsPagePath(index + 2)}`,
    lastModified: formatDate(new Date()),
    changeFrequency: 'weekly' as const,
    priority: 0.5,
  }));

  const stateUrls = (await getStateSummaries()).map((state) => ({
    url: `${baseUrl}/markets/state/${state.slug}`,
    lastModified: formatDate(new Date()),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  return [...routes, ...indexPageUrls, ...stateUrls, ...marketUrls];
}
