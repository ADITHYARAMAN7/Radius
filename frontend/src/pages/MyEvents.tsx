import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Pencil, Trash2, Users } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, SegmentedControl, StatTile } from '@/components/ui/Primitives';
import { EventCard } from '@/components/events/EventCard';
import { EmptyState, EventGridSkeleton, ErrorState } from '@/components/common/States';
import { useToast } from '@/components/ui/Toast';
import { useMyEvents } from '@/hooks/useEvents';
import { useRsvp } from '@/hooks/useRsvp';
import { api, ApiError } from '@/lib/api';
import { cn, hasFinished } from '@/lib/utils';
import type { EventRecord } from '@/lib/types';

type Tab = 'upcoming' | 'past';

/** The owner's row of controls under each of their own cards. */
function OwnerActions({
  event,
  onDeleted,
}: {
  event: EventRecord;
  onDeleted: (id: string) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const onDelete = async () => {
    setBusy(true);
    try {
      await api.deleteEvent(event.id);
      onDeleted(event.id);
      toast.success('Event deleted', `${event.title} has been removed.`);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'We could not delete that event.';
      toast.error('Delete failed', message);
      setBusy(false);
      setConfirming(false);
    }
  };

  // Flat top edge + shared ring so this reads as the card's own footer rather than a
  // detached strip floating underneath it.
  const shell =
    'flex items-center gap-2 rounded-b-card border-t border-border bg-surface px-3 py-2.5 ring-1 ring-border';

  if (confirming) {
    return (
      <div className={cn(shell, 'border-danger/20 bg-danger-soft ring-danger/25')}>
        <p className="flex-1 text-xs font-medium text-danger-ink">Delete permanently?</p>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
          No
        </Button>
        <Button variant="danger" size="sm" onClick={onDelete} loading={busy} loadingLabel="…">
          Yes, delete
        </Button>
      </div>
    );
  }

  return (
    <div className={shell}>
      <ButtonLink to={`/events/${event.id}/edit`} variant="secondary" size="sm" className="flex-1">
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        Edit
      </ButtonLink>

      <Button variant="danger-soft" size="sm" onClick={() => setConfirming(true)}>
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">Delete {event.title}</span>
      </Button>
    </div>
  );
}

export default function MyEvents() {
  const { events, loading, error, reload, removeEvent, patchEvent } = useMyEvents('created');
  const { toggle, isPending } = useRsvp({
    onChange: (id, attending, rsvpCount) => patchEvent(id, { isAttending: attending, rsvpCount }),
  });

  const [tab, setTab] = useState<Tab>('upcoming');

  useEffect(() => {
    document.title = 'My events — Nearby-Events';
  }, []);

  const { upcoming, past, totalRsvps } = useMemo(() => {
    const up: EventRecord[] = [];
    const done: EventRecord[] = [];
    let rsvps = 0;

    for (const event of events) {
      rsvps += event.rsvpCount;
      if (hasFinished(event) || event.status === 'CANCELLED') done.push(event);
      else up.push(event);
    }

    up.sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
    done.sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));

    return { upcoming: up, past: done, totalRsvps: rsvps };
  }, [events]);

  const visible = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="container-page py-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-display-lg">Events I created</h1>
          <p className="mt-2 text-sm text-ink-soft sm:text-base">
            Everything you have put on the board, with RSVP counts as they come in.
          </p>
        </div>

        <ButtonLink to="/events/new" variant="primary">
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          Create event
        </ButtonLink>
      </header>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading ? (
        <EventGridSkeleton count={3} />
      ) : events.length === 0 ? (
        <EmptyState
          icon={<CalendarPlus className="h-7 w-7" aria-hidden="true" />}
          title="You have not posted anything yet"
          description="If you organise anything at all — a weekly game, a clean-up, a yard sale — putting it here is how your neighbours find out about it."
          action={
            <ButtonLink to="/events/new" variant="primary">
              Create your first event
            </ButtonLink>
          }
        />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatTile label="Events posted" value={events.length} />
            <StatTile
              label="Total RSVPs"
              value={totalRsvps}
              hint="Across all your events"
              icon={<Users className="h-4 w-4" aria-hidden="true" />}
            />
            <StatTile label="Still upcoming" value={upcoming.length} />
          </div>

          <div className="mb-6">
            <SegmentedControl<Tab>
              ariaLabel="Filter your events"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'upcoming', label: `Upcoming (${upcoming.length})` },
                { value: 'past', label: `Past & cancelled (${past.length})` },
              ]}
            />
          </div>

          {visible.length === 0 ? (
            <Card className="px-6 py-12 text-center">
              <p className="text-sm text-ink-soft">
                {tab === 'upcoming'
                  ? 'Nothing upcoming right now. Everything you have posted has already happened.'
                  : 'Nothing in the past yet — all of your events are still to come.'}
              </p>
            </Card>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((event) => (
                <div key={event.id} className="flex flex-col">
                  <EventCard
                    event={event}
                    showStatus
                    pending={isPending(event.id)}
                    onToggleRsvp={toggle}
                    className="flex-1 rounded-b-none"
                  />
                  <OwnerActions event={event} onDeleted={removeEvent} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
