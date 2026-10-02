import { Router } from 'express';
import { currentUser, requireAuth, type AuthedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';
import { profileUpdateSchema } from '../middleware/validate';
import { listEventsAttending, listEventsByCreator, listSavedEvents } from '../services/eventService';
import { ensureProfile, updateProfile } from '../services/userService';

export const usersRouter = Router();

/**
 * POST /api/me/session — called once after sign-in.
 * Creates the Firestore profile document on first visit and returns it, so the client
 * never has to decide whether a user is new.
 */
usersRouter.post(
  '/session',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const profile = await ensureProfile(currentUser(req));
    res.json({ profile });
  }),
);

usersRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const profile = await ensureProfile(currentUser(req));
    res.json({ profile });
  }),
);

usersRouter.patch(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = currentUser(req);
    const patch = profileUpdateSchema.parse(req.body);

    await ensureProfile(user);
    const profile = await updateProfile(user.uid, patch);
    res.json({ profile });
  }),
);

/** GET /api/me/events — "Events I Created", including past and cancelled ones. */
usersRouter.get(
  '/events',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = currentUser(req);
    const events = await listEventsByCreator(user.uid, user.uid);
    res.json({ events, total: events.length });
  }),
);

/** GET /api/me/rsvps — "Events I'm Attending". */
usersRouter.get(
  '/rsvps',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const events = await listEventsAttending(currentUser(req).uid);
    res.json({ events, total: events.length });
  }),
);

/** GET /api/me/saved — events bookmarked for later. */
usersRouter.get(
  '/saved',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const events = await listSavedEvents(currentUser(req).uid);
    res.json({ events, total: events.length });
  }),
);
