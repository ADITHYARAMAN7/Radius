import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { EventForm } from '@/components/events/EventForm';

export default function CreateEvent() {
  useEffect(() => {
    document.title = 'Create an event — Nearby-objects';
  }, []);

  return (
    <div className="container-page max-w-3xl py-8">
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
          <li>
            <Link to="/" className="transition-colors hover:text-brand">
              Home
            </Link>
          </li>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <li aria-current="page" className="text-ink">
            Create event
          </li>
        </ol>
      </nav>

      <header className="mb-8">
        <h1 className="text-display-lg">Put something on the board</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft sm:text-base">
          Add the details and your event is live straight away, with its own shareable link. If
          writing is not your thing, the AI assistant will tidy up a rough note for you.
        </p>
      </header>

      <EventForm mode="create" />
    </div>
  );
}
