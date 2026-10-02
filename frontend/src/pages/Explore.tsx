import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, Map as MapIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/Primitives';
import { EventCard } from '@/components/events/EventCard';
import { EventFilters } from '@/components/events/EventFilters';
import { EventMap } from '@/components/events/EventMap';
import { CalendarView, parseDayKey, toDayKey } from '@/components/events/CalendarView';
import { EventGridSkeleton, ErrorState, NoEventsFound } from '@/components/common/States';
import { useDebounced, useEvents } from '@/hooks/useEvents';
import { useRsvp } from '@/hooks/useRsvp';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/lib/api';
import { CATEGORIES, type Category, type DateFilter, type EventFiltersState, type SortOption } from '@/lib/types';
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
  view: ViewMode,
  day: string,
): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.search.trim()) params.set('q', filters.search.trim());
  if (filters.category) params.set('category', filters.category);
  if (filters.neighborhood.trim()) params.set('neighborhood', filters.neighborhood.trim());
  if (filters.city.trim()) params.set('city', filters.city.trim());
  if (filters.date !== 'upcoming') params.set('date', filters.date);
  if (filters.sort !== 'soonest') params.set('sort', filters.sort);
  if (page > 1) params.set('page', String(page));
  if (view !== 'list') params.set('view', view);
  // `date` is already the Today/Weekend filter, so the calendar's selected day is `day`.
  if (view === 'calendar') params.set('day', day);

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
  const [view, setView] = useState<ViewMode>(() => {
    const raw = searchParams.get('view');
    return raw === 'map' || raw === 'calendar' ? raw : 'list';
  });
  // Calendar's selected day (and so its month); an invalid ?day= falls back to today.
  const [day, setDay] = useState(() => {
    const parsed = parseDayKey(searchParams.get('day'));
    return toDayKey(parsed ?? new Date());
  });
  const [aiAvailable, setAiAvailable] = useState(false);

  // Only the text query is debounced; a chip press should feel immediate.
  const debouncedSearch = useDebounced(filters.search, 350);

  useEffect(() => {
    document.title = 'Explore events — Nearby-objects';
  }, []);

  useEffect(() => {
    api
      .aiStatus()
      .then((status) => setAiAvailable(status.available))
      .catch(() => setAiAvailable(false));
  }, []);

  // Keep the URL in step with the controls, without stacking history entries per keystroke.
  useEffect(() => {
    setSearchParams(writeFiltersToUrl({ ...filters, search: debouncedSearch }, page, view, day), {
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
    view,
    day,
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
      // Map view wants every pin in the result set, not one page of twelve.
      pageSize: view === 'map' ? 60 : PAGE_SIZE,
    }),
    [debouncedSearch, filters, page, view],
  );

  // The calendar loads its own date range, so the paged list request is held back there.
  const { data, events, loading, refreshing, error, reload, applyRsvp } = useEvents(query, view !== 'calendar');
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
    <div className="container-page py-8">
      <header className="mb-6">
        <h1 className="text-display-lg">Explore events</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft sm:text-base">
          Everything upcoming near you. Search by neighbourhood or city, narrow it down, and switch
          to the map when you want to see what is closest.
        </p>
      </header>

      <div className="rounded-panel bg-surface p-4 ring-1 ring-border sm:p-5">
        <EventFilters
          filters={{ ...filters, search: filters.search }}
          onChange={onChangeFilters}
          onReset={onReset}
          resultCount={data?.total ?? 0}
          loading={loading}
          aiAvailable={aiAvailable}
        />
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <SegmentedControl<ViewMode>
          ariaLabel="Choose how to view events"
          value={view}
          onChange={setView}
          options={[
            { value: 'list', label: 'List', icon: <LayoutGrid className="h-4 w-4" aria-hidden="true" /> },
            { value: 'map', label: 'Map', icon: <MapIcon className="h-4 w-4" aria-hidden="true" /> },
            {
              value: 'calendar',
              label: 'Calendar',
              icon: <CalendarDays className="h-4 w-4" aria-hidden="true" />,
            },
          ]}
        />

        {refreshing && view !== 'calendar' && <span className="text-xs font-medium text-ink-muted">Updating…</span>}
      </div>

      <div className="mt-5">
        {view === 'calendar' ? (
          <>
            <p className="mb-4 text-xs text-ink-muted">
              The calendar uses the category, neighbourhood and city filters. Search, date and sort apply to the
              list and map.
            </p>
            <CalendarView
              day={day}
              onDayChange={setDay}
              category={filters.category}
              neighborhood={filters.neighborhood}
              city={filters.city}
            />
          </>
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading ? (
          <EventGridSkeleton count={6} />
        ) : events.length === 0 ? (
          <NoEventsFound hasFilters={hasFilters} onClear={onReset} />
        ) : view === 'map' ? (
          <EventMap events={events} theme={theme} className="h-[32rem]" />
        ) : (
          <>
            {/* Dim rather than unmount while refetching, so the page does not jump. */}
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
