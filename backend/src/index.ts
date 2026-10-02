import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { capabilities, env } from './config/env';
import { initFirebase } from './config/firebase';
import { logger } from './config/logger';
import { errorHandler, notFoundHandler } from './middleware/error';
import { readLimiter, writeLimiter } from './middleware/rateLimit';
import { requestContext } from './middleware/requestContext';
import { aiRouter } from './routes/ai';
import { eventsRouter } from './routes/events';
import { metaRouter } from './routes/meta';
import { recommendationsRouter } from './routes/recommendations';
import { rsvpsRouter } from './routes/rsvps';
import { uploadsRouter } from './routes/uploads';
import { usersRouter } from './routes/users';

export function createApp(): express.Express {
  const app = express();

  // Cloud Run terminates TLS and forwards the client IP in X-Forwarded-For.
  // Only trust the proxy header in production; in dev there is no proxy, so
  // leaving it on would let a local attacker spoof X-Forwarded-For and bypass
  // the IP-keyed rate limiter.
  if (env.isProduction) app.set('trust proxy', true);
  app.disable('x-powered-by');

  /**
   * CSP directive set used in both enforcement and report-only mode.
   *
   * No 'unsafe-inline' on script-src: the Vite build emits only src-based module
   * scripts, so allowing inline script would weaken the main XSS control for
   * nothing. Verified against dist/index.html — zero inline script blocks.
   *
   * In production this is enforced. In development it is sent as report-only so
   * violations surface in the browser console without blocking the dev server,
   * giving us continuous coverage rather than a gap between local and prod.
   */
  const cspDirectives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", 'https://maps.googleapis.com', 'https://apis.google.com'],
    // Styles still need it: Tailwind and the Maps SDK both inject style attributes.
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'connect-src': ["'self'", 'https://*.googleapis.com', 'https://*.google.com'],
    'frame-src': ["'self'", 'https://*.firebaseapp.com', 'https://*.google.com'],
  };

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: cspDirectives,
        // Report-only in dev: violations are logged to the console but not blocked.
        // This means the same policy is tested locally, not only in production.
        reportOnly: !env.isProduction,
      },
      crossOriginEmbedderPolicy: false,
      // Event images are served from storage.googleapis.com.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  /**
   * CORS is mounted on /api only.
   *
   * Static assets must not go through it: a `<script type="module">` request carries an
   * Origin header even when it is same-origin, so an origin check here would reject the
   * app's own bundle. Same-origin responses need no CORS headers anyway.
   */
  const corsDelegate: cors.CorsOptionsDelegate<express.Request> = (req, callback) => {
    const origin = req.headers.origin;

    // curl, server-to-server calls and Cloud Scheduler send no Origin at all.
    if (!origin) {
      callback(null, { origin: true, credentials: true });
      return;
    }

    // The SPA this same process serves is always allowed, whatever CORS_ORIGINS says.
    const selfOrigin = `${req.protocol}://${req.headers.host}`;
    const allowed =
      env.corsOrigins.includes('*') || env.corsOrigins.includes(origin) || origin === selfOrigin;

    if (!allowed) logger.warn('Blocked cross-origin request', { origin });

    // `origin: false` simply omits the CORS headers and lets the browser enforce the
    // block. Throwing here would turn a policy decision into a 500.
    callback(null, { origin: allowed, credentials: true });
  };

  app.use('/api', cors(corsDelegate));

  app.use(compression());
  // 64 KB is more than enough for every API call except the AI assist prompt
  // (which allows up to 2 KB of user text). A 1 MB global limit gives an
  // attacker a cheap way to consume memory and exhaust the heap — tighten it
  // here and let the AI router declare its own larger limit only where needed.
  app.use(express.json({ limit: '65536' }));
  app.use(express.urlencoded({ extended: true, limit: '65536' }));
  app.use(requestContext);

  /*
   * Rate limiting sits in front of every API route. It runs before per-route auth, so the
   * key is the client IP rather than a uid — the uid refinement applies to limiters mounted
   * after `requireAuth`, such as the one inside the AI router.
   */
  app.use('/api', readLimiter);
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    return writeLimiter(req, res, next);
  });

  app.use('/api', metaRouter);
  // Recommendations must be mounted BEFORE the generic events router so that
  // GET /api/events/recommended is matched here rather than treated as /:id.
  app.use('/api/events', recommendationsRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/events', rsvpsRouter);
  app.use('/api/me', usersRouter);
  // The AI router accepts up to ~2 KB of user text in a prompt. Give it its own
  // JSON limit so we do not raise the bar for every other route.
  app.use('/api/ai', express.json({ limit: '131072' }), aiRouter);
  app.use('/api/uploads', uploadsRouter);

  app.use('/api', notFoundHandler);

  /**
   * Single-service deployment: the same Cloud Run container serves the API and the built
   * SPA. Every non-API path falls through to index.html so React Router owns client-side
   * routes — which is what makes a shared event link work when opened cold.
   */
  if (env.serveStatic) {
    const distDir = path.resolve(__dirname, '../../frontend/dist');

    if (fs.existsSync(distDir)) {
      app.use(
        express.static(distDir, {
          // Hashed asset filenames are safe to cache hard; index.html must not be.
          setHeaders(res, filePath) {
            if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
            else res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          },
        }),
      );

      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });

      logger.info('Serving frontend build', { distDir });
    } else {
      logger.warn('SERVE_STATIC is on but no frontend build was found', { distDir });
    }
  }

  app.use(errorHandler);
  return app;
}

const CREDENTIALS_HELP = `
Nearby-objects could not authenticate to Google Cloud, so Firestore is unreachable.
Pick whichever of these fits where you are running:

  1. Service account key (simplest locally)
     Cloud console -> IAM & Admin -> Service Accounts -> Keys -> Add key (JSON)
     Save it as backend/service-account.json, then in backend/.env set:
       GOOGLE_APPLICATION_CREDENTIALS=./service-account.json

  2. Your own gcloud login (no key file to keep safe)
       gcloud auth application-default login
       gcloud config set project <your-project-id>
     Then leave GOOGLE_APPLICATION_CREDENTIALS blank in backend/.env

  3. Firestore emulator (no Google Cloud project needed at all)
       firebase emulators:start --only firestore
     Then in backend/.env set:
       FIRESTORE_EMULATOR_HOST=localhost:8081

On Cloud Run none of this applies — the attached service account is picked up
automatically, so leave GOOGLE_APPLICATION_CREDENTIALS unset there.
`;

function start(): void {
  try {
    initFirebase();
  } catch (error) {
    logger.critical('Could not initialise Firebase Admin', {
      reason: (error as { message?: string }).message,
    });
    process.stderr.write(CREDENTIALS_HELP);
    process.exit(1);
  }

  const app = createApp();

  const server = app.listen(env.port, () => {
    logger.info('Nearby-objects API listening', {
      port: env.port,
      environment: env.nodeEnv,
      storage: capabilities.storage,
      ai: capabilities.ai ? env.aiProvider : false,
      serveStatic: env.serveStatic,
    });
  });

  // Cloud Run sends SIGTERM before reclaiming an instance; closing cleanly avoids
  // cutting off in-flight requests during a deploy.
  const shutdown = (signal: string) => {
    logger.info('Shutting down', { signal });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason: String(reason) });
  });
}

if (require.main === module) start();
