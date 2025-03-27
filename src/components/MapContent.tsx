'use client';

import { useState, useCallback } from 'react';
import type { FarmerMarket } from '@/lib/api';
import { MapSearch } from '@/components/MapSearch';
import ClientMarketMap from '@/components/ClientMarketMap';
import { Card, CardContent } from "@/components/ui/card";

interface MapContentProps {
  markets: FarmerMarket[];
}

export function MapContent({ markets }: MapContentProps) {
  const [filteredMarkets, setFilteredMarkets] = useState<FarmerMarket[]>(markets);
  
  // Handle filter changes
  const handleFilterChange = useCallback((filtered: FarmerMarket[]) => {
    setFilteredMarkets(filtered);
  }, []);
  
  // For performance, limit the number of visible markers
  const visibleMarkets = filteredMarkets.slice(0, 500);
  
  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 md:py-12 space-y-6">
      <div className="relative z-20">
        <MapSearch 
          markets={markets}
          onFilterChange={handleFilterChange}
        />
      </div>
      
      <Card className="relative z-10">
        <CardContent className="p-4 sm:p-6">
          <ClientMarketMap 
            markets={visibleMarkets} 
            height="600px"
            key={visibleMarkets.length} // Force re-render when markers change
          />
          
          <div className="text-sm text-muted-foreground mt-4">
            <p>
              {filteredMarkets.length > visibleMarkets.length
                ? `Displaying ${visibleMarkets.length} of ${filteredMarkets.length} matching markets (for performance).`
                : `Displaying ${filteredMarkets.length} of ${markets.length} total markets.`}
              {' '}Click on a marker to see market details.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 