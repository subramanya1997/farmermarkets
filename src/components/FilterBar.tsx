'use client';

import { Button } from './ui/button';
import { ScrollArea, ScrollBar } from './ui/scroll-area';
import type { FilterCategory } from '@/lib/filters';
import { trackEvent } from '@/lib/analytics';
import { SITE_FRAME } from "@/lib/ui";

interface FilterBarProps {
  categories: FilterCategory[];
  activeFilters: Set<string>;
  onFilterChange: (filters: Set<string>) => void;
}

export function FilterBar({ categories, activeFilters, onFilterChange }: FilterBarProps) {
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

  return (
    // Desktop-only: on phones the explorer folds these filters into its
    // single options sheet.
    <div className="hidden w-full border-b border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-900">
      <div className={`${SITE_FRAME} py-3`}>
        <ScrollArea className="w-full">
          <div className="flex items-center gap-3 pb-2">
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
          {/* No visible bar: the row still scrolls by wheel, trackpad, and touch. */}
          <ScrollBar orientation="horizontal" className="invisible" />
        </ScrollArea>
      </div>
    </div>
  );
}
