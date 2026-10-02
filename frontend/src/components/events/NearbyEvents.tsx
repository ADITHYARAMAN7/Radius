import { useMemo, useState } from 'react';
import { ArrowRight, Crosshair, MapPinOff, Navigation, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Primitives';
import { EventCard } from './EventCard';
import { EventGridSkeleton, ErrorState } from '@/components/common/States';
import { useEvents } from '@/hooks/useEvents';
import { useRsvp } from '@/hooks/useRsvp';
import { useNearby } from '@/hooks/useNearby';
import { distanceKm as haversine } from '@/lib/utils';

const RADIUS_OPTIONS = [2, 5, 10, 25] as const;
const DEFAULT_RADIUS = 10;

/**
 * "Happening near you" — the one section on the home page driven by where the visitor
 * actually is rather than by what was posted most recently.
 *
 * Retrieval reuses the existing Firestore distance filter on the API; the per-card
 * distance is computed in the browser from coordinates the event already carries, so
 * showing it costs no extra request.
 *
 * Location is never requested on page load. The section renders a prompt, and the
 * permission dialog only appears if the visitor asks for it.
 */
export function NearbyEvents() {
  const { position, status, error, request, clear } = useNearby();
  const [radius, setRadius] = useState<number>(DEFAULT_RADIUS);

  const ready = status === 'ready' && position !== null;

  // Held back until a position exists, rather than firing a meaningless query.
  const { events, loading, error: loadError, reload, applyRsvp } = useEvents(
    ready
      ? { lat: position.lat, lng: position.lng, radiusKm: radius, sort: 'soonest', pageSize: 3 }
      : {},
    ready,
  );

  const { toggle, isPending } = useRsvp({ onChange: applyRsvp });

  // Sort by true proximity rather than by start time, which is what "near you" implies.
  const withDistance = useMemo(() => {
    if (!ready) return [];

    return events
      .map((event) => ({
        event,
        km:
          event.latitude !== null && event.longitude !== null
            ? haversine(position.lat, position.lng, event.latitude, event.longitude)
            : null,
      }))
      .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
  }, [events, ready, position]);

  /* ------------------------------------------------------- not asked yet */

  if (status === 'idle' || status === 'locating') {
    return (
      <section className="container-page py-8">
        <Card className="flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
              <Navigation className="h-5 w-5" aria-hidden="true" />
            </span>

            <div>
              <h2 className="font-display text-lg font-bold text-ink">
                See what&rsquo;s happening near you
              </h2>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-soft">
                Share your location and we will show the events closest to you first. It stays
                in your browser and is never sent anywhere except to filter this list.
              </p>
              {error && <p className="mt-2 text-sm font-medium text-danger-ink">{error}</p>}
            </div>
          </div>

          <Button
            variant="primary"
            onClick={request}
            loading={status === 'locating'}
            loadingLabel="Finding you"
            className="shrink-0"
          >
            <Crosshair className="h-4 w-4" aria-hidden="true" />
            Show nearby events
          </Button>
        </Card>
      </section>
    );
  }

  /* ------------------------------------------------- denied / unsupported */

  if (status === 'denied' || status === 'unsupported') {
    return (
      <section className="container-page py-8">
        <Card className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-sunken text-ink-muted">
              <MapPinOff className="h-5 w-5" aria-hidden="true" />
            </span>

            <div>
              <h2 className="font-display text-base font-bold text-ink">
                {status === 'denied' ? 'Location is switched off' : 'Location is unavailable here'}
              </h2>
              <p className="mt-1 max-w-lg text-sm leading-relaxed text-ink-soft">
                No problem — you can still find things close to home by filtering on a
                neighbourhood or city.
              </p>
            </div>
          </div>

          <ButtonLink to="/explore" variant="secondary" className="shrink-0">
            Browse by neighbourhood
          </ButtonLink>
        </Card>
      </section>
    );
  }

  /* ------------------------------------------------------------- results */

  // Unreachable in practice — `status === 'ready'` implies a position — but the compiler
  // cannot narrow through the branches above, and an explicit guard beats a non-null
  // assertion that would silently break if the states ever diverge.
  if (!position) return null;

  if (loadError) {
    return (
      <section className="container-page py-8">
        <h2 className="text-display-md">Happening near you</h2>
        <ErrorState error={loadError} onRetry={reload} className="mt-5" />
      </section>
    );
  }

  const exploreHref = `/explore?lat=${position.lat.toFixed(4)}&lng=${position.lng.toFixed(4)}&radiusKm=${radius}`;

  return (
    <section className="container-page py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-display-md">
            <Navigation className="h-6 w-6 text-accent" aria-hidden="true" />
            Happening near you
          </h2>
          <p className="mt-1.5 text-sm text-ink-soft">
            The closest events to where you are right now.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="nearby-radius" className="sr-only">
            Search radius
          </label>
          <select
            id="nearby-radius"
            value={radius}
            onChange={(changeEvent) => setRadius(Number(changeEvent.target.value))}
            className="h-9 cursor-pointer rounded-xl bg-surface px-3 text-sm font-medium text-ink ring-1 ring-inset ring-border focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {RADIUS_OPTIONS.map((km) => (
              <option key={km} value={km}>
                Within {km} km
              </option>
            ))}
          </select>

          <Button variant="ghost" size="sm" onClick={clear} title="Stop using your location">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">Stop using my location</span>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="mt-6">
          <EventGridSkeleton count={3} />
        </div>
      ) : withDistance.length === 0 ? (
        <Card className="mt-6 px-6 py-10 text-center">
          <p className="text-sm text-ink-soft">
            Nothing within {radius} km just now. Try a wider radius, or{' '}
            <Link to="/explore" className="font-semibold text-brand hover:text-brand-hover">
              browse everything upcoming
            </Link>
            .
          </p>
        </Card>
      ) : (
        <>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {withDistance.map(({ event, km }) => (
              <EventCard
                key={event.id}
                event={event}
                distanceKm={km}
                pending={isPending(event.id)}
                onToggleRsvp={toggle}
              />
            ))}
          </div>

          <div className="mt-6">
            <Link
              to={exploreHref}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand transition-colors hover:text-brand-hover"
            >
              See everything within {radius} km
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
