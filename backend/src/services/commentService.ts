import { FieldValue, getDb, type DocumentData } from '../config/firebase';
import { logger } from '../config/logger';
import { AppError } from '../middleware/error';
import type { AuthUser } from '../middleware/auth';
import type { EventComment } from '../types';
import { toIso } from '../utils/dates';

const EVENTS = 'events';
const COMMENTS = 'comments';

/** A thread on a neighbourhood event is short; this bounds the read however long it gets. */
const MAX_COMMENTS = 100;

function toComment(id: string, data: DocumentData, viewerUid?: string, eventOwnerId?: string): EventComment {
  const uid = String(data.uid ?? '');

  return {
    id,
    uid,
    displayName: String(data.displayName ?? 'Neighbour'),
    photoURL: data.photoURL ? String(data.photoURL) : null,
    text: String(data.text ?? ''),
    isOrganiser: Boolean(data.isOrganiser),
    createdAt: toIso(data.createdAt),
    // Authors can remove their own; the organiser can moderate their own event's thread.
    canDelete: Boolean(viewerUid && (viewerUid === uid || viewerUid === eventOwnerId)),
  };
}

/**
 * The questions-and-answers thread under an event: "is there parking?", "can I bring my
 * kids?". Oldest first, so it reads as a conversation.
 */
export async function listComments(eventId: string, viewerUid?: string): Promise<EventComment[]> {
  const eventRef = getDb().collection(EVENTS).doc(eventId);

  const [eventSnap, snapshot] = await Promise.all([
    eventRef.get(),
    eventRef.collection(COMMENTS).orderBy('createdAt', 'desc').limit(MAX_COMMENTS).get(),
  ]);

  if (!eventSnap.exists) throw AppError.notFound('That event does not exist or has been removed.');

  const ownerId = String(eventSnap.data()?.creatorId ?? '');

  return snapshot.docs.map((doc) => toComment(doc.id, doc.data(), viewerUid, ownerId)).reverse();
}

export async function addComment(eventId: string, text: string, user: AuthUser): Promise<EventComment> {
  const db = getDb();
  const eventRef = db.collection(EVENTS).doc(eventId);
  const commentRef = eventRef.collection(COMMENTS).doc();

  const ownerId = await db.runTransaction(async (tx) => {
    const eventSnap = await tx.get(eventRef);
    if (!eventSnap.exists) throw AppError.notFound('That event does not exist or has been removed.');

    const creatorId = String(eventSnap.data()?.creatorId ?? '');

    tx.set(commentRef, {
      uid: user.uid,
      displayName: user.displayName,
      photoURL: user.photoURL,
      text,
      isOrganiser: creatorId === user.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(eventRef, { commentCount: FieldValue.increment(1) });

    return creatorId;
  });

  const fresh = await commentRef.get();
  logger.info('Comment added', { eventId, commentId: commentRef.id, uid: user.uid });

  return toComment(commentRef.id, fresh.data() as DocumentData, user.uid, ownerId);
}

export async function deleteComment(eventId: string, commentId: string, user: AuthUser): Promise<void> {
  const db = getDb();
  const eventRef = db.collection(EVENTS).doc(eventId);
  const commentRef = eventRef.collection(COMMENTS).doc(commentId);

  await db.runTransaction(async (tx) => {
    const [eventSnap, commentSnap] = await Promise.all([tx.get(eventRef), tx.get(commentRef)]);

    if (!commentSnap.exists) throw AppError.notFound('That comment has already been removed.');

    const authorId = String(commentSnap.data()?.uid ?? '');
    const ownerId = String(eventSnap.data()?.creatorId ?? '');

    if (user.uid !== authorId && user.uid !== ownerId) {
      throw AppError.forbidden('Only the author or the event organiser can remove a comment.');
    }

    tx.delete(commentRef);
    if (eventSnap.exists) tx.update(eventRef, { commentCount: FieldValue.increment(-1) });
  });

  logger.info('Comment deleted', { eventId, commentId, uid: user.uid });
}
