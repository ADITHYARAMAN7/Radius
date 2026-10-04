import express, { Router } from 'express';
import { optionalAuth, requireAuth, currentUser, type AuthedRequest } from '../middleware/auth';
import { AppError, asyncHandler } from '../middleware/error';
import { calendarQuerySchema, eventInputSchema, eventQuerySchema, eventUpdateSchema } from '../middleware/validate';
import { moderateContent, generateEventImage } from '../services/aiService';
import { getTrendingEvents } from '../services/analyticsService';
import { uploadEventImage } from '../services/storageService';
import { randomUUID } from 'crypto';
import {
  cancelEvent,
  createEvent,
  deleteEvent,
  getEventById,
  listAttendees,
  listEvents,
  listEventsInRange,
  listRelatedEvents,
  reactivateEvent,
  updateEvent,
} from '../services/eventService';
import { resolveActor } from '../services/userService';
import { synthesizeSpeech } from '../services/ttsService';
import type { EventQueryOptions } from '../types';

export const eventsRouter = Router();

/**
 * POST /api/events/webhook/remind
 * Cloud Tasks hits this to trigger the event reminder.
 */
eventsRouter.post('/webhook/remind', express.json(), asyncHandler(async (req, res) => {
  const { eventId, userId } = req.body;
  if (!eventId || !userId) {
    res.status(400).send('Missing eventId or userId');
    return;
  }
  
  // In a real app, this sends an email via SendGrid/Mailgun or Firebase Cloud Messaging.
  // For the hackathon, we simply log the successful delivery to prove the architecture works.
  const { logger } = await import('../config/logger');
  logger.info(`🛎️ AUTOMATED REMINDER SENT to user ${userId} for event ${eventId}`);
  
  // We can also increment a 'remindersSent' counter on the event document for proof.
  const { getDb } = await import('../config/firebase');
  await getDb().collection('events').doc(eventId).set({
    remindersSent: (await import('firebase-admin/firestore')).FieldValue.increment(1)
  }, { merge: true });

  res.status(200).send('Reminder sent');
}));

/** GET /api/events/trending — fetch trending events from BigQuery. */
eventsRouter.get(
  '/trending',
  asyncHandler(async (req, res) => {
    const trending = await getTrendingEvents(48, 5); // last 48 hours, top 5
    
    // Fetch actual event details for those IDs
    const populated = await Promise.all(
      trending.map(async (t) => {
        try {
          const event = await getEventById(t.event_id);
          return { ...event, recentRsvps: t.rsvp_count };
        } catch {
          return null;
        }
      })
    );
    
    res.json({ items: populated.filter(Boolean) });
  }),
);

/**
 * GET /api/events — the Explore feed.
 * Public, but optionalAuth lets the response carry isAttending/isOwner for a signed-in
 * visitor so the cards render in the right state on first paint.
 */
eventsRouter.get(
  '/',
  optionalAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const query = eventQuerySchema.parse(req.query);

    const options: EventQueryOptions = {
      search: query.search,
      category: query.category,
      neighborhood: query.neighborhood,
      city: query.city,
      dateFilter: query.date,
      sort: query.sort,
      page: query.page,
      pageSize: query.pageSize,
      lat: query.lat,
      lng: query.lng,
      radiusKm: query.radiusKm,
    };

    const result = await listEvents(options, req.user?.uid);
    res.json(result);
  }),
);

/**
 * GET /api/events/calendar?from&to — every event in a month grid, unpaginated.
 * Registered before /:id so "calendar" is never read as an event id.
 */
eventsRouter.get(
  '/calendar',
  optionalAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const query = calendarQuerySchema.parse(req.query);

    const result = await listEventsInRange(
      {
        from: new Date(query.from),
        to: new Date(query.to),
        category: query.category,
        neighborhood: query.neighborhood,
        city: query.city,
      },
      req.user?.uid,
    );
    res.json(result);
  }),
);

/** GET /api/events/:id — shareable permalink target. */
eventsRouter.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const event = await getEventById(String(req.params.id), req.user?.uid);
    const [related, attendees] = await Promise.all([
      listRelatedEvents(event, req.user?.uid),
      listAttendees(event.id),
    ]);

    res.json({ event, related, attendees });
  }),
);

/** GET /api/events/:id/translate?target=hi — translate event title and description. */
eventsRouter.get(
  '/:id/translate',
  asyncHandler(async (req, res) => {
    const targetLanguage = String(req.query.target || 'en');
    const event = await getEventById(String(req.params.id));
    
    // Dynamically import translationService here to avoid circular dependencies or cluttering the top
    const { translateText } = await import('../services/translationService');
    
    const [translatedTitle, translatedDescription] = await Promise.all([
      translateText(event.title, targetLanguage),
      translateText(event.description || '', targetLanguage)
    ]);
    
    res.json({ title: translatedTitle, description: translatedDescription });
  }),
);

/** GET /api/events/:id/tts — synthesize event description to speech. */
eventsRouter.get(
  '/:id/tts',
  asyncHandler(async (req, res) => {
    const event = await getEventById(String(req.params.id));
    if (!event) throw new AppError(404, 'NOT_FOUND', 'Event not found');

    const audioContent = await synthesizeSpeech(event.description);
    if (!audioContent) throw new AppError(500, 'INTERNAL_ERROR', 'Failed to synthesize speech');

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioContent.length.toString(),
    });
    res.end(audioContent);
  }),
);

eventsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = currentUser(req);
    const input = eventInputSchema.parse(req.body);

    const isSafe = await moderateContent(input.title, input.description || '');
    if (!isSafe) {
      throw AppError.badRequest('Your content is against the community policy');
    }

    // First event doubles as first write of the profile document.
    const actor = await resolveActor(user);

    if (!input.imageUrl) {
      const generatedBuffer = await generateEventImage(input.title, input.description || '');
      if (generatedBuffer) {
        const uploadResult = await uploadEventImage(
          { buffer: generatedBuffer, mimetype: 'image/jpeg', size: generatedBuffer.length, originalname: 'generated.jpg' },
          user.uid
        );
        input.imageUrl = uploadResult.imageUrl;
        input.imagePath = uploadResult.imagePath;
      }
    }

    const event = await createEvent(input, actor);
    res.status(201).json({ event });
  }),
);

eventsRouter.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = currentUser(req);
    const input = eventUpdateSchema.parse(req.body);

    if (input.title || input.description !== undefined) {
      const eventToUpdate = await getEventById(String(req.params.id), user.uid);
      const titleToCheck = input.title ?? eventToUpdate.title;
      const descToCheck = input.description ?? eventToUpdate.description ?? '';
      
      const isSafe = await moderateContent(titleToCheck, descToCheck);
      if (!isSafe) {
        throw AppError.badRequest('Your content is against the community policy');
      }
    }

    const event = await updateEvent(String(req.params.id), input, user);
    res.json({ event });
  }),
);

/** Soft cancel — keeps the record and its RSVP history, drops it from the board. */
eventsRouter.post(
  '/:id/cancel',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const event = await cancelEvent(String(req.params.id), currentUser(req));
    res.json({ event });
  }),
);

/** Reverses a cancellation, so calling an event off is not a one-way door. */
eventsRouter.post(
  '/:id/reactivate',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const event = await reactivateEvent(String(req.params.id), currentUser(req));
    res.json({ event });
  }),
);

eventsRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    await deleteEvent(String(req.params.id), currentUser(req));
    res.status(204).send();
  }),
);

eventsRouter.get(
  '/:id/attendees',
  asyncHandler(async (req, res) => {
    const attendees = await listAttendees(String(req.params.id));
    res.json({ attendees, total: attendees.length });
  }),
);
