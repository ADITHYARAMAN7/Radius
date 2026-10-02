import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { Link } from 'react-router-dom';
import { MapPinOff, X } from 'lucide-react';
import { Badge, Card } from '@/components/ui/Primitives';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/common/States';
import { CategoryBadge } from './CategoryBadge';
import { cn, formatEventDate, formatRsvpCount, formatTimeRange } from '@/lib/utils';
import type { EventRecord } from '@/lib/types';

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

/** Coimbatore city centre — the fallback view when no event has coordinates. */
const DEFAULT_CENTER = { lat: 11.0168, lng: 76.9558 };

/** Keeps one Loader for the whole session; a second one with different options throws. */
let loaderPromise: Promise<typeof google.maps> | null = null;

function loadMaps(): Promise<typeof google.maps> {
  if (!MAPS_KEY) return Promise.reject(new Error('Google Maps API key is not configured.'));

  if (!loaderPromise) {
    const loader = new Loader({ apiKey: MAPS_KEY, version: 'weekly' });
    loaderPromise = loader.importLibrary('maps').then(() => google.maps);
  }

  return loaderPromise;
}

/** Muted styling so the event pins are the most prominent thing on the map. */
const LIGHT_STYLE: google.maps.MapTypeStyle[] = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape', stylers: [{ color: '#f6f7fb' }] },
  { featureType: 'water', stylers: [{ color: '#d9e4f5' }] },
];

const DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#18202f' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8e9ab5' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#18202f' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#242d3f' }] },
  { featureType: 'water', stylers: [{ color: '#0f1724' }] },
];

const CATEGORY_PIN_COLORS: Record<string, string> = {
  Sports: '#10b981',
  Music: '#8b5cf6',
  Food: '#f97316',
  'Yard Sale': '#f59e0b',
  Community: '#0ea5e9',
  Education: '#3b82f6',
  Technology: '#6366f1',
  Other: '#64748b',
};

function pinIcon(color: string, selected: boolean): google.maps.Symbol {
  return {
    path: 'M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8z',
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2,
    scale: selected ? 2.1 : 1.6,
    anchor: new google.maps.Point(12, 22),
  };
}

/**
 * Map view of the current result set.
 *
 * Markers are managed imperatively against the plain Maps JS API rather than through a
 * React wrapper, which keeps marker churn out of the React render path — the list and the
 * map share one data source, so switching views never refetches.
 */
export function EventMap({
  events,
  theme,
  className,
}: {
  events: EventRecord[];
  theme: 'light' | 'dark';
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(MAPS_KEY ? 'loading' : 'error');
  const [errorMessage, setErrorMessage] = useState('');
  const [selected, setSelected] = useState<EventRecord | null>(null);

  const mappable = useMemo(
    () => events.filter((event) => event.latitude !== null && event.longitude !== null),
    [events],
  );

  /* ------------------------------------------------------------ create map */
  useEffect(() => {
    if (!MAPS_KEY) {
      setErrorMessage(
        'Add VITE_GOOGLE_MAPS_API_KEY to frontend/.env to switch on the map. The list view works without it.',
      );
      setStatus('error');
      return;
    }

    let cancelled = false;

    loadMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;

        mapRef.current = new maps.Map(containerRef.current, {
          center: DEFAULT_CENTER,
          zoom: 12,
          disableDefaultUI: true,
          zoomControl: true,
          fullscreenControl: true,
          clickableIcons: false,
          styles: theme === 'dark' ? DARK_STYLE : LIGHT_STYLE,
        });

        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(
          (error as Error).message ||
            'Google Maps could not load. Check that the API key is valid and that the Maps JavaScript API is enabled.',
        );
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
    // Styles are re-applied by the theme effect below, so the map is built only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------- follow the theme */
  useEffect(() => {
    mapRef.current?.setOptions({ styles: theme === 'dark' ? DARK_STYLE : LIGHT_STYLE });
  }, [theme, status]);

  /* ------------------------------------------------------------- markers */
  const syncMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const existing = markersRef.current;
    const seen = new Set<string>();

    for (const event of mappable) {
      seen.add(event.id);
      const color = CATEGORY_PIN_COLORS[event.category] ?? CATEGORY_PIN_COLORS.Other!;
      const position = { lat: event.latitude!, lng: event.longitude! };

      const current = existing.get(event.id);

      if (current) {
        current.setPosition(position);
        current.setIcon(pinIcon(color, selected?.id === event.id));
        continue;
      }

      const marker = new google.maps.Marker({
        map,
        position,
        title: event.title,
        icon: pinIcon(color, false),
        // Keyboard users can reach markers and open them with Enter.
        optimized: false,
      });

      marker.addListener('click', () => setSelected(event));
      existing.set(event.id, marker);
    }

    // Drop markers for events no longer in the result set.
    for (const [id, marker] of existing) {
      if (!seen.has(id)) {
        marker.setMap(null);
        existing.delete(id);
      }
    }

    if (mappable.length === 0) return;

    // Fit to the visible pins, but never zoom in so far that a single event fills the screen.
    const bounds = new google.maps.LatLngBounds();
    for (const event of mappable) bounds.extend({ lat: event.latitude!, lng: event.longitude! });

    if (mappable.length === 1) {
      map.setCenter(bounds.getCenter());
      map.setZoom(14);
    } else {
      map.fitBounds(bounds, { top: 48, right: 48, bottom: 48, left: 48 });
    }
  }, [mappable, selected?.id]);

  useEffect(() => {
    if (status === 'ready') syncMarkers();
  }, [status, syncMarkers]);

  // Clear the preview if its event leaves the filtered set.
  useEffect(() => {
    if (selected && !mappable.some((event) => event.id === selected.id)) setSelected(null);
  }, [mappable, selected]);

  useEffect(
    () => () => {
      for (const marker of markersRef.current.values()) marker.setMap(null);
      markersRef.current.clear();
    },
    [],
  );

  /* -------------------------------------------------------------- render */
  if (status === 'error') {
    return (
      <EmptyState
        icon={<MapPinOff className="h-7 w-7" aria-hidden="true" />}
        title="Map view is unavailable"
        description={errorMessage}
        className={className}
      />
    );
  }

  return (
    <div className={cn('relative overflow-hidden rounded-panel ring-1 ring-border', className)}>
      <div
        ref={containerRef}
        className="h-full min-h-[28rem] w-full bg-surface-sunken"
        role="application"
        aria-label={`Map showing ${mappable.length} event${mappable.length === 1 ? '' : 's'}`}
      />

      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-sunken">
          <div className="shimmer h-full w-full" />
          <p className="absolute text-sm font-medium text-ink-soft">Loading map…</p>
        </div>
      )}

      {/* Tells the user why the map looks emptier than the list. */}
      {status === 'ready' && mappable.length < events.length && (
        <div className="pointer-events-none absolute left-4 top-4">
          <Badge tone="warning" className="bg-surface/95 shadow-sm backdrop-blur">
            {events.length - mappable.length} event
            {events.length - mappable.length === 1 ? '' : 's'} without a pinned location
          </Badge>
        </div>
      )}

      {/* ------------------------------------------------------ marker preview */}
      {selected && (
        <Card className="absolute bottom-4 left-4 right-4 z-10 animate-fade-up overflow-hidden shadow-lg sm:right-auto sm:w-80">
          <div className="flex gap-3 p-3">
            {selected.imageUrl && (
              <img
                src={selected.imageUrl}
                alt=""
                className="h-20 w-20 shrink-0 rounded-lg object-cover"
                loading="lazy"
              />
            )}

            <div className="min-w-0 flex-1">
              <CategoryBadge category={selected.category} size="sm" />

              <h3 className="clamp-2 mt-1.5 font-display text-sm font-bold leading-snug text-ink">
                {selected.title}
              </h3>

              <p className="mt-1 text-xs text-ink-soft">
                {formatEventDate(selected.startsAt)} · {formatTimeRange(selected.startTime, selected.endTime)}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">{formatRsvpCount(selected.rsvpCount)}</p>
            </div>

            <button
              type="button"
              onClick={() => setSelected(null)}
              className="-m-1 h-7 w-7 shrink-0 rounded-lg text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
              aria-label="Close event preview"
            >
              <X className="mx-auto h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="border-t border-border p-2">
            <ButtonLink to={`/events/${selected.id}`} variant="soft" size="sm" full>
              View full event
            </ButtonLink>
          </div>
        </Card>
      )}

      {/* A plain list of the pins, so the map is not the only way to reach them. */}
      <ul className="sr-only">
        {mappable.map((event) => (
          <li key={event.id}>
            <Link to={`/events/${event.id}`}>
              {event.title} at {event.location}, {event.neighborhood}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
