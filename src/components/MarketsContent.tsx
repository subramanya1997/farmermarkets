'use client';

import { useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import type { FarmerMarket } from '@/lib/api';
import { MarketCard } from '@/components/MarketCard';
import { MarketFilters } from '@/components/MarketFilters';
import { 
  Pagination, 
  PaginationContent, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious 
} from "@/components/ui/pagination";
import { Button } from '@/components/ui/button';

interface MarketsContentProps {
  markets: FarmerMarket[];
}

export function MarketsContent({ markets }: MarketsContentProps) {
  const searchParams = useSearchParams();
  const [filteredMarkets, setFilteredMarkets] = useState<FarmerMarket[]>(markets);
  const [currentPage, setCurrentPage] = useState(1);
  const marketsPerPage = 24;
  
  // If there's a search term in the URL, pass it to the filter component
  const urlSearchTerm = searchParams.get('search');
  
  // Calculate pagination
  const totalPages = Math.ceil(filteredMarkets.length / marketsPerPage);
  const indexOfLastMarket = currentPage * marketsPerPage;
  const indexOfFirstMarket = indexOfLastMarket - marketsPerPage;
  const currentMarkets = filteredMarkets.slice(indexOfFirstMarket, indexOfLastMarket);
  
  // Handle filter changes - memoize with useCallback
  const handleFilterChange = useCallback((filtered: FarmerMarket[]) => {
    setFilteredMarkets(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  }, []);
  
  // Page change handlers
  const goToPage = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  const goToPreviousPage = () => {
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  };
  
  const goToNextPage = () => {
    if (currentPage < totalPages) {
      goToPage(currentPage + 1);
    }
  };
  
  // Generate pagination numbers
  const generatePaginationItems = () => {
    const items = [];
    const maxPagesToShow = 5;
    
    // Logic to determine which pages to show
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    const endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
    
    // Adjust startPage if we're near the end
    startPage = Math.max(1, endPage - maxPagesToShow + 1);
    
    // First page
    if (startPage > 1) {
      items.push(
        <PaginationItem key="1">
          <PaginationLink onClick={() => goToPage(1)}>1</PaginationLink>
        </PaginationItem>
      );
      
      // Ellipsis if not starting at page 2
      if (startPage > 2) {
        items.push(
          <PaginationItem key="ellipsis1">
            <span className="px-4">...</span>
          </PaginationItem>
        );
      }
    }
    
    // Page numbers
    for (let page = startPage; page <= endPage; page++) {
      items.push(
        <PaginationItem key={page}>
          <PaginationLink 
            onClick={() => goToPage(page)}
            isActive={page === currentPage}
          >
            {page}
          </PaginationLink>
        </PaginationItem>
      );
    }
    
    // Last page
    if (endPage < totalPages) {
      // Ellipsis if not ending at one page before last
      if (endPage < totalPages - 1) {
        items.push(
          <PaginationItem key="ellipsis2">
            <span className="px-4">...</span>
          </PaginationItem>
        );
      }
      
      items.push(
        <PaginationItem key={totalPages}>
          <PaginationLink onClick={() => goToPage(totalPages)}>
            {totalPages}
          </PaginationLink>
        </PaginationItem>
      );
    }
    
    return items;
  };
  
  return (
    <div className="grid gap-6 md:grid-cols-[280px_1fr]">
      {/* Filters */}
      <div>
        <MarketFilters 
          markets={markets} 
          onFilterChange={handleFilterChange}
          initialSearchTerm={urlSearchTerm || ''}
        />
      </div>
      
      {/* Markets Grid */}
      <div>
        {filteredMarkets.length > 0 ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {currentMarkets.length} of {filteredMarkets.length} markets
              </p>
              <div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setFilteredMarkets([...filteredMarkets].sort((a, b) => {
                    const nameA = a.name.toLowerCase();
                    const nameB = b.name.toLowerCase();
                    return nameA.localeCompare(nameB);
                  }))}
                  className="mr-2"
                >
                  Sort A-Z
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setFilteredMarkets([...filteredMarkets].sort((a, b) => {
                    const stateA = (a.state || '').toLowerCase();
                    const stateB = (b.state || '').toLowerCase();
                    return stateA.localeCompare(stateB);
                  }))}
                >
                  Sort by State
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
              {currentMarkets.map((market) => (
                <MarketCard key={market.id} market={market} />
              ))}
            </div>
            
            {totalPages > 1 && (
              <div className="mt-8">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={goToPreviousPage}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    
                    {generatePaginationItems()}
                    
                    <PaginationItem>
                      <PaginationNext 
                        onClick={goToNextPage}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 bg-muted/50 rounded-lg border border-dashed">
            <h3 className="font-medium text-lg">No markets found</h3>
            <p className="text-muted-foreground mt-1">Try adjusting your filters</p>
          </div>
        )}
      </div>
    </div>
  );
} 