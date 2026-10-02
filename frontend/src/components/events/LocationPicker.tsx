import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { cn } from '@/lib/utils';

const PIN = L.divIcon({
  className: 'nearby-pin',
  iconSize: [40, 40],
  iconAnchor: [20, 38],
  html: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="40" height="40" aria-hidden="true" style="filter:drop-shadow(0 2px 3px rgba(15,23,42,.4))"><path d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8z" fill="#4f46e5" stroke="#fff" stroke-width="1.6"/><circle cx="12" cy="10" r="3" fill="#fff"/></svg>',
});

/**
 * A small map for placing an event's pin.
 *
 * A geocoder gets you to the right street at best, and often only to the right area. The
 * organiser is the one who knows it is "the gate on the east side", so the pin can be
 * dragged, or the map clicked, to put it exactly there. The latitude and longitude fields
 * under the map stay editable, so the pin can also be set without a pointer.
 */
export default function LocationPicker({
  latitude,
  longitude,
  onChange,
  className,
}: {
  latitude: number;
  longitude: number;
  onChange: (latitude: number, longitude: number) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Latest callback without rebuilding the map when the parent re-renders.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: [latitude, longitude],
      zoom: 15,
      scrollWheelZoom: false,
    });
    map.attributionControl.setPrefix(false);
    map.once('focus', () => map.scrollWheelZoom.enable());

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([latitude, longitude], {
      icon: PIN,
      draggable: true,
      keyboard: true,
      title: 'Event location — drag to adjust',
      alt: 'Event location',
    }).addTo(map);

    const report = (point: L.LatLng) =>
      onChangeRef.current(Number(point.lat.toFixed(5)), Number(point.lng.toFixed(5)));

    marker.on('dragend', () => report(marker.getLatLng()));
    map.on('click', (clickEvent: L.LeafletMouseEvent) => {
      marker.setLatLng(clickEvent.latlng);
      report(clickEvent.latlng);
    });

    // Leaflet measures its container once; the form may still be laying out.
    const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    observer.observe(containerRef.current);

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      observer.disconnect();
      markerRef.current = null;
      mapRef.current = null;
      map.remove();
    };
    // The map is created once; later coordinate changes are applied by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow coordinates set from outside: a new address lookup, "use my location", or typing.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    const current = marker.getLatLng();
    if (Math.abs(current.lat - latitude) < 1e-6 && Math.abs(current.lng - longitude) < 1e-6) return;

    marker.setLatLng([latitude, longitude]);
    map.setView([latitude, longitude], Math.max(map.getZoom(), 15), { animate: true });
  }, [latitude, longitude]);

  return (
    <div className={cn('nearby-map relative isolate overflow-hidden rounded-xl ring-1 ring-border', className)}>
      <div
        ref={containerRef}
        className="h-64 w-full bg-surface-sunken"
        role="application"
        aria-label="Map for placing the event pin. Drag the pin or click the map to move it."
      />
    </div>
  );
}
