import type { FarmerMarket } from './api';
import type { LucideIcon } from 'lucide-react';
import {
  Leaf,
  CreditCard,
  Utensils,
  Beef,
  Milk,
  Carrot,
  Package,
  Sprout,
  Heart,
  HandCoins,
  CalendarCheck,
  CalendarDays,
} from 'lucide-react';
import type { Weekday } from './seo.ts';
import { weekdayOf, weekdaysFor } from './marketDisplay.ts';

export interface FilterOption {
  id: string;
  label: string;
  icon: LucideIcon;
  /** How many markets match; options with none are dropped, never shown. */
  count?: number;
  /** Shown in the always-visible row; the rest sit behind "More". */
  primary?: boolean;
  filterFn: (market: FarmerMarket) => boolean;
}

/** The filters the explorer shows up front, in this order. */
export const PRIMARY_FILTER_IDS = ['today', 'weekend', 'snap', 'credit'] as const;

/**
 * Parsed weekdays per record. The schedule reader is regex-heavy and the
 * explorer filters ~9,000 records on every toggle, so each record is read once.
 */
const weekdayCache = new WeakMap<FarmerMarket, Weekday[]>();

function weekdaysOf(market: FarmerMarket): Weekday[] {
  let days = weekdayCache.get(market);
  if (!days) {
    days = weekdaysFor(market);
    weekdayCache.set(market, days);
  }
  return days;
}

function opensOn(market: FarmerMarket, days: readonly Weekday[]): boolean {
  return weekdaysOf(market).some((day) => days.includes(day));
}

const WEEKEND: readonly Weekday[] = ['Saturday', 'Sunday'];

export interface FilterCategory {
  id: string;
  label: string;
  options: FilterOption[];
}

/**
 * Extract unique filter options from market data
 */
export function extractFilterOptions(markets: FarmerMarket[], now: Date = new Date()): FilterCategory[] {
  const categories: FilterCategory[] = [];

  // When: read from the parsed schedule against the reader's own clock.
  // Records with no parseable weekday never match, so "Today" never promises
  // a market whose days are unknown.
  const today = weekdayOf(now);
  const whenFilters: FilterOption[] = [
    {
      id: 'today',
      label: 'Today',
      icon: CalendarCheck,
      primary: true,
      filterFn: (m: FarmerMarket) => opensOn(m, [today]),
      count: markets.filter((m) => opensOn(m, [today])).length,
    },
    {
      id: 'weekend',
      label: 'This weekend',
      icon: CalendarDays,
      primary: true,
      filterFn: (m: FarmerMarket) => opensOn(m, WEEKEND),
      count: markets.filter((m) => opensOn(m, WEEKEND)).length,
    },
  ].filter((option) => (option.count ?? 0) > 0);

  if (whenFilters.length > 0) {
    categories.push({ id: 'when', label: 'When', options: whenFilters });
  }

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
      id: 'snap',
      label: 'SNAP/EBT',
      icon: HandCoins,
      primary: true,
      filterFn: (m: FarmerMarket) => m.snap === true,
      count: markets.filter((m: FarmerMarket) => m.snap).length,
    },
    {
      id: 'credit',
      label: 'Cards',
      icon: CreditCard,
      primary: true,
      filterFn: (m: FarmerMarket) => m.accepts_credit_debit === true,
      count: markets.filter((m: FarmerMarket) => m.accepts_credit_debit).length,
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
      label: 'Payment',
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
      label: 'Growing',
      options: productionFilters,
    });
  }

  return categories;
}

/** Every option, flattened, for the up-front row and the "More" panel. */
export function splitFilterOptions(categories: FilterCategory[]): {
  primary: FilterOption[];
  more: FilterCategory[];
} {
  const all = categories.flatMap((category) => category.options);
  const primary = PRIMARY_FILTER_IDS
    .map((id) => all.find((option) => option.id === id))
    .filter((option): option is FilterOption => Boolean(option));
  const more = categories
    .map((category) => ({ ...category, options: category.options.filter((option) => !option.primary) }))
    .filter((category) => category.options.length > 0);
  return { primary, more };
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

