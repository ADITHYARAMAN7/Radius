import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Category, DateFilter, EventRecord } from './types';

/** Merge Tailwind classes so a later class reliably overrides an earlier one. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000);
}

/** "Today", "Tomorrow", "Sat 12 Oct" — the closer it is, the more human the label. */
export function formatEventDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const offset = daysBetween(date, new Date());

  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  if (offset === -1) return 'Yesterday';
  if (offset > 1 && offset < 7) return DAYS[date.getDay()] ?? '';

  const sameYear = date.getFullYear() === new Date().getFullYear();
  const month = (MONTHS[date.getMonth()] ?? '').slice(0, 3);
  return sameYear
    ? `${date.getDate()} ${month}`
    : `${date.getDate()} ${month} ${date.getFullYear()}`;
}

export function formatEventDateLong(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${DAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** 24h "18:30" to "6:30 PM" — matches how times are read aloud. */
export function formatTime(time: string): string {
  const [hoursRaw, minutes] = time.split(':');
  const hours = Number(hoursRaw);
  if (Number.isNaN(hours)) return time;

  const suffix = hours >= 12 ? 'PM' : 'AM';
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${minutes ?? '00'} ${suffix}`;
}

export function formatTimeRange(startTime: string, endTime: string): string {
  return `${formatTime(startTime)} – ${formatTime(endTime)}`;
}

/** "in 3 days", "in 2 hours", "started 20 minutes ago". */
export function formatRelative(iso: string): string {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return '';

  const diffMs = target - Date.now();
  const absMinutes = Math.round(Math.abs(diffMs) / 60_000);

  if (absMinutes < 1) return diffMs >= 0 ? 'starting now' : 'just started';

  const future = diffMs >= 0;
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

  let phrase: string;
  if (absMinutes < 60) phrase = plural(absMinutes, 'minute');
  else if (absMinutes < 1440) phrase = plural(Math.round(absMinutes / 60), 'hour');
  else if (absMinutes < 43_200) phrase = plural(Math.round(absMinutes / 1440), 'day');
  else phrase = plural(Math.round(absMinutes / 43_200), 'month');

  return future ? `in ${phrase}` : `${phrase} ago`;
}

/** "42 people are going" — the exact phrasing the brief asks for. */
export function formatRsvpCount(count: number): string {
  if (count === 0) return 'Be the first to go';
  if (count === 1) return '1 person is going';
  return `${count.toLocaleString()} people are going`;
}

export function hasFinished(event: EventRecord): boolean {
  return new Date(event.endsAt).getTime() < Date.now();
}

export function isHappeningNow(event: EventRecord): boolean {
  const now = Date.now();
  return new Date(event.startsAt).getTime() <= now && new Date(event.endsAt).getTime() >= now;
}

/** Status shown on a card in "Events I created", where past events still appear. */
export function eventLifecycle(event: EventRecord): {
  label: string;
  tone: 'brand' | 'success' | 'danger' | 'neutral' | 'warning';
} {
  if (event.status === 'CANCELLED') return { label: 'Cancelled', tone: 'danger' };
  if (hasFinished(event)) return { label: 'Finished', tone: 'neutral' };
  if (isHappeningNow(event)) return { label: 'Happening now', tone: 'success' };

  const hoursAway = (new Date(event.startsAt).getTime() - Date.now()) / 3_600_000;
  if (hoursAway < 24) return { label: 'Starting soon', tone: 'warning' };
  return { label: 'Upcoming', tone: 'brand' };
}

export const DATE_FILTERS: Array<{ value: DateFilter; label: string }> = [
  { value: 'upcoming', label: 'All upcoming' },
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'weekend', label: 'This weekend' },
  { value: 'week', label: 'This week' },
  { value: 'past', label: 'Past / Expired' },
];

/**
 * Per-category colour and icon name. Categories need to be distinguishable at a glance
 * in a dense grid, and a single accent colour would make every card look the same.
 */
export const CATEGORY_STYLES: Record<
  Category,
  { badge: string; dot: string; icon: string; blurb: string }
> = {
  Sports: {
    badge: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25',
    dot: 'bg-emerald-500',
    icon: 'Trophy',
    blurb: 'Games, matches, runs and rides',
  },
  Music: {
    badge: 'bg-violet-500/12 text-violet-700 dark:text-violet-300 ring-violet-500/25',
    dot: 'bg-violet-500',
    icon: 'Music',
    blurb: 'Gigs, open mics and jam sessions',
  },
  Food: {
    badge: 'bg-orange-500/12 text-orange-700 dark:text-orange-300 ring-orange-500/25',
    dot: 'bg-orange-500',
    icon: 'UtensilsCrossed',
    blurb: 'Markets, tastings and cook-alongs',
  },
  'Yard Sale': {
    badge: 'bg-amber-500/12 text-amber-700 dark:text-amber-300 ring-amber-500/25',
    dot: 'bg-amber-500',
    icon: 'Tag',
    blurb: 'Garage sales and second-hand finds',
  },
  Community: {
    badge: 'bg-sky-500/12 text-sky-700 dark:text-sky-300 ring-sky-500/25',
    dot: 'bg-sky-500',
    icon: 'Users',
    blurb: 'Clean-ups, drives and meet-ups',
  },
  Education: {
    badge: 'bg-blue-500/12 text-blue-700 dark:text-blue-300 ring-blue-500/25',
    dot: 'bg-blue-500',
    icon: 'GraduationCap',
    blurb: 'Classes, talks and study circles',
  },
  Technology: {
    badge: 'bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 ring-indigo-500/25',
    dot: 'bg-indigo-500',
    icon: 'Cpu',
    blurb: 'Workshops, demos and hack nights',
  },
  Other: {
    badge: 'bg-slate-500/12 text-slate-700 dark:text-slate-300 ring-slate-500/25',
    dot: 'bg-slate-500',
    icon: 'Sparkles',
    blurb: 'Everything else happening nearby',
  },
};

/** Stable colour for a name, so the same organiser always gets the same avatar. */
export function avatarColor(seed: string): string {
  const palette = [
    'bg-indigo-500', 'bg-emerald-500', 'bg-orange-500', 'bg-violet-500',
    'bg-sky-500', 'bg-rose-500', 'bg-teal-500', 'bg-amber-500',
  ];

  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length] ?? 'bg-indigo-500';
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0] ?? '').slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
}

/**
 * Constrains a post-login redirect to a path inside this app.
 *
 * `next` arrives from the query string, so an attacker controls it in any link they can
 * get someone to click. Anything absolute, protocol-relative (`//evil.example`) or
 * scheme-bearing is discarded in favour of the default.
 */
export function safeRedirectPath(next: string | null, fallback = '/explore'): string {
  if (!next) return fallback;

  // Must be a single-slash absolute path: rules out "//host", "https://host" and "javascript:".
  if (!next.startsWith('/') || next.startsWith('//')) return fallback;

  // A backslash is treated as a slash by some browsers when resolving URLs.
  if (next.includes('\\')) return fallback;

  return next;
}

/** Today in YYYY-MM-DD, used as the min attribute on date inputs. */
export function todayAsInputValue(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Great-circle distance in kilometres.
 *
 * Mirrors the server-side filter so a card can show "2.3 km away" without another round
 * trip — the event already carries its coordinates.
 */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** "450 m away" reads better than "0.5 km away" at close range. */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) return '';
  if (km < 1) return `${Math.round(km * 1000 / 50) * 50} m away`;
  if (km < 10) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
}

export function googleMapsLink(event: Pick<EventRecord, 'latitude' | 'longitude' | 'address'>): string {
  if (event.latitude !== null && event.longitude !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${event.latitude},${event.longitude}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.address)}`;
}

/** Calendar entry for an event, so "add to calendar" needs no backend. */
export function googleCalendarLink(event: EventRecord): string {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]|\.\d{3}/g, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${stamp(event.startsAt)}/${stamp(event.endsAt)}`,
    details: event.summary || event.description.slice(0, 500),
    location: event.address,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
