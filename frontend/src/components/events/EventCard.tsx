import { Link } from 'react-router-dom';
import { CalendarDays, Clock, MapPin, Navigation, Users } from 'lucide-react';
import { Badge, Card } from '@/components/ui/Primitives';
import { ButtonLink } from '@/components/ui/Button';
import { CategoryBadge, CategoryIcon } from './CategoryBadge';
import { RsvpButton } from './RsvpButton';
import { SaveButton } from './SaveButton';
import {
  CATEGORY_STYLES,
  cn,
  eventLifecycle,
  formatEventDate,
  formatDistance,
  formatRsvpCount,
  formatTimeRange,
  hasFinished,
  isHappeningNow,
} from '@/lib/utils';
import type { EventRecord } from '@/lib/types';

interface EventCardProps {
  event: EventRecord;
  pending?: boolean;
  onToggleRsvp?: (event: EventRecord) => void;
  /** Shows the lifecycle chip (Finished / Cancelled) — used on My Events. */
  showStatus?: boolean;
  /** Distance from the viewer in km. Set only where a position is known. */
  distanceKm?: number | null;
  /** Lets a list react when the bookmark changes, e.g. to drop the card from "Saved". */
  onSaveChange?: (eventId: string, saved: boolean) => void;
  className?: string;
}

/**
 * The core unit of the board.
 *
 * The whole card is a link via a stretched overlay, while the action buttons sit above it
 * in the stacking order — so clicking anywhere opens the event, but "I'm Going" still
 * RSVPs without navigating away.
 */
export function EventCard({
  event,
  pending = false,
  onToggleRsvp,
  showStatus = false,
  distanceKm = null,
  onSaveChange,
  className,
}: EventCardProps) {
  const lifecycle = eventLifecycle(event);
  const live = isHappeningNow(event) && event.status !== 'CANCELLED';
  const style = CATEGORY_STYLES[event.category];

  return (
    <Card
      interactive
      className={cn('group relative flex flex-col overflow-hidden', className)}
    >
      {/* ------------------------------------------------------------- image */}
      <div className="relative aspect-[16/10] overflow-hidden bg-surface-sunken">
        {event.imageUrl ? (
          <img
            src={event.imageUrl}
            // Describes the event, not the picture — the picture is decorative, the event is not.
            alt={`${event.title} in ${event.neighborhood}`}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          /*
           * No photo is the common case for a freshly posted event, so the placeholder has
           * to look deliberate rather than like a failed image. Showing the category icon
           * and name makes the empty slot carry information instead of just space.
           */
          <div
            className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-sunken"
            aria-hidden="true"
          >
            <span
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ring-inset',
                style.badge,
              )}
            >
              <CategoryIcon category={event.category} className="h-6 w-6" />
            </span>
            <span className="text-xs font-semibold text-ink-muted">{event.category}</span>
          </div>
        )}

        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={event.category} size="sm" className="bg-surface/95 backdrop-blur" />

          {live && (
            <Badge tone="success" size="sm" className="bg-surface/95 backdrop-blur">
              <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
              </span>
              Happening now
            </Badge>
          )}

          {(showStatus || event.status === 'EXPIRED' || hasFinished(event)) && !live && (
            <Badge tone={lifecycle.tone} size="sm" className="bg-surface/95 backdrop-blur">
              {lifecycle.label}
            </Badge>
          )}
        </div>

        {/* Above the stretched link, so saving never opens the event. */}
        <SaveButton event={event} onChange={onSaveChange} className="absolute right-3 top-3 z-10" />

        {/* RSVP count sits on the image so it reads at a glance while scanning the grid. */}
        <div className="absolute bottom-3 right-3">
          <Badge tone="neutral" size="sm" className="bg-surface/95 backdrop-blur">
            <Users className="h-3 w-3" aria-hidden="true" />
            <span className="tabular-nums">{event.rsvpCount}</span>
            <span className="sr-only">{formatRsvpCount(event.rsvpCount)}</span>
          </Badge>
        </div>
      </div>

      {/* ------------------------------------------------------------ content */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="clamp-2 font-display text-base font-bold leading-snug text-ink transition-colors group-hover:text-brand">
          {/*
            The stretched link makes the card clickable. It carries the accessible name,
            so there is exactly one link per card in the tab order rather than three.
          */}
          <Link to={`/events/${event.id}`} className="before:absolute before:inset-0 before:z-0">
            {event.title}
          </Link>
        </h3>

        <dl className="mt-3 space-y-1.5 text-[0.8125rem] text-ink-soft">
          <div className="flex items-center gap-2">
            <dt className="sr-only">Date</dt>
            <CalendarDays className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
            <dd className="font-semibold text-ink">{formatEventDate(event.startsAt)}</dd>
          </div>

          <div className="flex items-center gap-2">
            <dt className="sr-only">Time</dt>
            <Clock className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
            <dd>{formatTimeRange(event.startTime, event.endTime)}</dd>
          </div>

          <div className="flex items-start gap-2">
            <dt className="sr-only">Location</dt>
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
            <dd className="clamp-2">
              <span className="font-medium text-ink">{event.neighborhood}</span>
              <span className="text-ink-muted"> · {event.location}</span>
            </dd>
          </div>

          {/* Only rendered where the viewer has shared a location. */}
          {distanceKm !== null && (
            <div className="flex items-center gap-2">
              <dt className="sr-only">Distance from you</dt>
              <Navigation className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              <dd className="font-semibold text-accent-ink">{formatDistance(distanceKm)}</dd>
            </div>
          )}
        </dl>

        {/* ----------------------------------------------------------- actions */}
        <div className="relative z-10 mt-auto flex items-center gap-2 pt-5">
          <ButtonLink to={`/events/${event.id}`} variant="secondary" size="sm" className="flex-1">
            View event
          </ButtonLink>

          {onToggleRsvp && (
            <RsvpButton event={event} pending={pending} onToggle={onToggleRsvp} size="sm" />
          )}
        </div>
      </div>
    </Card>
  );
}
