import { TrendingBadge } from './TrendingBadge';
import { EventCard } from './EventCard';
import { cn } from '@/lib/utils';
import type { TrendingEvent } from '@/lib/types';

interface TrendingEventCardProps {
    event: TrendingEvent;
    pending?: boolean;
    onToggleRsvp?: (event: TrendingEvent) => void;
    className?: string;
}

/**
 * Wraps EventCard and adds an Event Pulse badge + reason chips.
 *
 * Distinct from RecommendedEventCard:
 *   - RecommendedEventCard = Personalized relevance (distance, interests)
 *   - TrendingEventCard    = Community momentum (recent RSVP velocity & growth)
 */
export function TrendingEventCard({
    event,
    pending = false,
    onToggleRsvp,
    className,
}: TrendingEventCardProps) {
    const status = event.pulseStatus;
    const score = event.pulseScore;
    const reasons = event.pulseReasons ?? [];

    return (
        <div className={cn('space-y-2', className)}>
            {/* Pulse status badge sits above card header */}
            <div className="flex items-center gap-2">
                <TrendingBadge status={status} score={score} />
            </div>

            {/* Standard EventCard */}
            <EventCard
                event={event}
                pending={pending}
                onToggleRsvp={onToggleRsvp ? () => onToggleRsvp(event) : undefined}
            />

            {/* Pulse reason chips (1–2 short explanations of recent community activity) */}
            {reasons.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Why this event is trending">
                    {reasons.map((reason) => (
                        <li
                            key={reason}
                            className="inline-flex items-center rounded-full bg-surface px-2.5 py-0.5 text-[0.7rem] font-medium text-ink-soft ring-1 ring-border"
                        >
                            {reason}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
