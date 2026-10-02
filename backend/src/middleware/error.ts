import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger';
import { env } from '../config/env';

/**
 * The only error type route handlers should throw. `message` is written for the
 * end user, which is what lets the handler below return it verbatim while keeping
 * stack traces and Firestore internals out of the response.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Please sign in to continue.') {
    return new AppError(401, 'UNAUTHENTICATED', message);
  }
  static forbidden(message = 'You do not have permission to do that.') {
    return new AppError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'We could not find what you were looking for.') {
    return new AppError(404, 'NOT_FOUND', message);
  }
  static conflict(message: string) {
    return new AppError(409, 'CONFLICT', message);
  }
  static unavailable(message: string) {
    return new AppError(503, 'SERVICE_UNAVAILABLE', message);
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    // originalUrl, not path — inside a mounted router `path` has the mount point stripped.
    error: { code: 'NOT_FOUND', message: 'No API route matches ' + req.method + ' ' + req.originalUrl },
  });
}

function fieldErrorsFrom(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Please check the highlighted fields and try again.',
        fields: fieldErrorsFrom(err),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    // 4xx is an expected outcome of a request, not an incident worth ERROR level.
    const log = err.status >= 500 ? logger.error : logger.warn;
    log(err.message, { code: err.code, status: err.status, path: req.path, method: req.method });

    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }

  const error = err as { message?: string; stack?: string; code?: string | number };

  logger.error('Unhandled error while serving request', {
    path: req.path,
    method: req.method,
    errorMessage: error.message,
    errorCode: error.code,
    stack: error.stack,
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: 'Something went wrong on our side. Please try again in a moment.',
      // Never leaked in production; invaluable while developing.
      ...(env.isProduction ? {} : { debug: error.message }),
    },
  });
}

/** Wraps an async handler so a rejected promise reaches the error handler. */
export function asyncHandler<T extends Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: T, res: Response, next: NextFunction): void => {
    void fn(req, res, next).catch(next);
  };
}
