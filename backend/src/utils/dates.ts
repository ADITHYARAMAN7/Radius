import type { DateFilter } from '../types';

const MS_PER_DAY = 86400000;

/**
 * Combine a YYYY-MM-DD day and an HH:mm time into an absolute instant.
 * The optional offset (minutes, as returned by getTimezoneOffset) is sent by the
 * browser so an event created at "18:00" is stored as 18:00 in the timezone of the
 * creator rather than in the timezone of the server.
 */
export function combineDateTime(date: string, time: string, tzOffsetMinutes?: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);

  if (!y || !m || !d || hh === undefined || mm === undefined || Number.isNaN(hh) || Number.isNaN(mm)) {
    throw new Error('Invalid date/time combination: ' + date + ' ' + time);
  }

  if (typeof tzOffsetMinutes === 'number' && Number.isFinite(tzOffsetMinutes)) {
    return new Date(Date.UTC(y, m - 1, d, hh, mm) + tzOffsetMinutes * 60000);
  }
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

/** Inclusive start / exclusive end window for each date chip on the Explore page. */
export function resolveDateWindow(
  filter: DateFilter | undefined,
  now = new Date(),
): { from: Date; to: Date | null } {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (filter) {
    case 'today':
      return { from: startOfToday, to: new Date(startOfToday.getTime() + MS_PER_DAY) };

    case 'tomorrow': {
      const from = new Date(startOfToday.getTime() + MS_PER_DAY);
      return { from, to: new Date(from.getTime() + MS_PER_DAY) };
    }

    case 'weekend': {
      // Saturday 00:00 through Monday 00:00. Inside a weekend, "this weekend"
      // means the one in progress, not the next one.
      const day = startOfToday.getDay(); // 0 Sun ... 6 Sat
      const daysUntilSaturday = day === 0 ? -1 : 6 - day;
      const from = new Date(startOfToday.getTime() + daysUntilSaturday * MS_PER_DAY);
      const to = new Date(from.getTime() + 2 * MS_PER_DAY);
      return { from: from < startOfToday ? startOfToday : from, to };
    }

    case 'week':
      return { from: startOfToday, to: new Date(startOfToday.getTime() + 7 * MS_PER_DAY) };

    case 'all':
      return { from: new Date(0), to: null };

    case 'past':
      return { from: new Date(0), to: now };

    case 'upcoming':
    default:
      return { from: startOfToday, to: null };
  }
}

export function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const candidate = value as { toDate?: () => Date };
    if (typeof candidate.toDate === 'function') return candidate.toDate().toISOString();
  }
  return null;
}

/** Great-circle distance in kilometres, for the distance filter. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
