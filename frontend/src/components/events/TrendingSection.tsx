import { useEffect, useState } from 'react';
import { ArrowRight, Flame } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TrendingEventCard } from './TrendingEventCard';
import { EventGridSkeleton } from '@/components/common/States';
import { useRsvp } from '@/hooks/useRsvp';
import { api } from '@/lib/api';
import type { TrendingEvent } from '@/lib/types';

/**
 * "Event Pulse — Trending Near You" section for the Home page.
 *
 * Displays events gaining community momentum (recent RSVP velocity & growth).
 * Distinct from RecommendedSection (which is personalized to distance and category interests).
 *
 * Renders nothing on empty state or error — consistent with other home sections.
 */
export function TrendingSection() {
    const [events, setEvents] = useState<TrendingEvent[]>([]);
    const [loading, setLoading] = useState(true);

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
            .trending({ pageSize: 3 })
            .then((result) => {
                if (active) setEvents(result.items);
            })
            .catch(() => {
                if (active) setEvents([]);
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, []);

    if (!loading && events.length === 0) return null;

    return (
        <section className="container-page py-8" aria-labelledby="trending-heading">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 id="trending-heading" className="flex items-center gap-2 text-display-md">
                        <Flame className="h-6 w-6 text-warning" aria-hidden="true" />
                        Event Pulse &mdash; Trending Near You
                    </h2>
                    <p className="mt-1.5 text-sm text-ink-soft">
                        Events gaining community momentum based on recent RSVP velocity and growth.
                    </p>
                </div>

                <Link
                    to="/explore?sort=popular"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand transition-colors hover:text-brand-hover"
                >
                    View popular events
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
                        <TrendingEventCard
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
