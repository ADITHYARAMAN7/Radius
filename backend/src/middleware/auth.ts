import type { NextFunction, Request, Response } from 'express';
import { getAuth } from '../config/firebase';
import { logger } from '../config/logger';
import { AppError } from './error';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string;
  photoURL: string | null;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}

/**
 * Verifies the Firebase ID token and attaches the caller.
 *
 * Identity always comes from the verified token, never from the request body — that
 * is what stops a client claiming someone else's uid to hijack an event or an RSVP.
 */
async function resolveUser(req: Request): Promise<AuthUser | null> {
  const token = extractToken(req);
  if (!token) return null;

  const decoded = await getAuth().verifyIdToken(token);

  return {
    uid: decoded.uid,
    email: decoded.email ?? null,
    displayName: (decoded.name as string | undefined) || decoded.email?.split('@')[0] || 'Neighbour',
    photoURL: (decoded.picture as string | undefined) ?? null,
  };
}

/** Rejects the request unless a valid ID token is present. */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  resolveUser(req)
    .then((user) => {
      if (!user) throw AppError.unauthorized();
      req.user = user;
      next();
    })
    .catch((err: unknown) => {
      if (err instanceof AppError) return next(err);
      const message = (err as { message?: string }).message;
      logger.warn('ID token verification failed', { reason: message });
      next(AppError.unauthorized('Your session has expired. Please sign in again.'));
    });
}

/**
 * Attaches the caller when a token is present but never blocks the request — used by
 * public reads so they can report isAttending / isOwner for a signed-in visitor.
 */
export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  resolveUser(req)
    .then((user) => {
      if (user) req.user = user;
      next();
    })
    .catch(() => {
      // A bad token on a public route is simply treated as anonymous.
      next();
    });
}

export function currentUser(req: AuthedRequest): AuthUser {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}
