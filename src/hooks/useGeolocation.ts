'use client';

import { useState, useEffect } from 'react';

export interface UserLocation {
  lat: number;
  lon: number;
  city?: string;
  state?: string;
  country?: string;
}

interface GeolocationState {
  location: UserLocation | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Hook to get user's approximate location using IP-based geolocation
 * No permissions required - uses free ipapi.co service
 */
export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    location: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    // Check if we have a cached location (less than 1 hour old)
    const cachedLocation = localStorage.getItem('user_location');
    const cacheTimestamp = localStorage.getItem('user_location_timestamp');
    
    if (cachedLocation && cacheTimestamp) {
      const age = Date.now() - parseInt(cacheTimestamp, 10);
      const oneHour = 60 * 60 * 1000;
      
      if (age < oneHour) {
        try {
          const location = JSON.parse(cachedLocation);
          setState({ location, loading: false, error: null });
          return;
        } catch {
          // Invalid cache, continue to fetch
        }
      }
    }

    // Fetch location from IP geolocation service
    const fetchLocation = async () => {
      try {
        // Using ipapi.co - free tier, no API key needed
        // Alternative: https://freeipapi.com/api/json
        const response = await fetch('https://ipapi.co/json/', {
          signal: AbortSignal.timeout(5000), // 5 second timeout
        });

        if (!response.ok) {
          throw new Error('Failed to fetch location');
        }

        const data = await response.json();

        const location: UserLocation = {
          lat: data.latitude,
          lon: data.longitude,
          city: data.city,
          state: data.region,
          country: data.country_name,
        };

        // Cache the location
        localStorage.setItem('user_location', JSON.stringify(location));
        localStorage.setItem('user_location_timestamp', Date.now().toString());

        setState({ location, loading: false, error: null });
      } catch (error) {
        console.error('Error fetching location:', error);
        setState({
          location: null,
          loading: false,
          error: error instanceof Error ? error : new Error('Unknown error'),
        });
      }
    };

    fetchLocation();
  }, []);

  return state;
}

