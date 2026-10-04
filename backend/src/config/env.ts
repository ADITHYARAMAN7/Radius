import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function optional(key: string, fallback = ''): string {
  return process.env[key]?.trim() || fallback;
}

function bool(key: string, fallback = false): boolean {
  const raw = process.env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes';
}

const nodeEnv = optional('NODE_ENV', 'development');

const configuredProjectId =
  optional('GCP_PROJECT_ID') || optional('FIREBASE_PROJECT_ID') || optional('GOOGLE_CLOUD_PROJECT');

/** The `demo-` prefix tells the Firebase tooling this project never talks to real Google Cloud. */
const LOCAL_PROJECT_ID = 'demo-radius';

/**
 * Local mode: nothing about Google Cloud is configured, so run against the Firebase
 * emulators instead of failing every request with "could not load the default credentials".
 *
 * It switches itself on only when there is no project, no key file and no explicit
 * emulator host — a fresh clone, in other words — and never in production. Setting any of
 * those (or LOCAL_MODE=false) hands control back to the real configuration.
 */
const localMode =
  nodeEnv !== 'production' &&
  bool(
    'LOCAL_MODE',
    !configuredProjectId &&
      !optional('GOOGLE_APPLICATION_CREDENTIALS') &&
      !optional('FIRESTORE_EMULATOR_HOST'),
  );

if (localMode) {
  // firebase-admin reads these two straight from the environment.
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8081';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
}

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: Number(optional('PORT', '8080')),

  localMode,
  projectId: configuredProjectId || (localMode ? LOCAL_PROJECT_ID : ''),
  credentialsPath: optional('GOOGLE_APPLICATION_CREDENTIALS'),

  gcsBucket: optional('GCS_BUCKET'),
  /**
   * Where event photos go when there is no bucket. Development only: a Cloud Run
   * container's disk is wiped on every restart, so production must use Cloud Storage.
   */
  localUploadsDir: path.resolve(__dirname, '../../uploads'),

  aiProvider: (optional('AI_PROVIDER', 'api') === 'vertex' ? 'vertex' : 'api') as 'api' | 'vertex',
  geminiApiKey: optional('GEMINI_API_KEY'),
  geminiModel: optional('GEMINI_MODEL', 'gemini-3.5-flash-lite'),
  /** Used for one retry when the main model answers "high demand". Empty = retry the main model. */
  geminiFallbackModel: optional('GEMINI_FALLBACK_MODEL', 'gemini-3.1-flash-lite'),
  vertexLocation: optional('VERTEX_LOCATION', 'global'),

  corsOrigins: optional('CORS_ORIGINS', 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  maintenanceToken: optional('MAINTENANCE_TOKEN'),
  serveStatic: bool('SERVE_STATIC', nodeEnv === 'production'),
  firestoreEmulatorHost: optional('FIRESTORE_EMULATOR_HOST'),
} as const;

/**
 * Features degrade independently: the board works without Gemini or Cloud Storage,
 * so we report capability rather than crashing at boot. /api/health exposes this.
 */
export const capabilities = {
  /** True when Gemini itself is reachable. The assistant still answers without it. */
  get ai(): boolean {
    if (env.aiProvider === 'vertex') return Boolean(env.projectId) && !env.localMode;
    return Boolean(env.geminiApiKey);
  },
  get storage(): boolean {
    return Boolean(env.gcsBucket) || this.localStorage;
  },
  /** Photos are written to disk instead of a bucket. */
  get localStorage(): boolean {
    return !env.gcsBucket && !env.isProduction;
  },
  get maintenance(): boolean {
    return Boolean(env.maintenanceToken);
  },
};
