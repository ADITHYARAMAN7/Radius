import { useEffect, useState } from 'react';
import { Cloud, CloudFog, CloudLightning, CloudRain, Droplets, Snowflake, Sun } from 'lucide-react';
import { Card } from '@/components/ui/Primitives';
import { api } from '@/lib/api';
import { cn, formatTime, hasFinished } from '@/lib/utils';
import type { EventRecord, EventWeather, WeatherKind } from '@/lib/types';

const ICONS: Record<WeatherKind, typeof Sun> = {
  clear: Sun,
  cloudy: Cloud,
  fog: CloudFog,
  rain: CloudRain,
  storm: CloudLightning,
  snow: Snowflake,
};

/** Wet or stormy weather is the case worth drawing the eye to. */
const TONES: Record<WeatherKind, string> = {
  clear: 'bg-warning-soft text-warning-ink',
  cloudy: 'bg-surface-sunken text-ink-soft',
  fog: 'bg-surface-sunken text-ink-soft',
  rain: 'bg-brand-soft text-brand-ink',
  storm: 'bg-danger-soft text-danger-ink',
  snow: 'bg-brand-soft text-brand-ink',
};

/**
 * Forecast for the hour the event starts, at the venue.
 *
 * "Should I bring an umbrella?" is the question people ask right after "should I go?", and
 * most neighbourhood events are outdoors. The card renders nothing at all when there is no
 * forecast — too far ahead, no pinned location, or the weather service is down — because
 * an empty weather box is worse than no weather box.
 */
export function EventWeatherCard({ event }: { event: EventRecord }) {
  const [weather, setWeather] = useState<EventWeather | null>(null);

  const eligible =
    event.latitude !== null &&
    event.longitude !== null &&
    event.status === 'ACTIVE' &&
    !hasFinished(event);

  useEffect(() => {
    setWeather(null);
    if (!eligible) return;

    const controller = new AbortController();

    api
      .eventWeather(event.id, controller.signal)
      .then((result) => setWeather(result.weather))
      // Purely additive: any failure simply means no card.
      .catch(() => undefined);

    return () => controller.abort();
  }, [event.id, eligible]);

  if (!weather?.available || !weather.kind) return null;

  const Icon = ICONS[weather.kind];

  return (
    <Card className="flex items-start gap-3 p-4 sm:col-span-2">
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
          TONES[weather.kind],
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Forecast for {weather.forHour ? formatTime(weather.forHour) : 'the start'}
        </dt>
        <dd className="mt-0.5">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold text-ink">
            <span className="tabular-nums">{weather.temperatureC}°C</span>
            <span className="font-semibold text-ink-soft">{weather.label}</span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted">
              <Droplets className="h-3 w-3" aria-hidden="true" />
              <span className="tabular-nums">{weather.precipitationChance ?? 0}%</span> chance of rain
            </span>
          </p>
          <p className="mt-1 text-sm text-ink-soft">{weather.advice}</p>
        </dd>
      </div>
    </Card>
  );
}
