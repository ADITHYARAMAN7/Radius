import { useRef, useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { CategoryIcon } from './CategoryBadge';
import {
  CATEGORIES,
  type Category,
  type EventFiltersState,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

interface EventFiltersProps {
  filters: EventFiltersState;
  onChange: (patch: Partial<EventFiltersState>) => void;
  onReset: () => void;
  resultCount: number;
  loading: boolean;
  aiAvailable?: boolean;
  aiProvider?: any;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Sports': '#007AFF', // Blue
  'Music': '#AF52DE', // Purple
  'Food': '#FF9500', // Orange
  'Yard Sale': '#FFCC00', // Yellow
  'Community': '#00C7BE', // Cyan
  'Education': '#5E5CE6', // Indigo
  'Technology': '#32ADE6', // Light blue
  'Other': '#8E8E93', // Gray
  // Mappings for screenshot names not in type definitions
  'Art': '#FF2D55', // Pink
  'Health': '#34C759', // Green
  'Tech': '#32ADE6', // Light blue
};

export function EventFilters({
  filters,
  onChange,
}: EventFiltersProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  // The categories to display, exactly as in the screenshot
  const displayCategories = [
    'Art', 'Community', 'Education', 'Food', 'Health', 'Music', 'Other', 'Sports', 'Tech', 'Yard Sale'
  ];

  return (
    <div className="w-full max-w-[1200px] mx-auto space-y-6 px-2">
      {/* Search Input */}
      <div className="relative w-full">
        <input
          ref={searchRef}
          type="search"
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
          placeholder="Search events, locations, neighborhoods..."
          className="h-14 w-full rounded-full bg-surface pl-6 pr-12 text-[15px] text-ink ring-1 ring-inset ring-border placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand/50 transition-colors [&::-webkit-search-cancel-button]:hidden"
        />
        {filters.search && (
          <button
            type="button"
            onClick={() => onChange({ search: '' })}
            className="absolute right-5 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink transition-colors"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Category Chips */}
      <div className="flex items-center gap-3 overflow-x-auto pb-4 scrollbar-none snap-x">
        <button
          onClick={() => onChange({ category: null })}
          className={cn(
            "flex items-center justify-center shrink-0 h-9 px-6 rounded-full text-[13px] font-medium border transition-colors snap-start",
            filters.category === null 
              ? "bg-brand/10 text-brand border-brand/50" 
              : "bg-transparent text-ink-muted border-border hover:border-border-strong hover:text-ink"
          )}
        >
          All
        </button>
        {displayCategories.map(category => (
          <button
            key={category}
            // Map Tech to Technology for backend compatibility
            onClick={() => onChange({ category: (category === 'Tech' ? 'Technology' : category) as Category })}
            className={cn(
              "flex items-center gap-2 shrink-0 h-9 px-5 rounded-full text-[13px] font-medium border transition-colors snap-start",
              filters.category === (category === 'Tech' ? 'Technology' : category)
                ? "bg-surface-raised text-ink border-border-strong"
                : "bg-transparent text-ink-muted border-border hover:border-border-strong hover:text-ink"
            )}
          >
            <div 
              className="w-2 h-2 rounded-full" 
              style={{ backgroundColor: CATEGORY_COLORS[category] || '#8E8E93' }} 
            />
            {category}
          </button>
        ))}
      </div>
    </div>
  );
}
