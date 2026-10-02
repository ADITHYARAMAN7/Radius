import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { api } from '@/lib/api';
import {
  describeAuthError,
  getFirebaseAuth,
  isAuthConfigured,
  isLocalAuth,
  registerWithEmail,
  signInAsDemoUser,
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
  /** Accounts live in the local emulator — the demo account is available. */
  localMode: boolean;
  signInDemo: () => Promise<void>;
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
  const [profile, setProfileValue] = useState<UserProfile | null>(null);
  const [initialising, setInitialising] = useState(isAuthConfigured);

  /**
   * Bumped on every profile write. A slow response can then tell that something newer has
   * already landed and stand down, instead of overwriting it with stale data.
   */
  const profileVersion = useRef(0);

  const setProfileState = useCallback((next: UserProfile | null) => {
    profileVersion.current += 1;
    setProfileValue(next);
  }, []);

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
      const version = profileVersion.current;

      api
        .startSession()
        .then(({ profile: fresh }) => {
          if (profileVersion.current === version) setProfileState(fresh);
        })
        .catch(() => {
          if (profileVersion.current === version) setProfileState(null);
        });
    });

    return unsubscribe;
  }, [setProfileState]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      await signInWithEmail(email, password);
    } catch (error) {
      throw new Error(describeAuthError(error));
    }
  }, []);

  /**
   * The session call above races the name being attached to a brand-new account, and can
   * create the profile as "you" from you@example.com. Writing the chosen name afterwards
   * settles it whichever request the server saw first.
   */
  const applyChosenName = useCallback(
    async (displayName: string) => {
      const name = displayName.trim();
      if (name.length < 2) return;

      try {
        const { profile: fresh } = await api.updateProfile({ displayName: name });
        setProfileState(fresh);
      } catch {
        // The account exists and works; the name can still be set from the profile page.
      }
    },
    [setProfileState],
  );

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      try {
        await registerWithEmail(email, password, displayName);
      } catch (error) {
        throw new Error(describeAuthError(error));
      }

      await applyChosenName(displayName);
    },
    [applyChosenName],
  );

  const signInDemo = useCallback(async () => {
    try {
      const { user: demoUser, created } = await signInAsDemoUser();
      // Only on first use — afterwards the name is whatever was set on the profile page.
      if (created) await applyChosenName(demoUser.displayName ?? '');
    } catch (error) {
      throw new Error(describeAuthError(error));
    }
  }, [applyChosenName]);

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
  }, [setProfileState]);

  const refreshProfile = useCallback(async () => {
    if (!isAuthConfigured || !getFirebaseAuth().currentUser) return;
    const { profile: fresh } = await api.getProfile();
    setProfileState(fresh);
  }, [setProfileState]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      initialising,
      configured: isAuthConfigured,
      localMode: isLocalAuth,
      signInDemo,
      signIn,
      register,
      signInGoogle,
      signOut,
      refreshProfile,
      setProfile: setProfileState,
    }),
    [user, profile, initialising, signIn, signInDemo, register, signInGoogle, signOut, refreshProfile, setProfileState],
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
