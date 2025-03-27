'use client';

import { useEffect, useRef } from 'react';
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

interface SingleMarketMapProps {
  market: FarmerMarket;
  height?: string;
}

export default function SingleMarketMap({ 
  market, 
  height = '300px'
}: SingleMarketMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);

  // Get coordinates from location object
  const latitude = market.location?.lat;
  const longitude = market.location?.lon;
  const name = market.name;
  const city = market.city;
  const state = market.state;

  useEffect(() => {
    // Only run this on the client side
    if (typeof window === 'undefined' || !mapRef.current || !latitude || !longitude) return;

    // Add small delay to ensure container is properly sized and ready
    const initializeMap = () => {
      // If map is already initialized, clean it up before reinitializing
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }

      if (!mapRef.current) return;

      // Initialize the map
      const coordinates: [number, number] = [latitude, longitude];
      
      try {
        // Create map with invalidateSize called after creation
        const map = L.map(mapRef.current, {
          zoomControl: true,
          attributionControl: true
        }).setView(coordinates, 13); // Zoom level 13 for closer view
        
        map.invalidateSize();
        leafletMapRef.current = map;

        // Add the OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        // Add a marker for the market
        const marker = L.marker(coordinates).addTo(map);
        marker.bindPopup(`
          <strong>${name}</strong><br>
          ${city}${city && state ? ', ' : ''}${state}
        `).openPopup();
      } catch (error) {
        console.error('Error initializing Leaflet map:', error);
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
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, [market, latitude, longitude, name, city, state]); // Re-run when market changes

  // Handle resize to fix map issues when container size changes
  useEffect(() => {
    const handleResize = () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.invalidateSize();
      }
    };

    window.addEventListener('resize', handleResize);
    
    // Also invalidate size when component mounts
    if (leafletMapRef.current) {
      leafletMapRef.current.invalidateSize();
    }

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  if (!latitude || !longitude) {
    return (
      <div 
        style={{ height, width: '100%' }} 
        className="bg-muted rounded-md flex items-center justify-center"
      >
        <p className="text-center text-sm text-muted-foreground">
          Map data not available
        </p>
      </div>
    );
  }

  return (
    <div ref={mapRef} style={{ height, width: '100%' }} className="rounded-md overflow-hidden" />
  );
} 