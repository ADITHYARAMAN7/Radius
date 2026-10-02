import { getDb } from '../config/firebase';
import { toIso } from '../utils/dates';
import { CATEGORIES, type Category } from '../types';

export interface InsightsPayload {
  totals: {
    events: number;
    active: number;
    expired: number;
    cancelled: number;
    rsvps: number;
    /** People who checked in at the door, across every event. */
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

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function topEntry(counts: Map<string, number>): { name: string; count: number } | null {
  let best: { name: string; count: number } | null = null;
  for (const [name, count] of counts) {
    if (!best || count > best.count) best = { name, count };
  }
  return best;
}

/**
 * Aggregates the whole collection in one pass.
 *
 * A single scan is the right call at this scale and keeps the numbers exact. The
 * production shape would be incrementally maintained counter documents updated on
 * write — noted in the roadmap rather than built, because it buys nothing for a board
 * of this size and costs correctness while the data is still changing shape.
 */
export async function getInsights(): Promise<InsightsPayload> {
  const snapshot = await getDb().collection('events').select(
    'category',
    'neighborhood',
    'status',
    'rsvpCount',
    'checkedInCount',
    'startsAt',
    'creatorId',
  ).get();

  const categoryEvents = new Map<string, number>();
  const categoryRsvps = new Map<string, number>();
  const neighborhoodEvents = new Map<string, number>();
  const neighborhoodRsvps = new Map<string, number>();
  const monthEvents = new Map<string, number>();
  const monthRsvps = new Map<string, number>();
  const dayOfWeek = new Map<string, number>();
  const organisers = new Set<string>();

  let active = 0;
  let expired = 0;
  let cancelled = 0;
  let rsvps = 0;
  let checkIns = 0;

  const bump = (map: Map<string, number>, key: string, by = 1) => {
    if (!key) return;
    map.set(key, (map.get(key) ?? 0) + by);
  };

  const now = Date.now();

  for (const doc of snapshot.docs) {
    const data = doc.data();

    const status = String(data.status ?? 'ACTIVE');
    const count = typeof data.rsvpCount === 'number' ? data.rsvpCount : 0;
    const category = String(data.category ?? 'Other');
    const neighborhood = String(data.neighborhood ?? '').trim();
    const startsAtIso = toIso(data.startsAt);

    rsvps += count;
    checkIns += typeof data.checkedInCount === 'number' ? Math.max(0, data.checkedInCount) : 0;
    if (data.creatorId) organisers.add(String(data.creatorId));

    if (status === 'CANCELLED') cancelled += 1;
    else if (status === 'EXPIRED') expired += 1;
    else if (startsAtIso && new Date(startsAtIso).getTime() < now - 86400000) expired += 1;
    else active += 1;

    bump(categoryEvents, category);
    bump(categoryRsvps, category, count);

    if (neighborhood) {
      bump(neighborhoodEvents, neighborhood);
      bump(neighborhoodRsvps, neighborhood, count);
    }

    if (startsAtIso) {
      const date = new Date(startsAtIso);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      bump(monthEvents, monthKey);
      bump(monthRsvps, monthKey, count);
      bump(dayOfWeek, DAY_LABELS[date.getDay()] ?? 'Unknown');
    }
  }

  const byCategory = CATEGORIES.map((category) => ({
    category,
    events: categoryEvents.get(category) ?? 0,
    rsvps: categoryRsvps.get(category) ?? 0,
  }));

  const byNeighborhood = Array.from(neighborhoodEvents.entries())
    .map(([neighborhood, events]) => ({
      neighborhood,
      events,
      rsvps: neighborhoodRsvps.get(neighborhood) ?? 0,
    }))
    .sort((a, b) => b.events - a.events || b.rsvps - a.rsvps)
    .slice(0, 8);

  const overTime = Array.from(monthEvents.keys())
    .sort()
    .slice(-6)
    .map((key) => {
      const [year, month] = key.split('-');
      const label = `${MONTH_LABELS[Number(month) - 1] ?? month} ${String(year).slice(2)}`;
      return { month: label, events: monthEvents.get(key) ?? 0, rsvps: monthRsvps.get(key) ?? 0 };
    });

  return {
    totals: {
      events: snapshot.size,
      active,
      expired,
      cancelled,
      rsvps,
      checkIns,
      organisers: organisers.size,
    },
    topCategory: topEntry(categoryEvents),
    topNeighborhood: topEntry(neighborhoodEvents),
    byCategory,
    byNeighborhood,
    overTime,
    busiestDay: topEntry(dayOfWeek),
    generatedAt: new Date().toISOString(),
  };
}

/** Category tiles on the home page need a live count, not a hardcoded one. */
export async function getCategoryCounts(): Promise<Array<{ category: Category; count: number }>> {
  const snapshot = await getDb()
    .collection('events')
    .where('status', '==', 'ACTIVE')
    .select('category')
    .get();

  const counts = new Map<string, number>();
  for (const doc of snapshot.docs) {
    const category = String(doc.data().category ?? 'Other');
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return CATEGORIES.map((category) => ({ category, count: counts.get(category) ?? 0 }));
}

let placeCache: { value: { neighborhoods: string[]; cities: string[] }; expiresAt: number } | null = null;

/**
 * Every neighbourhood and city that currently has an active event. Smart search matches a
 * query against this list, so it can only ever pick a place that is really on the board.
 * Cached briefly — the set changes slowly and search is called per keystroke-ish.
 */
export async function getPlaceIndex(): Promise<{ neighborhoods: string[]; cities: string[] }> {
  if (placeCache && placeCache.expiresAt > Date.now()) return placeCache.value;

  const snapshot = await getDb()
    .collection('events')
    .where('status', '==', 'ACTIVE')
    .select('neighborhood', 'city')
    .get();

  const neighborhoods = new Set<string>();
  const cities = new Set<string>();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const neighborhood = String(data.neighborhood ?? '').trim();
    const city = String(data.city ?? '').trim();
    if (neighborhood) neighborhoods.add(neighborhood);
    if (city) cities.add(city);
  }

  const value = { neighborhoods: Array.from(neighborhoods), cities: Array.from(cities) };
  placeCache = { value, expiresAt: Date.now() + 60_000 };
  return value;
}
