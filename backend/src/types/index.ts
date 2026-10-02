export const CATEGORIES = [
  'Sports',
  'Music',
  'Food',
  'Yard Sale',
  'Community',
  'Education',
  'Technology',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const EVENT_STATUSES = ['ACTIVE', 'EXPIRED', 'CANCELLED'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export interface EventRecord {
  id: string;
  title: string;
  description: string;
  summary: string;
  category: Category;
  tags: string[];

  /** Calendar day in the local context of the event, YYYY-MM-DD. */
  date: string;
  /** 24h HH:mm. */
  startTime: string;
  endTime: string;

  /** Absolute instants used for ordering and expiry - ISO strings over the wire. */
  startsAt: string;
  endsAt: string;

  location: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  neighborhood: string;
  city: string;

  imageUrl: string | null;
  imagePath: string | null;

  creatorId: string;
  creatorName: string;
  creatorPhotoURL: string | null;

  rsvpCount: number;
  status: EventStatus;

  createdAt: string | null;
  updatedAt: string | null;

  /** Populated per-request for the signed-in caller. */
  isAttending?: boolean;
  isOwner?: boolean;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string | null;
  photoURL: string | null;
  bio: string;
  neighborhood: string;
  city: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Attendee {
  uid: string;
  displayName: string;
  photoURL: string | null;
  createdAt: string | null;
}

export type DateFilter = 'today' | 'tomorrow' | 'weekend' | 'week' | 'upcoming' | 'all' | 'past';
export type SortOption = 'soonest' | 'popular' | 'recent';

export interface EventQueryOptions {
  search?: string;
  category?: Category;
  neighborhood?: string;
  city?: string;
  dateFilter?: DateFilter;
  sort?: SortOption;
  page?: number;
  pageSize?: number;
  creatorId?: string;
  /** Centre + radius in km for the distance filter. */
  lat?: number;
  lng?: number;
  radiusKm?: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface AiSuggestion {
  title: string;
  description: string;
  summary: string;
  category: Category;
  tags: string[];
}
