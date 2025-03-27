'use client';

import { useState, useEffect } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { FarmerMarket } from '@/lib/api';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface MapSearchProps {
  markets: FarmerMarket[];
  onFilterChange: (filtered: FarmerMarket[]) => void;
}

export function MapSearch({ markets, onFilterChange }: MapSearchProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedState, setSelectedState] = useState('all');
  
  // Extract all states from the markets data
  const states = Array.from(new Set(
    markets
      .map(market => market.state)
      .filter(Boolean) as string[]
  )).sort();
  
  // Filter markets based on search and filter criteria
  useEffect(() => {
    const filtered = markets.filter(market => {
      // Search by name, city, state, address
      const name = market.name;
      const city = market.city || '';
      const state = market.state || '';
      const address = market.address || '';
      
      const searchMatch = !searchTerm || 
        name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        city.toLowerCase().includes(searchTerm.toLowerCase()) ||
        state.toLowerCase().includes(searchTerm.toLowerCase()) ||
        address.toLowerCase().includes(searchTerm.toLowerCase());
      
      // State filter
      const stateMatch = selectedState === 'all' || 
        state.toLowerCase() === selectedState.toLowerCase();
      
      return searchMatch && stateMatch;
    });
    
    onFilterChange(filtered);
  }, [markets, searchTerm, selectedState, onFilterChange]);
  
  // Reset all filters
  const resetFilters = () => {
    setSearchTerm('');
    setSelectedState('all');
  };
  
  return (
    <div className="bg-card rounded-lg border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Search Markets</h2>
        {(searchTerm || selectedState !== 'all') && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={resetFilters}
            className="h-8 text-xs"
          >
            Reset
          </Button>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Search input */}
        <div className="space-y-2">
          <Input 
            placeholder="Search markets..."
            className="w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        {/* State filter */}
        <div className="space-y-2">
          <Select
            value={selectedState}
            onValueChange={setSelectedState}
          >
            <SelectTrigger id="state" className="w-full">
              <SelectValue placeholder="All States" />
            </SelectTrigger>
            <SelectContent className="z-50">
              <SelectItem value="all">All States</SelectItem>
              {states.map(state => (
                <SelectItem key={state} value={state}>{state}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Applied filters summary */}
      {(searchTerm || selectedState !== 'all') && (
        <div className="pt-2">
          <div className="flex flex-wrap gap-1">
            {searchTerm && (
              <Badge variant="secondary" className="text-xs">
                Search: {searchTerm}
              </Badge>
            )}
            {selectedState !== 'all' && (
              <Badge variant="secondary" className="text-xs">
                State: {selectedState}
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 