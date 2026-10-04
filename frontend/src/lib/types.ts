export const CATEGORIES = [
  'Sports',
  'Music',
  'Food',
  'Yard Sale',
  'Community',
  'Education',
  'Technology',
  'Art',
  'Health',
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
  /** How many people actually turned up — counted by the check-in flow. */
  checkedInCount: number;
  commentCount: number;
  status: EventStatus;

  createdAt: string | null;
  updatedAt: string | null;

  isAttending?: boolean;
  isOwner?: boolean;
  isSaved?: boolean;
  isCheckedIn?: boolean;
  /** Present only for the organiser: what guests present at the door. */
  checkInCode?: string;
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
  isOrganiser: boolean;
  createdAt: string | null;
  canDelete?: boolean;
}

export interface NeighbourStats {
  hosted: number;
  rsvps: number;
  checkIns: number;
}

export interface NeighbourLevel {
  name: string;
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

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  photoURL: string | null;
  neighborhood: string;
  points: number;
  level: string;
  stats: NeighbourStats;
  badgesEarned: number;
}

export interface LeaderboardPayload {
  leaders: LeaderboardEntry[];
  points: { host: number; rsvp: number; checkIn: number };
}

export type WeatherKind = 'clear' | 'cloudy' | 'fog' | 'rain' | 'storm' | 'snow';

export interface EventWeather {
  available: boolean;
  reason?: string;
  temperatureC?: number;
  precipitationChance?: number;
  kind?: WeatherKind;
  label?: string;
  advice?: string;
  forHour?: string;
}

export interface CheckInResult {
  checkedIn: true;
  alreadyCheckedIn: boolean;
  checkedInCount: number;
  rsvpCount: number;
  pointsEarned: number;
}

/** Which engine is behind the assistant: Gemini, or the built-in rule-based one. */
export type AiProvider = 'gemini' | 'local';

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
  source?: AiProvider;
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
  source?: AiProvider;
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
    checkIns: number;
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

/**
 * An event enriched with a Local Relevance Score and human-readable reasons,
 * returned by GET /api/events/recommended.
 *
 * This is NOT a prediction model result — it is a configurable heuristic ranking
 * based on distance, category interest, timing, freshness, and engagement.
 */
export interface RecommendedEvent extends EventRecord {
  /** 0–100 integer relevance score. */
  relevanceScore: number;
  /** 2–4 short reasons explaining why this event was recommended. */
  relevanceReasons: string[];
}

/**
 * Pulse status for community momentum classification.
 */
export type PulseStatus = 'NORMAL' | 'GROWING' | 'TRENDING';

/**
 * An event enriched with a community momentum (Pulse) score,
 * returned by GET /api/events/trending.
 *
 * Pulse measures RECENT engagement growth, not lifetime popularity.
 * An event with 10 RSVPs this week is more "trending" than one with
 * 40 RSVPs accumulated over 3 months.
 */
export interface TrendingEvent extends EventRecord {
  /** 0–100 integer pulse score. */
  pulseScore: number;
  /** Community momentum classification. */
  pulseStatus: PulseStatus;
  /** 1–3 human-readable reasons explaining the momentum. */
  pulseReasons: string[];
  recentRsvps?: number;
}

/** An address suggestion from /api/places/suggest (OpenStreetMap, used without a Google key). */
export interface PlaceSuggestion {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  kind: string;
  city: string;
  county: string;
  locality: string;
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  label: string;
  /** How close the match is: the address itself, the area around it, or only the city. */
  precision: 'address' | 'area' | 'city';
}
