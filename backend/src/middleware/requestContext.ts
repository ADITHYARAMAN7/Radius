import type { NextFunction, Request, Response } from 'express';
import { logger, setTraceContext } from '../config/logger';

/**
 * Cloud Run forwards X-Cloud-Trace-Context. Lifting the trace id out of it is what
 * makes a log line in Cloud Logging clickable through to the whole request trace.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('X-Cloud-Trace-Context');
  const traceId = header ? header.split('/')[0] : undefined;
  setTraceContext(traceId);

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    // Health checks fire constantly; logging them buries everything else.
    // Note: inside an Express router req.path has the mount prefix (/api) already
    // stripped, so the correct path to skip is just '/health', not '/api/health'.
    if (req.path === '/health' || req.originalUrl.split('?')[0] === '/api/health') return;

    logger.info(req.method + ' ' + req.originalUrl, {
      httpRequest: {
        requestMethod: req.method,
        requestUrl: req.originalUrl,
        status: res.statusCode,
        latency: durationMs.toFixed(1) + 'ms',
        userAgent: req.header('user-agent'),
      },
    });
  });

  next();
}
