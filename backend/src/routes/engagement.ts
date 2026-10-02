import { Router } from 'express';
import { currentUser, optionalAuth, requireAuth, type AuthedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';
import { checkInSchema, commentSchema } from '../middleware/validate';
import { checkIn } from '../services/checkinService';
import { addComment, deleteComment, listComments } from '../services/commentService';
import { getEventById, saveEvent, unsaveEvent } from '../services/eventService';
import { ensureProfile, resolveActor } from '../services/userService';
import { getEventWeather } from '../services/weatherService';

/**
 * Everything people do around an event beyond the RSVP itself: ask a question, bookmark
 * it for later, check in at the door, and see what the weather will be doing.
 * Mounted under /api/events alongside the events and RSVP routers.
 */
export const engagementRouter = Router();

/* --------------------------------------------------------------- comments */

/** GET /api/events/:id/comments — public, like the event itself. */
engagementRouter.get(
  '/:id/comments',
  optionalAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const comments = await listComments(String(req.params.id), req.user?.uid);
    res.json({ comments, total: comments.length });
  }),
);

engagementRouter.post(
  '/:id/comments',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = currentUser(req);
    const { text } = commentSchema.parse(req.body);

    const actor = await resolveActor(user);
    const comment = await addComment(String(req.params.id), text, actor);
    res.status(201).json({ comment });
  }),
);

engagementRouter.delete(
  '/:id/comments/:commentId',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    await deleteComment(String(req.params.id), String(req.params.commentId), currentUser(req));
    res.status(204).send();
  }),
);

/* ------------------------------------------------------------------ saved */

/** POST /api/events/:id/save — bookmark for later. Idempotent. */
engagementRouter.post(
  '/:id/save',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = currentUser(req);
    await ensureProfile(user);
    res.json(await saveEvent(String(req.params.id), user.uid));
  }),
);

engagementRouter.delete(
  '/:id/save',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json(await unsaveEvent(String(req.params.id), currentUser(req).uid));
  }),
);

/* --------------------------------------------------------------- check-in */

/** POST /api/events/:id/checkin — "I am actually here", proven with the organiser's code. */
engagementRouter.post(
  '/:id/checkin',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = currentUser(req);
    const { code } = checkInSchema.parse(req.body);

    const actor = await resolveActor(user);
    res.json(await checkIn(String(req.params.id), code, actor));
  }),
);

/* ---------------------------------------------------------------- weather */

/** GET /api/events/:id/weather — forecast for the hour the event starts. */
engagementRouter.get(
  '/:id/weather',
  asyncHandler(async (req, res) => {
    const event = await getEventById(String(req.params.id));
    const weather = await getEventWeather(event);

    // The upstream forecast only moves hourly, so let the browser hold on to it briefly.
    res.setHeader('Cache-Control', 'public, max-age=900');
    res.json({ weather });
  }),
);
