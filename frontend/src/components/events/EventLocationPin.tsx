import { Suspense, lazy, useState } from 'react';
import { Crosshair, MapPin, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Leaflet is only fetched once there is a pin to show. */
const LocationPicker = lazy(() => import('./LocationPicker'));

interface Notice {
  tone: 'success' | 'warning' | 'danger';
  text: string;
}

const NOTICE_TONES: Record<Notice['tone'], string> = {
  success: 'bg-success-soft text-success-ink ring-success/25',
  warning: 'bg-warning-soft text-warning-ink ring-warning/25',
  danger: 'bg-danger-soft text-danger-ink ring-danger/25',
};

function parse(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * The "where exactly" part of the event form.
 *
 * The pin is what puts an event on the map and into "near me" and distance searches, so it
 * should not depend on someone knowing their latitude. Two buttons do the work instead —
 * look the address up, or use where you are standing — and the map lets the organiser
 * drag the pin to the precise spot. Leaving it empty is still fine: the server looks the
 * address up when the event is saved.
 */
export function EventLocationPin({
  address,
  neighborhood,
  city,
  latitude,
  longitude,
  errors,
  onChange,
}: {
  address: string;
  neighborhood: string;
  city: string;
  /** Kept as strings because they are form fields the user can type into. */
  latitude: string;
  longitude: string;
  errors: { latitude?: string; longitude?: string };
  onChange: (latitude: string, longitude: string) => void;
}) {
  const [finding, setFinding] = useState(false);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const lat = parse(latitude);
  const lng = parse(longitude);
  const hasPin = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const canSearch = Boolean(address.trim() || neighborhood.trim() || city.trim());

  const findFromAddress = async () => {
    if (!canSearch) {
      setNotice({ tone: 'warning', text: 'Fill in the address, neighbourhood or city above first.' });
      return;
    }

    setFinding(true);
    setNotice(null);

    try {
      const { result } = await api.geocode({ address, neighborhood, city });

      if (!result) {
        setNotice({
          tone: 'warning',
          text: 'We could not find that address on the map. Check the city name, or use your current location instead.',
        });
        return;
      }

      onChange(String(result.latitude), String(result.longitude));

      setNotice(
        result.precision === 'address'
          ? { tone: 'success', text: `Pinned at ${result.label}. Drag the pin if it is not quite right.` }
          : {
              tone: 'warning',
              text: `We could only place this in ${result.label}, not at the exact address. Drag the pin to the right spot.`,
            },
      );
    } catch (error) {
      setNotice({
        tone: 'danger',
        text: error instanceof ApiError ? error.message : 'The address lookup is unavailable right now.',
      });
    } finally {
      setFinding(false);
    }
  };

  const useCurrentLocation = () => {
    if (!('geolocation' in navigator)) {
      setNotice({ tone: 'danger', text: 'This browser cannot share your location.' });
      return;
    }

    setLocating(true);
    setNotice(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onChange(position.coords.latitude.toFixed(5), position.coords.longitude.toFixed(5));

        // A desktop without GPS can be off by kilometres; say so rather than imply precision.
        const metres = Math.round(position.coords.accuracy);
        setNotice(
          metres > 500
            ? {
                tone: 'warning',
                text: `Pinned at your location, but your device is only accurate to about ${
                  metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`
                } here. Drag the pin to the right spot.`,
              }
            : { tone: 'success', text: 'Pinned at your current location. Drag the pin to adjust it.' },
        );
      },
      (error) => {
        setLocating(false);
        setNotice({
          tone: 'danger',
          text:
            error.code === error.PERMISSION_DENIED
              ? 'Location permission was declined. You can find the pin from the address instead.'
              : 'We could not work out where you are. Try finding the pin from the address.',
        });
      },
      // This is a one-off placement the organiser is waiting on, so ask for the best fix.
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  };

  const clearPin = () => {
    onChange('', '');
    setNotice(null);
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <MapPin className="h-4 w-4 text-brand" aria-hidden="true" />
          Pin on the map
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          The pin is what makes your event show up in &ldquo;near me&rdquo; and on the map. If you
          leave it empty we will look the address up when you publish.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void findFromAddress()}
          loading={finding}
          loadingLabel="Searching"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          Find from address
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={useCurrentLocation}
          loading={locating}
          loadingLabel="Locating"
        >
          <Crosshair className="h-4 w-4" aria-hidden="true" />
          Use my current location
        </Button>

        {hasPin && (
          <Button type="button" variant="ghost" size="sm" onClick={clearPin}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Remove pin
          </Button>
        )}
      </div>

      {notice && (
        <p role="status" className={cn('rounded-xl px-3 py-2.5 text-xs font-medium leading-relaxed ring-1', NOTICE_TONES[notice.tone])}>
          {notice.text}
        </p>
      )}

      {hasPin && (
        <Suspense fallback={<div className="shimmer h-64 rounded-xl" aria-hidden="true" />}>
          <LocationPicker
            latitude={lat}
            longitude={lng}
            onChange={(nextLat, nextLng) => onChange(String(nextLat), String(nextLng))}
          />
        </Suspense>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Input
          id="field-latitude"
          label="Latitude"
          value={latitude}
          onChange={(changeEvent) => onChange(changeEvent.target.value, longitude)}
          error={errors.latitude}
          hint="Filled in by the buttons above."
          placeholder="11.0168"
          inputMode="decimal"
        />

        <Input
          id="field-longitude"
          label="Longitude"
          value={longitude}
          onChange={(changeEvent) => onChange(latitude, changeEvent.target.value)}
          error={errors.longitude}
          hint="Or type both yourself."
          placeholder="76.9558"
          inputMode="decimal"
        />
      </div>
    </div>
  );
}
