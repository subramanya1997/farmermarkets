import type { FarmerMarket } from './api';
import type { LucideIcon } from 'lucide-react';
import { Leaf, CreditCard, Utensils, Beef, Milk, Carrot, Package, Sprout, Heart, ShoppingBag } from 'lucide-react';

export interface FilterOption {
  id: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  filterFn: (market: FarmerMarket) => boolean;
}

export interface FilterCategory {
  id: string;
  label: string;
  options: FilterOption[];
}

/**
 * Extract unique filter options from market data
 */
export function extractFilterOptions(markets: FarmerMarket[]): FilterCategory[] {
  const categories: FilterCategory[] = [];

  // Products Category
  const productFilters: FilterOption[] = [
    {
      id: 'fresh_produce',
      label: 'Fresh Produce',
      icon: Carrot,
      filterFn: (m: FarmerMarket) => m.has_fresh_produce === true,
      count: markets.filter((m: FarmerMarket) => m.has_fresh_produce).length,
    },
    {
      id: 'meat',
      label: 'Meat & Poultry',
      icon: Beef,
      filterFn: (m: FarmerMarket) => m.has_meat === true,
      count: markets.filter((m: FarmerMarket) => m.has_meat).length,
    },
    {
      id: 'dairy',
      label: 'Dairy & Eggs',
      icon: Milk,
      filterFn: (m: FarmerMarket) => m.has_dairy === true || m.has_eggs === true,
      count: markets.filter((m: FarmerMarket) => m.has_dairy || m.has_eggs).length,
    },
    {
      id: 'baked_goods',
      label: 'Baked Goods',
      icon: Package,
      filterFn: (m: FarmerMarket) => m.has_baked_goods === true,
      count: markets.filter((m: FarmerMarket) => m.has_baked_goods).length,
    },
    {
      id: 'prepared_food',
      label: 'Prepared Foods',
      icon: Utensils,
      filterFn: (m: FarmerMarket) => m.has_prepared_food === true,
      count: markets.filter((m: FarmerMarket) => m.has_prepared_food).length,
    },
  ].filter(option => (option.count ?? 0) > 0);

  if (productFilters.length > 0) {
    categories.push({
      id: 'products',
      label: 'Products',
      options: productFilters,
    });
  }

  // Payment Methods Category
  const paymentFilters: FilterOption[] = [
    {
      id: 'credit',
      label: 'Credit/Debit',
      icon: CreditCard,
      filterFn: (m: FarmerMarket) => m.accepts_credit_debit === true,
      count: markets.filter((m: FarmerMarket) => m.accepts_credit_debit).length,
    },
    {
      id: 'snap',
      label: 'SNAP/EBT',
      icon: ShoppingBag,
      filterFn: (m: FarmerMarket) => m.snap === true,
      count: markets.filter((m: FarmerMarket) => m.snap).length,
    },
    {
      id: 'wic',
      label: 'WIC',
      icon: Heart,
      filterFn: (m: FarmerMarket) => m.wic === true,
      count: markets.filter((m: FarmerMarket) => m.wic).length,
    },
  ].filter(option => (option.count ?? 0) > 0);

  if (paymentFilters.length > 0) {
    categories.push({
      id: 'payment',
      label: 'Payment Options',
      options: paymentFilters,
    });
  }

  // Production Methods Category
  const productionFilters: FilterOption[] = [
    {
      id: 'organic',
      label: 'Organic',
      icon: Leaf,
      filterFn: (m: FarmerMarket) => m.has_organic === true,
      count: markets.filter((m: FarmerMarket) => m.has_organic).length,
    },
    {
      id: 'naturally_grown',
      label: 'Naturally Grown',
      icon: Sprout,
      filterFn: (m: FarmerMarket) => m.has_naturally_grown === true,
      count: markets.filter((m: FarmerMarket) => m.has_naturally_grown).length,
    },
  ].filter(option => (option.count ?? 0) > 0);

  if (productionFilters.length > 0) {
    categories.push({
      id: 'production',
      label: 'Production Methods',
      options: productionFilters,
    });
  }

  return categories;
}

/**
 * Apply active filters to markets
 */
export function applyFilters(
  markets: FarmerMarket[],
  activeFilters: Set<string>,
  filterCategories: FilterCategory[]
): FarmerMarket[] {
  if (activeFilters.size === 0) return markets;

  return markets.filter(market => {
    // Market must match ALL active filters (AND logic)
    for (const filterId of activeFilters) {
      let matched = false;
      
      for (const category of filterCategories) {
        const option = category.options.find(opt => opt.id === filterId);
        if (option && option.filterFn(market)) {
          matched = true;
          break;
        }
      }
      
      if (!matched) return false;
    }
    
    return true;
  });
}

