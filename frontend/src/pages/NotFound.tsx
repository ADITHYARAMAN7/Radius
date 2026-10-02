import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Compass, MapPinOff, Plus } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Primitives';

export default function NotFound() {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = 'Page not found — Nearby-Events';
  }, []);

  return (
    <div className="container-page flex min-h-[70vh] max-w-xl flex-col justify-center py-12">
      <Card className="p-8 text-center sm:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          <MapPinOff className="h-8 w-8" aria-hidden="true" />
        </div>

        <p className="mt-6 font-display text-5xl font-extrabold tracking-tight text-brand">404</p>

        <h1 className="mt-2 text-display-md">Nothing at this address</h1>

        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          We could not find a page at{' '}
          <code className="rounded-md bg-surface-sunken px-1.5 py-0.5 text-xs text-ink">{pathname}</code>.
          The event may have been deleted, or the link may have been mistyped.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <ButtonLink to="/explore" variant="primary">
            <Compass className="h-4 w-4" aria-hidden="true" />
            Explore events
          </ButtonLink>

          <ButtonLink to="/events/new" variant="secondary">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create an event
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
