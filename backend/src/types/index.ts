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
  /** How many people actually turned up — counted by the check-in flow. */
  checkedInCount: number;
  commentCount: number;
  status: EventStatus;

  createdAt: string | null;
  updatedAt: string | null;

  /** Populated per-request for the signed-in caller. */
  isAttending?: boolean;
  isOwner?: boolean;
  isSaved?: boolean;
  isCheckedIn?: boolean;
  /** Only ever sent to the organiser — it is what attendees must present to check in. */
  checkInCode?: string;
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

  points: number;
  level: NeighbourLevel;
  stats: NeighbourStats;
  badges: Badge[];
}

export interface NeighbourStats {
  hosted: number;
  rsvps: number;
  checkIns: number;
}

export interface NeighbourLevel {
  name: string;
  /** 1-based position on the ladder. */
  rank: number;
  minPoints: number;
  nextName: string | null;
  nextAt: number | null;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  earned: boolean;
}

export interface Attendee {
  uid: string;
  displayName: string;
  photoURL: string | null;
  createdAt: string | null;
  checkedIn: boolean;
}

export interface EventComment {
  id: string;
  uid: string;
  displayName: string;
  photoURL: string | null;
  text: string;
  /** True when the author is the event's organiser, so answers stand out from questions. */
  isOrganiser: boolean;
  createdAt: string | null;
  /** Populated per-request: the viewer wrote it, or owns the event it is on. */
  canDelete?: boolean;
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
