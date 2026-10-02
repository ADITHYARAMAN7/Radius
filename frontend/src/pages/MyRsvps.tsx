import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bookmark, CalendarHeart, Compass } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { Card, SegmentedControl, StatTile } from '@/components/ui/Primitives';
import { EventCard } from '@/components/events/EventCard';
import { EmptyState, EventGridSkeleton, ErrorState } from '@/components/common/States';
import { useAuth } from '@/context/AuthContext';
import { useMyEvents } from '@/hooks/useEvents';
import { useRsvp } from '@/hooks/useRsvp';
import { api } from '@/lib/api';
import { formatEventDate, hasFinished } from '@/lib/utils';
import type { EventRecord } from '@/lib/types';

type Tab = 'upcoming' | 'past' | 'saved';

export default function MyRsvps() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const { events, loading, error, reload, patchEvent, removeEvent } = useMyEvents('attending');

  // Bookmarks load alongside the RSVPs so the tab count is right before it is opened.
  const [saved, setSaved] = useState<EventRecord[] | null>(null);

  // ?tab=saved is linkable, e.g. from the "Saved for later" toast and the account menu.
  const [tab, setTabState] = useState<Tab>(() => {
    const requested = searchParams.get('tab');
    return requested === 'saved' || requested === 'past' ? requested : 'upcoming';
  });

  const setTab = useCallback(
    (next: Tab) => {
      setTabState(next);
      setSearchParams(next === 'upcoming' ? {} : { tab: next }, { replace: true });
    },
    [setSearchParams],
  );

  useEffect(() => {
    document.title = "Events I'm attending — Nearby-Events";
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;

    api
      .mySaved()
      .then((result) => {
        if (active) setSaved(result.events);
      })
      // The RSVP list is the page's main job; a failed bookmark load just shows none.
      .catch(() => {
        if (active) setSaved([]);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const { toggle, isPending } = useRsvp({
    onChange: (id, attending, rsvpCount) => {
      // Keep a saved card's button in step whichever tab it was pressed on.
      setSaved((current) =>
        current
          ? current.map((event) => (event.id === id ? { ...event, isAttending: attending, rsvpCount } : event))
          : current,
      );

      // Cancelling an RSVP here means the event no longer belongs on the RSVP tabs.
      if (!attending) removeEvent(id);
      else if (events.some((event) => event.id === id)) patchEvent(id, { isAttending: attending, rsvpCount });
      // RSVP'd from the Saved tab: pull the fresh list so it shows under "Coming up".
      else reload();
    },
  });

  const onSaveChange = useCallback((eventId: string, isSaved: boolean) => {
    // Un-saving removes the card from the Saved tab straight away.
    if (!isSaved) setSaved((current) => (current ? current.filter((event) => event.id !== eventId) : current));
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

  const savedList = saved ?? [];
  const visible = tab === 'upcoming' ? upcoming : tab === 'past' ? past : savedList;
  const nothingAtAll = events.length === 0 && savedList.length === 0;

  return (
    <div className="container-page py-8">
      <header className="mb-8">
        <h1 className="text-display-lg">Events I&rsquo;m attending</h1>
        <p className="mt-2 text-sm text-ink-soft sm:text-base">
          Everything you have said yes to, plus the ones you saved to decide on later. Cancelling
          an RSVP here takes you off the organiser&rsquo;s list straight away.
        </p>
      </header>

      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : loading || saved === null ? (
        <EventGridSkeleton count={3} />
      ) : nothingAtAll ? (
        <EmptyState
          icon={<CalendarHeart className="h-7 w-7" aria-hidden="true" />}
          title="No RSVPs yet"
          description="When you find something you want to go to, press “I'm Going” and it will be waiting for you here. Not sure yet? Use the bookmark on any event to save it for later."
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

          <div className="mb-6 overflow-x-auto pb-1">
            <SegmentedControl<Tab>
              ariaLabel="Filter your events"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'upcoming', label: `Coming up (${upcoming.length})` },
                { value: 'past', label: `Past (${past.length})` },
                {
                  value: 'saved',
                  label: `Saved (${savedList.length})`,
                  icon: <Bookmark className="h-4 w-4" aria-hidden="true" />,
                },
              ]}
            />
          </div>

          {visible.length === 0 ? (
            <Card className="px-6 py-12 text-center">
              <p className="text-sm text-ink-soft">
                {tab === 'upcoming'
                  ? 'Nothing coming up right now.'
                  : tab === 'past'
                    ? 'Nothing in the past yet.'
                    : 'Nothing saved. Tap the bookmark on any event to keep it here.'}
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
                  onSaveChange={onSaveChange}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
