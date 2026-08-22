"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Map as MapIcon, Grid, Store, MapPin, Globe2 } from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import { MarketCard } from "@/components/MarketCard";
import { FilterBar } from "@/components/FilterBar";
import { DiscoverySurvey } from "@/components/DiscoverySurvey";
import dynamic from "next/dynamic";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useAllMarkets } from "@/hooks/useAllMarkets";
import { calculateDistance } from "@/lib/utils";
import { extractFilterOptions, applyFilters } from "@/lib/filters";
import { analyticsSafeSearchTerm, trackEvent } from "@/lib/analytics";
import { SITE_FRAME } from "@/lib/ui";

interface MarketsProps {
  title?: string;
  description?: string;
  hideHero?: boolean;
  /**
   * Set to false when the surrounding page already renders the discovery
   * survey — on `/markets` the server-rendered index owns it, so the explorer
   * must not open a second copy of the same dialog.
   */
  showDiscoverySurvey?: boolean;
}

const ITEMS_PER_PAGE = 30;

const MarketsMap = dynamic(() => import("@/components/MarketMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
    </div>
  ),
});

export function Markets({
  title = "Find Local Food Markets",
  description = "Discover farmers markets, public food markets, cooperatives, and other local-food places around the world",
  hideHero = false,
  showDiscoverySurvey = true
}: MarketsProps) {
  const { markets, loading: marketsLoading, error: marketsError } = useAllMarkets();
  const [view, setView] = useState('grid');
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const lastTrackedSearch = useRef('');
  const lastTrackedLocation = useRef('');
  
  // Get user's approximate location
  const { location, loading: locationLoading, error: locationError } = useGeolocation();
  
  const marketsInSelectedCountry = useMemo(() => (
    selectedCountry ? markets.filter((market) => market.country === selectedCountry) : markets
  ), [markets, selectedCountry]);

  // Product and payment counts should describe the country currently being viewed.
  const filterCategories = useMemo(
    () => extractFilterOptions(marketsInSelectedCountry),
    [marketsInSelectedCountry]
  );

  const countries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const market of markets) {
      if (!market.country) continue;
      counts.set(market.country, (counts.get(market.country) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [markets]);
  
  // Add distance to markets and sort by proximity
  const marketsWithDistance = useMemo(() => {
    if (!location) return markets;
    
    return markets.map(market => {
      if (market.location?.lat && market.location?.lon) {
        const distance = calculateDistance(
          location.lat,
          location.lon,
          market.location.lat,
          market.location.lon
        );
        return { ...market, distance };
      }
      return { ...market, distance: Infinity };
    }).sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
  }, [markets, location]);
  
  const filteredMarkets = useMemo(() => {
    let filtered = marketsWithDistance;
    
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(market => 
        [market.name, market.city, market.state, market.country, market.country_code, market.address]
          .some(field => field?.toLowerCase().includes(searchLower))
      );
    }

    if (selectedCountry) {
      filtered = filtered.filter((market) => market.country === selectedCountry);
    }
    
    return applyFilters(filtered, activeFilters, filterCategories);
  }, [marketsWithDistance, searchTerm, selectedCountry, activeFilters, filterCategories]);

  const totalPages = Math.ceil(filteredMarkets.length / ITEMS_PER_PAGE);

  useEffect(() => {
    const safeQuery = analyticsSafeSearchTerm(searchTerm);
    if (safeQuery.length < 2) return;

    const eventKey = [safeQuery, selectedCountry || 'All countries', filteredMarkets.length].join('|');
    const timer = window.setTimeout(() => {
      if (lastTrackedSearch.current === eventKey) return;
      lastTrackedSearch.current = eventKey;
      trackEvent('Market Search', {
        query: safeQuery,
        result_count: filteredMarkets.length,
        country: selectedCountry || 'All countries',
        sensitive_value_redacted: safeQuery === '[redacted]'
      });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [searchTerm, selectedCountry, filteredMarkets.length]);

  useEffect(() => {
    if (locationLoading) return;
    const locationKey = location
      ? [location.state, location.country].filter(Boolean).join('|')
      : 'unavailable';
    if (lastTrackedLocation.current === locationKey) return;
    lastTrackedLocation.current = locationKey;

    trackEvent(location ? 'Approximate Location Resolved' : 'Approximate Location Unavailable', {
      state: location?.state,
      country: location?.country,
      source: 'ip_lookup',
      reason: location ? undefined : locationError ? 'lookup_failed' : 'not_available'
    });
  }, [location, locationError, locationLoading]);

  const handleCountryChange = (country: string) => {
    setSelectedCountry(country);
    setActiveFilters(new Set());
    setPage(1);
    trackEvent('Country Filter Changed', { country: country || 'All countries' });
  };

  const handleFilterChange = (filters: Set<string>) => {
    setActiveFilters(filters);
    setPage(1);
  };

  const toggleView = () => {
    const nextView = view === 'grid' ? 'map' : 'grid';
    setView(nextView);
    trackEvent('Market View Changed', { view: nextView, result_count: filteredMarkets.length });
  };

  const changePage = (nextPage: number) => {
    setPage(nextPage);
    trackEvent('Market Results Page Changed', {
      page: nextPage,
      country: selectedCountry || 'All countries',
      result_count: filteredMarkets.length
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Memoize the current page items calculation to prevent unnecessary recalculation
  const currentMarkets = useMemo(() => {
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredMarkets.slice(startIndex, endIndex);
  }, [filteredMarkets, page]);

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Hero Section */}
      {!hideHero && (
        <section className="w-full py-8 sm:py-12 md:py-16 bg-gradient-to-b from-green-50 to-white dark:from-green-900/20 dark:to-zinc-950">
          <div className={SITE_FRAME}>
            <div className="flex flex-col items-center space-y-4 sm:space-y-6 text-center">
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tighter">
                {title}
              </h1>
              <p className="mx-auto max-w-[700px] text-sm sm:text-base md:text-lg text-zinc-600 dark:text-zinc-400">
                {description}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Google-style Search Bar */}
      <section className="sticky top-16 z-10 w-full py-4 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="w-full max-w-2xl mx-auto px-4 sm:px-6">
          {/* Location Indicator */}
          {location && !locationLoading && (
            <div className="mb-3 flex items-center justify-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <MapPin className="w-3 h-3" />
              <span>
                Showing markets near {location.city}, {location.state}
              </span>
            </div>
          )}
          
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <Input
                  type="text"
                  placeholder="Search markets by name, location..."
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setPage(1);
                  }}
                  className="pl-10 pr-4 py-2 w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div className="relative sm:w-56">
                <Globe2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                <label htmlFor="country-filter" className="sr-only">Country</label>
                <select
                  id="country-filter"
                  value={selectedCountry}
                  onChange={(event) => handleCountryChange(event.target.value)}
                  className="h-10 w-full appearance-none rounded-full border border-zinc-300 bg-white pl-9 pr-8 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  <option value="">All countries ({markets.length})</option>
                  {countries.map((country) => (
                    <option key={country.name} value={country.name}>
                      {country.name} ({country.count})
                    </option>
                  ))}
                </select>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-xs whitespace-nowrap"
                onClick={toggleView}
              >
                {view === 'grid' ? (
                  <>
                    <MapIcon className="w-4 h-4 mr-2" />
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
        </div>
      </section>

      {/* Linear Filter Bar */}
      <FilterBar 
        categories={filterCategories} 
        activeFilters={activeFilters}
        onFilterChange={handleFilterChange}
      />

      {/* Markets Grid/Map Section */}
      <section className="w-full py-8">
        <div className={SITE_FRAME}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {marketsLoading && markets.length === 0 ? (
                'Loading markets…'
              ) : (
                <>
                  {filteredMarkets.length.toLocaleString()} places
                  {selectedCountry ? ` in ${selectedCountry}` : ` across ${countries.length} countries and territories`}
                  {marketsLoading ? ' (still loading…)' : ''}
                </>
              )}
            </p>
          </div>
          {view === 'grid' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4 sm:gap-6">
                {currentMarkets.map((market) => (
                  <MarketCard key={market.id} market={market} />
                ))}
              </div>
              {filteredMarkets.length === 0 && marketsLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
                </div>
              )}
              {filteredMarkets.length === 0 && !marketsLoading && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Store className="w-12 h-12 text-zinc-400 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    {marketsError ? 'Could Not Load Markets' : 'No Markets Found'}
                  </h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-[500px]">
                    {marketsError
                      ? 'The market data could not be loaded. Reload the page, or browse the full directory below.'
                      : 'Try adjusting your search, country, or filters to find local-food places.'}
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

      {showDiscoverySurvey && (
        <DiscoverySurvey
          selectedCountry={selectedCountry || 'All countries'}
          resultCount={filteredMarkets.length}
        />
      )}

      {/* Pagination Section */}
      {filteredMarkets.length > 0 && (
        <section className="w-full py-4 sm:py-6">
          <div className={SITE_FRAME}>
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => changePage(page - 1)}
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
                onClick={() => changePage(page + 1)}
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
