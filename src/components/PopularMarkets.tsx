'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { MapPin, TrendingUp } from 'lucide-react';
import { MarketCard } from './MarketCard';
import { useGeolocation } from '@/hooks/useGeolocation';
import { calculateDistance } from '@/lib/utils';
import type { FarmerMarket } from '@/lib/api';

interface PopularMarketsProps {
  markets: FarmerMarket[];
  limit?: number;
}

export function PopularMarkets({ markets, limit = 6 }: PopularMarketsProps) {
  const { location, loading } = useGeolocation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate distances and sort by proximity
  const nearbyMarkets = useMemo(() => {
    if (!location || !markets) return markets.slice(0, limit);

    const marketsWithDistance = markets
      .filter(market => market.location?.lat && market.location?.lon)
      .map(market => {
        const distance = calculateDistance(
          location.lat,
          location.lon,
          market.location!.lat,
          market.location!.lon
        );
        return { ...market, distance };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);

    return marketsWithDistance;
  }, [markets, location, limit]);

  if (!mounted) {
    return null;
  }

  return (
    <section className="w-full py-12 md:py-16 lg:py-20 bg-white dark:bg-zinc-900">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col gap-6">
          {/* Section Header */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Popular Markets Near You
              </h2>
            </div>
            {location && !loading && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Showing highly-rated farmers markets near {location.city}, {location.state}
              </p>
            )}
            {!location && !loading && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Discover highly-rated farmers markets across the country
              </p>
            )}
            {loading && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Finding markets near you...
              </p>
            )}
          </div>

          {/* Markets Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {nearbyMarkets.map((market) => (
              <MarketCard key={market.id} market={market} />
            ))}
          </div>

          {/* View All Link */}
          <div className="flex justify-center pt-4">
            <Link
              href="/markets"
              className="inline-flex items-center gap-2 text-sm font-medium text-green-600 hover:text-green-700 dark:text-green-500 dark:hover:text-green-400"
            >
              View all farmers markets
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

