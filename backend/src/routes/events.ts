import { Router } from 'express';
import { optionalAuth, requireAuth, currentUser, type AuthedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';
import { calendarQuerySchema, eventInputSchema, eventQuerySchema, eventUpdateSchema } from '../middleware/validate';
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
import { ensureProfile } from '../services/userService';
import type { EventQueryOptions } from '../types';

export const eventsRouter = Router();

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

eventsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = currentUser(req);
    const input = eventInputSchema.parse(req.body);

    // First event doubles as first write of the profile document.
    await ensureProfile(user);

    const event = await createEvent(input, user);
    res.status(201).json({ event });
  }),
);

eventsRouter.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = currentUser(req);
    const input = eventUpdateSchema.parse(req.body);
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
