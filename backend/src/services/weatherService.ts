import { logger } from '../config/logger';
import type { EventRecord } from '../types';

export type WeatherKind = 'clear' | 'cloudy' | 'fog' | 'rain' | 'storm' | 'snow';

export interface EventWeather {
  available: boolean;
  /** Why there is no forecast, written for the user. Only set when `available` is false. */
  reason?: string;
  temperatureC?: number;
  precipitationChance?: number;
  kind?: WeatherKind;
  label?: string;
  /** Practical one-liner: bring an umbrella, carry water, good day to be outside. */
  advice?: string;
  /** The local hour the reading is for, e.g. "18:00". */
  forHour?: string;
}

/** Open-Meteo forecasts roughly sixteen days out; beyond that there is nothing to show. */
const FORECAST_HORIZON_DAYS = 15;
const CACHE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 6000;

const cache = new Map<string, { value: EventWeather; expiresAt: number }>();

/** WMO weather interpretation codes, as returned by Open-Meteo. */
function describe(code: number): { kind: WeatherKind; label: string } {
  if (code === 0) return { kind: 'clear', label: 'Clear sky' };
  if (code === 1) return { kind: 'clear', label: 'Mostly clear' };
  if (code === 2) return { kind: 'cloudy', label: 'Partly cloudy' };
  if (code === 3) return { kind: 'cloudy', label: 'Overcast' };
  if (code === 45 || code === 48) return { kind: 'fog', label: 'Foggy' };
  if (code >= 51 && code <= 57) return { kind: 'rain', label: 'Drizzle' };
  if (code >= 61 && code <= 67) return { kind: 'rain', label: 'Rain' };
  if (code >= 71 && code <= 77) return { kind: 'snow', label: 'Snow' };
  if (code >= 80 && code <= 82) return { kind: 'rain', label: 'Rain showers' };
  if (code === 85 || code === 86) return { kind: 'snow', label: 'Snow showers' };
  if (code >= 95) return { kind: 'storm', label: 'Thunderstorm' };
  return { kind: 'cloudy', label: 'Cloudy' };
}

function adviceFor(kind: WeatherKind, temperatureC: number, precipitationChance: number): string {
  if (kind === 'storm') return 'Thunderstorms are possible — check with the organiser before heading out.';
  if (precipitationChance >= 60 || kind === 'rain') return 'Rain is likely, so bring an umbrella.';
  if (precipitationChance >= 30) return 'There is a chance of showers — an umbrella would not hurt.';
  if (temperatureC >= 35) return 'It will be hot. Carry water and wear a cap.';
  if (temperatureC <= 12) return 'It will be chilly, so bring a layer.';
  return 'Good weather for being out and about.';
}

interface OpenMeteoResponse {
  hourly?: {
    time?: string[];
    temperature_2m?: Array<number | null>;
    precipitation_probability?: Array<number | null>;
    weather_code?: Array<number | null>;
  };
}

/**
 * Forecast for the hour an event starts, at the place it happens.
 *
 * Uses Open-Meteo, which needs no API key. The lookup is best-effort by design: a weather
 * outage must never break an event page, so every failure comes back as
 * `{ available: false }` and the page simply leaves the card out.
 */
export async function getEventWeather(
  event: Pick<EventRecord, 'latitude' | 'longitude' | 'date' | 'startTime' | 'startsAt' | 'endsAt'>,
): Promise<EventWeather> {
  if (event.latitude === null || event.longitude === null) {
    return { available: false, reason: 'This event has no pinned location.' };
  }

  const now = Date.now();
  if (new Date(event.endsAt).getTime() < now) {
    return { available: false, reason: 'This event has already finished.' };
  }

  const daysAway = (new Date(event.startsAt).getTime() - now) / 86_400_000;
  if (daysAway > FORECAST_HORIZON_DAYS) {
    return { available: false, reason: 'The forecast will appear about two weeks before the event.' };
  }

  const hour = Number(event.startTime.split(':')[0]);
  const hourLabel = `${String(Number.isFinite(hour) ? hour : 12).padStart(2, '0')}:00`;

  // ~1 km grid: every event at the same venue shares one upstream request.
  const key = `${event.latitude.toFixed(2)},${event.longitude.toFixed(2)},${event.date},${hourLabel}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', event.latitude.toFixed(4));
  url.searchParams.set('longitude', event.longitude.toFixed(4));
  url.searchParams.set('hourly', 'temperature_2m,precipitation_probability,weather_code');
  url.searchParams.set('start_date', event.date);
  url.searchParams.set('end_date', event.date);
  // Local time at the venue, so the hour lines up with the event's own start time.
  url.searchParams.set('timezone', 'auto');

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`Open-Meteo responded ${response.status}`);

    const payload = (await response.json()) as OpenMeteoResponse;
    const times = payload.hourly?.time ?? [];
    const index = times.indexOf(`${event.date}T${hourLabel}`);

    const temperature = payload.hourly?.temperature_2m?.[index];
    const code = payload.hourly?.weather_code?.[index];

    if (index < 0 || typeof temperature !== 'number' || typeof code !== 'number') {
      throw new Error('Open-Meteo returned no reading for the event hour');
    }

    const precipitationChance = payload.hourly?.precipitation_probability?.[index] ?? 0;
    const { kind, label } = describe(code);
    const temperatureC = Math.round(temperature);

    const value: EventWeather = {
      available: true,
      temperatureC,
      precipitationChance,
      kind,
      label,
      advice: adviceFor(kind, temperatureC, precipitationChance),
      forHour: hourLabel,
    };

    cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
    return value;
  } catch (error) {
    logger.warn('Weather lookup failed', { reason: (error as { message?: string }).message });
    return { available: false, reason: 'The forecast is not available right now.' };
  }
}

// Keeps the cache from growing for the life of the process.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) if (entry.expiresAt < now) cache.delete(key);
}, CACHE_TTL_MS).unref();
