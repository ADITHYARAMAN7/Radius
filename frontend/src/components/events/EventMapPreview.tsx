import { X } from 'lucide-react';
import { Card } from '@/components/ui/Primitives';
import { ButtonLink } from '@/components/ui/Button';
import { CategoryBadge } from './CategoryBadge';
import { formatEventDate, formatRsvpCount, formatTimeRange } from '@/lib/utils';
import type { EventRecord } from '@/lib/types';

/** Pin colour per category — shared by both map engines so they look identical. */
export const CATEGORY_PIN_COLORS: Record<string, string> = {
  Sports: '#10b981',
  Music: '#8b5cf6',
  Food: '#f97316',
  'Yard Sale': '#f59e0b',
  Community: '#0ea5e9',
  Education: '#3b82f6',
  Technology: '#6366f1',
  Other: '#64748b',
};

/** Coimbatore city centre — the fallback view when no event has coordinates. */
export const DEFAULT_MAP_CENTER = { lat: 11.0168, lng: 76.9558 };

/** The card that opens over the map when a pin is selected. */
export function EventMapPreview({ event, onClose }: { event: EventRecord; onClose: () => void }) {
  return (
    <Card className="absolute bottom-4 left-4 right-4 z-[1100] animate-fade-up overflow-hidden shadow-lg sm:right-auto sm:w-80">
      <div className="flex gap-3 p-3">
        {event.imageUrl && (
          <img
            src={event.imageUrl}
            alt=""
            className="h-20 w-20 shrink-0 rounded-lg object-cover"
            loading="lazy"
          />
        )}

        <div className="min-w-0 flex-1">
          <CategoryBadge category={event.category} size="sm" />

          <h3 className="clamp-2 mt-1.5 font-display text-sm font-bold leading-snug text-ink">
            {event.title}
          </h3>

          <p className="mt-1 text-xs text-ink-soft">
            {formatEventDate(event.startsAt)} · {formatTimeRange(event.startTime, event.endTime)}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">{formatRsvpCount(event.rsvpCount)}</p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="-m-1 h-7 w-7 shrink-0 rounded-lg text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
          aria-label="Close event preview"
        >
          <X className="mx-auto h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="border-t border-border p-2">
        <ButtonLink to={`/events/${event.id}`} variant="soft" size="sm" full>
          View full event
        </ButtonLink>
      </div>
    </Card>
  );
}
