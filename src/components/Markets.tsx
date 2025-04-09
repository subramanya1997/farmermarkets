"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Map, Grid, Store } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { MarketCard } from "@/components/MarketCard";
import dynamic from "next/dynamic";
import type { FarmerMarket } from "@/lib/api";

interface MarketsProps {
  markets: FarmerMarket[];
}

const MarketsMap = dynamic(() => import("@/components/ClientMarketMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
    </div>
  ),
});

export function Markets({ markets }: MarketsProps) {
  const [view, setView] = useState('grid');
  const [page, setPage] = useState(1);
  const [itemsPerPage] = useState(30);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredMarkets, setFilteredMarkets] = useState<FarmerMarket[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  
  // Filter markets based on search term
  useEffect(() => {
    const filtered = markets.filter(market => {
      if (!searchTerm) return true;
      
      const searchLower = searchTerm.toLowerCase();
      return [
        market.name,
        market.city,
        market.state,
        market.address
      ].some(field => field?.toLowerCase().includes(searchLower));
    });
    
    setFilteredMarkets(filtered);
    setPage(1); // Reset to first page when search changes
    setTotalPages(Math.ceil(filtered.length / itemsPerPage));
  }, [markets, searchTerm, itemsPerPage]);

  // Memoize the current page items calculation to prevent unnecessary recalculation
  const currentMarkets = useMemo(() => {
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredMarkets.slice(startIndex, endIndex);
  }, [filteredMarkets, page, itemsPerPage]);

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Hero Section */}
      <section className="w-full py-8 sm:py-12 md:py-16 bg-gradient-to-b from-green-50 to-white dark:from-green-900/20 dark:to-zinc-950">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col items-center space-y-4 sm:space-y-6 text-center">
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tighter">
              Find Local Farmers Markets
            </h1>
            <p className="mx-auto max-w-[700px] text-sm sm:text-base md:text-lg text-zinc-600 dark:text-zinc-400">
              Discover fresh produce and artisanal goods at farmers markets near you
            </p>
          </div>
        </div>
      </section>

      {/* Google-style Search Bar */}
      <section className="sticky top-16 z-10 w-full py-4 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="w-full max-w-2xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <Input
                type="text"
                placeholder="Search markets by name, location..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-xs whitespace-nowrap"
              onClick={() => setView(view === 'grid' ? 'map' : 'grid')}
            >
              {view === 'grid' ? (
                <>
                  <Map className="w-4 h-4 mr-2" />
                  Map View
                </>
              ) : (
                <>
                  <Grid className="w-4 h-4 mr-2" />
                  Grid View
                </>
              )}
            </Button>
          </div>
        </div>
      </section>

      {/* Markets Grid/Map Section */}
      <section className="w-full py-8">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6">
          {view === 'grid' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {currentMarkets.map((market) => (
                  <MarketCard key={market.id} market={market} />
                ))}
              </div>
              {filteredMarkets.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Store className="w-12 h-12 text-zinc-400 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Markets Found</h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-[500px]">
                    Try adjusting your search or filters to find farmers markets in your area.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-[calc(100vh-16rem)] rounded-lg overflow-hidden">
              <MarketsMap markets={filteredMarkets} />
            </div>
          )}
        </div>
      </section>

      {/* Pagination Section */}
      {filteredMarkets.length > 0 && (
        <section className="w-full py-4 sm:py-6">
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
} 