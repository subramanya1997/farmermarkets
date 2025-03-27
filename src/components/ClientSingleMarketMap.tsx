'use client';

import type { FarmerMarket } from '@/lib/api';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

// Import the SingleMarketMap component with dynamic loading to prevent SSR issues
const SingleMarketMap = dynamic(() => import('@/components/SingleMarketMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center w-full bg-muted rounded-md">
      <div className="py-8 text-center">
        <p className="text-muted-foreground">Loading map...</p>
      </div>
    </div>
  )
});

interface ClientSingleMarketMapProps {
  market: FarmerMarket;
  height?: string;
}

export default function ClientSingleMarketMap({ market, height = '300px' }: ClientSingleMarketMapProps) {
  const [isClient, setIsClient] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [hasCoordinates, setHasCoordinates] = useState(false);
  
  // Get coordinates from location object
  const latitude = market.location?.lat;
  const longitude = market.location?.lon;
  
  useEffect(() => {
    setIsClient(true);
    setHasCoordinates(!!latitude && !!longitude);
    
    if (!latitude || !longitude) {
      console.error('No coordinates found for market:', market.id);
    }
    
    // Set up a timer to ensure the container has been properly rendered
    const timer = setTimeout(() => {
      setIsMapReady(true);
    }, 200);
    
    return () => {
      clearTimeout(timer);
    };
  }, [latitude, longitude, market.id]);
  
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
          Location coordinates not available for this market
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
  
  return <SingleMarketMap market={market} height={height} />;
} 