import type { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger';
import type { AuthedRequest } from './auth';

/**
 * Fixed-window rate limiter, in memory.
 *
 * Scope and honesty about it: this is per-instance. With more than one Cloud Run instance
 * the effective limit multiplies by the instance count, so this is a guard against a stuck
 * client or a casual script, not a defence against a distributed attacker. Doing it
 * properly needs a shared store (Firestore counters or Redis) — that is a roadmap item
 * rather than something half-built here.
 *
 * It is still worth having: an accidental render loop firing writes is a far more likely
 * failure for this app than a coordinated flood, and this stops that cheaply.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Shown to the user when they are turned away. */
  message: string;
  /** Skip counting for requests that should never be limited, e.g. health checks. */
  skip?: (req: Request) => boolean;
}

export function rateLimit({ windowMs, max, message, skip }: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  // Without this sweep the map grows for every unique caller for the life of the process.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt < now) buckets.delete(key);
    }
  }, windowMs);
  sweep.unref();

  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (skip?.(req)) {
      next();
      return;
    }

    /*
     * Prefer the authenticated uid: it survives a changing IP, and it means one user on a
     * shared or carrier-grade-NAT address cannot exhaust the limit for everyone behind it.
     * `trust proxy` is set, so req.ip is the client address Cloud Run forwarded.
     */
    const key = req.user?.uid ?? req.ip ?? 'unknown';
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

      // Log once per window rather than on every blocked request, so a hot loop does not
      // also flood Cloud Logging.
      if (bucket.count === max + 1) {
        logger.warn('Rate limit exceeded', {
          key: req.user?.uid ? `uid:${req.user.uid}` : `ip:${req.ip}`,
          path: req.path,
          method: req.method,
          limit: max,
        });
      }

      res.status(429).json({
        error: { code: 'RATE_LIMITED', message, retryAfterSeconds },
      });
      return;
    }

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    next();
  };
}

/** Generous: normal browsing fires several reads per page and must never be throttled. */
export const readLimiter = rateLimit({
  windowMs: 60_000,
  max: 240,
  message: 'You are making requests very quickly. Give it a moment and try again.',
  // Health checks come from Cloud Run itself on a fixed schedule.
  skip: (req) => req.path === '/health',
});

/** Tighter: creating, editing and RSVPing are deliberate human actions. */
export const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 40,
  message: 'That is a lot of changes in one minute. Give it a moment and try again.',
});
