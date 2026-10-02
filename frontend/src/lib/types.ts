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

export type EventStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

export interface EventRecord {
  id: string;
  title: string;
  description: string;
  summary: string;
  category: Category;
  tags: string[];

  date: string;
  startTime: string;
  endTime: string;
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

  isAttending?: boolean;
  isOwner?: boolean;
}

export interface Attendee {
  uid: string;
  displayName: string;
  photoURL: string | null;
  createdAt: string | null;
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

export type DateFilter = 'today' | 'tomorrow' | 'weekend' | 'week' | 'upcoming' | 'all' | 'past';
export type SortOption = 'soonest' | 'popular' | 'recent';

export interface EventFiltersState {
  search: string;
  category: Category | null;
  neighborhood: string;
  city: string;
  date: DateFilter;
  sort: SortOption;
  /** Distance filter. All three are set together or all left null. */
  radiusKm: number | null;
  lat: number | null;
  lng: number | null;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface EventDetailResponse {
  event: EventRecord;
  related: EventRecord[];
  attendees: Attendee[];
}

export interface AiSuggestion {
  title: string;
  description: string;
  summary: string;
  category: Category;
  tags: string[];
}

/** Snap-a-Poster: form fields the AI can pre-fill. */
export type ExtractField =
  | 'title'
  | 'description'
  | 'category'
  | 'date'
  | 'startTime'
  | 'endTime'
  | 'location'
  | 'address'
  | 'neighborhood'
  | 'city';

export interface ExtractionResult {
  found: boolean;
  fields: Record<Exclude<ExtractField, 'category'>, string | null> & { category: Category | null };
  filled: ExtractField[];
  warnings: string[];
}

export interface SearchIntent {
  keywords: string;
  category: Category | null;
  dateFilter: DateFilter;
  neighborhood: string;
  city: string;
}

export interface RsvpResult {
  attending: boolean;
  rsvpCount: number;
}

export interface EventFormPayload {
  title: string;
  description: string;
  summary?: string;
  category: Category;
  tags: string[];
  date: string;
  startTime: string;
  endTime: string;
  tzOffsetMinutes?: number;
  location: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  neighborhood: string;
  city: string;
  imageUrl: string | null;
  imagePath: string | null;
}

export interface InsightsPayload {
  totals: {
    events: number;
    active: number;
    expired: number;
    cancelled: number;
    rsvps: number;
    organisers: number;
  };
  topCategory: { name: string; count: number } | null;
  topNeighborhood: { name: string; count: number } | null;
  byCategory: Array<{ category: Category; events: number; rsvps: number }>;
  byNeighborhood: Array<{ neighborhood: string; events: number; rsvps: number }>;
  overTime: Array<{ month: string; events: number; rsvps: number }>;
  busiestDay: { name: string; count: number } | null;
  generatedAt: string;
}

export interface CategoryCount {
  category: Category;
  count: number;
}
