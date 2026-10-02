import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { env } from './env';
import { getDb } from './firebase';
import { logger } from './logger';

/**
 * Local mode's safety net.
 *
 * Local mode swaps Firestore and Auth for the Firebase emulators — which only helps if the
 * emulators are actually running. `npm run dev` at the repo root starts them, but the API
 * is just as often started on its own (`npm run dev:api`, or straight from this folder),
 * and then every request would hang on a database that is not there.
 *
 * So the API looks after it: if the emulators are missing it starts them, loads the demo
 * board when it is empty, and until they are up it answers with a clear 503 instead of
 * leaving the browser on a loading skeleton forever.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..');
const BOOT_TIMEOUT_MS = 120_000;

type StackState = 'ready' | 'starting' | 'down';

let state: StackState = 'down';
/** Why the stack is down, written for the person looking at the terminal or the page. */
let failure = '';
let booting: Promise<void> | null = null;
let lastProbe = 0;

function parseHost(target: string, fallbackPort: number): { host: string; port: number } {
  const [host, port] = target.split(':');
  return { host: host || '127.0.0.1', port: Number(port) || fallbackPort };
}

function isPortOpen(target: string, fallbackPort: number, timeoutMs = 800): Promise<boolean> {
  const { host, port } = parseHost(target, fallbackPort);

  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

async function emulatorsReachable(): Promise<boolean> {
  const [firestore, auth] = await Promise.all([
    isPortOpen(process.env.FIRESTORE_EMULATOR_HOST ?? '', 8081),
    isPortOpen(process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '', 9099),
  ]);
  return firestore && auth;
}

function hasFirebaseCli(): boolean {
  const bin = path.join(REPO_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'firebase.cmd' : 'firebase');
  return fs.existsSync(bin);
}

/** Runs a repo-root npm script, sharing this terminal so its output and Ctrl+C behave normally. */
function runRootScript(command: string) {
  return spawn(command, { cwd: REPO_ROOT, shell: true, stdio: ['ignore', 'inherit', 'inherit'] });
}

async function seedIfEmpty(): Promise<void> {
  try {
    const existing = await getDb().collection('events').limit(1).get();
    if (!existing.empty) return;
  } catch (error) {
    logger.warn('Could not check whether the demo board is empty', {
      reason: (error as { message?: string }).message,
    });
    return;
  }

  logger.info('The local board is empty — loading the demo events');

  await new Promise<void>((resolve) => {
    const child = runRootScript('npm run seed --silent -- --local');
    child.once('exit', () => resolve());
    child.once('error', () => resolve());
  });
}

async function boot(): Promise<void> {
  if (await emulatorsReachable()) {
    state = 'ready';
    await seedIfEmpty();
    return;
  }

  if (!hasFirebaseCli()) {
    state = 'down';
    failure =
      'The Firebase emulators are not installed. Run "npm install" in the repository root, then start the project with "npm run dev".';
    logger.error(failure);
    return;
  }

  state = 'starting';
  failure = '';
  logger.info('Local mode: the Firebase emulators are not running, so the API is starting them');

  let exited = false;
  const emulators = runRootScript('npm run emulators --silent');

  emulators.once('exit', (code) => {
    exited = true;
    if (state === 'starting') {
      state = 'down';
      failure =
        `The Firebase emulators stopped while starting (exit code ${code ?? 'unknown'}). ` +
        'They need Java 21 or newer — check with "java -version" — and ports 8081, 9099 and 4000 free.';
      logger.error(failure);
    }
  });

  emulators.once('error', (error) => {
    exited = true;
    state = 'down';
    failure = `The Firebase emulators could not be started: ${error.message}`;
    logger.error(failure);
  });

  const deadline = Date.now() + BOOT_TIMEOUT_MS;

  while (!exited && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (await emulatorsReachable()) {
      logger.info('Local mode: Firebase emulators are up');
      // Stay "starting" until the demo board is loaded, so no page ever renders it empty.
      await seedIfEmpty();
      state = 'ready';
      return;
    }
  }

  if (!exited) {
    state = 'down';
    failure = 'The Firebase emulators did not come up in time. Stop the server and run "npm run dev" again.';
    logger.error(failure);
  }
}

/** Starts the emulators if local mode needs them and they are not already running. */
export function ensureLocalStack(): Promise<void> {
  if (!env.localMode) return Promise.resolve();

  if (!booting) {
    booting = boot()
      .catch((error: unknown) => {
        state = 'down';
        failure = `Local mode could not start: ${(error as { message?: string }).message ?? 'unknown error'}`;
        logger.error(failure);
      })
      .finally(() => {
        booting = null;
      });
  }

  return booting;
}

/**
 * Current state, re-checked against the real ports at most every couple of seconds — the
 * emulators can be stopped (or started by hand) while the API keeps running.
 */
async function currentState(): Promise<StackState> {
  if (state === 'starting') return state;

  const now = Date.now();
  if (now - lastProbe < 2000) return state;
  lastProbe = now;

  const reachable = await emulatorsReachable();

  if (reachable) {
    state = 'ready';
  } else if (state === 'ready') {
    // They were running and have gone away: bring them back rather than just reporting it.
    state = 'down';
    failure = '';
    void ensureLocalStack();
    return 'starting';
  }

  return state;
}

export async function localStackHealth(): Promise<StackState | 'not-local'> {
  return env.localMode ? currentState() : 'not-local';
}

/** Routes that never touch Firestore, so they keep working while the emulators boot. */
const NO_DATABASE = [/^\/health$/, /^\/geocode$/, /^\/ai\/status$/, /^\/uploads\/status$/, /^\/uploads\/files\//, /^\/categories\/list$/];

/**
 * Turns "the database is not there" into an immediate, readable 503.
 *
 * Without this the Firestore client retries an unreachable emulator for minutes, so the
 * request never completes and the page never leaves its loading state.
 */
export function localStackGuard(req: Request, res: Response, next: NextFunction): void {
  if (!env.localMode || NO_DATABASE.some((pattern) => pattern.test(req.path))) {
    next();
    return;
  }

  currentState()
    .then((current) => {
      if (current === 'ready') {
        next();
        return;
      }

      const starting = current === 'starting';

      // Tells the browser when it is worth asking again.
      res.setHeader('Retry-After', starting ? '3' : '10');
      res.status(503).json({
        error: {
          code: starting ? 'LOCAL_STACK_STARTING' : 'LOCAL_STACK_DOWN',
          message: starting
            ? 'The local database is starting up. This takes a few seconds — the page will retry on its own.'
            : failure || 'The local database is not running. Start the project with "npm run dev".',
        },
      });
    })
    .catch(next);
}
