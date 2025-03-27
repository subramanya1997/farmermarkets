// Client-side API for accessing market data
// This file should be used by client components to get data

// FarmerMarket type definition
export interface FarmerMarket {
  id: string;
  name: string;
  last_updated?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  location?: {
    lat: number;
    lon: number;
  };
  location_description?: string;
  site_type?: string;
  indoor_outdoor?: string;
  organization_types?: string[];
  organization_description?: string;
  phone_numbers?: string[];
  emails?: string[];
  websites?: string[];
  social_media?: string[];
  season?: string;
  days?: string[];
  vendor_count?: number;
  products?: string[];
  production_methods?: string[];
  payment_methods?: string[];
  wic?: boolean;
  sfmnp?: boolean;
  fmnp?: boolean;
  snap?: boolean;
  snap_option?: string;
  online_ordering_available?: boolean;
  online_ordering_links?: string[];
  phone_ordering?: boolean;
  csa_available?: boolean;
  csa_description?: string;
  delivery_available?: boolean;
  delivery_methods?: string;
  accepts_cash?: boolean;
  accepts_credit_debit?: boolean;
  accepts_checks?: boolean;
  has_organic?: boolean;
  has_naturally_grown?: boolean;
  has_chemical_free?: boolean;
  has_grass_fed?: boolean;
  has_free_range?: boolean;
  has_hormone_free?: boolean;
  has_gmo_free?: boolean;
  has_fresh_produce?: boolean;
  has_meat?: boolean;
  has_dairy?: boolean;
  has_eggs?: boolean;
  has_herbs?: boolean;
  has_crafts?: boolean;
  has_prepared_food?: boolean;
  has_baked_goods?: boolean;
  has_flowers?: boolean;
  has_honey?: boolean;
  has_jams?: boolean;
  has_wine?: boolean;
  has_parking?: boolean;
  has_restrooms?: boolean;
  has_picnic_area?: boolean;
  wheelchair_accessible?: boolean;
  pet_friendly?: boolean;
}

/**
 * Filter options for markets API
 */
export interface MarketFilterOptions {
  page?: number;
  limit?: number;
  search?: string;
  state?: string;
  products?: string[];
  paymentMethods?: {
    wic?: boolean;
    snap?: boolean;
    sfmnp?: boolean;
    fmnp?: boolean;
    cash?: boolean;
    credit?: boolean;
    checks?: boolean;
  };
  productionMethods?: {
    organic?: boolean;
    naturallyGrown?: boolean;
    chemicalFree?: boolean;
    grassFed?: boolean;
    freeRange?: boolean;
    hormoneFree?: boolean;
    gmoFree?: boolean;
  };
  amenities?: {
    parking?: boolean;
    restrooms?: boolean;
    picnicArea?: boolean;
    wheelchairAccessible?: boolean;
    petFriendly?: boolean;
  };
  salesChannels?: {
    onlineOrdering?: boolean;
    phoneOrdering?: boolean;
    csaAvailable?: boolean;
    deliveryAvailable?: boolean;
  };
}

/**
 * Response type for markets listing
 */
export interface MarketsResponse {
  data: FarmerMarket[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Response type for single market
 */
export interface MarketResponse {
  data: FarmerMarket;
}

// Helper function to get the base URL for API requests
function getBaseUrl() {
  // Check if we're running on the server or in the browser
  if (typeof window === 'undefined') {
    // Server-side: need to use an absolute URL
    const url = process.env.NEXT_PUBLIC_API_BASE_URL || 
                (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
                process.env.NEXT_PUBLIC_VERCEL_URL ||
                'http://localhost:3000';
                
    // Ensure the URL has a protocol
    return url.startsWith('http') ? url : `https://${url}`;
  }
  // Client-side: can use relative URL - this allows the browser to use the current origin
  return '';
}

/**
 * Fetch all markets with optional filtering
 */
export async function fetchMarkets(options: MarketFilterOptions = {}): Promise<MarketsResponse> {
  const { 
    page = 1, 
    limit = 50, 
    search = '', 
    state = '',
    products = [],
    paymentMethods = {},
    productionMethods = {},
    amenities = {},
    salesChannels = {}
  } = options;
  
  // Build query string
  const params = new URLSearchParams();
  params.append('page', page.toString());
  params.append('limit', limit.toString());
  if (search) params.append('search', search);
  if (state) params.append('state', state);
  
  // Add array parameters
  if (products.length > 0) {
    products.forEach(product => params.append('products[]', product));
  }
  
  // Add boolean parameters
  Object.entries(paymentMethods).forEach(([key, value]) => {
    if (value) params.append(`payment_${key}`, 'true');
  });
  
  Object.entries(productionMethods).forEach(([key, value]) => {
    if (value) params.append(`production_${key}`, 'true');
  });
  
  Object.entries(amenities).forEach(([key, value]) => {
    if (value) params.append(`amenity_${key}`, 'true');
  });
  
  Object.entries(salesChannels).forEach(([key, value]) => {
    if (value) params.append(`sales_${key}`, 'true');
  });
  
  const baseUrl = getBaseUrl();
  const response = await fetch(`${baseUrl}/api/markets?${params.toString()}`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch markets');
  }
  
  return await response.json();
}

/**
 * Fetch a single market by ID
 */
export async function fetchMarketById(id: string): Promise<FarmerMarket> {
  const baseUrl = getBaseUrl();
  const response = await fetch(`${baseUrl}/api/markets/${id}`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch market');
  }
  
  const result = await response.json();
  return result.data;
}

/**
 * Get products from a market
 */
export function getMarketProducts(market: FarmerMarket): string[] {
  return market.products || [];
}

/**
 * Get market hours/seasons string
 */
export function getMarketHours(market: FarmerMarket): string {
  if (market.season) {
    return market.season;
  }
  
  if (market.days && market.days.length > 0) {
    return market.days.join(', ');
  }
  
  return '';
}

/**
 * Get address string
 */
export function getMarketAddress(market: FarmerMarket): string {
  const parts = [];
  if (market.address) parts.push(market.address);
  if (market.city) parts.push(market.city);
  if (market.state) parts.push(market.state);
  if (market.zip_code) parts.push(market.zip_code);
  
  return parts.join(', ');
}

/**
 * Get payment methods from a market
 */
export function getMarketPaymentMethods(market: FarmerMarket): string[] {
  const methods = [];
  
  // Add standard payment methods
  if (market.payment_methods) {
    methods.push(...market.payment_methods);
  }
  
  // Add assistance programs
  if (market.wic) methods.push('WIC');
  if (market.snap) methods.push('SNAP');
  if (market.fmnp) methods.push('FMNP');
  if (market.sfmnp) methods.push('SFMNP');
  
  // Add basic payment methods
  if (market.accepts_cash) methods.push('Cash');
  if (market.accepts_credit_debit) methods.push('Credit/Debit');
  if (market.accepts_checks) methods.push('Checks');
  
  return methods;
}

/**
 * Get production methods from a market
 */
export function getMarketProductionMethods(market: FarmerMarket): string[] {
  const methods = [];
  
  if (market.has_organic) methods.push('Organic');
  if (market.has_naturally_grown) methods.push('Naturally Grown');
  if (market.has_chemical_free) methods.push('Chemical Free');
  if (market.has_grass_fed) methods.push('Grass Fed');
  if (market.has_free_range) methods.push('Free Range');
  if (market.has_hormone_free) methods.push('Hormone Free');
  if (market.has_gmo_free) methods.push('GMO Free');
  
  return methods;
}

/**
 * Get amenities from a market
 */
export function getMarketAmenities(market: FarmerMarket): string[] {
  const amenities = [];
  
  if (market.has_parking) amenities.push('Parking');
  if (market.has_restrooms) amenities.push('Restrooms');
  if (market.has_picnic_area) amenities.push('Picnic Area');
  if (market.wheelchair_accessible) amenities.push('Wheelchair Accessible');
  if (market.pet_friendly) amenities.push('Pet Friendly');
  
  return amenities;
}

/**
 * Get sales channels from a market
 */
export function getMarketSalesChannels(market: FarmerMarket): string[] {
  const channels = [];
  
  if (market.online_ordering_available) channels.push('Online Ordering');
  if (market.phone_ordering) channels.push('Phone Ordering');
  if (market.csa_available) channels.push('CSA Available');
  if (market.delivery_available) channels.push('Delivery Available');
  
  return channels;
} 