'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { FarmerMarket } from '@/lib/api';
import 'leaflet/dist/leaflet.css';

// Fix for Leaflet marker icon issue in Next.js
let DefaultIcon: L.Icon;
if (typeof window !== 'undefined') {
  DefaultIcon = new L.Icon({
    iconUrl: '/marker-icon.png',
    iconRetinaUrl: '/marker-icon-2x.png',
    shadowUrl: '/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });
  L.Marker.prototype.options.icon = DefaultIcon;
}

interface MarketMapProps {
  markets: FarmerMarket[];
  center?: [number, number];
  zoom?: number;
  height?: string;
}

export default function MarketMap({ 
  markets, 
  center = [39.8283, -98.5795], // Default center of US
  zoom = 4,
  height = '500px'
}: MarketMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const [mapInitialized, setMapInitialized] = useState(false);
  
  // Create map instance with proper error handling
  useEffect(() => {
    // Only run this on the client side
    if (typeof window === 'undefined' || !mapRef.current) return;
    
    let mapInstance: L.Map | null = null;
    
    // Add small delay to ensure container is properly rendered
    const initializeMap = () => {
      // If map is already initialized, clean it up before reinitializing
      if (leafletMapRef.current) {
        try {
          leafletMapRef.current.remove();
        } catch (e) {
          console.error('Error removing previous map instance:', e);
        }
        leafletMapRef.current = null;
      }
      
      if (!mapRef.current) return;
      
      try {
        // Initialize the map with explicit options
        mapInstance = L.map(mapRef.current, {
          zoomControl: true,
          attributionControl: true,
          fadeAnimation: true,
          zoomAnimation: true
        }).setView(center, zoom);
        
        // Ensure map is properly sized
        mapInstance.invalidateSize();
        leafletMapRef.current = mapInstance;
        setMapInitialized(true);
        
        // Add the OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(mapInstance);
      } catch (error) {
        console.error('Error initializing map:', error);
      }
    };
    
    // Delay initialization slightly to ensure DOM is ready
    const timer = setTimeout(() => {
      initializeMap();
    }, 100);
    
    // Clean up on unmount
    return () => {
      clearTimeout(timer);
      if (leafletMapRef.current) {
        try {
          leafletMapRef.current.remove();
        } catch (e) {
          console.error('Error cleaning up map on unmount:', e);
        }
        leafletMapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount to prevent re-initialization issues
  
  // Handle resize to fix map issues when container size changes
  useEffect(() => {
    const handleResize = () => {
      if (leafletMapRef.current) {
        try {
          leafletMapRef.current.invalidateSize();
        } catch (e) {
          console.error('Error invalidating map size:', e);
        }
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    // Also invalidate size when component mounts
    if (leafletMapRef.current) {
      setTimeout(() => {
        try {
          leafletMapRef.current?.invalidateSize();
        } catch (e) {
          console.error('Error invalidating map size on mount:', e);
        }
      }, 100);
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [mapInitialized]);
  
  // Add markers when map is initialized or markets change
  useEffect(() => {
    // Only proceed if map is initialized
    if (!mapInitialized || !leafletMapRef.current) return;
    
    const map = leafletMapRef.current;
    
    try {
      // Create a bounds object to track marker positions
      const bounds = L.latLngBounds([]);
      let hasValidMarkers = false;
      
      // Clear any existing markers
      map.eachLayer((layer) => {
        if (layer instanceof L.Marker) {
          map.removeLayer(layer);
        }
      });
      
      // Add markers for each market
      markets.forEach(market => {
        // Get coordinates from location object
        const latitude = market.location?.lat;
        const longitude = market.location?.lon;
        const name = market.name;
        const city = market.city;
        const state = market.state;
        
        // Check if market has valid coordinates
        if (latitude && longitude) {
          const marker = L.marker([latitude, longitude]).addTo(map);
          marker.bindPopup(`
            <strong>${name}</strong><br>
            ${city}${city && state ? ', ' : ''}${state}<br>
            <a href="/markets/${market.id}">View Details</a>
          `);
          
          // Extend bounds to include this marker
          bounds.extend([latitude, longitude]);
          hasValidMarkers = true;
        }
      });
      
      // If we have valid markers, fit the map to show all of them
      if (hasValidMarkers) {
        map.fitBounds(bounds, {
          padding: [50, 50], // Add some padding around the bounds
          maxZoom: 12 // Don't zoom in too far
        });
      } else {
        // If no markers, show default view of US
        map.setView(center, zoom);
      }
    } catch (error) {
      console.error('Error adding markers to map:', error);
    }
  }, [markets, center, zoom, mapInitialized]);
  
  return (
    <div ref={mapRef} style={{ height, width: '100%' }} className="rounded-md overflow-hidden" />
  );
} 