import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EventCard } from '@/components/events/EventCard';
import { EventFilters } from '@/components/events/EventFilters';
import { EventGridSkeleton, ErrorState, NoEventsFound } from '@/components/common/States';
import { useDebounced, useEvents } from '@/hooks/useEvents';
import { useRsvp } from '@/hooks/useRsvp';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/lib/api';
import {
  CATEGORIES,
  type AiProvider,
  type Category,
  type DateFilter,
  type EventFiltersState,
  type SortOption,
} from '@/lib/types';
import { cn } from '@/lib/utils';

type ViewMode = 'list' | 'map' | 'calendar';

const PAGE_SIZE = 12;

const EMPTY_FILTERS: EventFiltersState = {
  search: '',
  category: null,
  neighborhood: '',
  city: '',
  date: 'upcoming',
  sort: 'soonest',
  radiusKm: null,
  lat: null,
  lng: null,
};

/**
 * Filters live in the URL, not in component state.
 *
 * That makes a filtered board shareable and survives a reload or a back button — which is
 * what you want when someone sends "all the sports events this weekend" to a friend.
 */
function readFiltersFromUrl(params: URLSearchParams): EventFiltersState {
  const rawCategory = params.get('category');
  const rawDate = params.get('date');
  const rawSort = params.get('sort');

  const validDates: DateFilter[] = ['today', 'tomorrow', 'weekend', 'week', 'upcoming', 'all', 'past'];
  const validSorts: SortOption[] = ['soonest', 'popular', 'recent'];

  // A coordinate pair only counts when both halves parse — a lone lat cannot centre anything.
  const parsedLat = Number(params.get('lat'));
  const parsedLng = Number(params.get('lng'));
  const parsedRadius = Number(params.get('radiusKm'));

  const hasPoint =
    params.has('lat') &&
    params.has('lng') &&
    Number.isFinite(parsedLat) &&
    Number.isFinite(parsedLng) &&
    Math.abs(parsedLat) <= 90 &&
    Math.abs(parsedLng) <= 180;

  return {
    search: params.get('q') ?? '',
    category: CATEGORIES.includes(rawCategory as Category) ? (rawCategory as Category) : null,
    neighborhood: params.get('neighborhood') ?? '',
    city: params.get('city') ?? '',
    date: validDates.includes(rawDate as DateFilter) ? (rawDate as DateFilter) : 'upcoming',
    sort: validSorts.includes(rawSort as SortOption) ? (rawSort as SortOption) : 'soonest',
    lat: hasPoint ? parsedLat : null,
    lng: hasPoint ? parsedLng : null,
    radiusKm: hasPoint && Number.isFinite(parsedRadius) && parsedRadius > 0 ? parsedRadius : null,
  };
}

function writeFiltersToUrl(
  filters: EventFiltersState,
  page: number,
): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.search.trim()) params.set('q', filters.search.trim());
  if (filters.category) params.set('category', filters.category);
  if (filters.neighborhood.trim()) params.set('neighborhood', filters.neighborhood.trim());
  if (filters.city.trim()) params.set('city', filters.city.trim());
  if (filters.date !== 'upcoming') params.set('date', filters.date);
  if (filters.sort !== 'soonest') params.set('sort', filters.sort);
  if (page > 1) params.set('page', String(page));

  // Rounded to ~11 m, which is plenty for a distance filter and keeps the URL from
  // carrying the user's exact position.
  if (filters.lat !== null && filters.lng !== null && filters.radiusKm !== null) {
    params.set('lat', filters.lat.toFixed(4));
    params.set('lng', filters.lng.toFixed(4));
    params.set('radiusKm', String(filters.radiusKm));
  }

  return params;
}

export default function Explore() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { theme } = useTheme();

  const [filters, setFilters] = useState<EventFiltersState>(() => readFiltersFromUrl(searchParams));
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get('page')) || 1));
  const [aiAvailable, setAiAvailable] = useState(false);
  const [aiProvider, setAiProvider] = useState<AiProvider>('local');

  // Only the text query is debounced; a chip press should feel immediate.
  const debouncedSearch = useDebounced(filters.search, 350);

  useEffect(() => {
    document.title = 'Explore events — Radius';
  }, []);

  useEffect(() => {
    api
      .aiStatus()
      .then((status) => {
        setAiAvailable(status.available);
        setAiProvider(status.provider ?? 'gemini');
      })
      .catch(() => setAiAvailable(false));
  }, []);

  // Keep the URL in step with the controls, without stacking history entries per keystroke.
  useEffect(() => {
    setSearchParams(writeFiltersToUrl({ ...filters, search: debouncedSearch }, page), {
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedSearch,
    filters.category,
    filters.neighborhood,
    filters.city,
    filters.date,
    filters.sort,
    filters.lat,
    filters.lng,
    filters.radiusKm,
    page,
  ]);

  const query = useMemo(
    () => ({
      search: debouncedSearch,
      category: filters.category,
      neighborhood: filters.neighborhood,
      city: filters.city,
      date: filters.date,
      sort: filters.sort,
      lat: filters.lat,
      lng: filters.lng,
      radiusKm: filters.radiusKm,
      page,
      pageSize: PAGE_SIZE,
    }),
    [debouncedSearch, filters, page],
  );

  // Still runs in calendar view: one small page keeps the filter bar's "N events" count
  // honest; the calendar loads its own date range separately.
  const { data, events, loading, refreshing, error, reload, applyRsvp } = useEvents(query);
  const { toggle, isPending } = useRsvp({ onChange: applyRsvp });

  const onChangeFilters = useCallback((patch: Partial<EventFiltersState>) => {
    setFilters((current) => ({ ...current, ...patch }));
    // Any filter change invalidates the current page number.
    setPage(1);
  }, []);

  const onReset = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  const hasFilters =
    Boolean(debouncedSearch) ||
    filters.category !== null ||
    Boolean(filters.neighborhood) ||
    Boolean(filters.city) ||
    filters.date !== 'upcoming' ||
    filters.radiusKm !== null;

  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="container-page py-10 px-4">
      <div className="mb-12 text-center">
        <h1 className="text-display-xl lg:text-[4rem] font-serif font-extrabold tracking-tight">
          <span className="text-ink">Discover What's</span>
          <br />
          <span className="bg-gradient-to-r from-brand to-[#D4CE70] bg-clip-text text-transparent">
            Happening Nearby
          </span>
        </h1>
      </div>
      <div className="mb-10">
        <EventFilters
          filters={{ ...filters, search: filters.search }}
          onChange={onChangeFilters}
          onReset={onReset}
          resultCount={data?.total ?? 0}
          loading={loading}
          aiAvailable={aiAvailable}
          aiProvider={aiProvider}
        />
      </div>
      <div>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading ? (
          <EventGridSkeleton count={6} />
        ) : events.length === 0 ? (
          <NoEventsFound hasFilters={hasFilters} onClear={onReset} />
        ) : (
          <>
            <div
              className={cn(
                'grid gap-5 transition-opacity duration-200 sm:grid-cols-2 xl:grid-cols-3',
                refreshing && 'opacity-60',
              )}
            >
              {events.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  pending={isPending(event.id)}
                  onToggleRsvp={toggle}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <nav
                className="mt-10 flex items-center justify-center gap-2"
                aria-label="Event pages"
              >
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  Previous
                </Button>

                <p className="px-3 text-sm font-medium text-ink-soft" aria-live="polite">
                  Page <span className="font-bold tabular-nums text-ink">{page}</span> of{' '}
                  <span className="tabular-nums">{totalPages}</span>
                </p>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  );
}
