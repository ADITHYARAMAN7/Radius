import { getIdToken } from './firebase';
import type {
  AiProvider,
  AiSuggestion,
  Attendee,
  CategoryCount,
  CheckInResult,
  EventComment,
  EventDetailResponse,
  EventFiltersState,
  EventFormPayload,
  EventRecord,
  ExtractionResult,
  PlaceSuggestion,
  EventWeather,
  GeocodeResult,
  InsightsPayload,
  LeaderboardPayload,
  Paginated,
  RecommendedEvent,
  RsvpResult,
  SearchIntent,
  TrendingEvent,
  UserProfile,
} from './types';

/**
 * Empty base URL means same-origin, which covers both the Vite dev proxy and the
 * single-service Cloud Run deployment. Only a split deployment needs it set.
 */
const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

/**
 * A failed request carries the server's user-facing message plus any per-field errors,
 * so a form can highlight the offending input rather than showing one generic banner.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Attach the Firebase ID token. */
  auth?: boolean;
  signal?: AbortSignal;
  /** Multipart upload — skip JSON encoding and let the browser set the boundary. */
  formData?: FormData;
}

/**
 * In local mode the API starts the Firebase emulators itself, which takes a few seconds.
 * While that is happening it answers 503 LOCAL_STACK_STARTING; waiting and asking again
 * here means every page simply loads a moment later, rather than each one needing its
 * own retry button.
 */
const STARTING_RETRY_MS = 2000;
const STARTING_MAX_RETRIES = 45;

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await requestOnce<T>(path, options);
    } catch (error) {
      const starting = error instanceof ApiError && error.code === 'LOCAL_STACK_STARTING';
      if (!starting || attempt >= STARTING_MAX_RETRIES) throw error;
      await wait(STARTING_RETRY_MS, options.signal);
    }
  }
}

async function requestOnce<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = false, signal, formData } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (auth) {
    const token = await getIdToken();
    if (!token) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
    }
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;

  try {
    response = await fetch(`${BASE_URL}/api${path}`, {
      method,
      headers,
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal,
    });
  } catch (error) {
    // An aborted request is a navigation, not a failure the user should see.
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(
      0,
      'NETWORK',
      'We could not reach Radius. Check your connection and try again.',
    );
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      // A non-JSON body means something upstream failed — a proxy or a crashed process.
      if (!response.ok) {
        throw new ApiError(response.status, 'BAD_RESPONSE', 'The server returned an unexpected response.');
      }
    }
  }

  if (!response.ok) {
    const envelope = (payload as { error?: { code?: string; message?: string; fields?: Record<string, string>; details?: { fields?: Record<string, string> } } })?.error;

    throw new ApiError(
      response.status,
      envelope?.code ?? 'UNKNOWN',
      envelope?.message ?? 'Something went wrong. Please try again.',
      envelope?.fields ?? envelope?.details?.fields ?? {},
    );
  }

  return payload as T;
}

function buildEventQuery(filters: Partial<EventFiltersState> & { page?: number; pageSize?: number }): string {
  const params = new URLSearchParams();

  if (filters.search?.trim()) params.set('search', filters.search.trim());
  if (filters.category) params.set('category', filters.category);
  if (filters.neighborhood?.trim()) params.set('neighborhood', filters.neighborhood.trim());
  if (filters.city?.trim()) params.set('city', filters.city.trim());
  if (filters.date && filters.date !== 'upcoming') params.set('date', filters.date);
  if (filters.sort && filters.sort !== 'soonest') params.set('sort', filters.sort);
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));

  // Distance needs all three to mean anything, so they are sent as a set or not at all.
  if (
    filters.radiusKm != null &&
    filters.lat != null &&
    filters.lng != null &&
    Number.isFinite(filters.lat) &&
    Number.isFinite(filters.lng)
  ) {
    params.set('lat', String(filters.lat));
    params.set('lng', String(filters.lng));
    params.set('radiusKm', String(filters.radiusKm));
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export const api = {
  health: () => request<{ status: string; integrations: Record<string, string> }>('/health'),

  listEvents: (
    filters: Partial<EventFiltersState> & { page?: number; pageSize?: number },
    signal?: AbortSignal,
  ) => request<Paginated<EventRecord>>(`/events${buildEventQuery(filters)}`, { auth: false, signal }),

  /**
   * Same endpoint, but authenticated so the response knows which cards the viewer has
   * already joined. Falls back to the anonymous read when nobody is signed in.
   */
  listEventsAs: async (
    filters: Partial<EventFiltersState> & { page?: number; pageSize?: number },
    signedIn: boolean,
    signal?: AbortSignal,
  ) =>
    request<Paginated<EventRecord>>(`/events${buildEventQuery(filters)}`, {
      auth: signedIn,
      signal,
    }),

  /**
   * Every event starting in [from, to), unpaginated — for the month calendar. `from`/`to`
   * are the browser's local midnights, so days follow the viewer's timezone.
   */
  eventsInRange: (
    range: { from: Date; to: Date; category?: string | null; neighborhood?: string; city?: string },
    signedIn: boolean,
    signal?: AbortSignal,
  ) => {
    const params = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() });
    if (range.category) params.set('category', range.category);
    if (range.neighborhood?.trim()) params.set('neighborhood', range.neighborhood.trim());
    if (range.city?.trim()) params.set('city', range.city.trim());
    return request<{ items: EventRecord[]; truncated: boolean }>(`/events/calendar?${params}`, {
      auth: signedIn,
      signal,
    });
  },

  getEvent: (id: string, signedIn: boolean, signal?: AbortSignal) =>
    request<EventDetailResponse>(`/events/${id}`, { auth: signedIn, signal }),

  createEvent: (payload: EventFormPayload) =>
    request<{ event: EventRecord }>('/events', { method: 'POST', body: payload, auth: true }),

  updateEvent: (id: string, payload: Partial<EventFormPayload>) =>
    request<{ event: EventRecord }>(`/events/${id}`, { method: 'PATCH', body: payload, auth: true }),

  cancelEvent: (id: string) =>
    request<{ event: EventRecord }>(`/events/${id}/cancel`, { method: 'POST', auth: true }),

  reactivateEvent: (id: string) =>
    request<{ event: EventRecord }>(`/events/${id}/reactivate`, { method: 'POST', auth: true }),

  deleteEvent: (id: string) => request<void>(`/events/${id}`, { method: 'DELETE', auth: true }),

  listAttendees: (id: string) => request<{ attendees: Attendee[]; total: number }>(`/events/${id}/attendees`),

  rsvp: (id: string) => request<RsvpResult>(`/events/${id}/rsvp`, { method: 'POST', auth: true }),

  cancelRsvp: (id: string) => request<RsvpResult>(`/events/${id}/rsvp`, { method: 'DELETE', auth: true }),

  startSession: () => request<{ profile: UserProfile }>('/me/session', { method: 'POST', auth: true }),

  getProfile: () => request<{ profile: UserProfile }>('/me', { auth: true }),

  updateProfile: (patch: Partial<Pick<UserProfile, 'displayName' | 'bio' | 'neighborhood' | 'city'>>) =>
    request<{ profile: UserProfile }>('/me', { method: 'PATCH', body: patch, auth: true }),

  myEvents: () => request<{ events: EventRecord[]; total: number }>('/me/events', { auth: true }),

  myRsvps: () => request<{ events: EventRecord[]; total: number }>('/me/rsvps', { auth: true }),

  categories: () => request<{ categories: CategoryCount[] }>('/categories'),

  /** Address suggestions while typing, when there is no Google Maps key (OpenStreetMap / Photon). */
  placeSuggestions: (query: string, signal?: AbortSignal) =>
    request<{ suggestions: PlaceSuggestion[] }>(`/places/suggest?q=${encodeURIComponent(query)}`, { auth: true, signal }),

  /** Neighbourhood + city for a picked suggestion. */
  resolvePlace: (suggestion: PlaceSuggestion) =>
    request<{ place: { neighborhood: string; city: string } }>('/places/resolve', {
      method: 'POST',
      body: {
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
        name: suggestion.name,
        kind: suggestion.kind,
        city: suggestion.city,
        county: suggestion.county,
        locality: suggestion.locality,
      },
      auth: true,
    }),

  /** Neighbourhoods with upcoming events, for the filter's suggestions. */
  neighborhoods: () => request<{ neighborhoods: Array<{ name: string; count: number }> }>('/neighborhoods'),

  insights: () => request<InsightsPayload>('/insights'),

  aiStatus: () => request<{ available: boolean; provider?: AiProvider }>('/ai/status'),

  aiAssist: (input: {
    title: string;
    description: string;
    category?: string;
    city?: string;
    neighborhood?: string;
  }) => request<{ suggestion: AiSuggestion }>('/ai/assist', { method: 'POST', body: input, auth: true }),

  aiSearch: (query: string) =>
    request<{ intent: SearchIntent }>('/ai/search', { method: 'POST', body: { query }, auth: true }),

  /** Snap-a-Poster: a poster photo and/or pasted message in, form values out. */
  aiExtract: (input: { image?: Blob; text?: string; timezone: string }) => {
    const form = new FormData();
    if (input.image) form.append('image', input.image, 'poster');
    if (input.text) form.append('text', input.text);
    form.append('timezone', input.timezone);
    return request<{ result: ExtractionResult }>('/ai/extract', { method: 'POST', formData: form, auth: true });
  },
  /* ------------------------------------------------- comments (Q&A thread) */

  listComments: (id: string, signedIn: boolean, signal?: AbortSignal) =>
    request<{ comments: EventComment[]; total: number }>(`/events/${id}/comments`, {
      auth: signedIn,
      signal,
    }),

  addComment: (id: string, text: string) =>
    request<{ comment: EventComment }>(`/events/${id}/comments`, {
      method: 'POST',
      body: { text },
      auth: true,
    }),

  deleteComment: (id: string, commentId: string) =>
    request<void>(`/events/${id}/comments/${commentId}`, { method: 'DELETE', auth: true }),

  /* ------------------------------------------------------------- saved */

  saveEvent: (id: string) =>
    request<{ saved: boolean }>(`/events/${id}/save`, { method: 'POST', auth: true }),

  unsaveEvent: (id: string) =>
    request<{ saved: boolean }>(`/events/${id}/save`, { method: 'DELETE', auth: true }),

  mySaved: () => request<{ events: EventRecord[]; total: number }>('/me/saved', { auth: true }),

  /* ------------------------------------------- check-in, weather, community */

  checkIn: (id: string, code: string) =>
    request<CheckInResult>(`/events/${id}/checkin`, { method: 'POST', body: { code }, auth: true }),

  eventWeather: (id: string, signal?: AbortSignal) =>
    request<{ weather: EventWeather }>(`/events/${id}/weather`, { signal }),

  /** Looks up map coordinates for a written address. `result` is null when nothing matched. */
  geocode: (place: { address: string; neighborhood: string; city: string }) =>
    request<{ result: GeocodeResult | null }>('/geocode', { method: 'POST', body: place, auth: true }),

  leaderboard: () => request<LeaderboardPayload>('/community/leaderboard'),

  uploadStatus: () => request<{ available: boolean; maxBytes: number }>('/uploads/status'),

  uploadImage: (file: File) => {
    const form = new FormData();
    form.append('image', file);
    return request<{ imageUrl: string; imagePath: string }>('/uploads/image', {
      method: 'POST',
      formData: form,
      auth: true,
    });
  },

  /**
   * Fetch upcoming active events ranked by Local Relevance Score.
   * Auth is optional — signed-in users get isAttending/isOwner enrichment.
   *
   * This is a heuristic ranking (not an ML prediction) based on:
   * distance, category interests, time-until-event, freshness, and engagement.
   */
  recommended: (params: {
    lat?: number;
    lng?: number;
    interests?: string[];
    page?: number;
    pageSize?: number;
  } = {}) => {
    const query = new URLSearchParams();
    if (params.lat != null && Number.isFinite(params.lat)) query.set('lat', String(params.lat));
    if (params.lng != null && Number.isFinite(params.lng)) query.set('lng', String(params.lng));
    if (params.interests && params.interests.length > 0) query.set('interests', params.interests.join(','));
    if (params.page && params.page > 1) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    const qs = query.toString();
    return request<Paginated<RecommendedEvent>>(`/events/recommended${qs ? `?${qs}` : ''}`);
  },

  /**
   * Fetch upcoming active events ranked by community momentum (Pulse Score).
   * Measures RECENT engagement growth (e.g. RSVPs in the last 7 days) rather than lifetime totals.
   */
  trending: (params: {
    page?: number;
    pageSize?: number;
    category?: string;
    neighborhood?: string;
    city?: string;
  } = {}) => {
    const query = new URLSearchParams();
    if (params.page && params.page > 1) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    if (params.category) query.set('category', params.category);
    if (params.neighborhood) query.set('neighborhood', params.neighborhood);
    if (params.city) query.set('city', params.city);
    const qs = query.toString();
    return request<Paginated<TrendingEvent>>(`/events/trending${qs ? `?${qs}` : ''}`);
  },

  /**
   * Natural-language search powered by Gemini.
   */
  aiSearch: (query: string) => {
    return request<{ 
      intent: {
        category?: string;
        neighborhood?: string;
        dateFilter?: string;
        keywords?: string;
        source: string;
      };
      rankedEvents?: Array<{ eventId: string; reason: string }>;
    }>('/ai/search', {
      method: 'POST',
      body: { query },
      auth: true,
    });
  },
};
