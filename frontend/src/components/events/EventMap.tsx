import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadMapsLibrary } from '@/lib/maps';
import { Link } from 'react-router-dom';
import { MapPinOff } from 'lucide-react';
import { Badge } from '@/components/ui/Primitives';
import { EmptyState } from '@/components/common/States';
import { CATEGORY_PIN_COLORS, DEFAULT_MAP_CENTER, EventMapPreview } from './EventMapPreview';
import { cn } from '@/lib/utils';
import type { EventRecord } from '@/lib/types';

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

const DEFAULT_CENTER = DEFAULT_MAP_CENTER;

/** Split out so Leaflet is only downloaded when a map is actually shown without a Google key. */
const LeafletEventMap = lazy(() => import('./LeafletEventMap'));

interface EventMapProps {
  events: EventRecord[];
  theme: 'light' | 'dark';
  className?: string;
}

/**
 * Map view of a set of events.
 *
 * Google Maps when a key is configured; otherwise an OpenStreetMap map that needs no key
 * at all — so the map is never a dead "unavailable" panel.
 */
export function EventMap(props: EventMapProps) {
  if (MAPS_KEY) return <GoogleEventMap {...props} />;

  return (
    <Suspense
      fallback={
        <div className={cn('relative overflow-hidden rounded-panel ring-1 ring-border', props.className)}>
          <div className="shimmer h-full min-h-[18rem] w-full" />
        </div>
      }
    >
      <LeafletEventMap {...props} />
    </Suspense>
  );
}

/** The shared loader in lib/maps.ts owns the single Loader instance. */
function loadMaps(): Promise<typeof google.maps> {
  return loadMapsLibrary('maps').then(() => google.maps);
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
 * The Google Maps implementation.
 *
 * Markers are managed imperatively against the plain Maps JS API rather than through a
 * React wrapper, which keeps marker churn out of the React render path — the list and the
 * map share one data source, so switching views never refetches.
 */
function GoogleEventMap({ events, theme, className }: EventMapProps) {
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
    <div className={cn('relative isolate overflow-hidden rounded-panel ring-1 ring-border', className)}>
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

      {selected && <EventMapPreview event={selected} onClose={() => setSelected(null)} />}

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
