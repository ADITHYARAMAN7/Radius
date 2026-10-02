import { useEffect, useRef, useState } from 'react';
import { CalendarPlus, Check, Facebook, Link2, Mail, MessageCircle, Share2, Twitter } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { googleCalendarLink } from '@/lib/utils';
import type { EventRecord } from '@/lib/types';

/** Absolute URL for the event — the shareable permalink the brief requires. */
export function eventShareUrl(eventId: string): string {
  return `${window.location.origin}/events/${eventId}`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // The Clipboard API needs a secure context, so fall back to the old approach —
    // which matters because demos often run over plain http on a LAN address.
    try {
      const field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(field);
      return ok;
    } catch {
      return false;
    }
  }
}

export function CopyLinkButton({
  eventId,
  variant = 'secondary',
  className,
}: {
  eventId: string;
  variant?: 'secondary' | 'ghost' | 'outline';
  className?: string;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    const url = eventShareUrl(eventId);
    const ok = await copyToClipboard(url);

    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast.success('Link copied', 'Paste it anywhere to share this event.');
    } else {
      toast.error('Could not copy', url);
    }
  };

  return (
    <Button variant={variant} onClick={onCopy} className={className}>
      {copied ? (
        <>
          <Check className="h-4 w-4 text-success" aria-hidden="true" />
          Copied
        </>
      ) : (
        <>
          <Link2 className="h-4 w-4" aria-hidden="true" />
          Copy link
        </>
      )}
    </Button>
  );
}

interface ShareTarget {
  label: string;
  icon: typeof MessageCircle;
  href: (url: string, text: string, event: EventRecord) => string;
  className?: string;
}

const TARGETS: ShareTarget[] = [
  {
    label: 'WhatsApp',
    icon: MessageCircle,
    href: (url, text) => `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`,
    className: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    label: 'X / Twitter',
    icon: Twitter,
    href: (url, text) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  },
  {
    label: 'Facebook',
    icon: Facebook,
    href: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    className: 'text-blue-600 dark:text-blue-400',
  },
  {
    label: 'Email',
    icon: Mail,
    href: (url, text) => `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(url)}`,
  },
];

/**
 * Share menu with the native share sheet on devices that have one, and an explicit
 * dropdown everywhere else. Closes on Escape and on an outside click, and returns focus
 * to the trigger — otherwise keyboard users get stranded inside it.
 */
export function ShareMenu({ event }: { event: EventRecord }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const url = eventShareUrl(event.id);
  const text = `${event.title} — ${event.neighborhood}, ${event.city}`;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (pointerEvent: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(pointerEvent.target as Node)) setOpen(false);
    };

    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const onShare = async () => {
    // The native sheet is strictly better where it exists, especially on phones.
    if (navigator.share) {
      try {
        await navigator.share({ title: event.title, text, url });
        return;
      } catch (error) {
        // A user-cancelled share is not an error worth reporting.
        if ((error as Error).name === 'AbortError') return;
      }
    }
    setOpen((value) => !value);
  };

  return (
    <div ref={containerRef} className="relative">
      <Button
        ref={triggerRef}
        variant="secondary"
        onClick={onShare}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        Share
      </Button>

      {open && (
        <div
          role="menu"
          aria-label={`Share ${event.title}`}
          className="absolute right-0 z-30 mt-2 w-56 animate-scale-in overflow-hidden rounded-xl bg-surface-raised p-1.5 shadow-lg ring-1 ring-border"
        >
          {TARGETS.map((target) => {
            const Icon = target.icon;
            return (
              <a
                key={target.label}
                role="menuitem"
                href={target.href(url, text, event)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-sunken"
              >
                <Icon className={target.className ?? 'text-ink-soft'} size={16} aria-hidden="true" />
                {target.label}
              </a>
            );
          })}

          <div className="my-1.5 h-px bg-border" role="separator" />

          <a
            role="menuitem"
            href={googleCalendarLink(event)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-sunken"
          >
            <CalendarPlus size={16} className="text-ink-soft" aria-hidden="true" />
            Add to calendar
          </a>

          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              const ok = await copyToClipboard(url);
              setOpen(false);
              if (ok) toast.success('Link copied', 'Paste it anywhere to share this event.');
              else toast.error('Could not copy', url);
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-sunken"
          >
            <Link2 size={16} className="text-ink-soft" aria-hidden="true" />
            Copy link
          </button>
        </div>
      )}
    </div>
  );
}
