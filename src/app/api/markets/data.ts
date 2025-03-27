// This file handles the data layer for API routes
// Since this file is only imported by API routes, we don't need server-only

import { promises as fs } from 'fs';
import path from 'path';

// FarmerMarket interface for TypeScript typing
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

// Interface for raw market data from JSON
interface RawMarketData {
  id?: string | number;
  name: string;
  last_updated?: string;
  location?: {
    address?: string;
    city?: string;
    state?: string;
    zip_code?: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
    description?: string;
    site_type?: string;
    indoor_outdoor?: string;
  };
  organization?: {
    types?: string[];
    description?: string;
  };
  contact?: {
    phone_numbers?: string[];
    emails?: string[];
    websites?: string[];
    social_media?: string[];
  };
  operations?: {
    season?: string;
    days?: string[];
    vendor_count?: number;
  };
  products?: {
    items?: string[];
    production_methods?: string[];
    categories?: {
      fresh_produce?: boolean;
      meat?: boolean;
      dairy?: boolean;
      eggs?: boolean;
      herbs?: boolean;
      crafts?: boolean;
      prepared_food?: boolean;
      baked_goods?: boolean;
      flowers?: boolean;
      honey?: boolean;
      jams?: boolean;
      wine?: boolean;
    };
  };
  payment?: {
    methods?: string[];
    food_assistance?: {
      wic?: boolean;
      sfmnp?: boolean;
      fmnp?: boolean;
      snap?: boolean;
      snap_option?: string;
    };
  };
  sales_channels?: {
    online_ordering?: {
      available?: boolean;
      links?: string[];
    };
    phone_ordering?: boolean;
    csa?: {
      available?: boolean;
      description?: string;
    };
    delivery?: {
      available?: boolean;
      methods?: string;
    };
  };
  amenities?: {
    description?: string;
    features?: string[];
    parking?: boolean;
    restrooms?: boolean;
    picnic_area?: boolean;
    wheelchair_accessible?: boolean;
    pet_friendly?: boolean;
  };
}

// Load markets data from JSON file
async function loadMarketsData(): Promise<FarmerMarket[]> {
  try {
    const filePath = path.join(process.cwd(), 'public/data/farmers_markets.json');
    
    // Log the file path for debugging in Vercel
    console.log(`Attempting to load market data from: ${filePath}`);
    
    // Check if the file exists
    try {
      await fs.access(filePath);
    } catch (err) {
      console.error(`File does not exist or is not accessible: ${filePath}`, err);
      return [];
    }
    
    const fileContents = await fs.readFile(filePath, 'utf8');
    
    if (!fileContents || fileContents.trim() === '') {
      console.error('Market data file is empty');
      return [];
    }
    
    try {
      const data = JSON.parse(fileContents);
      
      if (!Array.isArray(data)) {
        console.error('Market data is not an array:', typeof data);
        return [];
      }
      
      console.log(`Successfully loaded ${data.length} markets from data file`);
      
      // Transform the data to match our schema
      return data.map((market: RawMarketData, index: number) => {
        // Extract payment methods and check for specific payment types
        const paymentMethods = market.payment?.methods || [];
        const acceptsCash = paymentMethods.some((method: string) => 
          method.toLowerCase().includes('cash')
        );
        const acceptsCredit = paymentMethods.some((method: string) => 
          method.toLowerCase().includes('credit') || 
          method.toLowerCase().includes('debit') ||
          method.toLowerCase().includes('card')
        );
        const acceptsChecks = paymentMethods.some((method: string) => 
          method.toLowerCase().includes('check')
        );

        // Extract production methods and check for specific types
        const productionMethods = market.products?.production_methods || [];
        const hasOrganic = productionMethods.some((method: string) =>
          method.toLowerCase().includes('organic')
        );
        const hasNaturallyGrown = productionMethods.some((method: string) =>
          method.toLowerCase().includes('naturally grown') ||
          method.toLowerCase().includes('natural growing')
        );
        const hasChemicalFree = productionMethods.some((method: string) =>
          method.toLowerCase().includes('chemical free') ||
          method.toLowerCase().includes('no chemicals')
        );
        const hasGrassFed = productionMethods.some((method: string) =>
          method.toLowerCase().includes('grass fed') ||
          method.toLowerCase().includes('grass-fed')
        );
        const hasFreeRange = productionMethods.some((method: string) =>
          method.toLowerCase().includes('free range') ||
          method.toLowerCase().includes('free-range')
        );
        const hasHormoneFree = productionMethods.some((method: string) =>
          method.toLowerCase().includes('hormone free') ||
          method.toLowerCase().includes('no hormones')
        );
        const hasGmoFree = productionMethods.some((method: string) =>
          method.toLowerCase().includes('gmo free') ||
          method.toLowerCase().includes('non-gmo') ||
          method.toLowerCase().includes('no gmo')
        );

        // Extract amenities from both amenities object and description
        const amenitiesText = [
          market.amenities?.description,
          market.location?.description,
          ...(market.amenities?.features || [])
        ].filter(Boolean).join(' ').toLowerCase();

        const hasParking = amenitiesText.includes('parking') || market.amenities?.parking === true;
        const hasRestrooms = (
          amenitiesText.includes('restroom') || 
          amenitiesText.includes('bathroom') || 
          amenitiesText.includes('facilities') ||
          market.amenities?.restrooms === true
        );
        const hasPicnicArea = (
          amenitiesText.includes('picnic') || 
          amenitiesText.includes('seating') ||
          market.amenities?.picnic_area === true
        );
        const isWheelchairAccessible = (
          amenitiesText.includes('wheelchair') || 
          amenitiesText.includes('accessible') || 
          amenitiesText.includes('ada') ||
          market.amenities?.wheelchair_accessible === true
        );
        const isPetFriendly = (
          amenitiesText.includes('pet friendly') || 
          amenitiesText.includes('dog friendly') ||
          amenitiesText.includes('pets welcome') ||
          market.amenities?.pet_friendly === true
        );

        return {
          id: market.id?.toString() || (index + 1).toString(),
          name: market.name,
          last_updated: market.last_updated,
          address: market.location?.address,
          city: market.location?.city,
          state: market.location?.state,
          zip_code: market.location?.zip_code,
          location: market.location?.coordinates ? {
            lat: market.location.coordinates.latitude,
            lon: market.location.coordinates.longitude
          } : undefined,
          location_description: market.location?.description,
          site_type: market.location?.site_type,
          indoor_outdoor: market.location?.indoor_outdoor,
          organization_types: market.organization?.types || [],
          organization_description: market.organization?.description,
          phone_numbers: market.contact?.phone_numbers || [],
          emails: market.contact?.emails || [],
          websites: market.contact?.websites || [],
          social_media: market.contact?.social_media || [],
          season: market.operations?.season,
          days: market.operations?.days || [],
          vendor_count: market.operations?.vendor_count,
          products: market.products?.items || [],
          production_methods: productionMethods,
          payment_methods: paymentMethods,
          wic: market.payment?.food_assistance?.wic || false,
          sfmnp: market.payment?.food_assistance?.sfmnp || false,
          fmnp: market.payment?.food_assistance?.fmnp || false,
          snap: market.payment?.food_assistance?.snap || false,
          snap_option: market.payment?.food_assistance?.snap_option,
          accepts_cash: acceptsCash,
          accepts_credit_debit: acceptsCredit,
          accepts_checks: acceptsChecks,
          online_ordering_available: market.sales_channels?.online_ordering?.available || false,
          online_ordering_links: market.sales_channels?.online_ordering?.links || [],
          phone_ordering: market.sales_channels?.phone_ordering || false,
          csa_available: market.sales_channels?.csa?.available || false,
          csa_description: market.sales_channels?.csa?.description,
          delivery_available: market.sales_channels?.delivery?.available || false,
          delivery_methods: market.sales_channels?.delivery?.methods,
          has_organic: hasOrganic,
          has_naturally_grown: hasNaturallyGrown,
          has_chemical_free: hasChemicalFree,
          has_grass_fed: hasGrassFed,
          has_free_range: hasFreeRange,
          has_hormone_free: hasHormoneFree,
          has_gmo_free: hasGmoFree,
          has_fresh_produce: market.products?.categories?.fresh_produce || false,
          has_meat: market.products?.categories?.meat || false,
          has_dairy: market.products?.categories?.dairy || false,
          has_eggs: market.products?.categories?.eggs || false,
          has_herbs: market.products?.categories?.herbs || false,
          has_crafts: market.products?.categories?.crafts || false,
          has_prepared_food: market.products?.categories?.prepared_food || false,
          has_baked_goods: market.products?.categories?.baked_goods || false,
          has_flowers: market.products?.categories?.flowers || false,
          has_honey: market.products?.categories?.honey || false,
          has_jams: market.products?.categories?.jams || false,
          has_wine: market.products?.categories?.wine || false,
          has_parking: hasParking,
          has_restrooms: hasRestrooms,
          has_picnic_area: hasPicnicArea,
          wheelchair_accessible: isWheelchairAccessible,
          pet_friendly: isPetFriendly
        };
      });
    } catch (error) {
      console.error('Error parsing market data:', error);
      return [];
    }
  } catch (error) {
    console.error('Error loading market data:', error);
    return [];
  }
}

// Our API data service
export const marketService = {
  // Get all markets with optional filtering 
  getMarkets: async (options: {
    search?: string;
    state?: string;
    page?: number;
    limit?: number;
  } = {}) => {
    const { search = '', state = '', page = 1, limit = 50 } = options;
    const markets = await loadMarketsData();
    
    // Apply filters
    let filteredMarkets = markets;
    
    if (search) {
      const searchLower = search.toLowerCase();
      filteredMarkets = filteredMarkets.filter(market => {
        return market.name.toLowerCase().includes(searchLower) || 
               (market.city && market.city.toLowerCase().includes(searchLower)) || 
               (market.state && market.state.toLowerCase().includes(searchLower));
      });
    }
    
    if (state) {
      filteredMarkets = filteredMarkets.filter(market => 
        market.state && market.state.toLowerCase() === state.toLowerCase()
      );
    }
    
    // Apply pagination
    const startIndex = (page - 1) * limit;
    const paginatedMarkets = filteredMarkets.slice(startIndex, startIndex + limit);
    
    // Return with pagination info
    return {
      data: paginatedMarkets,
      pagination: {
        total: filteredMarkets.length,
        page,
        limit,
        totalPages: Math.ceil(filteredMarkets.length / limit)
      }
    };
  },
  
  // Get a single market by ID
  getMarketById: async (id: string) => {
    const markets = await loadMarketsData();
    const market = markets.find(m => String(m.id) === id);
    return market || null;
  }
}; 