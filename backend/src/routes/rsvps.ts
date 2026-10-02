import { Router } from 'express';
import { currentUser, requireAuth, type AuthedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';
import { joinEvent, leaveEvent } from '../services/rsvpService';
import { ensureProfile } from '../services/userService';

export const rsvpsRouter = Router();

/**
 * POST /api/events/:id/rsvp — "I'm Going".
 * Idempotent: pressing it twice reports the same state rather than double counting.
 */
rsvpsRouter.post(
  '/:id/rsvp',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = currentUser(req);
    await ensureProfile(user);

    const result = await joinEvent(String(req.params.id), user);
    res.json(result);
  }),
);

/** DELETE /api/events/:id/rsvp — "Cancel RSVP", equally idempotent. */
rsvpsRouter.delete(
  '/:id/rsvp',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const result = await leaveEvent(String(req.params.id), currentUser(req));
    res.json(result);
  }),
);
