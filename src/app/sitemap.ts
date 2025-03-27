import { getMarkets } from "@/lib/data";
import { MetadataRoute } from "next";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const markets = await getMarkets();
  const baseUrl = 'https://farmermarkets.app';

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
    url: `${baseUrl}/markets/${market.id}`,
    lastModified: formatDate(market.last_updated),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  // Static routes
  const routes = [
    '',
    '/markets',
    '/map',
    '/about',
    '/terms',
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: formatDate(new Date()),
    changeFrequency: 'daily' as const,
    priority: 1.0,
  }));

  return [...routes, ...marketUrls];
} 