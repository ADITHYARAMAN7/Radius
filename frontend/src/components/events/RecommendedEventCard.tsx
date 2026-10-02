import { Sparkles } from 'lucide-react';
import { EventCard } from './EventCard';
import { cn } from '@/lib/utils';
import type { RecommendedEvent } from '@/lib/types';

interface RecommendedEventCardProps {
    event: RecommendedEvent;
    pending?: boolean;
    onToggleRsvp?: (event: RecommendedEvent) => void;
    className?: string;
}

/**
 * Wraps EventCard and adds a Local Relevance Score badge + reason chips.
 *
 * The score and reasons come from the backend intelligenceService — they explain
 * *why* the event was surfaced so the recommendation is transparent, not a black box.
 */
export function RecommendedEventCard({
    event,
    pending = false,
    onToggleRsvp,
    className,
}: RecommendedEventCardProps) {
    const score = event.relevanceScore;
    const reasons = event.relevanceReasons ?? [];

    /**
     * Colour coding for the score pill: green for high relevance, amber for medium,
     * and a neutral grey below 40. Purely cosmetic — the score is the same number regardless.
     */
    const pillStyle =
        score >= 75
            ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25'
            : score >= 50
                ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300 ring-amber-500/25'
                : 'bg-slate-500/12 text-slate-600 dark:text-slate-300 ring-slate-500/25';

    return (
        <div className={cn('space-y-2', className)}>
            {/* Score pill sits above the card so it doesn't compete with the card content. */}
            <div className="flex items-center gap-2">
                <span
                    className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1',
                        pillStyle,
                    )}
                    title="Local Relevance Score — a heuristic based on distance, interests, timing and engagement"
                >
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    {score}% relevant
                </span>
            </div>

            {/* Standard card — unchanged so every board feature (RSVP, share) still works. */}
            <EventCard
                event={event}
                pending={pending}
                onToggleRsvp={onToggleRsvp ? () => onToggleRsvp(event) : undefined}
            />

            {/* Reason chips: concise explanations of the score, max 4. */}
            {reasons.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Why this was recommended">
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
