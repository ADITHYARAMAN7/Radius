import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { BadgeCheck, Copy, QrCode, ScanLine, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Primitives';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { checkInWindow } from '@/lib/utils';
import type { CheckInResult, EventRecord } from '@/lib/types';

/* ------------------------------------------------------------ organiser */

function CheckInQrDialog({ event, code, onClose }: { event: EventRecord; code: string; onClose: () => void }) {
  // Scanning this opens the event page with the code attached, which checks the guest in.
  const target = `${window.location.origin}/events/${event.id}?checkin=${encodeURIComponent(code)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=${encodeURIComponent(target)}`;

  useEffect(() => {
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Rendered into <body>: the sticky sidebar this lives in is its own stacking context,
  // so an overlay left in place would sit underneath the navbar.
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkin-qr-title"
        className="relative z-10 w-full max-w-sm animate-scale-in p-6 text-center shadow-lg"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
          aria-label="Close"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        <h3 id="checkin-qr-title" className="text-display-sm">
          Scan to check in
        </h3>
        <p className="mt-1 text-sm text-ink-soft">{event.title}</p>

        <div className="mt-4 inline-block rounded-2xl bg-white p-3 ring-1 ring-border">
          <img src={qrUrl} alt={`Check-in QR code for ${event.title}`} className="h-56 w-56" />
        </div>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">Or enter the code</p>
        <p className="mt-1 font-display text-3xl font-extrabold tracking-[0.3em] text-ink">{code}</p>

        <p className="mt-4 text-xs leading-relaxed text-ink-muted">
          Show this at the door. Guests scan it with their phone camera, or type the code on the
          event page.
        </p>
      </Card>
    </div>,
    document.body,
  );
}

function OrganiserCheckIn({ event }: { event: EventRecord }) {
  const toast = useToast();
  const [showQr, setShowQr] = useState(false);

  const code = event.checkInCode ?? '';
  const turnout = event.rsvpCount > 0 ? Math.min(100, Math.round((event.checkedInCount / event.rsvpCount) * 100)) : 0;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Code copied', 'Share it with guests when they arrive.');
    } catch {
      toast.info('Check-in code', code);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Door check-in</p>

      <div className="rounded-xl bg-surface-sunken p-3 ring-1 ring-border">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">Code</p>
            <p className="font-display text-xl font-extrabold tracking-[0.25em] text-ink">{code || '—'}</p>
          </div>

          <button
            type="button"
            onClick={() => void copyCode()}
            disabled={!code}
            className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-50"
            aria-label="Copy check-in code"
            title="Copy code"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <Button variant="secondary" full onClick={() => setShowQr(true)} disabled={!code}>
        <QrCode className="h-4 w-4" aria-hidden="true" />
        Show check-in QR
      </Button>

      <div>
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-semibold text-ink">
            <span className="tabular-nums">{event.checkedInCount}</span> checked in
          </span>
          <span className="tabular-nums text-ink-muted">
            of {event.rsvpCount} RSVP{event.rsvpCount === 1 ? '' : 's'}
          </span>
        </div>
        <div
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-sunken ring-1 ring-inset ring-border"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={turnout}
          aria-label="Turnout"
        >
          <div className="h-full rounded-full bg-success transition-all duration-500" style={{ width: `${turnout}%` }} />
        </div>
      </div>

      {showQr && <CheckInQrDialog event={event} code={code} onClose={() => setShowQr(false)} />}
    </div>
  );
}

/* ---------------------------------------------------------------- guest */

function GuestCheckIn({
  event,
  initialCode,
  onCheckedIn,
}: {
  event: EventRecord;
  initialCode: string;
  onCheckedIn: (result: CheckInResult) => void;
}) {
  const { user, initialising, refreshProfile } = useAuth();
  const toast = useToast();

  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const autoSubmitted = useRef(false);

  const window_ = checkInWindow(event);

  const submit = async (value: string) => {
    const cleaned = value.trim();
    if (cleaned.length < 4) {
      setError('Enter the code the organiser is showing.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const result = await api.checkIn(event.id, cleaned);
      onCheckedIn(result);

      if (result.alreadyCheckedIn) {
        toast.info('Already checked in', 'You were checked in to this event earlier.');
      } else {
        toast.success("You're checked in", `+${result.pointsEarned} neighbour points for turning up.`);
        void refreshProfile().catch(() => undefined);
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'We could not check you in. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // Arriving from the organiser's QR code: the code is already in the link, so a signed-in
  // guest should not have to press anything.
  useEffect(() => {
    if (!initialCode || autoSubmitted.current || initialising || !user) return;
    if (event.isCheckedIn || window_ !== 'open') return;

    autoSubmitted.current = true;
    void submit(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode, initialising, user, event.isCheckedIn, window_]);

  if (event.isCheckedIn) {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-success-soft p-3 ring-1 ring-success/25">
        <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
        <div>
          <p className="text-sm font-bold text-success-ink">You&rsquo;re checked in</p>
          <p className="mt-0.5 text-xs text-success-ink/85">Thanks for turning up. Enjoy the event.</p>
        </div>
      </div>
    );
  }

  if (window_ === 'closed') return null;

  if (window_ === 'early') {
    // Only worth mentioning to someone who is going, or who arrived holding a code.
    if (!event.isAttending && !initialCode) return null;

    return (
      <p className="flex items-start gap-2 rounded-xl bg-surface-sunken p-3 text-xs leading-relaxed text-ink-soft">
        <ScanLine className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
        Check-in opens one hour before the start. Scan the organiser&rsquo;s QR at the venue to
        earn neighbour points.
      </p>
    );
  }

  if (!user) {
    const next = `/events/${event.id}${initialCode ? `?checkin=${encodeURIComponent(initialCode)}` : ''}`;

    return (
      <div className="rounded-xl bg-surface-sunken p-3 ring-1 ring-border">
        <p className="flex items-center gap-2 text-sm font-bold text-ink">
          <ScanLine className="h-4 w-4 text-brand" aria-hidden="true" />
          At the event?
        </p>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          <Link to={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-brand hover:text-brand-hover">
            Sign in
          </Link>{' '}
          to check in and earn neighbour points.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(submitEvent) => {
        submitEvent.preventDefault();
        void submit(code);
      }}
      className="rounded-xl bg-surface-sunken p-3 ring-1 ring-border"
    >
      <label htmlFor="checkin-code" className="flex items-center gap-2 text-sm font-bold text-ink">
        <ScanLine className="h-4 w-4 text-brand" aria-hidden="true" />
        At the event? Check in
      </label>
      <p id="checkin-hint" className="mt-1 text-xs leading-relaxed text-ink-soft">
        Enter the code the organiser is showing, or scan their QR.
      </p>

      <div className="mt-2.5 flex gap-2">
        <input
          id="checkin-code"
          value={code}
          onChange={(changeEvent) => {
            setCode(changeEvent.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8));
            setError('');
          }}
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="CODE"
          aria-describedby={error ? 'checkin-error' : 'checkin-hint'}
          aria-invalid={Boolean(error)}
          className="h-10 w-full min-w-0 rounded-xl bg-surface px-3 text-center font-display text-sm font-bold uppercase tracking-[0.25em] text-ink ring-1 ring-inset ring-border placeholder:font-sans placeholder:font-medium placeholder:tracking-normal placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <Button type="submit" size="sm" className="h-10 shrink-0" loading={busy} loadingLabel="Checking">
          Check in
        </Button>
      </div>

      {error && (
        <p id="checkin-error" role="alert" className="mt-2 text-xs font-medium text-danger-ink">
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * Check-in closes the loop the RSVP opens: an RSVP says "I intend to come", a check-in
 * says "I came". The organiser shows a code or QR at the door; guests present it and are
 * counted — and earn the largest share of neighbour points, since turning up is the part
 * that actually matters.
 */
export function CheckInPanel({
  event,
  initialCode = '',
  onCheckedIn,
}: {
  event: EventRecord;
  /** Code carried in the URL by the organiser's QR. */
  initialCode?: string;
  onCheckedIn: (result: CheckInResult) => void;
}) {
  if (event.status === 'CANCELLED') return null;

  if (event.isOwner) return <OrganiserCheckIn event={event} />;

  return <GuestCheckIn event={event} initialCode={initialCode} onCheckedIn={onCheckedIn} />;
}
