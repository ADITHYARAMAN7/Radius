import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { api } from '@/lib/api';
import {
  describeAuthError,
  getFirebaseAuth,
  isAuthConfigured,
  registerWithEmail,
  signInWithEmail,
  signInWithGoogle,
  signOut as firebaseSignOut,
} from '@/lib/firebase';
import type { UserProfile } from '@/lib/types';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  /** True until the first auth state resolves — prevents a protected-route flash. */
  initialising: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setProfile: (profile: UserProfile) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [initialising, setInitialising] = useState(isAuthConfigured);

  useEffect(() => {
    // With Firebase unconfigured the app still runs read-only, so resolve immediately
    // rather than hanging on a listener that will never fire.
    if (!isAuthConfigured) {
      setInitialising(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (nextUser) => {
      setUser(nextUser);
      setInitialising(false);

      if (!nextUser) {
        setProfileState(null);
        return;
      }

      // Creates the Firestore profile document on first sign-in. A failure here must not
      // block the session — the user is authenticated either way.
      api
        .startSession()
        .then(({ profile: fresh }) => setProfileState(fresh))
        .catch(() => setProfileState(null));
    });

    return unsubscribe;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      await signInWithEmail(email, password);
    } catch (error) {
      throw new Error(describeAuthError(error));
    }
  }, []);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    try {
      await registerWithEmail(email, password, displayName);
    } catch (error) {
      throw new Error(describeAuthError(error));
    }
  }, []);

  const signInGoogle = useCallback(async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      throw new Error(describeAuthError(error));
    }
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut();
    setProfileState(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!isAuthConfigured || !getFirebaseAuth().currentUser) return;
    const { profile: fresh } = await api.getProfile();
    setProfileState(fresh);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      initialising,
      configured: isAuthConfigured,
      signIn,
      register,
      signInGoogle,
      signOut,
      refreshProfile,
      setProfile: setProfileState,
    }),
    [user, profile, initialising, signIn, register, signInGoogle, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}

/** Display name preferring the editable profile over the Firebase Auth record. */
export function useDisplayName(): string {
  const { user, profile } = useAuth();
  return profile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'Neighbour';
}
