import { env } from './env';

/**
 * Cloud Logging on Cloud Run works by reading structured JSON from stdout/stderr.
 * Emitting the documented field names (`severity`, `message`,
 * `logging.googleapis.com/trace`) is the officially supported integration — it needs
 * no extra dependency, and entries arrive in Cloud Logging already parsed,
 * searchable and correlated to the request trace.
 */
type Severity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

let activeTrace: string | undefined;

export function setTraceContext(trace: string | undefined): void {
  activeTrace = trace;
}

function emit(severity: Severity, message: string, meta?: Record<string, unknown>): void {
  const entry: Record<string, unknown> = {
    severity,
    message,
    service: 'radius-api',
    ...meta,
  };

  if (activeTrace && env.projectId) {
    entry['logging.googleapis.com/trace'] = `projects/${env.projectId}/traces/${activeTrace}`;
  }

  if (env.isProduction) {
    const line = JSON.stringify(entry);
    if (severity === 'ERROR' || severity === 'CRITICAL') process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
    return;
  }

  // Readable single line while developing locally.
  const tail = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const stamp = new Date().toISOString().slice(11, 23);
  process.stdout.write(`${stamp} ${severity.padEnd(8)} ${message}${tail}\n`);
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => emit('DEBUG', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => emit('INFO', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit('WARNING', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit('ERROR', message, meta),
  critical: (message: string, meta?: Record<string, unknown>) => emit('CRITICAL', message, meta),
};
