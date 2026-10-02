import { useEffect, useMemo, useState } from 'react';
import { CalendarHeart, Compass } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { Card, SegmentedControl, StatTile } from '@/components/ui/Primitives';
import { EventCard } from '@/components/events/EventCard';
import { EmptyState, EventGridSkeleton, ErrorState } from '@/components/common/States';
import { useMyEvents } from '@/hooks/useEvents';
import { useRsvp } from '@/hooks/useRsvp';
import { formatEventDate, hasFinished } from '@/lib/utils';
import type { EventRecord } from '@/lib/types';

type Tab = 'upcoming' | 'past';

export default function MyRsvps() {
  const { events, loading, error, reload, patchEvent, removeEvent } = useMyEvents('attending');
  const [tab, setTab] = useState<Tab>('upcoming');

  const { toggle, isPending } = useRsvp({
    onChange: (id, attending, rsvpCount) => {
      // Cancelling an RSVP here means the event no longer belongs on this page.
      if (!attending) removeEvent(id);
      else patchEvent(id, { isAttending: attending, rsvpCount });
    },
  });

  useEffect(() => {
    document.title = "Events I'm attending — Nearby-objects";
  }, []);

  const { upcoming, past, nextUp } = useMemo(() => {
    const up: EventRecord[] = [];
    const done: EventRecord[] = [];

    for (const event of events) {
      if (hasFinished(event) || event.status === 'CANCELLED') done.push(event);
      else up.push(event);
    }

    up.sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
    done.sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));

    return { upcoming: up, past: done, nextUp: up[0] ?? null };
  }, [events]);

  const visible = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="container-page py-8">
      <header className="mb-8">
        <h1 className="text-display-lg">Events I&rsquo;m attending</h1>
        <p className="mt-2 text-sm text-ink-soft sm:text-base">
          Everything you have said yes to. Cancelling here takes you off the organiser&rsquo;s list
          straight away.
        </p>
      </header>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading ? (
        <EventGridSkeleton count={3} />
      ) : events.length === 0 ? (
        <EmptyState
          icon={<CalendarHeart className="h-7 w-7" aria-hidden="true" />}
          title="No RSVPs yet"
          description="When you find something you want to go to, press “I'm Going” and it will be waiting for you here."
          action={
            <ButtonLink to="/explore" variant="primary">
              <Compass className="h-4 w-4" aria-hidden="true" />
              Find something nearby
            </ButtonLink>
          }
        />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatTile label="Coming up" value={upcoming.length} />
            <StatTile label="Been to" value={past.length} />
            <StatTile
              label="Next one"
              value={nextUp ? formatEventDate(nextUp.startsAt) : '—'}
              hint={nextUp?.title}
            />
          </div>

          <div className="mb-6">
            <SegmentedControl<Tab>
              ariaLabel="Filter your RSVPs"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'upcoming', label: `Coming up (${upcoming.length})` },
                { value: 'past', label: `Past (${past.length})` },
              ]}
            />
          </div>

          {visible.length === 0 ? (
            <Card className="px-6 py-12 text-center">
              <p className="text-sm text-ink-soft">
                {tab === 'upcoming'
                  ? 'Nothing coming up. Everything you RSVP’d to has already happened.'
                  : 'Nothing in the past yet.'}
              </p>
            </Card>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  showStatus
                  pending={isPending(event.id)}
                  onToggleRsvp={toggle}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
