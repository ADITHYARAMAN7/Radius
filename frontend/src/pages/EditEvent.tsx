import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, ShieldAlert } from 'lucide-react';
import { EventForm } from '@/components/events/EventForm';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorState, PageSkeleton } from '@/components/common/States';
import { api, ApiError } from '@/lib/api';
import type { EventRecord } from '@/lib/types';

export default function EditEvent() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!id) return;

    let active = true;
    setLoading(true);
    setError(null);

    api
      .getEvent(id, true)
      .then((result) => {
        if (active) setEvent(result.event);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    document.title = event ? `Editing ${event.title} — Radius` : 'Edit event — Radius';
  }, [event]);

  if (loading) return <PageSkeleton label="Loading your event" />;

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;

    return (
      <div className="container-page max-w-2xl py-16">
        <ErrorState error={error} />
        <div className="mt-6 flex justify-center">
          <ButtonLink to="/my-events" variant="secondary">
            {notFound ? 'Back to my events' : 'Back to my events'}
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (!event) return null;

  /**
   * The server is the real authority here — it rejects a PATCH from anyone but the
   * organiser. This check only saves the user from filling in a form that could never
   * save.
   */
  if (!event.isOwner) {
    return (
      <div className="container-page max-w-2xl py-16">
        <EmptyState
          icon={<ShieldAlert className="h-7 w-7" aria-hidden="true" />}
          title="This is not your event to edit"
          description="Only the organiser who posted an event can change it. If something looks wrong, get in touch with them through the event page."
          action={
            <ButtonLink to={`/events/${event.id}`} variant="primary">
              View the event
            </ButtonLink>
          }
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-16 bg-bg relative overflow-hidden">
      {/* Decorative background blurs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[10%] right-[-10%] w-[30%] h-[30%] bg-accent/10 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="container-page max-w-3xl relative z-10">
        <nav aria-label="Breadcrumb" className="mb-4">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-ink-muted">
            <li>
              <Link to="/my-events" className="transition-colors hover:text-brand">
                My events
              </Link>
            </li>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            <li>
              <Link to={`/events/${event.id}`} className="max-w-[16rem] truncate transition-colors hover:text-brand">
                {event.title}
              </Link>
            </li>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            <li aria-current="page" className="text-ink">
              Edit
            </li>
          </ol>
        </nav>

        <header className="mb-8 text-center">
          <h1 className="text-display-lg bg-gradient-to-r from-brand to-accent bg-clip-text text-transparent">Edit your event</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft sm:text-base">
            Changes go live immediately. Everyone who has already RSVP&rsquo;d keeps their place
            {event.rsvpCount > 0 && ` — ${event.rsvpCount} ${event.rsvpCount === 1 ? 'person is' : 'people are'} going`}.
          </p>
        </header>

        <div className="bg-surface/60 border border-border backdrop-blur-xl rounded-[2rem] p-6 sm:p-10 shadow-xl">
          <EventForm mode="edit" initialEvent={event} />
        </div>
      </div>
    </div>
  );
}
