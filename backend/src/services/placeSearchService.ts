import { logger } from '../config/logger';
import { placeKey } from '../utils/search';
import { getPlaceIndex } from './statsService';

/**
 * Address suggestions without a Google key, from Photon (komoot) — an OpenStreetMap search
 * built for search-as-you-type, whose public instance allows it under fair use (unlike
 * Nominatim, whose policy forbids autocomplete). When a Google Maps key is configured the
 * form uses Google Places instead and never calls this.
 */

const SEARCH = 'https://photon.komoot.io/api/';
const REVERSE = 'https://photon.komoot.io/reverse';
const USER_AGENT = 'NearbyEvents/1.0 (community event board; hackathon project)';
const TIMEOUT_MS = 4000;
const CACHE_TTL_MS = 10 * 60 * 1000;
/** Coimbatore city centre: results are ranked by distance from here. */
const BIAS = { lat: 11.0168, lon: 76.9558 };

export interface PlaceSuggestion {
  name: string;
  /** Human-readable address built from the OSM fields. */
  address: string;
  latitude: number;
  longitude: number;
  /** OSM tag value, e.g. "suburb", "mall", "park" — decides how the area is resolved. */
  kind: string;
  /** Raw OSM admin fields, passed back to resolvePlace() when the user picks this one. */
  city: string;
  county: string;
  locality: string;
}

export interface ResolvedPlace {
  neighborhood: string;
  city: string;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, string | undefined>;
}

const cache = new Map<string, { value: PlaceSuggestion[]; expiresAt: number }>();

/** OSM place types that are a neighbourhood in their own right. */
const AREA_KINDS = new Set(['suburb', 'quarter', 'neighbourhood', 'village', 'hamlet', 'town', 'locality']);
/** Ward numbers are administrative, not something people search by. */
const isWard = (value: string) => /^ward\s*\d+/i.test(value);

async function photon(url: URL): Promise<PhotonFeature[]> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Photon responded ${response.status}`);
  const body = (await response.json()) as { features?: PhotonFeature[] };
  return body.features ?? [];
}

/** Indian addresses: the taluk ("Perur", "Podanur") is not what anyone calls the city. */
function cityOf(p: { city?: string; county?: string }): string {
  const city = (p.city ?? '').trim();
  const county = (p.county ?? '').trim();
  if (/coimbatore/i.test(county) || /coimbatore/i.test(city)) return 'Coimbatore';
  return city || county;
}

function toSuggestion(feature: PhotonFeature): PlaceSuggestion | null {
  const p = feature.properties ?? {};
  const [lon, lat] = feature.geometry?.coordinates ?? [];
  if (p.country !== 'India' || typeof lat !== 'number' || typeof lon !== 'number' || !p.name) return null;

  const city = cityOf(p);
  const street = [p.housenumber, p.street].filter(Boolean).join(', ');
  const parts = [p.name, street, p.locality, p.district && !isWard(p.district) ? p.district : '', city, p.postcode]
    .map((part) => (part ?? '').trim())
    .filter(Boolean);
  // Long OSM street strings already contain the city; drop exact repeats.
  const address = parts.filter((part, index) => parts.findIndex((other) => placeKey(other) === placeKey(part)) === index).join(', ');

  return {
    name: p.name,
    address,
    latitude: Number(lat.toFixed(5)),
    longitude: Number(lon.toFixed(5)),
    kind: p.osm_value ?? '',
    city: p.city ?? '',
    county: p.county ?? '',
    locality: p.locality ?? '',
  };
}

/** Up to five places in India matching what the organiser has typed so far. */
export async function suggestPlaces(query: string): Promise<PlaceSuggestion[]> {
  const key = query.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const url = new URL(SEARCH);
  url.searchParams.set('q', query.trim());
  url.searchParams.set('lat', String(BIAS.lat));
  url.searchParams.set('lon', String(BIAS.lon));
  url.searchParams.set('limit', '10');
  url.searchParams.set('lang', 'en');

  try {
    const seen = new Set<string>();
    const value = (await photon(url))
      .map(toSuggestion)
      .filter((s): s is PlaceSuggestion => s !== null)
      .filter((s) => {
        const id = placeKey(s.address);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .slice(0, 5);
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (error) {
    // Best effort: the form still works by typing the address and using "Find from address".
    logger.warn('Place suggestions unavailable', { reason: (error as { message?: string }).message });
    return [];
  }
}

/** Snaps a name to the spelling already used on the board ("RS Puram" → "R.S. Puram"). */
async function knownSpelling(name: string): Promise<string> {
  if (!name) return name;
  const index = await getPlaceIndex().catch(() => ({ neighborhoods: [] as string[], cities: [] as string[] }));
  return index.neighborhoods.find((known) => placeKey(known) === placeKey(name)) ?? name;
}

/**
 * The neighbourhood and city for a picked suggestion. An area (suburb, village) is its own
 * neighbourhood; for a venue (mall, park, college) the surrounding suburb is looked up
 * once by reverse geocoding — only on pick, never per keystroke.
 */
export async function resolvePlace(input: {
  latitude: number;
  longitude: number;
  name: string;
  kind: string;
  city?: string;
  county?: string;
  locality?: string;
}): Promise<ResolvedPlace> {
  const city = cityOf(input);
  let neighborhood = '';

  if (AREA_KINDS.has(input.kind)) {
    neighborhood = input.name;
  } else {
    try {
      const url = new URL(REVERSE);
      url.searchParams.set('lat', String(input.latitude));
      url.searchParams.set('lon', String(input.longitude));
      url.searchParams.set('layer', 'locality');
      url.searchParams.set('limit', '1');
      url.searchParams.set('lang', 'en');
      const area = (await photon(url))[0]?.properties;
      if (area?.name && AREA_KINDS.has(area.osm_value ?? '') && !isWard(area.name)) neighborhood = area.name;
    } catch (error) {
      logger.warn('Reverse place lookup failed', { reason: (error as { message?: string }).message });
    }
  }

  // A village or small town (Ettimadai, Perur) is the neighbourhood when nothing finer fits.
  if (!neighborhood) {
    const town = (input.city ?? '').trim();
    if (town && placeKey(town) !== placeKey(city)) neighborhood = town;
    else if (input.locality && !isWard(input.locality)) neighborhood = input.locality;
  }

  return { neighborhood: await knownSpelling(neighborhood), city };
}
