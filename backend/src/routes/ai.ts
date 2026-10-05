import { Router, type NextFunction, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { capabilities } from '../config/env';
import { currentUser, requireAuth, type AuthedRequest } from '../middleware/auth';
import { AppError, asyncHandler } from '../middleware/error';
import { aiAssistSchema, aiExtractSchema } from '../middleware/validate';
import { extractEventDetails, generateEventSuggestion, parseSearchIntent, generateEventImage } from '../services/aiService';
import { rankEventsWithAi } from '../services/aiRankingService';
import { listEvents } from '../services/eventService';
import { MAX_IMAGE_BYTES, detectImageType, uploadEventImage } from '../services/storageService';
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
    
    // Fetch events based on the intent filters (no search keyword filter to get more matches)
    const eventsResponse = await listEvents({
      category: intent.category as any,
      neighborhood: intent.neighborhood || undefined,
      city: intent.city || undefined,
      dateFilter: intent.dateFilter as any,
    }, key);
    
    // Rank events with AI
    const rankedEvents = await rankEventsWithAi(query, eventsResponse.items);
    
    res.json({ intent, rankedEvents });
  }),
);

/** Same memory-only, size-capped pattern as event image uploads. */
const posterUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 5 },
});

/** HEIF brands found in the `ftyp` box of iPhone photos and other HEIC/HEIF files. */
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis']);
const HEIF_BRANDS = new Set(['mif1', 'msf1', 'heif']);

/**
 * The image types Gemini reads, detected from the bytes rather than trusting the
 * client's declared type. GIF is a valid event image but not a format Gemini accepts.
 */
function detectPosterType(buffer: Buffer): string | null {
  const known = detectImageType(buffer);
  if (known) return known.mime === 'image/gif' ? null : known.mime;

  if (buffer.length > 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii');
    if (HEIC_BRANDS.has(brand)) return 'image/heic';
    if (HEIF_BRANDS.has(brand)) return 'image/heif';
  }
  return null;
}

/**
 * Runs before the upload is parsed, so a throttled or unconfigured request is turned
 * away without first reading a 5 MB body into memory.
 */
function extractGate(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!capabilities.ai) {
    next(AppError.unavailable("Couldn't read it automatically. The AI assistant is not configured here, so please fill the form manually."));
    return;
  }

  if (!throttle(currentUser(req).uid)) {
    logger.warn('AI rate limit hit', { uid: currentUser(req).uid, route: 'extract' });
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'That is a lot of AI help in one minute. Give it a moment and try again.',
      },
    });
    return;
  }

  next();
}

/**
 * POST /api/ai/extract — Snap-a-Poster (idea by Adhi).
 * multipart/form-data: `image` (optional file), `text` (optional), `timezone` (IANA).
 * At least one of image or text is required. Returns values for the form to pre-fill;
 * nothing is ever posted from here.
 */
aiRouter.post(
  '/extract',
  requireAuth,
  extractGate,
  posterUpload.single('image'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const input = aiExtractSchema.parse(req.body ?? {});

    if (!req.file && !input.text) {
      throw AppError.badRequest('Add a photo of the poster or paste the message text first.');
    }

    let image: { data: Buffer; mimeType: string } | undefined;
    if (req.file) {
      const mimeType = detectPosterType(req.file.buffer);
      if (!mimeType) {
        throw AppError.badRequest('Please use a JPG, PNG, WebP or HEIC photo of the poster.');
      }
      image = { data: req.file.buffer, mimeType };
    }

    const result = await extractEventDetails({ image, text: input.text, timezone: input.timezone });
    res.json({ result });
  }),
);

/**
 * POST /api/ai/generate-poster
 * Explicitly requests AI image generation for an event based on title and description.
 */
aiRouter.post(
  '/generate-poster',
  requireAuth,
  extractGate,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { title, description } = req.body;
    if (!title) {
      throw AppError.badRequest('Title is required to generate a poster.');
    }

    const generatedBuffer = await generateEventImage(title, description || '');
    if (!generatedBuffer) {
      throw AppError.unavailable('Failed to generate image. Please try again.');
    }

    const uploadResult = await uploadEventImage(
      { buffer: generatedBuffer, mimetype: 'image/jpeg', size: generatedBuffer.length, originalname: 'generated.jpg' },
      currentUser(req).uid
    );

    res.json({ imageUrl: uploadResult.imageUrl, imagePath: uploadResult.imagePath });
  }),
);
