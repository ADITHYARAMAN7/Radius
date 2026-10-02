import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import type { EventRecord } from '@/lib/types';

interface UseRsvpOptions {
  /** Applies the new count wherever the event is currently rendered. */
  onChange?: (eventId: string, attending: boolean, rsvpCount: number) => void;
}

/**
 * Drives the "I'm Going" / "Cancel RSVP" toggle.
 *
 * The count updates optimistically so the button feels instant, and is rolled back to
 * the exact pre-click values if the request fails — which matters because the RSVP count
 * is the most visible number on the page.
 */
export function useRsvp({ onChange }: UseRsvpOptions = {}) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const toggle = useCallback(
    async (event: EventRecord): Promise<void> => {
      if (!user) {
        // Remember where they were so they land back on the event after signing in.
        navigate(`/login?next=${encodeURIComponent(`/events/${event.id}`)}`);
        toast.info('Sign in to RSVP', 'It takes a moment, and your RSVPs are saved to your account.');
        return;
      }

      const wasAttending = Boolean(event.isAttending);
      const previousCount = event.rsvpCount;

      setPendingId(event.id);
      onChange?.(event.id, !wasAttending, Math.max(0, previousCount + (wasAttending ? -1 : 1)));

      try {
        const result = wasAttending ? await api.cancelRsvp(event.id) : await api.rsvp(event.id);

        onChange?.(event.id, result.attending, result.rsvpCount);

        if (result.attending) {
          toast.success("You're going", `${event.title} is now in your RSVPs.`);
        } else {
          toast.info('RSVP cancelled', `You have been removed from ${event.title}.`);
        }
      } catch (error) {
        onChange?.(event.id, wasAttending, previousCount);

        const message =
          error instanceof ApiError ? error.message : 'We could not update your RSVP. Please try again.';
        toast.error('RSVP failed', message);
      } finally {
        setPendingId(null);
      }
    },
    [user, navigate, toast, onChange],
  );

  return { toggle, pendingId, isPending: (id: string) => pendingId === id };
}
