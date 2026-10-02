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
const authEmulatorHost = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST as string | undefined;

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
        ? { ...config, apiKey: config.apiKey || 'emulator', projectId: config.projectId || 'demo' }
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
      return 'We could not reach the sign-in service. Check your connection.';
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
