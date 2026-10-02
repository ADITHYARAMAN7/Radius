import { useEffect, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { RecommendedEventCard } from './RecommendedEventCard';
import { EventGridSkeleton } from '@/components/common/States';
import { useRsvp } from '@/hooks/useRsvp';
import { useNearby } from '@/hooks/useNearby';
import { api } from '@/lib/api';
import type { RecommendedEvent } from '@/lib/types';

/**
 * "Recommended for You" section for the Home page.
 *
 * Uses the stored geolocation from `useNearby` (never prompts on load — respects
 * the existing UX policy) to pass context to the scoring endpoint.
 *
 * Renders nothing on error or empty state, consistent with other home sections.
 */
export function RecommendedSection() {
    const { position } = useNearby();

    const [events, setEvents] = useState<RecommendedEvent[]>([]);
    const [loading, setLoading] = useState(true);

    // useRsvp onChange receives (eventId, attending, rsvpCount).
    const { toggle, isPending } = useRsvp({
        onChange: (eventId, attending, rsvpCount) => {
            setEvents((prev) =>
                prev.map((e) =>
                    e.id === eventId
                        ? { ...e, isAttending: attending, rsvpCount }
                        : e,
                ),
            );
        },
    });

    useEffect(() => {
        let active = true;
        setLoading(true);

        api
            .recommended({
                lat: position?.lat,
                lng: position?.lng,
                pageSize: 3,
            })
            .then((result) => {
                if (active) setEvents(result.items);
            })
            .catch(() => {
                // A failed recommendation is silent — the rest of the home page still works.
                if (active) setEvents([]);
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [position?.lat, position?.lng]);

    // Don't reserve space if there are no recommendations.
    if (!loading && events.length === 0) return null;

    return (
        <section className="container-page py-8" aria-labelledby="recommended-heading">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2
                        id="recommended-heading"
                        className="flex items-center gap-2 text-display-md"
                    >
                        <Sparkles className="h-6 w-6 text-brand" aria-hidden="true" />
                        Recommended for You
                    </h2>
                    <p className="mt-1.5 text-sm text-ink-soft">
                        Upcoming events ranked by distance, interests, and community engagement.
                    </p>
                </div>

                <Link
                    to="/explore"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand transition-colors hover:text-brand-hover"
                >
                    See all events
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
            </div>

            {loading ? (
                <div className="mt-6">
                    <EventGridSkeleton count={3} />
                </div>
            ) : (
                <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                    {events.map((event) => (
                        <RecommendedEventCard
                            key={event.id}
                            event={event}
                            pending={isPending(event.id)}
                            onToggleRsvp={toggle}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}
