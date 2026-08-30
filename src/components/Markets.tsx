"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FarmerMarket } from "@/lib/api";
import { Search, Map as MapIcon, Grid, Store, MapPin, Globe2, ArrowUpDown, SlidersHorizontal } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect, useMemo, useRef } from "react";
import { MarketCard } from "@/components/MarketCard";
import { FilterBar } from "@/components/FilterBar";
import { DiscoverySurvey } from "@/components/DiscoverySurvey";
import dynamic from "next/dynamic";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useAllMarkets } from "@/hooks/useAllMarkets";
import { calculateDistance } from "@/lib/utils";
import { extractFilterOptions, applyFilters } from "@/lib/filters";
import { searchMarkets, listingSortKey } from "@/lib/marketSearch";
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

/**
 * Must stay a multiple of 12: the results grid renders 2, 3, 4, or 6 columns
 * depending on viewport, and 12 is the smallest count they all divide, so a
 * full page never ends on a ragged row (30 left a 2-card row at 4 columns).
 */
const ITEMS_PER_PAGE = 36;

/** Radix Select forbids `""` as an item value, so "all countries" needs a sentinel. */
const ALL_COUNTRIES_VALUE = 'all';

/** Cards shown beside the map, mirroring what the current view displays. */
const MAP_LIST_SIZE = 20;

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
  // Seeded from `?search=` so the homepage search bar (and the WebSite
  // SearchAction schema) land here with the query applied. Safe to read
  // `window` directly: this component is loaded with `ssr: false`.
  const [searchTerm, setSearchTerm] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : new URLSearchParams(window.location.search).get('search') ?? ''
  );
  const [selectedCountry, setSelectedCountry] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [sortOrder, setSortOrder] = useState<'nearest' | 'name'>('nearest');
  // Markets inside the map's current viewport, closest first (fed by the map).
  const [mapVisibleMarkets, setMapVisibleMarkets] = useState<FarmerMarket[]>([]);
  const lastTrackedSearch = useRef('');
  const lastTrackedLocation = useRef('');
  
  // Get user's approximate location
  const { location, loading: locationLoading, error: locationError } = useGeolocation();

  // Stable reference: a fresh array literal per render would re-trigger the
  // map's recenter effect (and its moveend events) in a loop.
  const mapCenter = useMemo<[number, number] | undefined>(
    () => (location ? [location.lat, location.lon] : undefined),
    [location]
  );
  
  const marketsInSelectedCountry = useMemo(() => (
    selectedCountry ? markets.filter((market) => market.country === selectedCountry) : markets
  ), [markets, selectedCountry]);

  // Product and payment counts should describe the country currently being viewed.
  const filterCategories = useMemo(
    () => extractFilterOptions(marketsInSelectedCountry),
    [marketsInSelectedCountry]
  );

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

  const countries = useMemo(() => {
    // Rank countries by how close their nearest market is to the reader, so
    // the dropdown leads with where they are. With no location every
    // distance is Infinity and the list falls back to alphabetical.
    const stats = new Map<string, { count: number; nearest: number }>();
    for (const market of marketsWithDistance) {
      if (!market.country) continue;
      const distance = market.distance ?? Infinity;
      const entry = stats.get(market.country);
      if (entry) {
        entry.count += 1;
        if (distance < entry.nearest) entry.nearest = distance;
      } else {
        stats.set(market.country, { count: 1, nearest: distance });
      }
    }
    return [...stats.entries()]
      .map(([name, { count, nearest }]) => ({ name, count, nearest }))
      .sort((left, right) =>
        left.nearest !== right.nearest
          ? left.nearest - right.nearest
          : left.name.localeCompare(right.name)
      );
  }, [marketsWithDistance]);
  
  const filteredMarkets = useMemo(() => {
    let filtered = marketsWithDistance;

    // Relevance-ranked search: field-weighted text match, plus verification
    // and proximity boosts (`src/lib/marketSearch.ts`).
    if (searchTerm) {
      filtered = searchMarkets(filtered, searchTerm);
    }

    if (selectedCountry) {
      filtered = filtered.filter((market) => market.country === selectedCountry);
    }

    filtered = applyFilters(filtered, activeFilters, filterCategories);

    if (sortOrder === 'name') {
      // A-Z is an explicit browse order; keep it purely alphabetical.
      filtered = [...filtered].sort((left, right) =>
        left.name.localeCompare(right.name, 'en', { sensitivity: 'base' })
      );
    } else if (!searchTerm) {
      // Browse listing: nearest first, with recently supported records
      // ranked ahead of unconfirmed ones and dropped records last.
      filtered = [...filtered].sort((left, right) => listingSortKey(left) - listingSortKey(right));
    }
    // With a search term under "nearest first", the relevance order already
    // folds distance and verification in, so it stands as-is.

    return filtered;
  }, [marketsWithDistance, searchTerm, selectedCountry, activeFilters, filterCategories, sortOrder]);

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

  // Filter toggle for the phone options sheet (the desktop FilterBar has its
  // own copy of this, with the same analytics event).
  const toggleSheetFilter = (filterId: string) => {
    const next = new Set(activeFilters);
    const enabled = !next.has(filterId);
    if (enabled) {
      next.add(filterId);
    } else {
      next.delete(filterId);
    }
    handleFilterChange(next);
    trackEvent('Market Filter Changed', { filter: filterId, enabled });
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
        <div className={SITE_FRAME}>
          <div className="flex flex-col gap-3">
            {/* One row on every size. Phones: search takes ~75% and the other
                controls collapse into one options sheet. Mid-size screens:
                icon-only controls. Large screens: full labels. */}
            <div className="flex flex-row items-center gap-2">
              <div className="relative min-w-0 flex-1">
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
              <Select
                value={selectedCountry || ALL_COUNTRIES_VALUE}
                onValueChange={(value) =>
                  handleCountryChange(value === ALL_COUNTRIES_VALUE ? '' : value)
                }
              >
                <SelectTrigger
                  aria-label="Country"
                  className="hidden h-10 w-auto shrink-0 rounded-full border-zinc-300 bg-white pl-3 data-[size=default]:h-10 dark:border-zinc-700 dark:bg-zinc-800 md:flex lg:w-56"
                >
                  <Globe2 className="h-4 w-4 shrink-0 text-zinc-400" />
                  <span className="hidden flex-1 truncate text-left lg:block">
                    <SelectValue />
                  </span>
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={ALL_COUNTRIES_VALUE}>
                    All countries ({markets.length})
                  </SelectItem>
                  {countries.map((country) => (
                    <SelectItem key={country.name} value={country.name}>
                      {country.name} ({country.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={sortOrder}
                onValueChange={(value) => {
                  setSortOrder(value as 'nearest' | 'name');
                  setPage(1);
                  trackEvent('Market Sort Changed', { sort: value });
                }}
              >
                <SelectTrigger
                  aria-label="Sort markets"
                  className="hidden h-10 w-auto shrink-0 rounded-full border-zinc-300 bg-white pl-3 data-[size=default]:h-10 dark:border-zinc-700 dark:bg-zinc-800 md:flex lg:w-44"
                >
                  <ArrowUpDown className="h-4 w-4 shrink-0 text-zinc-400" />
                  <span className="hidden flex-1 truncate text-left lg:block">
                    <SelectValue />
                  </span>
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="nearest">Nearest first</SelectItem>
                  <SelectItem value="name">Name A-Z</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                aria-label={view === 'grid' ? 'Map view' : 'Grid view'}
                className="hidden h-10 shrink-0 whitespace-nowrap rounded-full border-zinc-300 bg-white px-3 text-sm font-normal dark:border-zinc-700 dark:bg-zinc-800 md:flex lg:px-4"
                onClick={toggleView}
              >
                {view === 'grid' ? (
                  <>
                    <MapIcon className="h-4 w-4 lg:mr-2" />
                    <span className="hidden lg:inline">Map View</span>
                  </>
                ) : (
                  <>
                    <Grid className="h-4 w-4 lg:mr-2" />
                    <span className="hidden lg:inline">Grid View</span>
                  </>
                )}
              </Button>

              {/* Phone: view, sort, country, and filters fold into one sheet. */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    aria-label="View, sort, country, and filter options"
                    className="relative h-10 w-10 shrink-0 rounded-full border-zinc-300 bg-white p-0 dark:border-zinc-700 dark:bg-zinc-800 md:hidden"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    {activeFilters.size > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-green-600 px-1 text-[10px] font-semibold text-white">
                        {activeFilters.size}
                      </span>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl">
                  <SheetHeader className="pb-0">
                    <SheetTitle>Options</SheetTitle>
                  </SheetHeader>
                  <div className="overflow-y-auto px-4 pb-8">
                    <div className="space-y-6">
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          View
                        </p>
                        <Tabs
                          value={view}
                          onValueChange={(value) => value !== view && toggleView()}
                        >
                          <TabsList className="h-11 w-full rounded-full p-1">
                            <TabsTrigger value="grid" className="rounded-full">
                              <Grid className="mr-2 h-4 w-4" />
                              Grid
                            </TabsTrigger>
                            <TabsTrigger value="map" className="rounded-full">
                              <MapIcon className="mr-2 h-4 w-4" />
                              Map
                            </TabsTrigger>
                          </TabsList>
                        </Tabs>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          Sort
                        </p>
                        <Tabs
                          value={sortOrder}
                          onValueChange={(value) => {
                            setSortOrder(value as 'nearest' | 'name');
                            setPage(1);
                            trackEvent('Market Sort Changed', { sort: value });
                          }}
                        >
                          <TabsList className="h-11 w-full rounded-full p-1">
                            <TabsTrigger value="nearest" className="rounded-full">
                              Nearest first
                            </TabsTrigger>
                            <TabsTrigger value="name" className="rounded-full">
                              Name A-Z
                            </TabsTrigger>
                          </TabsList>
                        </Tabs>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          Country
                        </p>
                        <Select
                          value={selectedCountry || ALL_COUNTRIES_VALUE}
                          onValueChange={(value) =>
                            handleCountryChange(value === ALL_COUNTRIES_VALUE ? '' : value)
                          }
                        >
                          <SelectTrigger className="w-full rounded-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent position="popper">
                            <SelectItem value={ALL_COUNTRIES_VALUE}>
                              All countries ({markets.length})
                            </SelectItem>
                            {countries.map((country) => (
                              <SelectItem key={country.name} value={country.name}>
                                {country.name} ({country.count})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {filterCategories.map((category) => (
                        <div key={category.id}>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                            {category.label}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {category.options.map((option) => {
                              const Icon = option.icon;
                              const isActive = activeFilters.has(option.id);
                              return (
                                <button
                                  key={option.id}
                                  onClick={() => toggleSheetFilter(option.id)}
                                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors ${
                                    isActive
                                      ? 'border-green-500 bg-green-50 text-green-700 dark:border-green-600 dark:bg-green-900/20 dark:text-green-500'
                                      : 'border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                                  }`}
                                >
                                  <Icon className="h-4 w-4" />
                                  {option.label}
                                  {option.count !== undefined && (
                                    <span className={`text-xs ${isActive ? 'text-green-600 dark:text-green-400' : 'text-zinc-500'}`}>
                                      ({option.count})
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      {activeFilters.size > 0 && (
                        <Button
                          variant="outline"
                          className="w-full rounded-full"
                          onClick={() => {
                            handleFilterChange(new Set());
                            trackEvent('Market Filters Cleared', {
                              previous_filter_count: activeFilters.size,
                            });
                          }}
                        >
                          Clear all filters ({activeFilters.size})
                        </Button>
                      )}
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
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
            <div className="flex h-[calc(100vh-16rem)] gap-4">
              {/* What the map shows, as cards: closest first, desktop only. */}
              <div className="hidden w-1/2 flex-col lg:flex">
                <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {mapVisibleMarkets.length === 0
                    ? 'No markets in this map view. Pan or zoom out to find some.'
                    : `Closest ${Math.min(mapVisibleMarkets.length, MAP_LIST_SIZE)} of ${mapVisibleMarkets.length.toLocaleString()} markets in view`}
                </p>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="grid grid-cols-1 gap-3 pr-3 xl:grid-cols-2">
                    {mapVisibleMarkets.slice(0, MAP_LIST_SIZE).map((market) => (
                      <MarketCard key={market.id} market={market} />
                    ))}
                  </div>
                </ScrollArea>
              </div>
              {/* Zoom 9 shows roughly a 50 mile radius around the reader; the
                  map itself only renders markers inside the current view. */}
              <div className="h-full w-full overflow-hidden rounded-lg lg:w-1/2">
                <MarketsMap
                  markets={filteredMarkets}
                  height="100%"
                  center={mapCenter}
                  zoom={location ? 9 : undefined}
                  onVisibleMarketsChange={setMapVisibleMarkets}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Location note lives down here so the search bar keeps the space. */}
      {location && !locationLoading && (
        <div className="flex items-center justify-center gap-1.5 pb-4 text-xs text-zinc-500 dark:text-zinc-400">
          <MapPin className="h-3 w-3" />
          <span>
            Showing markets near {location.city}, {location.state}
          </span>
        </div>
      )}

      {showDiscoverySurvey && (
        <DiscoverySurvey
          selectedCountry={selectedCountry || 'All countries'}
          resultCount={filteredMarkets.length}
        />
      )}

      {/* Pagination Section (grid only: the map paginates by panning) */}
      {view === 'grid' && filteredMarkets.length > 0 && (
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
