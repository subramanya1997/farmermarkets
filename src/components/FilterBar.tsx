'use client';

import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ChevronDown } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet';
import type { FilterCategory } from '@/lib/filters';
import { trackEvent } from '@/lib/analytics';
import { SITE_FRAME } from "@/lib/ui";

interface FilterBarProps {
  categories: FilterCategory[];
  activeFilters: Set<string>;
  onFilterChange: (filters: Set<string>) => void;
}

export function FilterBar({ categories, activeFilters, onFilterChange }: FilterBarProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleFilter = (filterId: string) => {
    const newFilters = new Set(activeFilters);
    const enabled = !newFilters.has(filterId);
    if (newFilters.has(filterId)) {
      newFilters.delete(filterId);
    } else {
      newFilters.add(filterId);
    }
    onFilterChange(newFilters);
    trackEvent('Market Filter Changed', { filter: filterId, enabled });
  };

  const clearFilters = () => {
    onFilterChange(new Set());
    trackEvent('Market Filters Cleared', { previous_filter_count: activeFilters.size });
  };

  if (!mounted) {
    return null;
  }

  return (
    <div className="w-full bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
      <div className={`${SITE_FRAME} py-3`}>
        {/* Mobile Filter Button */}
        <div className="md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="w-full">
                <ChevronDown className="w-4 h-4 mr-2" />
                Filters
                {activeFilters.size > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {activeFilters.size}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[80vh]">
              <SheetHeader>
                <SheetTitle>Filter Markets</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-6 overflow-y-auto max-h-[calc(80vh-100px)]">
                {categories.map((category) => (
                  <div key={category.id}>
                    <h3 className="text-sm font-semibold mb-3">{category.label}</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {category.options.map((option) => {
                        const Icon = option.icon;
                        const isActive = activeFilters.has(option.id);
                        return (
                          <button
                            key={option.id}
                            onClick={() => toggleFilter(option.id)}
                            className={`flex flex-col items-center p-3 rounded-lg border transition-all ${
                              isActive
                                ? 'bg-green-50 border-green-500 dark:bg-green-900/20 dark:border-green-600'
                                : 'bg-white border-zinc-200 dark:bg-zinc-800 dark:border-zinc-700 hover:border-green-300 dark:hover:border-green-700'
                            }`}
                          >
                            <Icon className={`w-5 h-5 mb-1 ${isActive ? 'text-green-600' : 'text-zinc-600 dark:text-zinc-400'}`} />
                            <span className={`text-xs text-center ${isActive ? 'text-green-700 dark:text-green-500 font-medium' : 'text-zinc-700 dark:text-zinc-300'}`}>
                              {option.label}
                            </span>
                            {option.count !== undefined && (
                              <span className="text-[10px] text-zinc-500 mt-0.5">
                                {option.count}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {activeFilters.size > 0 && (
                  <Button onClick={clearFilters} variant="outline" className="w-full">
                    Clear All Filters
                  </Button>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Desktop Linear Filter Bar */}
        <div className="hidden md:flex items-center gap-3 overflow-x-auto pb-2">
          {categories.map((category) => (
            <div key={category.id} className="flex items-center gap-2">
              {category.options.map((option) => {
                const Icon = option.icon;
                const isActive = activeFilters.has(option.id);
                return (
                  <button
                    key={option.id}
                    onClick={() => toggleFilter(option.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all whitespace-nowrap ${
                      isActive
                        ? 'bg-green-50 border-green-500 text-green-700 dark:bg-green-900/20 dark:border-green-600 dark:text-green-500'
                        : 'bg-white border-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 hover:border-green-300 dark:hover:border-green-700'
                    }`}
                    title={option.label}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-sm">{option.label}</span>
                    {option.count !== undefined && (
                      <span className={`text-xs ${isActive ? 'text-green-600 dark:text-green-400' : 'text-zinc-500'}`}>
                        ({option.count})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          {activeFilters.size > 0 && (
            <Button onClick={clearFilters} variant="ghost" size="sm" className="text-xs">
              Clear ({activeFilters.size})
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
