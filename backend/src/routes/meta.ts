import crypto from 'node:crypto';
import { Router } from 'express';
import { capabilities, env } from '../config/env';
import { getDb } from '../config/firebase';
import { localStackHealth } from '../config/localStack';
import { logger } from '../config/logger';
import { requireAuth } from '../middleware/auth';
import { AppError, asyncHandler } from '../middleware/error';
import { geocodeSchema } from '../middleware/validate';
import { geocode } from '../services/geocodeService';
import { expirePastEvents } from '../services/eventService';
import { POINTS, getLeaderboard } from '../services/gamificationService';
import { getCategoryCounts, getInsights, getNeighborhoodOptions } from '../services/statsService';
import { CATEGORIES } from '../types';

export const metaRouter = Router();

/**
 * Cloud Run's health check target. Reports which optional integrations are configured,
 * which turns "the AI button does nothing" into a one-request diagnosis.
 */
metaRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    let firestore = 'unknown';
    const localStack = await localStackHealth();

    if (localStack === 'starting' || localStack === 'down') {
      // Asking Firestore would hang until the emulator answers, so report what is known.
      firestore = localStack === 'starting' ? 'emulator starting' : 'emulator not running';
    } else {
      try {
        await getDb().collection('events').limit(1).get();
        firestore = 'connected';
      } catch (error) {
        firestore = 'unreachable';
        logger.error('Health check could not reach Firestore', {
          reason: (error as { message?: string }).message,
        });
      }
    }

    const healthy = firestore === 'connected';

    // In production, omit internal details that have no monitoring value and
    // would help an attacker enumerate the stack (project ID, AI provider, etc.).
    const integrations = env.isProduction
      ? {
          firestore,
          cloudStorage: capabilities.storage ? 'configured' : 'not configured',
          gemini: capabilities.ai ? 'configured' : 'not configured',
          scheduledExpiry: capabilities.maintenance ? 'configured' : 'not configured',
        }
      : {
          firestore,
          cloudStorage: capabilities.localStorage
            ? 'local disk (development)'
            : capabilities.storage
              ? 'configured'
              : 'not configured',
          gemini: capabilities.ai ? `configured (${env.aiProvider})` : 'built-in assistant (no Gemini key)',
          mode: env.localMode ? 'local emulators' : 'google cloud',
          scheduledExpiry: capabilities.maintenance ? 'configured' : 'not configured',
        };

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      service: 'nearby-objects-api',
      // Environment tag is useful in staging; omit in production to avoid leaking stack info.
      ...(env.isProduction ? {} : { environment: env.nodeEnv }),
      // Never expose the GCP project ID publicly — it can be used to enumerate resources.
      integrations,
      timestamp: new Date().toISOString(),
    });
  }),
);

metaRouter.get('/categories', asyncHandler(async (_req, res) => {
  const counts = await getCategoryCounts();
  res.json({ categories: counts });
}));

/** Suggestions for the neighbourhood filter: places with upcoming events. */
metaRouter.get('/neighborhoods', asyncHandler(async (_req, res) => {
  const neighborhoods = await getNeighborhoodOptions();
  res.json({ neighborhoods });
}));

metaRouter.get('/categories/list', (_req, res) => {
  res.json({ categories: CATEGORIES });
});

metaRouter.get(
  '/insights',
  asyncHandler(async (_req, res) => {
    const insights = await getInsights();
    res.json(insights);
  }),
);

/**
 * POST /api/geocode — "Find from address" on the event form.
 * Signed in only: every call is a request to a third-party service on the project's behalf.
 */
metaRouter.post(
  '/geocode',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = geocodeSchema.parse(req.body);
    const result = await geocode(input);
    res.json({ result });
  }),
);

/** GET /api/community/leaderboard — the most active neighbours, and how points are earned. */
metaRouter.get(
  '/community/leaderboard',
  asyncHandler(async (_req, res) => {
    const leaders = await getLeaderboard(10);
    res.json({ leaders, points: POINTS });
  }),
);

/**
 * POST /api/maintenance/expire — the Cloud Scheduler target.
 *
 * Guarded by a shared secret rather than a user token, because the caller is a machine.
 * Compared in constant time so the endpoint does not leak the token through timing.
 */
metaRouter.post(
  '/maintenance/expire',
  asyncHandler(async (req, res) => {
    if (!capabilities.maintenance) {
      throw AppError.unavailable('MAINTENANCE_TOKEN is not configured on this deployment.');
    }

    const provided = req.header('X-Maintenance-Token') ?? '';
    const expected = env.maintenanceToken;

    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    const matches =
      providedBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(providedBuffer, expectedBuffer);

    if (!matches) {
      logger.warn('Rejected maintenance call with an invalid token');
      throw AppError.forbidden('Invalid maintenance token.');
    }

    const result = await expirePastEvents();
    res.json({ ...result, ranAt: new Date().toISOString() });
  }),
);
