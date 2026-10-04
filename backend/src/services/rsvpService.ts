import { FieldValue, getDb, type DocumentData } from '../config/firebase';
import { logger } from '../config/logger';
import { AppError } from '../middleware/error';
import type { AuthUser } from '../middleware/auth';
import { pointsDelta } from './gamificationService';
import { logRsvpToBigQuery } from './analyticsService';
import { getEventById } from './eventService';
import { scheduleEventReminder } from './tasksService';

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
  const userRef = db.collection('users').doc(user.uid);
  const mirrorRef = userRef.collection(ATTENDING).doc(eventId);

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

    // Organisers do not earn RSVP points on their own events — hosting already pays.
    if (event.creatorId !== user.uid) {
      tx.set(userRef, pointsDelta('rsvp', 1, String(event.category ?? 'Other')), { merge: true });
    }

    return { attending: true, rsvpCount: currentCount + 1 };
  });

  logger.info('RSVP created', { eventId, uid: user.uid, rsvpCount: result.rsvpCount });
  
  // Log to BigQuery for real-time analytics
  void logRsvpToBigQuery(eventId, user.uid);
  
  // Schedule a reminder 15 minutes before the event using Cloud Tasks
  try {
    const event = await getEventById(eventId);
    // Send 15 minutes before the event
    const sendAt = new Date(new Date(event.startsAt).getTime() - 15 * 60 * 1000);
    // If it's already within 15 minutes, send in 1 minute
    const actualSendAt = sendAt.getTime() > Date.now() ? sendAt : new Date(Date.now() + 60 * 1000);
    
    void scheduleEventReminder(eventId, user.uid, actualSendAt);
  } catch (error) {
    logger.error('Failed to schedule reminder on RSVP', { reason: String(error) });
  }

  return result;
}

/** Cancelling is symmetric: never let the counter drift below zero. */
export async function leaveEvent(eventId: string, user: AuthUser): Promise<RsvpResult> {
  const db = getDb();
  const eventRef = db.collection(EVENTS).doc(eventId);
  const rsvpRef = eventRef.collection(RSVPS).doc(user.uid);
  const userRef = db.collection('users').doc(user.uid);
  const mirrorRef = userRef.collection(ATTENDING).doc(eventId);

  const result = await db.runTransaction(async (tx) => {
    const [eventSnap, rsvpSnap] = await Promise.all([tx.get(eventRef), tx.get(rsvpRef)]);

    if (!eventSnap.exists) throw AppError.notFound('That event does not exist or has been removed.');

    const event = eventSnap.data() as DocumentData;
    const currentCount = typeof event.rsvpCount === 'number' ? event.rsvpCount : 0;

    if (!rsvpSnap.exists) {
      return { attending: false, rsvpCount: currentCount };
    }

    const rsvp = rsvpSnap.data() as DocumentData;

    // Someone who has checked in was there; that record should not be erasable afterwards.
    if (rsvp.checkedInAt) {
      throw AppError.conflict('You have already checked in at this event, so your RSVP stays.');
    }

    tx.delete(rsvpRef);
    tx.delete(mirrorRef);
    tx.update(eventRef, { rsvpCount: FieldValue.increment(currentCount > 0 ? -1 : 0) });

    if (event.creatorId !== user.uid) {
      tx.set(userRef, pointsDelta('rsvp', -1, String(event.category ?? 'Other')), { merge: true });
    }

    return { attending: false, rsvpCount: Math.max(0, currentCount - 1) };
  });

  logger.info('RSVP cancelled', { eventId, uid: user.uid, rsvpCount: result.rsvpCount });
  return result;
}
