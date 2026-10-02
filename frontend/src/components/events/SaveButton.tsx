import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { EventRecord } from '@/lib/types';

/**
 * "Save for later" — for the event you are interested in but not ready to commit to.
 *
 * Deliberately separate from the RSVP: saving tells the organiser nothing and changes no
 * count, so it is safe to press on a whim. The state is owned here rather than threaded
 * through every list, because a bookmark affects nothing else on the page.
 */
export function SaveButton({
  event,
  variant = 'icon',
  onChange,
  className,
}: {
  event: EventRecord;
  /** `icon` floats over a card image; `full` is the labelled button on the event page. */
  variant?: 'icon' | 'full';
  onChange?: (eventId: string, saved: boolean) => void;
  className?: string;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [saved, setSaved] = useState(Boolean(event.isSaved));
  const [busy, setBusy] = useState(false);

  // The list can refetch underneath us (signing in, changing filters).
  useEffect(() => {
    setSaved(Boolean(event.isSaved));
  }, [event.id, event.isSaved]);

  const toggle = async () => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      toast.info('Sign in to save events', 'Saved events are kept with your account.');
      return;
    }

    const next = !saved;
    setSaved(next);
    setBusy(true);

    try {
      const result = next ? await api.saveEvent(event.id) : await api.unsaveEvent(event.id);
      setSaved(result.saved);
      onChange?.(event.id, result.saved);

      if (result.saved) toast.success('Saved for later', 'Find it under Saved in your events.');
    } catch (error) {
      setSaved(!next);
      const message = error instanceof ApiError ? error.message : 'We could not update your saved events.';
      toast.error('Could not save', message);
    } finally {
      setBusy(false);
    }
  };

  const label = saved ? `Remove ${event.title} from saved events` : `Save ${event.title} for later`;

  if (variant === 'full') {
    return (
      <Button
        variant={saved ? 'soft' : 'secondary'}
        full
        onClick={toggle}
        disabled={busy}
        aria-pressed={saved}
        aria-label={label}
        className={className}
      >
        <Bookmark className={cn('h-4 w-4', saved && 'fill-current')} aria-hidden="true" />
        {saved ? 'Saved' : 'Save for later'}
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      aria-label={label}
      title={saved ? 'Saved — click to remove' : 'Save for later'}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-full bg-surface/95 shadow-sm ring-1 ring-border backdrop-blur transition-all duration-150 hover:scale-105 active:scale-95',
        saved ? 'text-brand' : 'text-ink-soft hover:text-ink',
        className,
      )}
    >
      <Bookmark className={cn('h-4 w-4', saved && 'fill-current')} aria-hidden="true" />
    </button>
  );
}
