import fs from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';
import { env } from './env';
import { logger } from './logger';

let app: admin.app.App | null = null;

/**
 * Credential resolution order:
 *  1. GOOGLE_APPLICATION_CREDENTIALS pointing at a readable service-account JSON (local dev)
 *  2. Application Default Credentials — how this runs on Cloud Run, where the
 *     service account is attached to the revision and no key file exists
 */
function resolveCredential(): admin.credential.Credential | undefined {
  const configured = env.credentialsPath;
  if (!configured) return undefined;

  const absolute = path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  if (!fs.existsSync(absolute)) {
    logger.warn('Service account file not found, falling back to Application Default Credentials', {
      path: absolute,
    });

    // applicationDefault() reads this same variable, so leaving the dead path in place
    // would make the fallback fail with the identical ENOENT instead of trying
    // gcloud / metadata credentials.
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    return undefined;
  }

  logger.info('Using service account credentials', { path: absolute });
  return admin.credential.cert(absolute);
}

export function initFirebase(): admin.app.App {
  if (app) return app;

  if (env.firestoreEmulatorHost) {
    process.env.FIRESTORE_EMULATOR_HOST = env.firestoreEmulatorHost;
    logger.warn('Firestore emulator mode', {
      host: env.firestoreEmulatorHost,
      authEmulator: process.env.FIREBASE_AUTH_EMULATOR_HOST || '(none — real Firebase Auth)',
    });
  }

  const credential = resolveCredential();
  const isEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

  app = admin.initializeApp({
    ...(credential
      ? { credential }
      : isEmulator
        ? {}
        : { credential: admin.credential.applicationDefault() }),
    projectId: env.projectId || 'demo-radius',
    ...(env.gcsBucket ? { storageBucket: env.gcsBucket } : {}),
  });

  const db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });

  logger.info('Firebase Admin initialised', {
    projectId: env.projectId || '(from credentials)',
    bucket: env.gcsBucket || '(none)',
  });

  return app;
}

import { getFirestore } from 'firebase-admin/firestore';

export function getDb(): admin.firestore.Firestore {
  const currentApp = initFirebase();
  // The user's database was created as 'default1' instead of '(default)'
  return getFirestore(currentApp, 'default1');
}

export function getAuth(): admin.auth.Auth {
  initFirebase();
  return admin.auth();
}

export function getBucket() {
  initFirebase();
  if (!env.gcsBucket) throw new Error('GCS_BUCKET is not configured');
  return admin.storage().bucket(env.gcsBucket);
}

export const Timestamp = admin.firestore.Timestamp;
export const FieldValue = admin.firestore.FieldValue;
export type DocumentData = admin.firestore.DocumentData;
export type QueryDocumentSnapshot = admin.firestore.QueryDocumentSnapshot;
export type FirestoreQuery = admin.firestore.Query;
