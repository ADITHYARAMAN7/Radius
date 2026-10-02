import { Router } from 'express';
import { z } from 'zod';
import { capabilities } from '../config/env';
import { currentUser, requireAuth, type AuthedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';
import { aiAssistSchema } from '../middleware/validate';
import { generateEventSuggestion, parseSearchIntent } from '../services/aiService';
import { logger } from '../config/logger';

export const aiRouter = Router();

/**
 * Crude per-user throttle. Gemini calls cost money and a stuck "Improve with AI" button
 * could otherwise fire continuously; an in-memory counter is the right weight for a
 * single-instance deployment. Multi-instance would need a shared store — noted in the
 * roadmap.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;
const hits = new Map<string, { count: number; resetAt: number }>();

function throttle(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (entry.count >= MAX_PER_WINDOW) return false;
  entry.count += 1;
  return true;
}

// Keep the map from growing without bound across a long-lived instance.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits) if (entry.resetAt < now) hits.delete(key);
}, WINDOW_MS).unref();

/**
 * The assistant is always available: Gemini when it is configured, otherwise the built-in
 * rule-based engine. `provider` lets the UI label which one the user is talking to.
 */
aiRouter.get('/status', (_req, res) => {
  res.json({ available: true, provider: capabilities.ai ? 'gemini' : 'local' });
});

/**
 * POST /api/ai/assist — the "Improve with AI" button.
 * Signed in only, because it spends money on behalf of the project.
 */
aiRouter.post(
  '/assist',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = currentUser(req);

    if (!throttle(user.uid)) {
      logger.warn('AI rate limit hit', { uid: user.uid });
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'That is a lot of AI help in one minute. Give it a moment and try again.',
        },
      });
      return;
    }

    const input = aiAssistSchema.parse(req.body);

    if (!input.title && !input.description) {
      res.status(400).json({
        error: {
          code: 'BAD_REQUEST',
          message: 'Write a rough title or a few words of description first, then let AI improve it.',
        },
      });
      return;
    }

    const suggestion = await generateEventSuggestion(input);
    res.json({ suggestion });
  }),
);

/**
 * POST /api/ai/search — natural-language search.
 * Requires authentication: the endpoint proxies every call to Gemini, spending
 * project quota. Anonymous access would let any bot drain that budget with no
 * per-user accountability. The existing per-user throttle still applies on top.
 */
aiRouter.post(
  '/search',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { query } = z.object({ query: z.string().trim().min(3).max(200) }).parse(req.body);
    const key = currentUser(req).uid;

    if (!throttle(key)) {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many searches at once. Try again shortly.' },
      });
      return;
    }

    const intent = await parseSearchIntent(query);
    res.json({ intent });
  }),
);
