'use client';

import { useState } from 'react';
import { ChevronDown, Globe2, SlidersHorizontal, X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { splitFilterOptions, type FilterCategory, type FilterOption } from '@/lib/filters';
import { trackEvent } from '@/lib/analytics';
import { SITE_FRAME } from '@/lib/ui';

/** Radix Select forbids `""` as an item value, so "all countries" needs a sentinel. */
const ALL_COUNTRIES_VALUE = 'all';

interface FilterBarProps {
  categories: FilterCategory[];
  activeFilters: Set<string>;
  onFilterChange: (filters: Set<string>) => void;
  /** Countries in the data, nearest to the reader first. */
  countries: string[];
  selectedCountry: string;
  onCountryChange: (country: string) => void;
}

// The chips are ghost Buttons. h-auto, font-normal and the hover colors
// that repeat the resting ones cancel the ghost defaults so the pills keep
// their own look.
const chipBase =
  'inline-flex h-auto shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-normal transition-colors has-[>svg]:px-3';
const chipIdle =
  'border-zinc-200 bg-white text-zinc-700 hover:border-green-600/40 hover:bg-white hover:text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-green-500/40 dark:hover:bg-zinc-900 dark:hover:text-zinc-300';
const chipActive =
  'border-green-600 bg-green-50 text-green-800 hover:bg-green-50 hover:text-green-800 dark:border-green-500 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/30 dark:hover:text-green-300';

function FilterChip({
  option,
  active,
  onToggle,
}: {
  option: FilterOption;
  active: boolean;
  onToggle: () => void;
}) {
  const Icon = option.icon;
  return (
    <Button
      type="button"
      variant="ghost"
      aria-pressed={active}
      onClick={onToggle}
      className={`${chipBase} ${active ? chipActive : chipIdle}`}
    >
      <Icon aria-hidden className="h-4 w-4 text-green-700 dark:text-green-500" />
      {option.label}
    </Button>
  );
}

/**
 * The explorer's filters: the four people reach for first (when, and how they
 * can pay) as chips, and everything else behind "More". Country lives in
 * "More" too: most readers want what is near them, which is the default.
 */
export function FilterBar({
  categories,
  activeFilters,
  onFilterChange,
  countries,
  selectedCountry,
  onCountryChange,
}: FilterBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { primary, more } = splitFilterOptions(categories);
  const moreActive =
    more.reduce(
      (total, category) => total + category.options.filter((option) => activeFilters.has(option.id)).length,
      0
    ) + (selectedCountry ? 1 : 0);

  const toggleFilter = (filterId: string) => {
    const next = new Set(activeFilters);
    const enabled = !next.has(filterId);
    if (enabled) next.add(filterId);
    else next.delete(filterId);
    onFilterChange(next);
    trackEvent('Market Filter Changed', { filter: filterId, enabled });
  };

  const clearAll = () => {
    onFilterChange(new Set());
    if (selectedCountry) onCountryChange('');
    trackEvent('Market Filters Cleared', { previous_filter_count: activeFilters.size });
  };

  const anyActive = activeFilters.size > 0 || Boolean(selectedCountry);

  return (
    <div className="w-full border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className={`${SITE_FRAME} py-3`}>
        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
          {primary.map((option) => (
            <FilterChip
              key={option.id}
              option={option}
              active={activeFilters.has(option.id)}
              onToggle={() => toggleFilter(option.id)}
            />
          ))}
          <Button
            type="button"
            variant="ghost"
            aria-expanded={moreOpen}
            aria-controls="explorer-more-filters"
            onClick={() => setMoreOpen((open) => !open)}
            className={`${chipBase} ${moreActive > 0 ? chipActive : chipIdle}`}
          >
            <SlidersHorizontal aria-hidden className="h-4 w-4 text-green-700 dark:text-green-500" />
            More
            {moreActive > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-green-700 px-1 text-[10px] font-semibold text-white">
                {moreActive}
              </span>
            )}
            <ChevronDown
              aria-hidden
              className={`size-3.5 transition-transform ${moreOpen ? 'rotate-180' : ''}`}
            />
          </Button>
          {anyActive && (
            <Button
              type="button"
              variant="ghost"
              onClick={clearAll}
              className="inline-flex h-auto shrink-0 items-center gap-1 rounded-full px-2 py-1.5 text-sm font-normal text-zinc-500 transition-none hover:bg-transparent hover:text-zinc-800 has-[>svg]:px-2 dark:text-zinc-400 dark:hover:bg-transparent dark:hover:text-zinc-200"
            >
              <X aria-hidden className="size-3.5" />
              Clear
            </Button>
          )}
        </div>

        {moreOpen && (
          <div
            id="explorer-more-filters"
            className="mt-3 grid gap-4 rounded-2xl border border-zinc-200 p-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-zinc-800"
          >
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Country
              </p>
              <Select
                value={selectedCountry || ALL_COUNTRIES_VALUE}
                onValueChange={(value) => onCountryChange(value === ALL_COUNTRIES_VALUE ? '' : value)}
              >
                <SelectTrigger aria-label="Country" className="w-full rounded-full">
                  <Globe2 aria-hidden className="h-4 w-4 shrink-0 text-green-700 dark:text-green-500" />
                  <span className="flex-1 truncate text-left">
                    <SelectValue />
                  </span>
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={ALL_COUNTRIES_VALUE}>All countries</SelectItem>
                  {countries.map((country) => (
                    <SelectItem key={country} value={country}>
                      {country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {more.map((category) => (
              <div key={category.id}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {category.label}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {category.options.map((option) => (
                    <FilterChip
                      key={option.id}
                      option={option}
                      active={activeFilters.has(option.id)}
                      onToggle={() => toggleFilter(option.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
