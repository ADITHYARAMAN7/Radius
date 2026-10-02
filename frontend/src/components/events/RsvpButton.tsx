import { Check, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn, formatRsvpCount, hasFinished } from '@/lib/utils';
import type { EventRecord } from '@/lib/types';

/**
 * The RSVP control. Deliberately changes shape rather than just colour when joined, so
 * the state is readable without relying on colour alone.
 */
export function RsvpButton({
  event,
  pending,
  onToggle,
  size = 'md',
  full = false,
  className,
}: {
  event: EventRecord;
  pending: boolean;
  onToggle: (event: EventRecord) => void;
  size?: 'sm' | 'md' | 'lg';
  full?: boolean;
  className?: string;
}) {
  const attending = Boolean(event.isAttending);
  const finished = hasFinished(event);
  const cancelled = event.status === 'CANCELLED';

  if (cancelled) {
    return (
      <Button variant="secondary" size={size} full={full} disabled className={className}>
        Event cancelled
      </Button>
    );
  }

  if (finished) {
    return (
      <Button variant="secondary" size={size} full={full} disabled className={className}>
        {attending ? 'You attended' : 'Event finished'}
      </Button>
    );
  }

  return (
    <Button
      variant={attending ? 'success' : 'primary'}
      size={size}
      full={full}
      loading={pending}
      loadingLabel={attending ? 'Cancelling' : 'Joining'}
      onClick={() => onToggle(event)}
      className={cn('group', className)}
      // Spells out what the button does and the count it affects, since the visible
      // label alone ("I'm Going") does not say which event.
      aria-label={
        attending
          ? `Cancel your RSVP for ${event.title}. ${formatRsvpCount(event.rsvpCount)}`
          : `RSVP to ${event.title}. ${formatRsvpCount(event.rsvpCount)}`
      }
    >
      {attending ? (
        <>
          <Check className="h-4 w-4" aria-hidden="true" />
          <span className="group-hover:hidden">You&rsquo;re going</span>
          {/* Hover reveals that pressing again cancels, so the action is never a surprise. */}
          <span className="hidden group-hover:inline">Cancel RSVP</span>
        </>
      ) : (
        <>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          I&rsquo;m Going
        </>
      )}
    </Button>
  );
}
