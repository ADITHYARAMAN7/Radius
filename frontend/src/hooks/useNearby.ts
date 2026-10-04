import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'radius:location';

/** How long a remembered position stays usable before we ask again. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type NearbyStatus = 'idle' | 'locating' | 'ready' | 'denied' | 'unsupported';

export interface NearbyPosition {
  lat: number;
  lng: number;
  savedAt: number;
}

interface StoredPosition extends NearbyPosition {
  version: 1;
}

function readStored(): NearbyPosition | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredPosition>;
    if (
      parsed.version !== 1 ||
      typeof parsed.lat !== 'number' ||
      typeof parsed.lng !== 'number' ||
      typeof parsed.savedAt !== 'number'
    ) {
      return null;
    }

    // A day-old fix is fine for "what is near me"; older than that and the user has
    // probably moved, so ask again rather than quietly showing the wrong neighbourhood.
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return null;

    return { lat: parsed.lat, lng: parsed.lng, savedAt: parsed.savedAt };
  } catch {
    // Private browsing, blocked storage, or corrupted JSON — all mean "no position".
    return null;
  }
}

function writeStored(position: NearbyPosition): void {
  try {
    const payload: StoredPosition = { ...position, version: 1 };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Not being able to remember it is not worth failing the feature over.
  }
}

/**
 * Browser location for the "near you" features.
 *
 * Two rules this follows deliberately:
 *
 *  1. **Never prompt on page load.** A permission dialog nobody asked for is the fastest
 *     way to get it denied permanently. `request()` only runs from a user gesture.
 *  2. **Remember the answer.** A granted position is cached for a day, so a returning
 *     visitor gets nearby events immediately with no second prompt.
 */
export function useNearby() {
  const [position, setPosition] = useState<NearbyPosition | null>(null);
  const [status, setStatus] = useState<NearbyStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // Restore a previous answer, and notice up front if the API is unavailable at all.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setStatus('unsupported');
      return;
    }

    const stored = readStored();
    if (stored) {
      setPosition(stored);
      setStatus('ready');
    }
  }, []);

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unsupported');
      setError('This browser cannot share your location.');
      return;
    }

    setStatus('locating');
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (result) => {
        const next: NearbyPosition = {
          lat: result.coords.latitude,
          lng: result.coords.longitude,
          savedAt: Date.now(),
        };

        setPosition(next);
        setStatus('ready');
        writeStored(next);
      },
      (geoError) => {
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setStatus('denied');
          setError('Location permission was declined.');
        } else {
          setStatus('idle');
          setError(
            geoError.code === geoError.TIMEOUT
              ? 'Finding your location took too long. Try again.'
              : 'We could not work out where you are.',
          );
        }
      },
      // High accuracy is pointless for a kilometre-scale radius and costs battery.
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }, []);

  const clear = useCallback(() => {
    setPosition(null);
    setStatus('idle');
    setError(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing useful to do if storage is unavailable.
    }
  }, []);

  return { position, status, error, request, clear };
}
