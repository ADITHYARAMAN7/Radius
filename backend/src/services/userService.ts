import { FieldValue, getDb, type DocumentData } from '../config/firebase';
import { logger } from '../config/logger';
import type { AuthUser } from '../middleware/auth';
import type { UserProfile } from '../types';
import { toIso } from '../utils/dates';
import { badgesFor, levelFor, readStats } from './gamificationService';

const USERS = 'users';

function toProfile(uid: string, data: DocumentData): UserProfile {
  const points = typeof data.points === 'number' ? Math.max(0, data.points) : 0;

  return {
    uid,
    displayName: String(data.displayName ?? 'Neighbour'),
    email: data.email ? String(data.email) : null,
    photoURL: data.photoURL ? String(data.photoURL) : null,
    bio: String(data.bio ?? ''),
    neighborhood: String(data.neighborhood ?? ''),
    city: String(data.city ?? ''),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),

    points,
    level: levelFor(points),
    stats: readStats(data),
    badges: badgesFor(data),
  };
}

/**
 * Called on every sign-in. Firebase Auth owns credentials; this document owns the
 * profile fields Auth has no place for (bio, home neighborhood), and gives events a
 * stable organiser record to point at.
 */
export async function ensureProfile(user: AuthUser): Promise<UserProfile> {
  const ref = getDb().collection(USERS).doc(user.uid);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    const payload = {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
      bio: '',
      neighborhood: '',
      city: '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await ref.set(payload);
    logger.info('User profile created', { uid: user.uid });

    const fresh = await ref.get();
    return toProfile(user.uid, fresh.data() as DocumentData);
  }

  const data = snapshot.data() as DocumentData;

  // Keep the mirror fresh when the provider photo or name changes, but never clobber a
  // display name the user has deliberately edited here.
  const drift: DocumentData = {};
  if (user.email && data.email !== user.email) drift.email = user.email;
  if (user.photoURL && !data.photoURL) drift.photoURL = user.photoURL;
  if (!data.displayName && user.displayName) drift.displayName = user.displayName;

  if (Object.keys(drift).length > 0) {
    drift.updatedAt = FieldValue.serverTimestamp();
    await ref.update(drift);
    return toProfile(user.uid, { ...data, ...drift });
  }

  return toProfile(user.uid, data);
}

export async function getProfile(uid: string): Promise<UserProfile | null> {
  const snapshot = await getDb().collection(USERS).doc(uid).get();
  if (!snapshot.exists) return null;
  return toProfile(uid, snapshot.data() as DocumentData);
}

export async function updateProfile(
  uid: string,
  patch: Partial<Pick<UserProfile, 'displayName' | 'bio' | 'neighborhood' | 'city' | 'photoURL'>>,
): Promise<UserProfile> {
  const ref = getDb().collection(USERS).doc(uid);

  const update: DocumentData = { updatedAt: FieldValue.serverTimestamp() };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) update[key] = value;
  }

  await ref.set(update, { merge: true });
  logger.info('User profile updated', { uid, fields: Object.keys(patch) });

  const fresh = await ref.get();
  return toProfile(uid, fresh.data() as DocumentData);
}

/**
 * The caller as they should appear on anything they create.
 *
 * The ID token carries the name from sign-up, but the profile page is where people change
 * it — so the stored profile wins, and the token is only the fallback for a first visit.
 */
export async function resolveActor(user: AuthUser): Promise<AuthUser> {
  const profile = await ensureProfile(user);

  return {
    ...user,
    displayName: profile.displayName || user.displayName,
    photoURL: profile.photoURL ?? user.photoURL,
  };
}
