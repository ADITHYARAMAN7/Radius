import { useMemo } from 'react';
import { CalendarPlus, CalendarX2, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Primitives';
import { EmptyState, ErrorState } from '@/components/common/States';
import { EventCard } from './EventCard';
import { useCalendarEvents } from '@/hooks/useEvents';
import { useRsvp } from '@/hooks/useRsvp';
import { CATEGORY_STYLES, cn } from '@/lib/utils';
import type { Category, EventRecord } from '@/lib/types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABEL = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });
const DAY_LABEL = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

/** YYYY-MM-DD of a Date in the viewer's local timezone (never UTC). */
export function toDayKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Local midnight for a YYYY-MM-DD key, or null when the key is not a real date. */
export function parseDayKey(key: string | null): Date | null {
  const match = key?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return toDayKey(date) === key ? date : null;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Month view for Explore. Day boundaries are the viewer's local midnights: the grid's
 * first and last day go to the API as instants, and events are grouped by the local
 * date of their start — so a 1:00 AM IST event lands on its own day, not the one before.
 *
 * Events in this app always start and end on the same day (end must be after start), so
 * each event appears on exactly one day.
 */
export function CalendarView({
  day,
  onDayChange,
  category,
  neighborhood,
  city,
}: {
  /** Selected day, YYYY-MM-DD. Also decides which month is shown. */
  day: string;
  onDayChange: (day: string) => void;
  category: Category | null;
  neighborhood: string;
  city: string;
}) {
  const today = startOfToday();
  const todayKey = toDayKey(today);
  const selected = parseDayKey(day) ?? today;
  const selectedKey = toDayKey(selected);

  const year = selected.getFullYear();
  const month = selected.getMonth();
  const monthKeyPrefix = selectedKey.slice(0, 7);

  // Sunday-first grid covering the whole month: 4 to 6 rows.
  const { gridStart, gridEnd, cells } = useMemo(() => {
    const leading = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const weeks = Math.ceil((leading + daysInMonth) / 7);
    const start = new Date(year, month, 1 - leading);
    const end = new Date(year, month, 1 - leading + weeks * 7);
    const list = Array.from({ length: weeks * 7 }, (_, index) => new Date(year, month, 1 - leading + index));
    return { gridStart: start, gridEnd: end, cells: list };
  }, [year, month]);

  const { events, truncated, loading, error, reload, applyRsvp } = useCalendarEvents({
    from: gridStart,
    to: gridEnd,
    category,
    neighborhood,
    city,
  });
  const { toggle, isPending } = useRsvp({ onChange: applyRsvp });

  const byDay = useMemo(() => {
    const groups = new Map<string, EventRecord[]>();
    for (const event of events) {
      const key = toDayKey(new Date(event.startsAt));
      const list = groups.get(key) ?? [];
      list.push(event);
      groups.set(key, list);
    }
    return groups;
  }, [events]);

  const monthHasEvents = events.some((event) => toDayKey(new Date(event.startsAt)).startsWith(monthKeyPrefix));
  const selectedEvents = byDay.get(selectedKey) ?? [];
  const selectedIsPast = selected < today;

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const beforeCurrentMonth = new Date(year, month, 1) < new Date(today.getFullYear(), today.getMonth(), 1);

  /** Moving to a month selects its 1st, or today when the 1st has already passed. */
  const goToMonth = (offset: number) => {
    const first = new Date(year, month + offset, 1);
    onDayChange(toDayKey(first < today ? today : first));
  };

  return (
    <div className="space-y-6">
      <Card className="p-3 sm:p-5">
        {/* -------------------------------------------------------- header */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-ink" aria-live="polite">
            {MONTH_LABEL.format(selected)}
          </h2>

          <div className="flex items-center gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin text-ink-muted" aria-label="Loading events" />}
            <Button variant="secondary" size="sm" onClick={() => onDayChange(todayKey)} disabled={selectedKey === todayKey}>
              Today
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => goToMonth(-1)}
              disabled={isCurrentMonth || beforeCurrentMonth}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button variant="secondary" size="sm" onClick={() => goToMonth(1)} aria-label="Next month">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* ---------------------------------------------------------- grid */}
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {WEEKDAYS.map((weekday) => (
            <div key={weekday} className="pb-1 text-center text-[0.6875rem] font-bold uppercase tracking-wide text-ink-muted">
              <span className="sm:hidden">{weekday.charAt(0)}</span>
              <span className="hidden sm:inline">{weekday}</span>
            </div>
          ))}

          {cells.map((date) => {
            const key = toDayKey(date);
            const inMonth = date.getMonth() === month;
            const past = date < today;
            const isToday = key === todayKey;
            const isSelected = key === selectedKey;
            // Past days show nothing, matching the board's expiry rule.
            const dayEvents = past ? [] : byDay.get(key) ?? [];
            const categories = Array.from(new Set(dayEvents.map((event) => event.category))).slice(0, 3);
            const count = dayEvents.length;

            return (
              <button
                key={key}
                type="button"
                onClick={() => onDayChange(key)}
                disabled={past}
                aria-pressed={isSelected}
                aria-label={`${DAY_LABEL.format(date)}${past ? ', past' : `, ${count} ${count === 1 ? 'event' : 'events'}`}`}
                className={cn(
                  'flex min-h-12 flex-col items-center justify-start gap-1 rounded-lg p-1 text-sm transition-colors sm:min-h-20 sm:items-start sm:p-2',
                  inMonth ? 'bg-surface-sunken/60' : 'bg-transparent',
                  !past && 'hover:bg-brand-soft',
                  past && 'cursor-not-allowed opacity-40',
                  isSelected && 'bg-brand-soft ring-2 ring-brand',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                    inMonth ? 'text-ink' : 'text-ink-muted',
                    isToday && 'bg-brand text-white',
                  )}
                >
                  {date.getDate()}
                </span>

                {count > 0 && (
                  <span className="flex items-center gap-1">
                    {categories.map((name) => (
                      <span key={name} className={cn('h-1.5 w-1.5 rounded-full', CATEGORY_STYLES[name].dot)} aria-hidden="true" />
                    ))}
                    <span className="hidden text-[0.6875rem] font-semibold text-ink-soft sm:inline">
                      {count} {count === 1 ? 'event' : 'events'}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {truncated && (
          <p className="mt-3 text-xs text-ink-muted">
            This month is very busy, so only the first few hundred events are shown. Use the filters to narrow it down.
          </p>
        )}
      </Card>

      {/* ---------------------------------------------------- selected day */}
      {error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !loading && !monthHasEvents ? (
        <EmptyState
          icon={<CalendarX2 className="h-7 w-7" aria-hidden="true" />}
          title={`Nothing on the board for ${MONTH_LABEL.format(selected)} yet`}
          description="Know about something happening this month? Put it on the board so your neighbours can find it."
          action={
            <ButtonLink to="/events/new" variant="primary">
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              Post an event
            </ButtonLink>
          }
        />
      ) : (
        <section aria-labelledby="calendar-day-heading">
          <h3 id="calendar-day-heading" className="mb-4 font-display text-base font-bold text-ink">
            {DAY_LABEL.format(selected)}
            {!selectedIsPast && !loading && (
              <span className="ml-2 text-sm font-medium text-ink-muted">
                {selectedEvents.length} {selectedEvents.length === 1 ? 'event' : 'events'}
              </span>
            )}
          </h3>

          {selectedIsPast ? (
            <p className="text-sm text-ink-soft">This day has passed. Finished events are taken off the board.</p>
          ) : selectedEvents.length === 0 ? (
            !loading && <p className="text-sm text-ink-soft">Nothing on this day. Pick a day with a dot to see what is on.</p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {selectedEvents.map((event) => (
                <EventCard key={event.id} event={event} pending={isPending(event.id)} onToggleRsvp={toggle} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
