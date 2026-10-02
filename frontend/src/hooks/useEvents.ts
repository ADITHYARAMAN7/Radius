import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { EventFiltersState, EventRecord, Paginated } from '@/lib/types';

/** Delays a fast-changing value — used so typing in the search box is not one request per keystroke. */
export function useDebounced<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

interface UseEventsResult {
  data: Paginated<EventRecord> | null;
  events: EventRecord[];
  loading: boolean;
  /** True only while refetching with data already on screen, so the grid can dim instead of unmounting. */
  refreshing: boolean;
  error: unknown;
  reload: () => void;
  /** Applies an RSVP result locally so the card updates without a round trip. */
  applyRsvp: (eventId: string, attending: boolean, rsvpCount: number) => void;
}

/**
 * Fetches a page of events for the given filters.
 *
 * Every fetch runs under an AbortController and a request sequence number, so a slow
 * earlier response cannot overwrite a newer one — the classic race when someone types
 * quickly and each keystroke fires a request.
 */
export function useEvents(
  filters: Partial<EventFiltersState> & { page?: number; pageSize?: number },
  /**
   * Set false to hold the request back — used by the nearby section, which has nothing
   * meaningful to ask for until the visitor has shared a location.
   */
  enabled = true,
): UseEventsResult {
  const { user, initialising } = useAuth();
  const [data, setData] = useState<Paginated<EventRecord> | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);

  const latestRequest = useRef(0);
  const hasData = useRef(false);

  // Serialised so the effect depends on the filter values rather than object identity.
  const key = JSON.stringify(filters);

  useEffect(() => {
    // Waiting for auth avoids fetching anonymously and then immediately refetching.
    if (initialising) return;

    if (!enabled) {
      // Nothing to wait for, so do not leave the caller stuck on a loading state.
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    latestRequest.current += 1;
    const requestId = latestRequest.current;

    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    setError(null);

    api
      .listEventsAs(JSON.parse(key), Boolean(user), controller.signal)
      .then((result) => {
        if (requestId !== latestRequest.current) return;
        setData(result);
        hasData.current = true;
        setError(null);
      })
      .catch((caught: unknown) => {
        if ((caught as Error).name === 'AbortError') return;
        if (requestId !== latestRequest.current) return;
        setError(caught);
      })
      .finally(() => {
        if (requestId !== latestRequest.current) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => controller.abort();
  }, [key, user, initialising, nonce, enabled]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  const applyRsvp = useCallback((eventId: string, attending: boolean, rsvpCount: number) => {
    setData((current) =>
      current
        ? {
            ...current,
            items: current.items.map((event) =>
              event.id === eventId ? { ...event, isAttending: attending, rsvpCount } : event,
            ),
          }
        : current,
    );
  }, []);

  return {
    data,
    events: data?.items ?? [],
    loading,
    refreshing,
    error,
    reload,
    applyRsvp,
  };
}

/**
 * All events in a calendar grid's date range. Same race protection as useEvents: a
 * fast click through months cannot let an older month's response land last.
 */
export function useCalendarEvents(range: {
  from: Date;
  to: Date;
  category: string | null;
  neighborhood: string;
  city: string;
}) {
  const { user, initialising } = useAuth();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);
  const latestRequest = useRef(0);

  const key = JSON.stringify({ ...range, from: range.from.toISOString(), to: range.to.toISOString() });

  useEffect(() => {
    if (initialising) return;

    const controller = new AbortController();
    latestRequest.current += 1;
    const requestId = latestRequest.current;
    const parsed = JSON.parse(key) as { from: string; to: string; category: string | null; neighborhood: string; city: string };

    setLoading(true);
    setError(null);

    api
      .eventsInRange({ ...parsed, from: new Date(parsed.from), to: new Date(parsed.to) }, Boolean(user), controller.signal)
      .then((result) => {
        if (requestId !== latestRequest.current) return;
        setEvents(result.items);
        setTruncated(result.truncated);
      })
      .catch((caught: unknown) => {
        if ((caught as Error).name === 'AbortError') return;
        if (requestId !== latestRequest.current) return;
        setError(caught);
      })
      .finally(() => {
        if (requestId === latestRequest.current) setLoading(false);
      });

    return () => controller.abort();
  }, [key, user, initialising, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  const applyRsvp = useCallback((eventId: string, attending: boolean, rsvpCount: number) => {
    setEvents((current) =>
      current.map((event) => (event.id === eventId ? { ...event, isAttending: attending, rsvpCount } : event)),
    );
  }, []);

  return { events, truncated, loading, error, reload, applyRsvp };
}

/** Shared loader for "Events I created" and "Events I'm attending". */
export function useMyEvents(kind: 'created' | 'attending') {
  const { user, initialising } = useAuth();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (initialising) return;

    if (!user) {
      setEvents([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    const load = kind === 'created' ? api.myEvents() : api.myRsvps();

    load
      .then((result) => {
        if (active) setEvents(result.events);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [kind, user, initialising, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  const removeEvent = useCallback((eventId: string) => {
    setEvents((current) => current.filter((event) => event.id !== eventId));
  }, []);

  const patchEvent = useCallback((eventId: string, patch: Partial<EventRecord>) => {
    setEvents((current) =>
      current.map((event) => (event.id === eventId ? { ...event, ...patch } : event)),
    );
  }, []);

  return { events, loading, error, reload, removeEvent, patchEvent };
}
