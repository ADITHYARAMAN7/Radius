import {
  FieldValue,
  Timestamp,
  getDb,
  type DocumentData,
  type FirestoreQuery,
  type QueryDocumentSnapshot,
} from '../config/firebase';
import { logger } from '../config/logger';
import { AppError } from '../middleware/error';
import type { EventInput, EventUpdateInput } from '../middleware/validate';
import type { AuthUser } from '../middleware/auth';
import type { Category, EventQueryOptions, EventRecord, Paginated } from '../types';
import { combineDateTime, distanceKm, resolveDateWindow, toIso } from '../utils/dates';
import { buildKeywords, normalise, placeKey, relevanceScore } from '../utils/search';
import { deleteImage, isOwnedImagePath } from './storageService';

const EVENTS = 'events';
const RSVPS = 'rsvps';
const ATTENDING = 'attending';

/**
 * Upper bound on documents pulled into memory for one Explore request.
 *
 * Firestore cannot combine free-text search, several equality filters and a sort in a
 * single query, so the pipeline is: narrow as far as Firestore allows (status + date
 * range + the most selective equality filter), then score, filter and page in memory.
 * The cap keeps that honest — it bounds reads per request however large the collection
 * grows. Past this size the text search belongs in a dedicated search index; the
 * migration path is written up in docs/architecture.md.
 */
const FETCH_CAP = 400;
const DEFAULT_PAGE_SIZE = 12;

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function toEventRecord(doc: QueryDocumentSnapshot | DocumentData, id?: string): EventRecord {
  const hasDataFn = typeof (doc as QueryDocumentSnapshot).data === 'function';
  const data = (hasDataFn ? (doc as QueryDocumentSnapshot).data() : doc) as DocumentData;
  const docId = id ?? (doc as QueryDocumentSnapshot).id;

  return {
    id: docId,
    title: String(data.title ?? ''),
    description: String(data.description ?? ''),
    summary: String(data.summary ?? ''),
    category: (data.category ?? 'Other') as Category,
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],

    date: String(data.date ?? ''),
    startTime: String(data.startTime ?? ''),
    endTime: String(data.endTime ?? ''),
    startsAt: toIso(data.startsAt) ?? new Date(0).toISOString(),
    endsAt: toIso(data.endsAt) ?? new Date(0).toISOString(),

    location: String(data.location ?? ''),
    address: String(data.address ?? ''),
    latitude: asNumber(data.latitude),
    longitude: asNumber(data.longitude),
    neighborhood: String(data.neighborhood ?? ''),
    city: String(data.city ?? ''),

    imageUrl: data.imageUrl ? String(data.imageUrl) : null,
    imagePath: data.imagePath ? String(data.imagePath) : null,

    creatorId: String(data.creatorId ?? ''),
    creatorName: String(data.creatorName ?? 'Neighbour'),
    creatorPhotoURL: data.creatorPhotoURL ? String(data.creatorPhotoURL) : null,

    rsvpCount: typeof data.rsvpCount === 'number' ? data.rsvpCount : 0,
    status: (data.status ?? 'ACTIVE') as EventRecord['status'],

    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

interface SearchableFields {
  title: string;
  description: string;
  summary: string;
  category: string;
  tags: string[];
  location: string;
  address: string;
  neighborhood: string;
  city: string;
}

/** Matching-key mirrors (see placeKey) so Firestore equality filters ignore case, dots and spaces. */
function buildSearchFields(input: SearchableFields) {
  return {
    neighborhoodLower: placeKey(input.neighborhood),
    cityLower: placeKey(input.city),
    searchKeywords: buildKeywords([
      input.title,
      input.summary,
      input.category,
      input.location,
      input.neighborhood,
      input.city,
      input.tags.join(' '),
      input.description.slice(0, 600),
    ]),
  };
}

/**
 * The client echoes `imagePath` back from the upload response, and that value is later
 * handed to `deleteImage`. Accepting it unchecked let a user name someone else's object
 * and have it deleted when they removed their own event — so a path that is not under the
 * caller's own prefix is discarded rather than stored.
 */
function safeImagePath(imagePath: string | null | undefined, uid: string): string | null {
  if (!imagePath) return null;

  if (!isOwnedImagePath(imagePath, uid)) {
    logger.warn('Rejected an image path the caller does not own', { uid, imagePath });
    return null;
  }

  return imagePath;
}

function assertNotInPast(startsAt: Date): void {
  // A short grace window lets someone post an event that is about to begin.
  const graceMs = 5 * 60 * 1000;
  if (startsAt.getTime() < Date.now() - graceMs) {
    throw AppError.badRequest('That start time is already in the past. Pick an upcoming date and time.', {
      fields: { date: 'Choose a date and time in the future.' },
    });
  }
}

export async function createEvent(input: EventInput, user: AuthUser): Promise<EventRecord> {
  const startsAt = combineDateTime(input.date, input.startTime, input.tzOffsetMinutes);
  const endsAt = combineDateTime(input.date, input.endTime, input.tzOffsetMinutes);

  assertNotInPast(startsAt);

  const tags = (input.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 10);
  const summary = input.summary?.trim() || input.description.slice(0, 160).trim();

  const searchable: SearchableFields = {
    title: input.title,
    description: input.description,
    summary,
    category: input.category,
    tags,
    location: input.location,
    address: input.address,
    neighborhood: input.neighborhood,
    city: input.city,
  };

  const payload = {
    ...searchable,

    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    startsAt: Timestamp.fromDate(startsAt),
    endsAt: Timestamp.fromDate(endsAt),

    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,

    imageUrl: input.imageUrl ?? null,
    imagePath: safeImagePath(input.imagePath, user.uid),

    creatorId: user.uid,
    creatorName: user.displayName,
    creatorPhotoURL: user.photoURL,

    rsvpCount: 0,
    status: 'ACTIVE' as const,

    ...buildSearchFields(searchable),

    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const ref = await getDb().collection(EVENTS).add(payload);
  const snapshot = await ref.get();

  logger.info('Event created', { eventId: ref.id, creatorId: user.uid, category: input.category });
  return { ...toEventRecord(snapshot), isOwner: true, isAttending: false };
}

export async function isAttending(eventId: string, uid: string): Promise<boolean> {
  const doc = await getDb().collection(EVENTS).doc(eventId).collection(RSVPS).doc(uid).get();
  return doc.exists;
}

export async function getEventById(id: string, viewerUid?: string): Promise<EventRecord> {
  const snapshot = await getDb().collection(EVENTS).doc(id).get();
  if (!snapshot.exists) throw AppError.notFound('That event does not exist or has been removed.');

  const record = toEventRecord(snapshot);
  record.isOwner = Boolean(viewerUid && viewerUid === record.creatorId);
  record.isAttending = viewerUid ? await isAttending(id, viewerUid) : false;
  return record;
}

async function loadOwnedEvent(id: string, user: AuthUser) {
  const ref = getDb().collection(EVENTS).doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw AppError.notFound('That event does not exist or has been removed.');

  const data = snapshot.data() as DocumentData;

  // Ownership is checked against the verified token rather than anything the client
  // sent, so a crafted request cannot reach an event it does not own.
  if (data.creatorId !== user.uid) {
    throw AppError.forbidden('Only the organiser of this event can change it.');
  }

  return { ref, data };
}

export async function updateEvent(
  id: string,
  input: EventUpdateInput,
  user: AuthUser,
): Promise<EventRecord> {
  const { ref, data } = await loadOwnedEvent(id, user);

  const merged: SearchableFields & { date: string; startTime: string; endTime: string } = {
    title: input.title ?? String(data.title ?? ''),
    description: input.description ?? String(data.description ?? ''),
    summary: input.summary ?? String(data.summary ?? ''),
    category: (input.category ?? data.category ?? 'Other') as Category,
    tags: input.tags ?? (Array.isArray(data.tags) ? (data.tags as string[]) : []),
    location: input.location ?? String(data.location ?? ''),
    address: input.address ?? String(data.address ?? ''),
    neighborhood: input.neighborhood ?? String(data.neighborhood ?? ''),
    city: input.city ?? String(data.city ?? ''),
    date: input.date ?? String(data.date ?? ''),
    startTime: input.startTime ?? String(data.startTime ?? ''),
    endTime: input.endTime ?? String(data.endTime ?? ''),
  };

  if (merged.endTime <= merged.startTime) {
    throw AppError.badRequest('End time must be after the start time.', {
      fields: { endTime: 'End time must be after the start time.' },
    });
  }

  const startsAt = combineDateTime(merged.date, merged.startTime, input.tzOffsetMinutes);
  const endsAt = combineDateTime(merged.date, merged.endTime, input.tzOffsetMinutes);

  const update: DocumentData = {
    ...merged,
    startsAt: Timestamp.fromDate(startsAt),
    endsAt: Timestamp.fromDate(endsAt),
    ...buildSearchFields(merged),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (input.latitude !== undefined) update.latitude = input.latitude;
  if (input.longitude !== undefined) update.longitude = input.longitude;

  if (input.imageUrl !== undefined) {
    const nextPath = safeImagePath(input.imagePath, user.uid);

    update.imageUrl = input.imageUrl;
    update.imagePath = nextPath;

    // Without this the replaced object would sit in the bucket forever. The previous path
    // is re-checked too: an event created before this guard existed could still be holding
    // a path that is not the owner's.
    const previousPath = data.imagePath ? String(data.imagePath) : null;
    if (previousPath && previousPath !== nextPath && isOwnedImagePath(previousPath, user.uid)) {
      void deleteImage(previousPath);
    }
  }

  // An edit that moves a finished event into the future brings it back to the board.
  if (data.status !== 'CANCELLED') {
    update.status = endsAt.getTime() >= Date.now() ? 'ACTIVE' : 'EXPIRED';
  }

  await ref.update(update);
  const fresh = await ref.get();

  logger.info('Event updated', { eventId: id, creatorId: user.uid });
  return { ...toEventRecord(fresh), isOwner: true, isAttending: await isAttending(id, user.uid) };
}

export async function cancelEvent(id: string, user: AuthUser): Promise<EventRecord> {
  const { ref } = await loadOwnedEvent(id, user);
  await ref.update({ status: 'CANCELLED', updatedAt: FieldValue.serverTimestamp() });

  logger.info('Event cancelled', { eventId: id, creatorId: user.uid });
  const fresh = await ref.get();
  return { ...toEventRecord(fresh), isOwner: true };
}

/**
 * Puts a cancelled event back on the board.
 *
 * Cancelling is a soft delete, so it has to be reversible — organisers call events off and
 * back on, and without this the only route back is deleting and recreating, which would
 * throw away the RSVP list and break every shared link.
 *
 * The restored status is derived from the end time rather than assumed: reinstating an
 * event that has already passed makes it EXPIRED, not ACTIVE.
 */
export async function reactivateEvent(id: string, user: AuthUser): Promise<EventRecord> {
  const { ref, data } = await loadOwnedEvent(id, user);

  if (data.status !== 'CANCELLED') {
    throw AppError.conflict('That event is not cancelled, so there is nothing to restore.');
  }

  const endsAtMs = data.endsAt?.toDate?.()?.getTime?.() ?? 0;
  const status = endsAtMs && endsAtMs < Date.now() ? 'EXPIRED' : 'ACTIVE';

  await ref.update({ status, updatedAt: FieldValue.serverTimestamp() });

  logger.info('Event reactivated', { eventId: id, creatorId: user.uid, status });
  const fresh = await ref.get();
  return { ...toEventRecord(fresh), isOwner: true, isAttending: await isAttending(id, user.uid) };
}

/**
 * Removes the event, its RSVP subcollection and the mirrored entry on every attendee,
 * so nobody is left with a dangling row under "Events I am attending".
 */
export async function deleteEvent(id: string, user: AuthUser): Promise<void> {
  const { ref, data } = await loadOwnedEvent(id, user);
  const db = getDb();

  const rsvps = await ref.collection(RSVPS).get();

  const targets = [
    ...rsvps.docs.map((doc) => doc.ref),
    ...rsvps.docs.map((doc) => db.collection('users').doc(doc.id).collection(ATTENDING).doc(id)),
  ];

  // Firestore batches cap at 500 writes, so chunk — a popular event has many RSVPs.
  for (let i = 0; i < targets.length; i += 400) {
    const batch = db.batch();
    for (const target of targets.slice(i, i + 400)) batch.delete(target);
    await batch.commit();
  }

  await ref.delete();

  // Only ever delete an object the owner actually owns — a stored path from before the
  // ownership guard could still point somewhere else.
  const imagePath = data.imagePath ? String(data.imagePath) : null;
  if (imagePath && isOwnedImagePath(imagePath, user.uid)) void deleteImage(imagePath);

  logger.info('Event deleted', { eventId: id, creatorId: user.uid, rsvpsRemoved: rsvps.size });
}

/** Adds isOwner / isAttending to a page of events without one read per event. */
async function decorateForViewer(events: EventRecord[], viewerUid?: string): Promise<void> {
  if (!viewerUid || events.length === 0) {
    for (const event of events) {
      event.isOwner = false;
      event.isAttending = false;
    }
    return;
  }

  const db = getDb();
  const refs = events.map((event) =>
    db.collection('users').doc(viewerUid).collection(ATTENDING).doc(event.id),
  );
  const snapshots = await db.getAll(...refs);
  const attending = new Set(snapshots.filter((s) => s.exists).map((s) => s.id));

  for (const event of events) {
    event.isOwner = event.creatorId === viewerUid;
    event.isAttending = attending.has(event.id);
  }
}

/**
 * Explore query. Firestore narrows the candidate set; memory finishes the job.
 *
 * Only one equality filter beyond `status` is pushed down (the most selective one
 * available) which keeps the composite index set small — the remaining filters are
 * cheap to apply across the capped result set.
 */
export async function listEvents(
  options: EventQueryOptions,
  viewerUid?: string,
): Promise<Paginated<EventRecord>> {
  const db = getDb();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(60, Math.max(1, options.pageSize ?? DEFAULT_PAGE_SIZE));
  const window = resolveDateWindow(options.dateFilter, new Date());
  const isPast = options.dateFilter === 'past';
  const isAll = options.dateFilter === 'all';

  let query: FirestoreQuery = db.collection(EVENTS);

  if (isPast) {
    query = query.where('status', '==', 'EXPIRED');
  } else if (!isAll) {
    query = query.where('status', '==', 'ACTIVE');
  }

  if (options.category) {
    query = query.where('category', '==', options.category);
  } else if (options.neighborhood) {
    query = query.where('neighborhoodLower', '==', placeKey(options.neighborhood));
  } else if (options.city) {
    query = query.where('cityLower', '==', placeKey(options.city));
  }

  if (!isPast && !isAll) {
    query = query.where('startsAt', '>=', Timestamp.fromDate(window.from));
    if (window.to) query = query.where('startsAt', '<', Timestamp.fromDate(window.to));
  }

  const snapshot = await query.orderBy('startsAt', 'asc').limit(FETCH_CAP).get();

  const now = Date.now();
  let records = snapshot.docs.map((doc) => toEventRecord(doc));

  if (isPast) {
    // Show events that have ended or are marked EXPIRED, newest past events first
    records = records.filter(
      (event) => event.status === 'EXPIRED' || new Date(event.endsAt).getTime() < now,
    );
    records.sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
  } else if (!isAll) {
    // A finished event never appears on the active board, even before the scheduled
    // sweep has flipped its status.
    records = records.filter((event) => new Date(event.endsAt).getTime() >= now && event.status === 'ACTIVE');
  }

  // Equality filters that were not pushed down to Firestore.
  if (options.category && options.neighborhood) {
    const target = placeKey(options.neighborhood);
    records = records.filter((e) => placeKey(e.neighborhood) === target);
  }
  if ((options.category || options.neighborhood) && options.city) {
    const target = placeKey(options.city);
    records = records.filter((e) => placeKey(e.city) === target);
  }

  if (options.lat !== undefined && options.lng !== undefined && options.radiusKm) {
    const { lat, lng, radiusKm } = options;
    records = records.filter((e) =>
      e.latitude !== null && e.longitude !== null
        ? distanceKm(lat, lng, e.latitude, e.longitude) <= radiusKm
        : false,
    );
  }

  const search = options.search?.trim();
  if (search) {
    records = records
      .map((event) => ({ event, score: relevanceScore(event, search) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((row) => row.event);
  }

  // A text query is already ordered by relevance; an explicit sort overrides that.
  if (!search || options.sort) {
    switch (options.sort) {
      case 'popular':
        records.sort(
          (a, b) => b.rsvpCount - a.rsvpCount || +new Date(a.startsAt) - +new Date(b.startsAt),
        );
        break;
      case 'recent':
        records.sort((a, b) => +new Date(b.createdAt ?? 0) - +new Date(a.createdAt ?? 0));
        break;
      case 'soonest':
      default:
        records.sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
        break;
    }
  }

  const total = records.length;
  const start = (page - 1) * pageSize;
  const items = records.slice(start, start + pageSize);

  await decorateForViewer(items, viewerUid);

  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    hasMore: start + pageSize < total,
  };
}

/** Safety cap for one calendar grid; far above what a 6-week window holds today. */
const CALENDAR_CAP = 300;

export interface CalendarRangeOptions {
  from: Date;
  to: Date;
  category?: Category;
  neighborhood?: string;
  city?: string;
}

/**
 * Every active, not-yet-finished event starting in [from, to) — the month view needs the
 * whole range, not one page. The browser sends the range already aligned to its own
 * midnight, so day boundaries follow the user's timezone rather than the server's.
 *
 * Uses the existing status + startsAt index; the place and category filters are applied
 * in memory with placeKey, exactly like the list endpoint's fallback filters.
 */
export async function listEventsInRange(
  options: CalendarRangeOptions,
  viewerUid?: string,
): Promise<{ items: EventRecord[]; truncated: boolean }> {
  const snapshot = await getDb()
    .collection(EVENTS)
    .where('status', '==', 'ACTIVE')
    .where('startsAt', '>=', Timestamp.fromDate(options.from))
    .where('startsAt', '<', Timestamp.fromDate(options.to))
    .orderBy('startsAt', 'asc')
    .limit(CALENDAR_CAP + 1)
    .get();

  const truncated = snapshot.size > CALENDAR_CAP;
  const now = Date.now();

  // Same expiry rule as the board: a finished event is never shown, even before the
  // scheduled sweep flips its status — so past days stay empty and today shows only
  // what has not ended yet.
  let items = snapshot.docs
    .slice(0, CALENDAR_CAP)
    .map((doc) => toEventRecord(doc))
    .filter((event) => new Date(event.endsAt).getTime() >= now);

  if (options.category) items = items.filter((event) => event.category === options.category);
  if (options.neighborhood) {
    const target = placeKey(options.neighborhood);
    items = items.filter((event) => placeKey(event.neighborhood) === target);
  }
  if (options.city) {
    const target = placeKey(options.city);
    items = items.filter((event) => placeKey(event.city) === target);
  }

  await decorateForViewer(items, viewerUid);
  return { items, truncated };
}

export async function listEventsByCreator(uid: string, viewerUid?: string): Promise<EventRecord[]> {
  const snapshot = await getDb()
    .collection(EVENTS)
    .where('creatorId', '==', uid)
    .orderBy('startsAt', 'desc')
    .limit(200)
    .get();

  const records = snapshot.docs.map((doc) => toEventRecord(doc));
  await decorateForViewer(records, viewerUid);
  return records;
}

/**
 * Reads the mirror under users/{uid}/attending, which makes "Events I am attending" a
 * single ordered query instead of a collection-group scan across every RSVP.
 */
export async function listEventsAttending(uid: string): Promise<EventRecord[]> {
  const db = getDb();
  const mirror = await db
    .collection('users')
    .doc(uid)
    .collection(ATTENDING)
    .orderBy('startsAt', 'desc')
    .limit(200)
    .get();

  if (mirror.empty) return [];

  const ids = mirror.docs.map((doc) => doc.id);
  const records: EventRecord[] = [];

  // getAll takes a bounded argument list, so read in chunks.
  for (let i = 0; i < ids.length; i += 100) {
    const refs = ids.slice(i, i + 100).map((id) => db.collection(EVENTS).doc(id));
    const snapshots = await db.getAll(...refs);
    for (const snapshot of snapshots) {
      if (snapshot.exists) records.push({ ...toEventRecord(snapshot), isAttending: true });
    }
  }

  for (const record of records) record.isOwner = record.creatorId === uid;
  records.sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  return records;
}

export async function listRelatedEvents(
  event: EventRecord,
  viewerUid?: string,
): Promise<EventRecord[]> {
  const snapshot = await getDb()
    .collection(EVENTS)
    .where('status', '==', 'ACTIVE')
    .where('category', '==', event.category)
    .where('startsAt', '>=', Timestamp.fromDate(new Date()))
    .orderBy('startsAt', 'asc')
    .limit(7)
    .get();

  const records = snapshot.docs
    .map((doc) => toEventRecord(doc))
    .filter((candidate) => candidate.id !== event.id)
    .slice(0, 3);

  await decorateForViewer(records, viewerUid);
  return records;
}

export async function listAttendees(eventId: string, limit = 24) {
  const snapshot = await getDb()
    .collection(EVENTS)
    .doc(eventId)
    .collection(RSVPS)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      uid: doc.id,
      displayName: String(data.displayName ?? 'Neighbour'),
      photoURL: data.photoURL ? String(data.photoURL) : null,
      createdAt: toIso(data.createdAt),
    };
  });
}

/**
 * Flips finished events to EXPIRED. Driven by Cloud Scheduler in production. The board
 * is already correct without it, because every active query bounds on endsAt — so a
 * missed run costs bookkeeping accuracy, not correctness of what users see.
 */
export async function expirePastEvents(): Promise<{ expired: number }> {
  const db = getDb();
  const snapshot = await db
    .collection(EVENTS)
    .where('status', '==', 'ACTIVE')
    .where('endsAt', '<', Timestamp.fromDate(new Date()))
    .limit(450)
    .get();

  if (snapshot.empty) return { expired: 0 };

  const batch = db.batch();
  for (const doc of snapshot.docs) {
    batch.update(doc.ref, { status: 'EXPIRED', updatedAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();

  logger.info('Expiration sweep complete', { expired: snapshot.size });
  return { expired: snapshot.size };
}
