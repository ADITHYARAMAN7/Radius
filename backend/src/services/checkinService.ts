import crypto from 'node:crypto';
import { FieldValue, getDb, type DocumentData } from '../config/firebase';
import { logger } from '../config/logger';
import { AppError } from '../middleware/error';
import type { AuthUser } from '../middleware/auth';
import { POINTS, pointsDelta } from './gamificationService';

const EVENTS = 'events';
const RSVPS = 'rsvps';
const ATTENDING = 'attending';

/** No 0/O, 1/I/L — the code is read off a phone or a printed flyer and typed by hand. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/** Doors open an hour early, and latecomers can still check in for a while after the end. */
const OPENS_BEFORE_START_MS = 60 * 60 * 1000;
const CLOSES_AFTER_END_MS = 3 * 60 * 60 * 1000;

export function generateCheckInCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function normaliseCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function codesMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(normaliseCode(provided));
  const b = Buffer.from(normaliseCode(expected));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

export interface CheckInResult {
  checkedIn: true;
  /** True when this call changed nothing because the user had already checked in. */
  alreadyCheckedIn: boolean;
  checkedInCount: number;
  rsvpCount: number;
  pointsEarned: number;
}

/**
 * Confirms that someone actually turned up.
 *
 * The organiser shows a code (or a QR that carries it) at the venue; presenting it during
 * the event window marks the RSVP as attended. That turns "36 people said they would come"
 * into "28 people came" — the number an organiser plans the next event around.
 *
 * Checking in without having RSVP'd first is allowed and simply creates the RSVP too:
 * walk-ins are real attendees, and sending them away to press a different button first
 * would only lose the data.
 */
export async function checkIn(eventId: string, code: string, user: AuthUser): Promise<CheckInResult> {
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

    if (event.creatorId === user.uid) {
      throw AppError.conflict('You are hosting this event — check-in is for your guests.');
    }

    const startsAtMs = event.startsAt?.toDate?.()?.getTime?.() ?? 0;
    const endsAtMs = event.endsAt?.toDate?.()?.getTime?.() ?? 0;
    const now = Date.now();

    if (startsAtMs && now < startsAtMs - OPENS_BEFORE_START_MS) {
      throw AppError.conflict('Check-in opens one hour before the event starts.');
    }
    if (endsAtMs && now > endsAtMs + CLOSES_AFTER_END_MS) {
      throw AppError.conflict('Check-in for this event has closed.');
    }

    if (!event.checkInCode || !codesMatch(code, String(event.checkInCode))) {
      throw AppError.badRequest('That check-in code is not right. Ask the organiser for the code.', {
        fields: { code: 'That code does not match this event.' },
      });
    }

    const rsvpCount = typeof event.rsvpCount === 'number' ? event.rsvpCount : 0;
    const checkedInCount = typeof event.checkedInCount === 'number' ? event.checkedInCount : 0;

    if (rsvpSnap.exists && rsvpSnap.data()?.checkedInAt) {
      return { alreadyCheckedIn: true, checkedInCount, rsvpCount, pointsEarned: 0 };
    }

    const category = String(event.category ?? 'Other');
    let pointsEarned = POINTS.checkIn;
    let nextRsvpCount = rsvpCount;

    if (rsvpSnap.exists) {
      tx.update(rsvpRef, { checkedInAt: FieldValue.serverTimestamp() });
    } else {
      // A walk-in: record the RSVP and the attendance together.
      tx.set(rsvpRef, {
        uid: user.uid,
        displayName: user.displayName,
        photoURL: user.photoURL,
        createdAt: FieldValue.serverTimestamp(),
        checkedInAt: FieldValue.serverTimestamp(),
      });

      tx.set(mirrorRef, {
        eventId,
        title: event.title ?? '',
        category,
        startsAt: event.startsAt ?? null,
        imageUrl: event.imageUrl ?? null,
        createdAt: FieldValue.serverTimestamp(),
      });

      tx.set(userRef, pointsDelta('rsvp', 1, category), { merge: true });
      pointsEarned += POINTS.rsvp;
      nextRsvpCount += 1;
    }

    tx.update(eventRef, {
      checkedInCount: FieldValue.increment(1),
      ...(rsvpSnap.exists ? {} : { rsvpCount: FieldValue.increment(1) }),
    });
    tx.set(userRef, pointsDelta('checkIn', 1), { merge: true });

    return {
      alreadyCheckedIn: false,
      checkedInCount: checkedInCount + 1,
      rsvpCount: nextRsvpCount,
      pointsEarned,
    };
  });

  logger.info('Check-in recorded', {
    eventId,
    uid: user.uid,
    alreadyCheckedIn: result.alreadyCheckedIn,
    checkedInCount: result.checkedInCount,
  });

  return { checkedIn: true, ...result };
}
