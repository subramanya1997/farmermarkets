'use client';

import { useState, useEffect, useCallback } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { FarmerMarket } from '@/lib/api';
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useSearchParams } from 'next/navigation';

interface MarketFiltersProps {
  markets: FarmerMarket[];
  onFilterChange: (filtered: FarmerMarket[]) => void;
  initialSearchTerm?: string;
}

export function MarketFilters({ markets, onFilterChange, initialSearchTerm = '' }: MarketFiltersProps) {
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [paymentFilters, setPaymentFilters] = useState({
    wic: false,
    snap: false,
    sfmnp: false,
    fmnp: false,
    cash: false,
    credit: false,
    checks: false
  });
  const [productFilters, setProductFilters] = useState({
    has_fresh_produce: false,
    has_meat: false,
    has_dairy: false,
    has_eggs: false,
    has_seafood: false,
    has_baked_goods: false,
    has_herbs: false,
    has_crafts: false,
    has_prepared_food: false,
    has_flowers: false,
    has_honey: false,
    has_jams: false,
    has_wine: false,
    has_grass_fed: false,
    has_free_range: false,
    has_hormone_free: false
  });
  const [amenityFilters, setAmenityFilters] = useState({
    parking: false,
    restrooms: false,
    picnicArea: false,
    wheelchairAccessible: false,
    petFriendly: false
  });
  const [salesFilters, setSalesFilters] = useState({
    onlineOrdering: false,
    phoneOrdering: false,
    csaAvailable: false,
    deliveryAvailable: false
  });
  
  // Extract all states from the markets data
  const states = Array.from(new Set(
    markets
      .map(market => market.state)
      .filter(Boolean) as string[]
  )).sort();
  
  // Extract all product categories from the markets data
  const allProducts = Array.from(new Set(
    markets.flatMap(market => market.products || []).filter(Boolean)
  )).sort();
  
  // Handle initialSearchTerm changes
  useEffect(() => {
    if (initialSearchTerm) {
      setSearchTerm(initialSearchTerm);
    }
  }, [initialSearchTerm]);
  
  // Handle URL filter parameters
  useEffect(() => {
    const filters = searchParams.get('filters')?.split(',') || [];
    if (filters.length > 0) {
      setProductFilters(prevFilters => {
        const newProductFilters = { ...prevFilters };
        filters.forEach(filter => {
          if (filter in newProductFilters) {
            newProductFilters[filter as keyof typeof newProductFilters] = true;
          }
        });
        return newProductFilters;
      });
    }
  }, [searchParams]);
  
  // Memoize the filtering function to prevent it from causing re-renders
  const filterMarkets = useCallback(() => {
    const filtered = markets.filter(market => {
      // Search by name, city, state, address
      const searchMatch = !searchTerm || [
        market.name,
        market.city,
        market.state,
        market.address
      ].some(field => field?.toLowerCase().includes(searchTerm.toLowerCase()));
      
      // State filter - match if no states selected or market state is in selected states
      const stateMatch = selectedStates.length === 0 || 
        (market.state && selectedStates.includes(market.state));
      
      // Products filter
      const productsMatch = selectedProducts.length === 0 || 
        selectedProducts.some(product => 
          market.products?.includes(product)
        );
      
      // Product type filters - match if any selected filter matches (OR logic)
      const productTypeMatch = !Object.values(productFilters).some(v => v) || 
        Object.entries(productFilters)
          .filter(([, value]) => value)
          .some(([key]) => market[key as keyof FarmerMarket]);
      
      // Payment methods - match if any selected payment method is available (OR logic)
      const paymentMatch = !Object.values(paymentFilters).some(v => v) || (
        (paymentFilters.wic && market.wic) ||
        (paymentFilters.snap && market.snap) ||
        (paymentFilters.sfmnp && market.sfmnp) ||
        (paymentFilters.fmnp && market.fmnp) ||
        (paymentFilters.cash && market.accepts_cash) ||
        (paymentFilters.credit && market.accepts_credit_debit) ||
        (paymentFilters.checks && market.accepts_checks)
      );
      
      // Amenities - match if any selected amenity is available (OR logic)
      const amenityMatch = !Object.values(amenityFilters).some(v => v) || (
        (amenityFilters.parking && market.has_parking) ||
        (amenityFilters.restrooms && market.has_restrooms) ||
        (amenityFilters.picnicArea && market.has_picnic_area) ||
        (amenityFilters.wheelchairAccessible && market.wheelchair_accessible) ||
        (amenityFilters.petFriendly && market.pet_friendly)
      );
      
      // Sales channels - match if any selected sales channel is available (OR logic)
      const salesMatch = !Object.values(salesFilters).some(v => v) || (
        (salesFilters.onlineOrdering && market.online_ordering_available) ||
        (salesFilters.phoneOrdering && market.phone_ordering) ||
        (salesFilters.csaAvailable && market.csa_available) ||
        (salesFilters.deliveryAvailable && market.delivery_available)
      );
      
      return (
        searchMatch && stateMatch && productsMatch &&
        productTypeMatch && paymentMatch && amenityMatch && salesMatch
      );
    });
    
    return filtered;
  }, [
    markets, searchTerm, selectedStates, selectedProducts,
    paymentFilters, productFilters, amenityFilters, salesFilters
  ]);
  
  // Apply filters when dependencies change
  useEffect(() => {
    const filteredResults = filterMarkets();
    onFilterChange(filteredResults);
  }, [filterMarkets, onFilterChange]);
  
  // Reset all filters
  const resetFilters = () => {
    setSearchTerm('');
    setSelectedStates([]);
    setSelectedProducts([]);
    setPaymentFilters({
      wic: false,
      snap: false,
      sfmnp: false,
      fmnp: false,
      cash: false,
      credit: false,
      checks: false
    });
    setProductFilters({
      has_fresh_produce: false,
      has_meat: false,
      has_dairy: false,
      has_eggs: false,
      has_seafood: false,
      has_baked_goods: false,
      has_herbs: false,
      has_crafts: false,
      has_prepared_food: false,
      has_flowers: false,
      has_honey: false,
      has_jams: false,
      has_wine: false,
      has_grass_fed: false,
      has_free_range: false,
      has_hormone_free: false
    });
    setAmenityFilters({
      parking: false,
      restrooms: false,
      picnicArea: false,
      wheelchairAccessible: false,
      petFriendly: false
    });
    setSalesFilters({
      onlineOrdering: false,
      phoneOrdering: false,
      csaAvailable: false,
      deliveryAvailable: false
    });
  };
  
  // Toggle a product filter
  const toggleProduct = (product: string) => {
    setSelectedProducts(prev => 
      prev.includes(product)
        ? prev.filter(p => p !== product)
        : [...prev, product]
    );
  };

  // Toggle a state filter
  const toggleState = (state: string) => {
    setSelectedStates(prev => 
      prev.includes(state)
        ? prev.filter(s => s !== state)
        : [...prev, state]
    );
  };
  
  return (
    <div className="bg-card rounded-lg border p-4 h-fit space-y-6">
      {/* Applied filters summary - moved to top */}
      {(selectedStates.length > 0 || selectedProducts.length > 0 || 
        Object.values(paymentFilters).some(v => v) ||
        Object.values(productFilters).some(v => v) ||
        Object.values(amenityFilters).some(v => v) ||
        Object.values(salesFilters).some(v => v)) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Applied Filters:</p>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={resetFilters}
              className="h-6 text-xs"
            >
              Reset All
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {selectedStates.map(state => (
              <Badge 
                key={state} 
                variant="secondary" 
                className="text-xs cursor-pointer hover:bg-destructive/20"
                onClick={() => toggleState(state)}
              >
                {state} ×
              </Badge>
            ))}
            {selectedProducts.map(product => (
              <Badge 
                key={product} 
                variant="secondary" 
                className="text-xs cursor-pointer hover:bg-destructive/20"
                onClick={() => toggleProduct(product)}
              >
                {product} ×
              </Badge>
            ))}
            {Object.entries(paymentFilters)
              .filter(([, value]) => value)
              .map(([key]) => (
                <Badge 
                  key={`payment-${key}`} 
                  variant="secondary" 
                  className="text-xs cursor-pointer hover:bg-destructive/20"
                  onClick={() => setPaymentFilters(prev => ({...prev, [key]: false}))}
                >
                  {key.toUpperCase()} ×
                </Badge>
              ))}
            {Object.entries(productFilters)
              .filter(([, value]) => value)
              .map(([key]) => (
                <Badge 
                  key={`product-${key}`} 
                  variant="secondary" 
                  className="text-xs cursor-pointer hover:bg-destructive/20"
                  onClick={() => setProductFilters(prev => ({...prev, [key]: false}))}
                >
                  {key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} ×
                </Badge>
              ))}
            {Object.entries(amenityFilters)
              .filter(([, value]) => value)
              .map(([key]) => (
                <Badge 
                  key={`amenity-${key}`} 
                  variant="secondary" 
                  className="text-xs cursor-pointer hover:bg-destructive/20"
                  onClick={() => setAmenityFilters(prev => ({...prev, [key]: false}))}
                >
                  {key} ×
                </Badge>
              ))}
            {Object.entries(salesFilters)
              .filter(([, value]) => value)
              .map(([key]) => (
                <Badge 
                  key={`sales-${key}`} 
                  variant="secondary" 
                  className="text-xs cursor-pointer hover:bg-destructive/20"
                  onClick={() => setSalesFilters(prev => ({...prev, [key]: false}))}
                >
                  {key} ×
                </Badge>
              ))}
          </div>
        </div>
      )}
      
      {/* Search input */}
      <div className="space-y-2">
        <Label htmlFor="search" className="text-sm font-medium">
          Search
        </Label>
        <Input 
          id="search" 
          placeholder="Search markets..."
          className="w-full"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      
      <Accordion type="multiple" className="w-full">
        {/* States filter */}
        <AccordionItem value="states">
          <AccordionTrigger className="text-sm font-medium">States</AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-1 gap-2 pt-2">
              {states.map(state => (
                <div key={state} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`state-${state}`} 
                    checked={selectedStates.includes(state)} 
                    onCheckedChange={() => toggleState(state)}
                  />
                  <Label htmlFor={`state-${state}`} className="text-sm">{state}</Label>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Products filter */}
        <AccordionItem value="products">
          <AccordionTrigger className="text-sm font-medium">Products</AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-1 gap-2 pt-2">
              {allProducts.map(product => (
                <div key={product} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`product-${product}`} 
                    checked={selectedProducts.includes(product)} 
                    onCheckedChange={() => toggleProduct(product)}
                  />
                  <Label htmlFor={`product-${product}`} className="text-sm">{product}</Label>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Payment Methods */}
        <AccordionItem value="payment">
          <AccordionTrigger className="text-sm font-medium">Payment Methods</AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-1 gap-2 pt-2">
              {Object.entries({
                wic: 'Accepts WIC',
                snap: 'Accepts SNAP',
                sfmnp: 'Accepts SFMNP',
                fmnp: 'Accepts FMNP',
                cash: 'Accepts Cash',
                credit: 'Accepts Credit/Debit',
                checks: 'Accepts Checks'
              }).map(([key, label]) => (
                <div key={key} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`payment-${key}`} 
                    checked={paymentFilters[key as keyof typeof paymentFilters]} 
                    onCheckedChange={(checked) => 
                      setPaymentFilters(prev => ({...prev, [key]: checked === true}))
                    }
                  />
                  <Label htmlFor={`payment-${key}`} className="text-sm">{label}</Label>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Product Types */}
        <AccordionItem value="productTypes">
          <AccordionTrigger className="text-sm font-medium">Product Types</AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-1 gap-2 pt-2">
              {Object.entries({
                has_fresh_produce: 'Fresh Produce',
                has_meat: 'Meat',
                has_dairy: 'Dairy',
                has_eggs: 'Eggs',
                has_seafood: 'Seafood',
                has_baked_goods: 'Baked Goods',
                has_herbs: 'Herbs',
                has_crafts: 'Crafts',
                has_prepared_food: 'Prepared Food',
                has_flowers: 'Flowers',
                has_honey: 'Honey',
                has_jams: 'Jams',
                has_wine: 'Wine'
              }).map(([key, label]) => (
                <div key={key} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`product-type-${key}`} 
                    checked={productFilters[key as keyof typeof productFilters]} 
                    onCheckedChange={(checked) => 
                      setProductFilters(prev => ({...prev, [key]: checked === true}))
                    }
                  />
                  <Label htmlFor={`product-type-${key}`} className="text-sm">{label}</Label>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Amenities */}
        <AccordionItem value="amenities">
          <AccordionTrigger className="text-sm font-medium">Amenities</AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-1 gap-2 pt-2">
              {Object.entries({
                parking: 'Parking Available',
                restrooms: 'Restrooms Available',
                picnicArea: 'Picnic Area',
                wheelchairAccessible: 'Wheelchair Accessible',
                petFriendly: 'Pet Friendly'
              }).map(([key, label]) => (
                <div key={key} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`amenity-${key}`} 
                    checked={amenityFilters[key as keyof typeof amenityFilters]} 
                    onCheckedChange={(checked) => 
                      setAmenityFilters(prev => ({...prev, [key]: checked === true}))
                    }
                  />
                  <Label htmlFor={`amenity-${key}`} className="text-sm">{label}</Label>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Sales Channels */}
        <AccordionItem value="sales">
          <AccordionTrigger className="text-sm font-medium">Sales Channels</AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-1 gap-2 pt-2">
              {Object.entries({
                onlineOrdering: 'Online Ordering',
                phoneOrdering: 'Phone Ordering',
                csaAvailable: 'CSA Available',
                deliveryAvailable: 'Delivery Available'
              }).map(([key, label]) => (
                <div key={key} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`sales-${key}`} 
                    checked={salesFilters[key as keyof typeof salesFilters]} 
                    onCheckedChange={(checked) => 
                      setSalesFilters(prev => ({...prev, [key]: checked === true}))
                    }
                  />
                  <Label htmlFor={`sales-${key}`} className="text-sm">{label}</Label>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
} 