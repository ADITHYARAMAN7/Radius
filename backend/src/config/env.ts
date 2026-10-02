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

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: Number(optional('PORT', '8080')),

  projectId: optional('GCP_PROJECT_ID') || optional('FIREBASE_PROJECT_ID') || optional('GOOGLE_CLOUD_PROJECT'),
  credentialsPath: optional('GOOGLE_APPLICATION_CREDENTIALS'),

  gcsBucket: optional('GCS_BUCKET'),

  aiProvider: (optional('AI_PROVIDER', 'api') === 'vertex' ? 'vertex' : 'api') as 'api' | 'vertex',
  geminiApiKey: optional('GEMINI_API_KEY'),
  geminiModel: optional('GEMINI_MODEL', 'gemini-3.8-flash'),
  /** Used for one retry when the main model answers "high demand". Empty = retry the main model. */
  geminiFallbackModel: optional('GEMINI_FALLBACK_MODEL', 'gemini-3.5-flash'),
  vertexLocation: optional('VERTEX_LOCATION', 'us-central1'),

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
  get ai(): boolean {
    return env.aiProvider === 'vertex' ? Boolean(env.projectId) : Boolean(env.geminiApiKey);
  },
  get storage(): boolean {
    return Boolean(env.gcsBucket);
  },
  get maintenance(): boolean {
    return Boolean(env.maintenanceToken);
  },
};
