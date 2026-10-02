import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Badge } from '@/components/ui/Primitives';
import { CATEGORY_PIN_COLORS, DEFAULT_MAP_CENTER, EventMapPreview } from './EventMapPreview';
import { cn } from '@/lib/utils';
import type { EventRecord } from '@/lib/types';

/**
 * The standard OpenStreetMap tile server: free and, unlike most hosted basemaps, usable
 * with no API key or account. It only publishes a light style, so dark mode is done by
 * filtering the tile layer in CSS (see `.nearby-map-dark` in index.css).
 */
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

/**
 * A pin drawn as inline SVG. Leaflet's default marker is a PNG it locates by URL, which
 * breaks under a bundler; drawing it also lets the colour carry the category.
 */
function pinIcon(color: string, selected: boolean): L.DivIcon {
  const size = selected ? 44 : 34;

  return L.divIcon({
    className: 'nearby-pin',
    iconSize: [size, size],
    iconAnchor: [size / 2, size - 2],
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" style="filter:drop-shadow(0 2px 3px rgba(15,23,42,.35))"><path d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8z" fill="${color}" stroke="#fff" stroke-width="1.6"/><circle cx="12" cy="10" r="3" fill="#fff"/></svg>`,
  });
}

/**
 * Map view built on Leaflet and OpenStreetMap.
 *
 * This is what renders when no Google Maps key is configured, so the map — pins, category
 * colours, previews — works on a fresh clone and on a deployment without a billing
 * account. It mirrors the Google implementation: markers are managed imperatively so pin
 * churn stays out of the React render path.
 */
export default function LeafletEventMap({
  events,
  className,
}: {
  events: EventRecord[];
  /** Accepted for parity with the Google map; theming here is handled in CSS. */
  theme?: 'light' | 'dark';
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tilesRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  /** Once someone has panned or zoomed, the view is theirs — stop re-fitting it. */
  const userMovedRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const mappable = useMemo(
    () => events.filter((event) => event.latitude !== null && event.longitude !== null),
    [events],
  );

  // Looked up by id at render time, so the preview always shows the latest RSVP count.
  const selected = mappable.find((event) => event.id === selectedId) ?? null;

  // Fitting the view is tied to *which* events are shown, not to selection changes.
  const fitKey = mappable.map((event) => event.id).join(',');

  /* ------------------------------------------------------------ create map */
  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: [DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng],
      zoom: 12,
      zoomControl: true,
      // Scrolling the page past the map should not hijack the wheel.
      scrollWheelZoom: false,
    });

    map.attributionControl.setPrefix(false);
    map.on('click', () => setSelectedId(null));
    // Opt in to wheel zoom once the user has deliberately interacted with the map.
    map.once('focus', () => map.scrollWheelZoom.enable());

    const container = containerRef.current;
    const markUserMoved = () => {
      userMovedRef.current = true;
    };
    container.addEventListener('pointerdown', markUserMoved);
    container.addEventListener('wheel', markUserMoved, { passive: true });

    mapRef.current = map;
    setReady(true);

    const markers = markersRef.current;

    return () => {
      container.removeEventListener('pointerdown', markUserMoved);
      container.removeEventListener('wheel', markUserMoved);
      markers.clear();
      tilesRef.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, []);

  /* ------------------------------------------------------------------ tiles */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || tilesRef.current) return;

    tilesRef.current = L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);
  }, [ready]);

  /* ---------------------------------------------------------------- markers */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const existing = markersRef.current;
    const seen = new Set<string>();

    for (const event of mappable) {
      seen.add(event.id);

      const color = CATEGORY_PIN_COLORS[event.category] ?? CATEGORY_PIN_COLORS.Other!;
      const isSelected = selectedId === event.id;
      const position: L.LatLngExpression = [event.latitude!, event.longitude!];
      const current = existing.get(event.id);

      if (current) {
        current.setLatLng(position);
        current.setIcon(pinIcon(color, isSelected));
        current.setZIndexOffset(isSelected ? 1000 : 0);
        continue;
      }

      const marker = L.marker(position, {
        icon: pinIcon(color, false),
        title: event.title,
        alt: `${event.title} at ${event.location}`,
        // Reachable with Tab and opened with Enter.
        keyboard: true,
      }).addTo(map);

      marker.on('click', (clickEvent) => {
        // Otherwise the map's own click handler would close the preview straight away.
        L.DomEvent.stopPropagation(clickEvent);
        setSelectedId(event.id);
      });

      existing.set(event.id, marker);
    }

    // Drop markers for events no longer in the result set.
    for (const [id, marker] of existing) {
      if (!seen.has(id)) {
        marker.remove();
        existing.delete(id);
      }
    }
  }, [mappable, selectedId, ready]);

  /* -------------------------------------------------------------- fit view */
  const fitToPins = useCallback(() => {
    const map = mapRef.current;
    if (!map || mappable.length === 0) return;

    if (mappable.length === 1) {
      map.setView([mappable[0]!.latitude!, mappable[0]!.longitude!], 15, { animate: false });
      return;
    }

    // Fit to the visible pins, but never zoom in so far that two close events fill the screen.
    const bounds = L.latLngBounds(mappable.map((event) => [event.latitude!, event.longitude!]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  // A new result set is a new question, so the view resets even after manual panning.
  useEffect(() => {
    userMovedRef.current = false;
    fitToPins();
  }, [fitToPins, ready]);

  /*
   * Leaflet measures its container once, at creation. The map is often created before the
   * layout has settled (it is lazy-loaded, and the list/map toggle swaps it in), so without
   * this it would compute the zoom for the wrong size and sit a level too far out.
   */
  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
      if (!userMovedRef.current) fitToPins();
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [fitToPins, ready]);

  return (
    <div
      className={cn(
        // `nearby-map` is the hook index.css uses to darken the tiles under the dark theme.
        'nearby-map relative isolate overflow-hidden rounded-panel ring-1 ring-border',
        className,
      )}
    >
      <div
        ref={containerRef}
        className="h-full min-h-[18rem] w-full bg-surface-sunken"
        role="application"
        aria-label={`Map showing ${mappable.length} event${mappable.length === 1 ? '' : 's'}`}
      />

      {/* Tells the user why the map looks emptier than the list. */}
      {mappable.length < events.length && (
        <div className="pointer-events-none absolute left-14 top-3 z-[500]">
          <Badge tone="warning" className="bg-surface/95 shadow-sm backdrop-blur">
            {events.length - mappable.length} event
            {events.length - mappable.length === 1 ? '' : 's'} without a pinned location
          </Badge>
        </div>
      )}

      {selected && <EventMapPreview event={selected} onClose={() => setSelectedId(null)} />}

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
