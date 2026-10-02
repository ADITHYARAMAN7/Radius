import { getIdToken } from './firebase';
import type {
  AiSuggestion,
  Attendee,
  CategoryCount,
  EventDetailResponse,
  EventFiltersState,
  EventFormPayload,
  EventRecord,
  InsightsPayload,
  Paginated,
  RsvpResult,
  SearchIntent,
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

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
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
      'We could not reach Nearby-objects. Check your connection and try again.',
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

  insights: () => request<InsightsPayload>('/insights'),

  aiStatus: () => request<{ available: boolean }>('/ai/status'),

  aiAssist: (input: {
    title: string;
    description: string;
    category?: string;
    city?: string;
    neighborhood?: string;
  }) => request<{ suggestion: AiSuggestion }>('/ai/assist', { method: 'POST', body: input, auth: true }),

  aiSearch: (query: string) =>
    request<{ intent: SearchIntent }>('/ai/search', { method: 'POST', body: { query }, auth: true }),

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
};
