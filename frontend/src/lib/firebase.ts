import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * Points sign-in at the local Auth emulator, e.g. `127.0.0.1:9099`.
 *
 * This is what makes the whole app testable without a Google Cloud project — otherwise
 * every signed-in page is unreachable locally. Never set in production.
 */
const configuredEmulatorHost = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST as string | undefined;

/**
 * Local mode, mirroring the API's: on the dev server with no Firebase web config at all,
 * sign-in goes to the Auth emulator that `npm run dev` starts. That is what makes a fresh
 * clone fully usable — accounts, RSVPs, posting — without creating a Firebase project.
 * A production build never takes this path.
 */
const authEmulatorHost =
  configuredEmulatorHost || (import.meta.env.DEV && !config.apiKey ? '127.0.0.1:9099' : undefined);

/** Must match the project id the emulators and the API run under. */
const LOCAL_PROJECT_ID = 'demo-radius';

/** True when accounts live in the local emulator rather than in real Firebase Auth. */
export const isLocalAuth = Boolean(authEmulatorHost);

/**
 * Whether sign-in can work at all. Checked up front so the UI can explain that auth is
 * unconfigured instead of throwing an opaque Firebase error on the first click.
 *
 * The emulator needs no real credentials, so its presence alone counts as configured.
 */
export const isAuthConfigured = Boolean(
  (config.apiKey && config.authDomain && config.projectId) || authEmulatorHost,
);

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (!isAuthConfigured) {
    throw new Error(
      'Firebase Authentication is not configured. Add the VITE_FIREBASE_* values to frontend/.env — see the README.',
    );
  }

  if (!authInstance) {
    // The emulator ignores these, but the SDK still requires non-empty values.
    app = app ?? initializeApp(
      authEmulatorHost
        ? {
            ...config,
            apiKey: config.apiKey || 'local-emulator',
            authDomain: config.authDomain || 'localhost',
            projectId: config.projectId || LOCAL_PROJECT_ID,
          }
        : config,
    );
    authInstance = getAuth(app);

    if (authEmulatorHost) {
      // warnings:false keeps the emulator's red banner out of screenshots.
      connectAuthEmulator(authInstance, `http://${authEmulatorHost}`, { disableWarnings: true });
    }

    // Survive a page reload, which matters for a demo where you reload often.
    void setPersistence(authInstance, browserLocalPersistence);
  }

  return authInstance;
}

/** Firebase error codes are machine-readable; these are the messages users see. */
export function describeAuthError(error: unknown): string {
  const code = (error as { code?: string }).code ?? '';

  switch (code) {
    case 'auth/invalid-email':
      return 'That email address does not look right.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Those sign-in details do not match an account.';
    case 'auth/email-already-in-use':
      return 'An account already exists with that email. Try signing in instead.';
    case 'auth/weak-password':
      return 'Pick a password of at least 6 characters.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'The Google sign-in window closed before finishing.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup. Allow popups for this site and try again.';
    case 'auth/operation-not-allowed':
      return 'That sign-in method is not enabled on this Firebase project yet.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a minute and try again.';
    case 'auth/network-request-failed':
      // In local mode "the sign-in service" is the emulator on this machine, so a network
      // error means it is not running — which has nothing to do with the user's connection.
      return isLocalAuth
        ? 'The local sign-in emulator is not running yet. It starts with the server — wait a few seconds and try again, or restart the project with "npm run dev".'
        : 'We could not reach the sign-in service. Check your connection.';
    default:
      return (error as { message?: string }).message || 'Sign-in failed. Please try again.';
  }
}

export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string,
): Promise<User> {
  const auth = getFirebaseAuth();
  const credential = await createUserWithEmailAndPassword(auth, email, password);

  // Without this the new account has no name, and every event they post is "Neighbour".
  if (displayName.trim()) {
    await updateProfile(credential.user, { displayName: displayName.trim() });
    await credential.user.reload();

    // The ID token minted at sign-up predates the name. The API reads the organiser name
    // from the token, so without a forced refresh a new user's first events would be
    // attributed to the first half of their email address for up to an hour.
    await credential.user.getIdToken(true);
  }

  return credential.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  return credential.user;
}

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const credential = await signInWithPopup(getFirebaseAuth(), provider);
  return credential.user;
}

/** A ready-made account for demos, so nobody has to invent an email to try the app. */
const DEMO_ACCOUNT = { email: 'demo@radius.local', password: 'demo-neighbour', name: 'Demo Neighbour' };

/**
 * One-click sign-in for local mode. Creates the demo account the first time and signs
 * into it thereafter. Refuses to run against real Firebase Auth.
 */
export async function signInAsDemoUser(): Promise<{ user: User; created: boolean }> {
  if (!isLocalAuth) throw new Error('The demo account only exists in local mode.');

  try {
    return { user: await signInWithEmail(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password), created: false };
  } catch (error) {
    const code = (error as { code?: string }).code ?? '';
    if (code !== 'auth/user-not-found' && code !== 'auth/invalid-credential') throw error;

    const user = await registerWithEmail(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password, DEMO_ACCOUNT.name);
    return { user, created: true };
  }
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(getFirebaseAuth());
}

/**
 * Fresh ID token for the Authorization header. The SDK caches and refreshes it, so
 * calling this per request is cheap and avoids sending an expired token.
 */
export async function getIdToken(): Promise<string | null> {
  if (!isAuthConfigured) return null;
  const user = getFirebaseAuth().currentUser;
  if (!user) return null;
  return user.getIdToken();
}
