import { useEffect, useRef, useState } from 'react';
import { Crosshair, Mic, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Primitives';
import { CategoryIcon } from './CategoryBadge';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { useVoiceSearch } from '@/hooks/useVoiceSearch';
import {
  CATEGORIES,
  type AiProvider,
  type Category,
  type DateFilter,
  type EventFiltersState,
  type SortOption,
} from '@/lib/types';
import { cn, DATE_FILTERS } from '@/lib/utils';

const SORTS: Array<{ value: SortOption; label: string }> = [
  { value: 'soonest', label: 'Soonest' },
  { value: 'popular', label: 'Most popular' },
  { value: 'recent', label: 'Recently added' },
];

const RADIUS_OPTIONS = [2, 5, 10, 25, 50] as const;

interface EventFiltersProps {
  filters: EventFiltersState;
  onChange: (patch: Partial<EventFiltersState>) => void;
  onReset: () => void;
  resultCount: number;
  loading: boolean;
  /** Whether smart search is available on this deployment. */
  aiAvailable: boolean;
  /** Gemini, or the built-in rule-based parser used when no Gemini key is configured. */
  aiProvider?: AiProvider;
}

function Chip({
  active,
  children,
  onClick,
  className,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[0.8125rem] font-semibold ring-1 ring-inset transition-all duration-150',
        active
          ? 'bg-brand text-white ring-brand shadow-sm'
          : 'bg-surface text-ink-soft ring-border hover:bg-surface-sunken hover:text-ink hover:ring-border-strong',
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Search, chips and the advanced panel.
 *
 * The search input is local state pushed up on a debounce by the parent; keeping it local
 * is what lets typing stay smooth while requests lag behind.
 */
export function EventFilters({
  filters,
  onChange,
  onReset,
  resultCount,
  loading,
  aiAvailable,
  aiProvider = 'gemini',
}: EventFiltersProps) {
  const toast = useToast();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const hasLocation = filters.lat !== null && filters.lng !== null;

  const activeCount =
    (filters.category ? 1 : 0) +
    (filters.date !== 'upcoming' ? 1 : 0) +
    (filters.neighborhood ? 1 : 0) +
    (filters.city ? 1 : 0) +
    (filters.sort !== 'soonest' ? 1 : 0) +
    (filters.radiusKm !== null && hasLocation ? 1 : 0);

  /**
   * Distance filtering needs a centre point, and the only one we can get without asking
   * the user to type coordinates is the browser's. Permission is requested only when they
   * press the button, never on page load.
   */
  const useMyLocation = () => {
    if (!('geolocation' in navigator)) {
      toast.error('Location unavailable', 'This browser cannot share your location.');
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onChange({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          // Give the filter a sensible default the moment a location exists.
          radiusKm: filters.radiusKm ?? 10,
        });
        toast.success('Using your location', 'Showing events within the chosen distance.');
      },
      (error) => {
        setLocating(false);
        const message =
          error.code === error.PERMISSION_DENIED
            ? 'Permission was declined. You can still filter by neighbourhood or city.'
            : 'We could not work out where you are. Try again, or filter by neighbourhood.';
        toast.error('Location unavailable', message);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const clearLocation = () => onChange({ lat: null, lng: null, radiusKm: null });

  const hasAnything = activeCount > 0 || Boolean(filters.search) || hasLocation;

  // "/" focuses search, the way most search-led products behave.
  useEffect(() => {
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      const target = keyEvent.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;

      if (keyEvent.key === '/' && !typing) {
        keyEvent.preventDefault();
        searchRef.current?.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /**
   * Hands the sentence to the assistant, which returns the structured filters the board
   * already understands — so retrieval stays in Firestore and the assistant only does the
   * language. `spoken` is the transcript when the query arrived by voice.
   */
  const runSmartSearch = async (spoken?: string) => {
    const query = (spoken ?? filters.search).trim();
    if (query.length < 3) {
      toast.info('Type a little more', 'Try something like "free tech workshops this weekend".');
      return;
    }

    setAiBusy(true);
    try {
      const { intent } = await api.aiSearch(query);

      onChange({
        search: intent.keywords || query,
        category: intent.category,
        date: intent.dateFilter,
        neighborhood: intent.neighborhood,
        city: intent.city,
      });

      const applied = [
        intent.category,
        intent.dateFilter !== 'upcoming' ? DATE_FILTERS.find((d) => d.value === intent.dateFilter)?.label : null,
        intent.neighborhood,
        intent.city,
      ].filter(Boolean);

      toast.success(
        'Filters applied',
        applied.length ? `Reading that as: ${applied.join(' · ')}` : 'Searching across all upcoming events.',
      );
    } catch (error) {
      // Smart search needs an account; a spoken query still works as a plain keyword search.
      if (error instanceof ApiError && error.isAuthError) {
        onChange({ search: query });
        toast.info('Searching by keyword', 'Sign in to let smart search set the filters for you.');
        return;
      }

      const message =
        error instanceof ApiError ? error.message : 'Smart search is unavailable right now.';
      toast.error('Smart search failed', message);
    } finally {
      setAiBusy(false);
    }
  };

  const voice = useVoiceSearch({
    onInterim: (text) => onChange({ search: text }),
    onResult: (text) => {
      onChange({ search: text });
      // A spoken query is a sentence, which is exactly what smart search is for.
      if (aiAvailable) void runSmartSearch(text);
    },
    onError: (message) => toast.error('Voice search', message),
  });

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------------ search */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-[1.125rem] w-[1.125rem] -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />

          <input
            ref={searchRef}
            type="search"
            value={filters.search}
            onChange={(changeEvent) => onChange({ search: changeEvent.target.value })}
            onKeyDown={(keyEvent) => {
              if (keyEvent.key === 'Enter' && aiAvailable && keyEvent.shiftKey) {
                keyEvent.preventDefault();
                void runSmartSearch();
              }
            }}
            placeholder={voice.listening ? 'Listening…' : 'Search events, neighbourhoods or cities…'}
            aria-label="Search events by title, description, category, neighbourhood or city"
            className="h-12 w-full rounded-xl bg-surface pl-11 pr-20 text-sm text-ink ring-1 ring-inset ring-border transition-shadow placeholder:text-ink-muted hover:ring-border-strong focus:outline-none focus:ring-2 focus:ring-brand [&::-webkit-search-cancel-button]:hidden"
          />

          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
            {filters.search && !voice.listening && (
              <button
                type="button"
                onClick={() => onChange({ search: '' })}
                className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}

            {/* Hidden where the browser has no speech recognition, rather than shown broken. */}
            {voice.supported && (
              <button
                type="button"
                onClick={voice.listening ? voice.stop : voice.start}
                aria-pressed={voice.listening}
                aria-label={voice.listening ? 'Stop listening' : 'Search by voice'}
                title={voice.listening ? 'Stop listening' : 'Search by voice'}
                className={cn(
                  'relative rounded-lg p-1.5 transition-colors',
                  voice.listening
                    ? 'bg-danger-soft text-danger'
                    : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
                )}
              >
                {voice.listening && (
                  <span
                    className="absolute inset-0 animate-ping rounded-lg bg-danger/20"
                    aria-hidden="true"
                  />
                )}
                <Mic className="relative h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {aiAvailable && (
          <Button
            variant="soft"
            size="lg"
            onClick={() => void runSmartSearch()}
            loading={aiBusy}
            loadingLabel="Thinking"
            className="sm:w-auto"
            title={`Describe what you want in plain words and let ${
              aiProvider === 'gemini' ? 'Gemini' : 'the built-in assistant'
            } set the filters`}
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Smart search
          </Button>
        )}

        <Button
          variant={showAdvanced ? 'primary' : 'secondary'}
          size="lg"
          onClick={() => setShowAdvanced((value) => !value)}
          aria-expanded={showAdvanced}
          aria-controls="advanced-filters"
          className="sm:w-auto"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filters
          {activeCount > 0 && (
            <span className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1 text-[0.6875rem] font-bold tabular-nums">
              {activeCount}
            </span>
          )}
        </Button>
      </div>

      {/* --------------------------------------------------------- date chips */}
      <div
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label="Filter by date"
      >
        {DATE_FILTERS.map((option) => (
          <Chip
            key={option.value}
            active={filters.date === option.value}
            onClick={() => onChange({ date: option.value as DateFilter })}
          >
            {option.label}
          </Chip>
        ))}
      </div>

      {/* ----------------------------------------------------- category chips */}
      <div
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label="Filter by category"
      >
        <Chip active={filters.category === null} onClick={() => onChange({ category: null })}>
          All categories
        </Chip>

        {CATEGORIES.map((category) => (
          <Chip
            key={category}
            active={filters.category === category}
            onClick={() => onChange({ category: filters.category === category ? null : category })}
          >
            <CategoryIcon category={category as Category} className="h-3.5 w-3.5" />
            {category}
          </Chip>
        ))}
      </div>

      {/* ------------------------------------------------------ advanced panel */}
      {showAdvanced && (
        <div
          id="advanced-filters"
          className="grid animate-fade-up gap-4 rounded-panel bg-surface-sunken p-4 ring-1 ring-border sm:grid-cols-3"
        >
          <div className="space-y-1.5">
            <label htmlFor="filter-neighborhood" className="text-sm font-semibold text-ink">
              Neighbourhood
            </label>
            <input
              id="filter-neighborhood"
              type="text"
              value={filters.neighborhood}
              onChange={(changeEvent) => onChange({ neighborhood: changeEvent.target.value })}
              placeholder="e.g. Gandhipuram"
              className="h-10 w-full rounded-xl bg-surface px-3.5 text-sm text-ink ring-1 ring-inset ring-border focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="filter-city" className="text-sm font-semibold text-ink">
              City
            </label>
            <input
              id="filter-city"
              type="text"
              value={filters.city}
              onChange={(changeEvent) => onChange({ city: changeEvent.target.value })}
              placeholder="e.g. Coimbatore"
              className="h-10 w-full rounded-xl bg-surface px-3.5 text-sm text-ink ring-1 ring-inset ring-border focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="filter-sort" className="text-sm font-semibold text-ink">
              Sort by
            </label>
            <select
              id="filter-sort"
              value={filters.sort}
              onChange={(changeEvent) => onChange({ sort: changeEvent.target.value as SortOption })}
              className="h-10 w-full cursor-pointer rounded-xl bg-surface px-3.5 text-sm text-ink ring-1 ring-inset ring-border focus:outline-none focus:ring-2 focus:ring-brand"
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* ------------------------------------------------------- distance */}
          <div className="space-y-1.5 sm:col-span-3">
            <label htmlFor="filter-distance" className="text-sm font-semibold text-ink">
              Distance
            </label>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                id="filter-distance"
                value={filters.radiusKm ?? ''}
                disabled={!hasLocation}
                onChange={(changeEvent) =>
                  onChange({
                    radiusKm: changeEvent.target.value ? Number(changeEvent.target.value) : null,
                  })
                }
                aria-describedby="filter-distance-hint"
                className="h-10 w-full cursor-pointer rounded-xl bg-surface px-3.5 text-sm text-ink ring-1 ring-inset ring-border focus:outline-none focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-60 sm:w-48"
              >
                <option value="">Any distance</option>
                {RADIUS_OPTIONS.map((km) => (
                  <option key={km} value={km}>
                    Within {km} km
                  </option>
                ))}
              </select>

              <Button
                variant={hasLocation ? 'soft' : 'secondary'}
                size="sm"
                onClick={useMyLocation}
                loading={locating}
                loadingLabel="Locating"
              >
                <Crosshair className="h-4 w-4" aria-hidden="true" />
                {hasLocation ? 'Update my location' : 'Use my location'}
              </Button>

              {hasLocation && (
                <Button variant="ghost" size="sm" onClick={clearLocation}>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Clear location
                </Button>
              )}
            </div>

            <p id="filter-distance-hint" className="text-xs text-ink-muted">
              {hasLocation
                ? 'Events without pinned coordinates are hidden while a distance filter is on.'
                : 'Share your location to filter by how far away an event is.'}
            </p>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------- result line */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        {/* aria-live so the count change is announced after a filter is applied. */}
        <p className="text-sm text-ink-soft" aria-live="polite">
          {loading ? (
            'Searching…'
          ) : (
            <>
              <span className="font-bold tabular-nums text-ink">{resultCount}</span>{' '}
              {resultCount === 1 ? 'event' : 'events'}
              {filters.search && (
                <>
                  {' '}
                  matching <span className="font-semibold text-ink">“{filters.search}”</span>
                </>
              )}
            </>
          )}
        </p>

        <div className="flex items-center gap-2">
          {filters.sort !== 'soonest' && (
            <Badge tone="brand" size="sm">
              {SORTS.find((option) => option.value === filters.sort)?.label}
            </Badge>
          )}

          {hasAnything && (
            <Button variant="ghost" size="sm" onClick={onReset}>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Clear filters
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
