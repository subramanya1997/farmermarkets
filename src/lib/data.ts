// Server-side adapter for backward compatibility
// This file uses the fetch for data access but works on both server and client

import { 
  fetchMarkets, 
  fetchMarketById,
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
  const response = await fetchMarkets({ limit: 1000 });
  return response.data;
}

// Compatibility function for existing code  
export async function getMarketById(id: string): Promise<FarmerMarket | undefined> {
  try {
    const market = await fetchMarketById(id);
    return market;
  } catch (error) {
    console.error('Error fetching market by ID:', error);
    return undefined;
  }
}

// Re-export the FarmerMarket type
export type { FarmerMarket };
