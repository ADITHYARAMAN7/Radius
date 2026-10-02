import { Router } from 'express';
import multer from 'multer';
import { currentUser, requireAuth, type AuthedRequest } from '../middleware/auth';
import { AppError, asyncHandler } from '../middleware/error';
import { MAX_IMAGE_BYTES, uploadEventImage } from '../services/storageService';
import { capabilities } from '../config/env';

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
