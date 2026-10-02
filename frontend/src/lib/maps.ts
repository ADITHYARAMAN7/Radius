import { Loader } from '@googlemaps/js-api-loader';

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

/** False when no key is configured — every Maps feature then falls back to plain inputs. */
export const isMapsConfigured = Boolean(MAPS_KEY);

/**
 * Exactly one Loader for the whole session: creating a second one with different
 * options throws. Libraries ('maps', 'places') are imported on demand from it.
 */
let loader: Loader | null = null;
const libraries = new Map<string, Promise<unknown>>();

export function loadMapsLibrary(name: 'maps'): Promise<google.maps.MapsLibrary>;
export function loadMapsLibrary(name: 'places'): Promise<google.maps.PlacesLibrary>;
export function loadMapsLibrary(name: 'maps' | 'places'): Promise<unknown> {
  if (!MAPS_KEY) return Promise.reject(new Error('Google Maps API key is not configured.'));

  loader ??= new Loader({ apiKey: MAPS_KEY, version: 'weekly' });

  let pending = libraries.get(name);
  if (!pending) {
    pending = loader.importLibrary(name);
    // A failed load (offline, blocked key) should be retryable on the next mount.
    pending.catch(() => libraries.delete(name));
    libraries.set(name, pending);
  }
  return pending;
}
