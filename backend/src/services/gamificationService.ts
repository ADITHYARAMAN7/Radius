import { FieldValue, getDb, type DocumentData } from '../config/firebase';
import { CATEGORIES, type Badge, type Category, type NeighbourLevel, type NeighbourStats } from '../types';

/**
 * Neighbour points: a small reward loop for the three things that make a community board
 * worth visiting — people post events, people say they are coming, and people turn up.
 *
 * Turning up is worth the most on purpose. An RSVP costs one tap; a check-in means the
 * person was actually there, and that is the number an organiser cares about.
 */
export const POINTS = {
  host: 20,
  rsvp: 5,
  checkIn: 15,
} as const;

export type PointAction = keyof typeof POINTS;

const STAT_FIELD: Record<PointAction, keyof NeighbourStats> = {
  host: 'hosted',
  rsvp: 'rsvps',
  checkIn: 'checkIns',
};

const LEVELS: Array<{ name: string; minPoints: number }> = [
  { name: 'Newcomer', minPoints: 0 },
  { name: 'Neighbour', minPoints: 25 },
  { name: 'Regular', minPoints: 75 },
  { name: 'Connector', minPoints: 150 },
  { name: 'Local Legend', minPoints: 300 },
];

/**
 * The write that awards (direction 1) or takes back (direction -1) points for an action.
 *
 * Returned as plain data rather than performed here, so the caller can put it inside the
 * same transaction or batch as the action itself — the points can then never drift from
 * what the user actually did. Apply it with `set(userRef, data, { merge: true })`.
 */
export function pointsDelta(action: PointAction, direction: 1 | -1, category?: string): DocumentData {
  const data: DocumentData = {
    points: FieldValue.increment(POINTS[action] * direction),
    stats: { [STAT_FIELD[action]]: FieldValue.increment(direction) },
  };

  // Tracks which kinds of event someone goes to: drives the Explorer badge and the
  // "For you" recommendations.
  if (action === 'rsvp' && category) {
    data.categoryCounts = { [category]: FieldValue.increment(direction) };
  }

  return data;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export function readStats(data: DocumentData): NeighbourStats {
  const stats = (data.stats ?? {}) as Record<string, unknown>;
  return {
    hosted: count(stats.hosted),
    rsvps: count(stats.rsvps),
    checkIns: count(stats.checkIns),
  };
}

export function readCategoryCounts(data: DocumentData): Partial<Record<Category, number>> {
  const raw = (data.categoryCounts ?? {}) as Record<string, unknown>;
  const result: Partial<Record<Category, number>> = {};

  for (const category of CATEGORIES) {
    const value = count(raw[category]);
    if (value > 0) result[category] = value;
  }

  return result;
}

export function levelFor(points: number): NeighbourLevel {
  let index = 0;
  for (let i = 0; i < LEVELS.length; i += 1) {
    if (points >= LEVELS[i]!.minPoints) index = i;
  }

  const current = LEVELS[index]!;
  const next = LEVELS[index + 1] ?? null;

  return {
    name: current.name,
    rank: index + 1,
    minPoints: current.minPoints,
    nextName: next?.name ?? null,
    nextAt: next?.minPoints ?? null,
  };
}

/** Every badge, earned or not, so the profile can show what is still to unlock. */
export function badgesFor(data: DocumentData): Badge[] {
  const stats = readStats(data);
  const categories = Object.keys(readCategoryCounts(data)).length;

  return [
    {
      id: 'first-rsvp',
      name: 'First Step',
      description: 'RSVP to your first event',
      earned: stats.rsvps >= 1,
    },
    {
      id: 'regular',
      name: 'Regular',
      description: 'RSVP to 5 events',
      earned: stats.rsvps >= 5,
    },
    {
      id: 'explorer',
      name: 'Explorer',
      description: 'RSVP to events in 3 different categories',
      earned: categories >= 3,
    },
    {
      id: 'showed-up',
      name: 'Showed Up',
      description: 'Check in at an event',
      earned: stats.checkIns >= 1,
    },
    {
      id: 'reliable',
      name: 'Reliable',
      description: 'Check in at 5 events',
      earned: stats.checkIns >= 5,
    },
    {
      id: 'host',
      name: 'Host',
      description: 'Post your first event',
      earned: stats.hosted >= 1,
    },
    {
      id: 'super-host',
      name: 'Super Host',
      description: 'Post 5 events',
      earned: stats.hosted >= 5,
    },
  ];
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

/** The most active neighbours. Email and bio are deliberately left out of a public list. */
export async function getLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  const snapshot = await getDb()
    .collection('users')
    .where('points', '>', 0)
    .orderBy('points', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    const points = count(data.points);

    return {
      uid: doc.id,
      displayName: String(data.displayName ?? 'Neighbour'),
      photoURL: data.photoURL ? String(data.photoURL) : null,
      neighborhood: String(data.neighborhood ?? ''),
      points,
      level: levelFor(points).name,
      stats: readStats(data),
      badgesEarned: badgesFor(data).filter((badge) => badge.earned).length,
    };
  });
}
