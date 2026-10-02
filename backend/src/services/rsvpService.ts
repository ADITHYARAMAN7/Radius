import { FieldValue, getDb, type DocumentData } from '../config/firebase';
import { logger } from '../config/logger';
import { AppError } from '../middleware/error';
import type { AuthUser } from '../middleware/auth';

const EVENTS = 'events';
const RSVPS = 'rsvps';
const ATTENDING = 'attending';

export interface RsvpResult {
  attending: boolean;
  rsvpCount: number;
}

/**
 * Joining an event touches three documents that must agree:
 *   events/{id}.rsvpCount        — the number shown on every card
 *   events/{id}/rsvps/{uid}      — the attendee list
 *   users/{uid}/attending/{id}   — the mirror powering "Events I am attending"
 *
 * A transaction is what keeps them consistent, and using the uid as the RSVP document
 * id makes a duplicate RSVP structurally impossible rather than merely guarded against:
 * a second join writes the same path, and the read inside the transaction sees it.
 */
export async function joinEvent(eventId: string, user: AuthUser): Promise<RsvpResult> {
  const db = getDb();
  const eventRef = db.collection(EVENTS).doc(eventId);
  const rsvpRef = eventRef.collection(RSVPS).doc(user.uid);
  const mirrorRef = db.collection('users').doc(user.uid).collection(ATTENDING).doc(eventId);

  const result = await db.runTransaction(async (tx) => {
    const [eventSnap, rsvpSnap] = await Promise.all([tx.get(eventRef), tx.get(rsvpRef)]);

    if (!eventSnap.exists) throw AppError.notFound('That event does not exist or has been removed.');

    const event = eventSnap.data() as DocumentData;

    if (event.status === 'CANCELLED') {
      throw AppError.conflict('The organiser has cancelled this event.');
    }

    const endsAtMs = event.endsAt?.toDate?.()?.getTime?.() ?? 0;
    if (endsAtMs && endsAtMs < Date.now()) {
      throw AppError.conflict('This event has already finished.');
    }

    const currentCount = typeof event.rsvpCount === 'number' ? event.rsvpCount : 0;

    // Already going — report the current state instead of double counting.
    if (rsvpSnap.exists) {
      return { attending: true, rsvpCount: currentCount };
    }

    tx.set(rsvpRef, {
      uid: user.uid,
      displayName: user.displayName,
      photoURL: user.photoURL,
      createdAt: FieldValue.serverTimestamp(),
    });

    tx.set(mirrorRef, {
      eventId,
      title: event.title ?? '',
      category: event.category ?? 'Other',
      startsAt: event.startsAt ?? null,
      imageUrl: event.imageUrl ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });

    tx.update(eventRef, { rsvpCount: FieldValue.increment(1) });

    return { attending: true, rsvpCount: currentCount + 1 };
  });

  logger.info('RSVP created', { eventId, uid: user.uid, rsvpCount: result.rsvpCount });
  return result;
}

/** Cancelling is symmetric: never let the counter drift below zero. */
export async function leaveEvent(eventId: string, user: AuthUser): Promise<RsvpResult> {
  const db = getDb();
  const eventRef = db.collection(EVENTS).doc(eventId);
  const rsvpRef = eventRef.collection(RSVPS).doc(user.uid);
  const mirrorRef = db.collection('users').doc(user.uid).collection(ATTENDING).doc(eventId);

  const result = await db.runTransaction(async (tx) => {
    const [eventSnap, rsvpSnap] = await Promise.all([tx.get(eventRef), tx.get(rsvpRef)]);

    if (!eventSnap.exists) throw AppError.notFound('That event does not exist or has been removed.');

    const event = eventSnap.data() as DocumentData;
    const currentCount = typeof event.rsvpCount === 'number' ? event.rsvpCount : 0;

    if (!rsvpSnap.exists) {
      return { attending: false, rsvpCount: currentCount };
    }

    tx.delete(rsvpRef);
    tx.delete(mirrorRef);
    tx.update(eventRef, { rsvpCount: FieldValue.increment(currentCount > 0 ? -1 : 0) });

    return { attending: false, rsvpCount: Math.max(0, currentCount - 1) };
  });

  logger.info('RSVP cancelled', { eventId, uid: user.uid, rsvpCount: result.rsvpCount });
  return result;
}
