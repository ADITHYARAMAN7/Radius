import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { capabilities, env } from '../config/env';
import { getBucket } from '../config/firebase';
import { logger } from '../config/logger';
import { AppError } from '../middleware/error';

const ALLOWED_MIME = new Map<string, string>([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** URL prefix the API serves locally stored photos from — see the uploads router. */
export const LOCAL_UPLOADS_ROUTE = '/api/uploads/files';

/** True for an image URL this API produced itself when storing a photo on local disk. */
export function isLocalUploadUrl(value: string): boolean {
  return /^\/api\/uploads\/files\/events\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/.test(value);
}

/** Resolves an object path inside the local uploads folder, refusing anything that escapes it. */
function localFilePath(objectPath: string): string | null {
  const absolute = path.resolve(env.localUploadsDir, objectPath);
  return absolute.startsWith(env.localUploadsDir + path.sep) ? absolute : null;
}

/**
 * Magic-byte signatures, because `file.mimetype` is whatever the client wrote in the
 * multipart headers. Trusting it means an attacker can upload arbitrary bytes and have
 * Cloud Storage serve them back under an image content type.
 *
 * The detected type is what gets stored — the client's claim is only ever a hint.
 */
const SIGNATURES: Array<{ mime: string; ext: string; match: (b: Buffer) => boolean }> = [
  {
    mime: 'image/jpeg',
    ext: '.jpg',
    match: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/png',
    ext: '.png',
    match: (b) =>
      b.length > 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    mime: 'image/gif',
    ext: '.gif',
    match: (b) => b.length > 6 && b.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/) !== null,
  },
  {
    // RIFF....WEBP
    mime: 'image/webp',
    ext: '.webp',
    match: (b) =>
      b.length > 12 &&
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

/** Returns the actual type of the bytes, or null when they are not a supported image. */
function detectImageType(buffer: Buffer): { mime: string; ext: string } | null {
  for (const signature of SIGNATURES) {
    if (signature.match(buffer)) return { mime: signature.mime, ext: signature.ext };
  }
  return null;
}

/**
 * Object paths are always `events/{uid}/...`, derived server-side from the verified token.
 *
 * This check exists because the client sends `imagePath` back when creating or editing an
 * event, and that value is later passed to `deleteImage`. Without it, a user could claim
 * another user's object path and have it deleted when they removed their own event.
 */
export function isOwnedImagePath(objectPath: string, uid: string): boolean {
  if (!objectPath) return false;

  // No traversal, no absolute paths, no protocol tricks.
  if (objectPath.includes('..') || objectPath.includes('//') || objectPath.startsWith('/')) {
    return false;
  }

  return objectPath.startsWith(`events/${uid}/`);
}

export interface UploadedImage {
  imageUrl: string;
  imagePath: string;
}

/**
 * Streams an event image into Cloud Storage and returns its public URL.
 *
 * The upload goes through the API rather than straight from the browser so that no
 * storage credential ever reaches the client, and so the MIME type and size are
 * validated by something the user cannot bypass.
 */
export async function uploadEventImage(
  file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  uid: string,
): Promise<UploadedImage> {
  if (!capabilities.storage) {
    throw AppError.unavailable(
      'Image uploads are not configured on this deployment. Set GCS_BUCKET to enable them.',
    );
  }

  if (!ALLOWED_MIME.has(file.mimetype)) {
    throw AppError.badRequest('Please upload a JPG, PNG, WebP or GIF image.');
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw AppError.badRequest('That image is larger than 5 MB. Please choose a smaller file.');
  }

  // The declared type got us this far; the bytes decide. This is what stops a file of
  // arbitrary content being stored and later served under an image content type.
  const detected = detectImageType(file.buffer);
  if (!detected) {
    logger.warn('Upload rejected: content does not match any supported image format', {
      uid,
      declared: file.mimetype,
      bytes: file.size,
    });
    throw AppError.badRequest(
      'That file is not a valid JPG, PNG, WebP or GIF image. Please choose a different file.',
    );
  }

  const extension = detected.ext;

  // Path is derived server-side from the verified uid, so one user cannot write into
  // another user's folder by crafting a filename.
  const safeStem = path
    .basename(file.originalname, path.extname(file.originalname))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'event';

  const objectPath = `events/${uid}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeStem}${extension}`;

  // No bucket in development: keep the photo on disk and let the API serve it, so the
  // create-event flow is fully usable without a Google Cloud project.
  if (capabilities.localStorage) {
    const target = localFilePath(objectPath);
    if (!target) throw AppError.badRequest('That file name is not valid.');

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.buffer);

    logger.info('Event image stored locally', { objectPath, uid, bytes: file.size });
    return { imageUrl: `${LOCAL_UPLOADS_ROUTE}/${objectPath}`, imagePath: objectPath };
  }

  const bucket = getBucket();
  const blob = bucket.file(objectPath);

  await blob.save(file.buffer, {
    // The sniffed type, never the client's claim.
    contentType: detected.mime,
    resumable: false,
    metadata: {
      cacheControl: 'public, max-age=31536000, immutable',
      // Stops a browser from re-interpreting the bytes as anything other than the
      // declared image type.
      contentDisposition: 'inline',
      metadata: { uploadedBy: uid, detectedType: detected.mime },
    },
  });

  // Works with "public access" buckets. For a uniform-access private bucket, swap this
  // for blob.getSignedUrl(...) — see docs/architecture.md.
  const imageUrl = `https://storage.googleapis.com/${env.gcsBucket}/${objectPath}`;

  logger.info('Event image uploaded', { objectPath, uid, bytes: file.size });
  return { imageUrl, imagePath: objectPath };
}

/**
 * Best-effort cleanup. A failure here must never fail the user's request — the
 * database is already consistent, and an orphaned object is a billing nuisance at worst.
 */
export async function deleteImage(objectPath: string): Promise<void> {
  if (!capabilities.storage || !objectPath) return;

  try {
    if (capabilities.localStorage) {
      const target = localFilePath(objectPath);
      if (target) await fs.rm(target, { force: true });
      logger.info('Local event image deleted', { objectPath });
      return;
    }

    await getBucket().file(objectPath).delete({ ignoreNotFound: true });
    logger.info('Event image deleted', { objectPath });
  } catch (error) {
    logger.warn('Could not delete event image', {
      objectPath,
      reason: (error as { message?: string }).message,
    });
  }
}
