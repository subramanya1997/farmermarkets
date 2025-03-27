'use client';

import type { FarmerMarket } from '@/lib/api';
import dynamic from 'next/dynamic';
import { useEffect, useState, useRef } from 'react';

// Import the MarketMap component with dynamic loading to prevent SSR issues
const MarketMap = dynamic(() => import('@/components/MarketMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center w-full bg-muted rounded-md">
      <div className="py-8 text-center">
        <p className="text-muted-foreground">Loading map...</p>
      </div>
    </div>
  )
});

interface ClientMarketMapProps {
  markets: FarmerMarket[];
  height?: string;
}

export default function ClientMarketMap({ markets, height = '600px' }: ClientMarketMapProps) {
  const [isClient, setIsClient] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [hasCoordinates, setHasCoordinates] = useState(false);
  const marketsRef = useRef<FarmerMarket[]>(markets);
  
  useEffect(() => {
    // Update the ref when markets change
    marketsRef.current = markets;
  }, [markets]);
  
  useEffect(() => {
    setIsClient(true);
    
    // Check if we have markets with valid coordinates
    const marketsWithCoordinates = markets.filter(market => {
      return market.location?.lat && market.location?.lon;
    });
    
    setHasCoordinates(marketsWithCoordinates.length > 0);
    
    if (marketsWithCoordinates.length === 0) {
      console.error('No markets with valid coordinates found');
    }
    
    // Set up a timer to ensure the container has been properly rendered
    const timer = setTimeout(() => {
      setIsMapReady(true);
    }, 200);
    
    return () => {
      clearTimeout(timer);
    };
  }, [markets]);
  
  if (!isClient) {
    return (
      <div 
        style={{ height, width: '100%' }} 
        className="bg-muted rounded-md flex items-center justify-center"
      >
        <p className="text-center text-sm text-muted-foreground">
          Initializing map...
        </p>
      </div>
    );
  }
  
  if (!hasCoordinates) {
    return (
      <div 
        style={{ height, width: '100%' }} 
        className="bg-muted rounded-md flex items-center justify-center"
      >
        <p className="text-center text-sm text-muted-foreground">
          No markets with location coordinates found. Please check the data structure.
        </p>
      </div>
    );
  }
  
  if (!isMapReady) {
    return (
      <div 
        style={{ height, width: '100%' }} 
        className="bg-muted rounded-md flex items-center justify-center"
      >
        <p className="text-center text-sm text-muted-foreground">
          Preparing map view...
        </p>
      </div>
    );
  }
  
  // Use the ref value to prevent rendering issues with Leaflet
  return <MarketMap markets={marketsRef.current} height={height} />;
} 