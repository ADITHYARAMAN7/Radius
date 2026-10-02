import express, { Router } from 'express';
import multer from 'multer';
import { currentUser, requireAuth, type AuthedRequest } from '../middleware/auth';
import { AppError, asyncHandler } from '../middleware/error';
import { MAX_IMAGE_BYTES, uploadEventImage } from '../services/storageService';
import { capabilities, env } from '../config/env';

export const uploadsRouter = Router();

/**
 * Memory storage rather than a temp file: event images are capped at 5 MB and go
 * straight through to Cloud Storage, so touching the Cloud Run container's disk would
 * only add a failure mode.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
});

uploadsRouter.get('/status', (_req, res) => {
  res.json({ available: capabilities.storage, maxBytes: MAX_IMAGE_BYTES });
});

/**
 * Development stand-in for the Cloud Storage public URL: serves photos that were written
 * to disk because no bucket is configured. Never mounted in production.
 *
 * `dotfiles: 'deny'` and express.static's own traversal guard keep requests inside the
 * uploads folder; the file names are server-generated and the bytes were sniffed on upload.
 */
if (capabilities.localStorage) {
  uploadsRouter.use(
    '/files',
    express.static(env.localUploadsDir, {
      dotfiles: 'deny',
      index: false,
      maxAge: '1y',
      immutable: true,
    }),
    // A photo that is gone is a plain 404, not something for the error handler to log.
    (_req: express.Request, res: express.Response) => {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'That image no longer exists.' } });
    },
  );
}

uploadsRouter.post(
  '/image',
  requireAuth,
  upload.single('image'),
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!req.file) throw AppError.badRequest('Choose an image to upload.');

    const result = await uploadEventImage(req.file, currentUser(req).uid);
    res.status(201).json(result);
  }),
);
