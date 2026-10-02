import { AlertTriangle, CalendarX2, Compass, RefreshCw, WifiOff } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, Skeleton } from '@/components/ui/Primitives';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

/* ---------------------------------------------------------------- Loading */

/**
 * Card-shaped skeleton that mirrors the real EventCard layout. Matching the final
 * shape is what stops the page jumping when data lands.
 */
export function EventCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="aspect-[16/10] w-full rounded-none" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/5" />
        <div className="space-y-2 pt-1">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
    </Card>
  );
}

export function EventGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
      role="status"
      aria-label="Loading events"
    >
      {Array.from({ length: count }, (_, index) => (
        <EventCardSkeleton key={index} />
      ))}
      <span className="sr-only">Loading events, please wait.</span>
    </div>
  );
}

export function LoadingState({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      className={cn('flex flex-col items-center justify-center gap-3 py-16 text-center', className)}
    >
      <RefreshCw className="h-6 w-6 animate-spin text-brand" aria-hidden="true" />
      <p className="text-sm font-medium text-ink-soft">{label}…</p>
    </div>
  );
}

/**
 * Page-shaped skeleton for the event detail route.
 *
 * A centred spinner collapses the page to nothing and drags the footer up into the
 * viewport, which reads as broken rather than as loading. Mirroring the real layout keeps
 * the page the right height and stops everything jumping when the data lands.
 */
export function EventDetailSkeleton() {
  return (
    <div role="status" aria-label="Loading event" className="pb-12">
      <Skeleton className="aspect-[16/9] max-h-[28rem] w-full rounded-none sm:aspect-[21/9]" />

      <div className="container-page">
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-4">
            <Skeleton className="h-6 w-28 rounded-full" />
            <Skeleton className="h-10 w-4/5" />
            <Skeleton className="h-5 w-3/5" />

            <div className="grid gap-4 pt-2 sm:grid-cols-2">
              <Skeleton className="h-20 rounded-card" />
              <Skeleton className="h-20 rounded-card" />
              <Skeleton className="h-28 rounded-card sm:col-span-2" />
            </div>

            <div className="space-y-2 pt-4">
              <Skeleton className="h-6 w-44" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>

          <div className="space-y-3">
            <Skeleton className="h-64 rounded-panel" />
          </div>
        </div>
      </div>

      <span className="sr-only">Loading event, please wait.</span>
    </div>
  );
}

/** Keeps the page tall while a session is restored, instead of collapsing to a spinner. */
export function PageSkeleton({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="container-page py-8">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="mt-3 h-5 w-96 max-w-full" />

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28 rounded-card" />
        <Skeleton className="h-28 rounded-card" />
        <Skeleton className="h-28 rounded-card" />
      </div>

      <div className="mt-8">
        <EventGridSkeleton count={3} />
      </div>

      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function InlineSpinner({ label }: { label: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-ink-soft">
      <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ Empty */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
        {icon ?? <Compass className="h-7 w-7" aria-hidden="true" />}
      </div>
      <h3 className="text-display-sm">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-soft">{description}</p>
      {action && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>}
    </Card>
  );
}

export function NoEventsFound({
  hasFilters,
  onClear,
}: {
  hasFilters: boolean;
  onClear: () => void;
}) {
  if (hasFilters) {
    return (
      <EmptyState
        icon={<CalendarX2 className="h-7 w-7" aria-hidden="true" />}
        title="Nothing matches those filters"
        description="There is nothing on the board for this combination yet. Widening the date range or clearing the category usually turns something up."
        action={
          <Button variant="secondary" onClick={onClear}>
            Clear all filters
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      title="The board is quiet right now"
      description="No upcoming events have been posted yet. If you know of something happening nearby, you can be the first to put it on the board."
      action={
        <ButtonLink to="/events/new" variant="primary">
          Create the first event
        </ButtonLink>
      }
    />
  );
}

/* ------------------------------------------------------------------ Error */

/**
 * Error state that reads the failure rather than showing one generic message — a
 * dropped connection and a missing record need different wording and different actions.
 */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const isApiError = error instanceof ApiError;
  const offline = isApiError && error.isNetworkError;

  const message = isApiError
    ? error.message
    : (error as { message?: string })?.message || 'Something unexpected went wrong.';

  return (
    <Card
      role="alert"
      className={cn('flex flex-col items-center px-6 py-14 text-center', className)}
    >
      <div
        className={cn(
          'mb-4 flex h-14 w-14 items-center justify-center rounded-2xl',
          offline ? 'bg-warning-soft text-warning-ink' : 'bg-danger-soft text-danger-ink',
        )}
      >
        {offline ? (
          <WifiOff className="h-7 w-7" aria-hidden="true" />
        ) : (
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        )}
      </div>

      <h3 className="text-display-sm">{offline ? 'You appear to be offline' : 'That did not work'}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-soft">{message}</p>

      {onRetry && (
        <Button variant="secondary" className="mt-6" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      )}
    </Card>
  );
}
