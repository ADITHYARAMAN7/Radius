import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Clock,
  ExternalLink,
  MapPin,
  Pencil,
  RotateCcw,
  Trash2,
  Users,
} from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Avatar, Badge, Card, Panel, Separator } from '@/components/ui/Primitives';
import { CategoryBadge } from '@/components/events/CategoryBadge';
import { RsvpButton } from '@/components/events/RsvpButton';
import { CopyLinkButton, ShareMenu } from '@/components/events/ShareMenu';
import { CalendarExport } from '@/components/events/CalendarExport';
import { EventQrCode } from '@/components/events/EventQrCode';
import { EventCard } from '@/components/events/EventCard';
import { EventMap } from '@/components/events/EventMap';
import { ErrorState, EventDetailSkeleton } from '@/components/common/States';
import { useAuth } from '@/context/AuthContext';
import { useRsvp } from '@/hooks/useRsvp';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import type { Attendee, EventRecord } from '@/lib/types';
import {
  formatEventDateLong,
  formatRelative,
  formatRsvpCount,
  formatTimeRange,
  googleMapsLink,
  hasFinished,
  isHappeningNow,
} from '@/lib/utils';

/** Confirmation for delete — an irreversible action should never be one click. */
function DeleteDialog({
  event,
  onCancel,
  onConfirm,
  busy,
}: {
  event: EventRecord;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  useEffect(() => {
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel, busy]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-sm" aria-hidden="true" />

      <Card
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        aria-describedby="delete-body"
        className="relative w-full max-w-md animate-scale-in p-6 shadow-lg"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-danger-soft text-danger-ink">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </div>

        <h2 id="delete-title" className="mt-4 text-display-sm">
          Delete this event?
        </h2>

        <p id="delete-body" className="mt-2 text-sm leading-relaxed text-ink-soft">
          <span className="font-semibold text-ink">{event.title}</span> will be removed from the
          board along with its {event.rsvpCount} RSVP{event.rsvpCount === 1 ? '' : 's'}. This cannot
          be undone.
        </p>

        <p className="mt-3 rounded-xl bg-surface-sunken p-3 text-xs leading-relaxed text-ink-soft">
          If the event is simply not going ahead, cancelling instead keeps the record and tells
          everyone who RSVP&rsquo;d.
        </p>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Keep event
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={busy} loadingLabel="Deleting">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete permanently
          </Button>
        </div>
      </Card>
    </div>
  );
}

function AttendeeList({ attendees, total }: { attendees: Attendee[]; total: number }) {
  if (total === 0) {
    return (
      <p className="text-sm text-ink-soft">
        Nobody has RSVP&rsquo;d yet. Be the first and your neighbours will see it.
      </p>
    );
  }

  const hidden = total - attendees.length;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {attendees.map((attendee) => (
          <div
            key={attendee.uid}
            className="flex items-center gap-2 rounded-full bg-surface-sunken py-1 pl-1 pr-3"
          >
            <Avatar name={attendee.displayName} src={attendee.photoURL} size="xs" />
            <span className="text-xs font-medium text-ink">{attendee.displayName}</span>
          </div>
        ))}

        {hidden > 0 && (
          <div className="flex items-center rounded-full bg-surface-sunken px-3 py-1.5">
            <span className="text-xs font-semibold text-ink-soft">+{hidden} more</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EventDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, initialising } = useAuth();
  const { theme } = useTheme();

  const [event, setEvent] = useState<EventRecord | null>(null);
  const [related, setRelated] = useState<EventRecord[]>([]);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!id || initialising) return;

    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setError(null);

    api
      .getEvent(id, Boolean(user), controller.signal)
      .then((result) => {
        if (!active) return;
        setEvent(result.event);
        setRelated(result.related);
        setAttendees(result.attendees);
      })
      .catch((caught: unknown) => {
        if ((caught as Error).name === 'AbortError' || !active) return;
        setError(caught);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [id, user, initialising, nonce]);

  useEffect(() => {
    document.title = event ? `${event.title} — Nearby-objects` : 'Event — Nearby-objects';
  }, [event]);

  const applyRsvp = useCallback(
    (eventId: string, attending: boolean, rsvpCount: number) => {
      setEvent((current) =>
        current && current.id === eventId ? { ...current, isAttending: attending, rsvpCount } : current,
      );
      setRelated((current) =>
        current.map((item) => (item.id === eventId ? { ...item, isAttending: attending, rsvpCount } : item)),
      );

      // Keep the visible attendee list honest about the viewer's own membership.
      if (eventId === event?.id && user) {
        setAttendees((current) => {
          const without = current.filter((attendee) => attendee.uid !== user.uid);
          if (!attending) return without;
          return [
            {
              uid: user.uid,
              displayName: user.displayName || 'You',
              photoURL: user.photoURL ?? null,
              createdAt: new Date().toISOString(),
            },
            ...without,
          ];
        });
      }
    },
    [event?.id, user],
  );

  const { toggle, isPending } = useRsvp({ onChange: applyRsvp });

  const onDelete = async () => {
    if (!event) return;
    setDeleting(true);

    try {
      await api.deleteEvent(event.id);
      toast.success('Event deleted', `${event.title} has been removed from the board.`);
      navigate('/my-events', { replace: true });
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'We could not delete that event.';
      toast.error('Delete failed', message);
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  const onCancelEvent = async () => {
    if (!event) return;
    setCancelling(true);

    try {
      const result = await api.cancelEvent(event.id);
      setEvent(result.event);
      toast.info('Event cancelled', 'It no longer appears on the active board.');
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'We could not cancel that event.';
      toast.error('Could not cancel', message);
    } finally {
      setCancelling(false);
    }
  };

  const onReactivateEvent = async () => {
    if (!event) return;
    setCancelling(true);

    try {
      const result = await api.reactivateEvent(event.id);
      setEvent(result.event);
      toast.success(
        'Event restored',
        result.event.status === 'ACTIVE'
          ? 'It is back on the board, with its RSVPs intact.'
          : 'Restored, though it has already finished so it stays off the active board.',
      );
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'We could not restore that event.';
      toast.error('Could not restore', message);
    } finally {
      setCancelling(false);
    }
  };

  /* -------------------------------------------------------------- states */

  if (loading) return <EventDetailSkeleton />;

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;

    return (
      <div className="container-page py-16">
        <ErrorState error={error} onRetry={notFound ? undefined : () => setNonce((n) => n + 1)} />
        <div className="mt-6 flex justify-center">
          <ButtonLink to="/explore" variant="secondary">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to all events
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (!event) return null;

  const finished = hasFinished(event);
  const live = isHappeningNow(event) && event.status !== 'CANCELLED';

  return (
    <article className="pb-12">
      {/* ------------------------------------------------------------- hero */}
      <div className="relative">
        <div className="relative aspect-[16/9] max-h-[28rem] w-full overflow-hidden bg-surface-sunken sm:aspect-[21/9]">
          {event.imageUrl ? (
            <img
              src={event.imageUrl}
              alt={`${event.title} at ${event.location}, ${event.neighborhood}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-brand-soft via-surface to-accent-soft" />
          )}

          {/* Gradient keeps the back button legible over any photo. */}
          <div
            className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/25"
            aria-hidden="true"
          />
        </div>

        <div className="container-page absolute inset-x-0 top-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(-1)}
            className="bg-surface/90 backdrop-blur"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </Button>
        </div>
      </div>

      <div className="container-page">
        {/* Status banners sit above the title where they cannot be missed. */}
        {event.status === 'CANCELLED' && (
          <div
            role="alert"
            className="mt-6 flex items-start gap-3 rounded-xl bg-danger-soft p-4 ring-1 ring-danger/25"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold text-danger-ink">This event has been cancelled</p>
              <p className="mt-0.5 text-sm text-danger-ink/85">
                The organiser called it off. It no longer appears on the active board.
              </p>
            </div>
          </div>
        )}

        {finished && event.status !== 'CANCELLED' && (
          <div className="mt-6 flex items-start gap-3 rounded-xl bg-surface-sunken p-4 ring-1 ring-border">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold text-ink">This event has finished</p>
              <p className="mt-0.5 text-sm text-ink-soft">
                It ran {formatRelative(event.endsAt)} and is kept here for the record.
              </p>
            </div>
          </div>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {/* ------------------------------------------------------- main */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CategoryBadge category={event.category} />

              {live && (
                <Badge tone="success">
                  <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                  </span>
                  Happening now
                </Badge>
              )}

              {!finished && !live && event.status === 'ACTIVE' && (
                <Badge tone="neutral">Starts {formatRelative(event.startsAt)}</Badge>
              )}
            </div>

            <h1 className="mt-3 text-display-lg">{event.title}</h1>

            {event.summary && (
              <p className="mt-3 text-base leading-relaxed text-ink-soft">{event.summary}</p>
            )}

            {/* ------------------------------------------------- key facts */}
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <Card className="flex items-start gap-3 p-4">
                <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                <div className="min-w-0">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Date</dt>
                  <dd className="mt-0.5 text-sm font-bold text-ink">
                    {formatEventDateLong(event.startsAt)}
                  </dd>
                </div>
              </Card>

              <Card className="flex items-start gap-3 p-4">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                <div className="min-w-0">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Time</dt>
                  <dd className="mt-0.5 text-sm font-bold text-ink">
                    {formatTimeRange(event.startTime, event.endTime)}
                  </dd>
                </div>
              </Card>

              <Card className="flex items-start gap-3 p-4 sm:col-span-2">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                <div className="min-w-0">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Location
                  </dt>
                  <dd className="mt-0.5">
                    <p className="text-sm font-bold text-ink">{event.location}</p>
                    <p className="mt-0.5 text-sm text-ink-soft">{event.address}</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {event.neighborhood} · {event.city}
                    </p>

                    <a
                      href={googleMapsLink(event)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-brand-hover"
                    >
                      Open in Google Maps
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  </dd>
                </div>
              </Card>
            </dl>

            {/* ----------------------------------------------- description */}
            <section className="mt-8">
              <h2 className="text-display-sm">About this event</h2>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-soft sm:text-base">
                {event.description.split('\n').filter(Boolean).map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>

              {event.tags.length > 0 && (
                <ul className="mt-5 flex flex-wrap gap-2">
                  {event.tags.map((tag) => (
                    <li key={tag}>
                      <Link to={`/explore?q=${encodeURIComponent(tag)}`}>
                        <Badge tone="neutral" className="transition-colors hover:bg-brand-soft hover:text-brand-ink">
                          #{tag}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ------------------------------------------------------ map */}
            {event.latitude !== null && event.longitude !== null && (
              <section className="mt-8">
                <h2 className="text-display-sm">Where it is</h2>
                <EventMap events={[event]} theme={theme} className="mt-3 h-80" />
              </section>
            )}

            {/* ------------------------------------------------ attendees */}
            <section className="mt-8">
              <h2 className="flex items-center gap-2 text-display-sm">
                <Users className="h-5 w-5 text-brand" aria-hidden="true" />
                Who&rsquo;s going
              </h2>
              <p className="mt-1 text-sm font-semibold text-ink">{formatRsvpCount(event.rsvpCount)}</p>
              <div className="mt-4">
                <AttendeeList attendees={attendees} total={event.rsvpCount} />
              </div>
            </section>
          </div>

          {/* ----------------------------------------------------- sidebar */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Panel className="space-y-4">
              <div>
                <p className="font-display text-2xl font-bold tabular-nums text-ink">
                  {event.rsvpCount}
                </p>
                <p className="text-sm text-ink-soft">{formatRsvpCount(event.rsvpCount)}</p>
              </div>

              <RsvpButton
                event={event}
                pending={isPending(event.id)}
                onToggle={toggle}
                size="lg"
                full
              />

              <div className="grid grid-cols-2 gap-2">
                <ShareMenu event={event} />
                <CopyLinkButton eventId={event.id} />
              </div>

              <div className="flex items-center justify-between pt-1">
                <EventQrCode event={event} />
              </div>

              <Separator />

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2">
                  Calendar Sync
                </p>
                <CalendarExport event={event} />
              </div>

              <Separator />

              {/* --------------------------------------------- organiser */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Organised by
                </p>
                <div className="mt-2.5 flex items-center gap-3">
                  <Avatar name={event.creatorName} src={event.creatorPhotoURL} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{event.creatorName}</p>
                    <p className="text-xs text-ink-muted">
                      {event.createdAt ? `Posted ${formatRelative(event.createdAt)}` : 'Community organiser'}
                    </p>
                  </div>
                </div>
              </div>

              {/* ------------------------------------- owner-only controls */}
              {event.isOwner && (
                <>
                  <Separator />

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      Manage your event
                    </p>

                    <ButtonLink to={`/events/${event.id}/edit`} variant="secondary" full>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      Edit event
                    </ButtonLink>

                    {event.status === 'ACTIVE' && !finished && (
                      <Button
                        variant="outline"
                        full
                        onClick={onCancelEvent}
                        loading={cancelling}
                        loadingLabel="Cancelling"
                      >
                        Cancel event
                      </Button>
                    )}

                    {/* Cancelling is a soft delete, so it has to be reversible. */}
                    {event.status === 'CANCELLED' && (
                      <Button
                        variant="success"
                        full
                        onClick={onReactivateEvent}
                        loading={cancelling}
                        loadingLabel="Restoring"
                      >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        Restore event
                      </Button>
                    )}

                    <Button variant="danger-soft" full onClick={() => setConfirmingDelete(true)}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Delete event
                    </Button>
                  </div>
                </>
              )}
            </Panel>
          </aside>
        </div>

        {/* ------------------------------------------------- related events */}
        {related.length > 0 && (
          <section className="mt-16">
            <h2 className="text-display-md">More {event.category.toLowerCase()} events</h2>
            <p className="mt-1.5 text-sm text-ink-soft">
              Other things in the same category coming up soon.
            </p>

            <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {related.map((item) => (
                <EventCard
                  key={item.id}
                  event={item}
                  pending={isPending(item.id)}
                  onToggleRsvp={toggle}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {confirmingDelete && (
        <DeleteDialog
          event={event}
          busy={deleting}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={onDelete}
        />
      )}
    </article>
  );
}
