// Server-side adapter for backward compatibility
// This file is used by server-rendered pages and sitemap generation.

import 'server-only';
import { marketService } from '@/app/api/markets/data';
import { 
  getMarketProducts,
  getMarketHours, 
  getMarketAddress,
  getMarketPaymentMethods,
  getMarketProductionMethods,
  getMarketAmenities,
  getMarketSalesChannels,
  type FarmerMarket 
} from './api';

// Re-export helper functions directly from API
export {
  getMarketProducts,
  getMarketHours, 
  getMarketAddress,
  getMarketPaymentMethods,
  getMarketProductionMethods,
  getMarketAmenities,
  getMarketSalesChannels
};

// Compatibility function for existing code
export async function getMarkets(): Promise<FarmerMarket[]> {
  return await marketService.getAllMarkets();
}

// Compatibility function for existing code  
export async function getMarketById(id: string): Promise<FarmerMarket | undefined> {
  try {
    const market = await marketService.getMarketById(id);
    return market ?? undefined;
  } catch (error) {
    console.error('Error fetching market by ID:', error);
    return undefined;
  }
}

// Resolve a legacy numeric market ID (old `/markets/{id}` URLs) to its slug.
// Returns null when the ID is unknown so the caller can 404 instead of guessing.
export async function getSlugByLegacyId(id: string): Promise<string | null> {
  return await marketService.getSlugByLegacyId(id);
}

// Get market by slug
export async function getMarketBySlug(slug: string): Promise<FarmerMarket | undefined> {
  try {
    const market = await marketService.getMarketBySlug(slug);
    return market ?? undefined;
  } catch (error) {
    console.error('Error fetching market by slug:', error);
    return undefined;
  }
}

// Re-export the FarmerMarket type
export type { FarmerMarket };
