import { logger } from '../config/logger';

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  /** What the geocoder matched, e.g. "Fairlands, Salem West, Salem, Tamil Nadu". */
  label: string;
  /**
   * How close the match is likely to be: the address itself, the surrounding area, or
   * only the city. The form uses it to tell the organiser whether to adjust the pin.
   */
  precision: 'address' | 'area' | 'city';
}

export interface GeocodeInput {
  address?: string;
  neighborhood?: string;
  city?: string;
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
/** Nominatim's usage policy asks for an identifying User-Agent and at most one request a second. */
const USER_AGENT = 'NearbyEvents/1.0 (community event board; hackathon project)';
const MIN_INTERVAL_MS = 1100;
const REQUEST_TIMEOUT_MS = 5000;
/** Geocoding must never hold up publishing an event for long. */
const TOTAL_BUDGET_MS = 9000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const cache = new Map<string, { value: GeocodeResult | null; expiresAt: number }>();
let lastRequestAt = 0;
/** Serialises lookups so concurrent callers still respect the one-per-second limit. */
let queue: Promise<unknown> = Promise.resolve();

function clean(value: string | undefined): string {
  return (value ?? '')
    // "salem-636016" → "salem 636016": the hyphen makes the postcode unrecognisable.
    .replace(/-\s*(\d{5,6})\b/g, ' $1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The queries to try, most specific first.
 *
 * Addresses on a neighbourhood board are written for people, not for geocoders —
 * "126/1, 1st cross, Thoppukadu, Fairlands, Salem" has no chance as a whole, but its tail
 * ("Fairlands, Salem") resolves fine. So the house-level detail is progressively dropped
 * until something matches; an approximate pin in the right area is far more useful to the
 * distance filter than no pin at all.
 */
function candidates(input: GeocodeInput): Array<{ query: string; precision: GeocodeResult['precision'] }> {
  const address = clean(input.address);
  const neighborhood = clean(input.neighborhood);
  const city = clean(input.city);

  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  const withCity = (query: string) =>
    city && !query.toLowerCase().includes(city.toLowerCase()) ? `${query}, ${city}` : query;

  const list: Array<{ query: string; precision: GeocodeResult['precision'] }> = [];

  if (address) list.push({ query: withCity(address), precision: 'address' });
  if (parts.length > 3) list.push({ query: withCity(parts.slice(-3).join(', ')), precision: 'area' });
  if (parts.length > 2) list.push({ query: withCity(parts.slice(-2).join(', ')), precision: 'area' });
  if (neighborhood) list.push({ query: withCity(neighborhood), precision: 'area' });
  if (city) list.push({ query: city, precision: 'city' });

  const seen = new Set<string>();
  return list.filter(({ query }) => {
    const key = query.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface NominatimRow {
  lat?: string;
  lon?: string;
  display_name?: string;
}

async function lookup(query: string): Promise<{ latitude: number; longitude: number; label: string } | null> {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();

  const url = new URL(ENDPOINT);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('q', query);

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`Nominatim responded ${response.status}`);

  const rows = (await response.json()) as NominatimRow[];
  const row = rows[0];
  const latitude = Number(row?.lat);
  const longitude = Number(row?.lon);

  if (!row || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    // ~1 m of precision is plenty, and keeps the stored numbers tidy.
    latitude: Number(latitude.toFixed(5)),
    longitude: Number(longitude.toFixed(5)),
    label: String(row.display_name ?? query),
  };
}

async function resolve(input: GeocodeInput): Promise<GeocodeResult | null> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  for (const { query, precision } of candidates(input)) {
    if (Date.now() > deadline) break;

    try {
      const match = await lookup(query);
      if (match) {
        logger.info('Geocoded an event location', { query, precision });
        return { ...match, precision };
      }
    } catch (error) {
      // One failed query (timeout, rate limit) should not stop the less specific ones.
      logger.warn('Geocoding request failed', { query, reason: (error as { message?: string }).message });
    }
  }

  return null;
}

/**
 * Turns a written address into map coordinates using OpenStreetMap's Nominatim, which
 * needs no API key.
 *
 * Best-effort by design: it returns null rather than throwing, because an event without a
 * pin is still a perfectly good event — it just will not appear in distance searches.
 */
export function geocode(input: GeocodeInput): Promise<GeocodeResult | null> {
  const key = [clean(input.address), clean(input.neighborhood), clean(input.city)].join('|').toLowerCase();
  if (key === '||') return Promise.resolve(null);

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);

  const task = queue.then(async () => {
    // Another caller may have filled the cache while this one waited its turn.
    const fresh = cache.get(key);
    if (fresh && fresh.expiresAt > Date.now()) return fresh.value;

    const value = await resolve(input);
    // A miss is cached too, but briefly: the address may simply be edited and retried.
    cache.set(key, { value, expiresAt: Date.now() + (value ? CACHE_TTL_MS : 5 * 60 * 1000) });
    return value;
  });

  queue = task.catch(() => undefined);
  return task;
}
