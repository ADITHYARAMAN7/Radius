import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { PageSkeleton } from './States';

/**
 * Gate for the routes that need an account.
 *
 * Waiting on `initialising` matters: without it a signed-in user who reloads a protected
 * page gets bounced to /login for a frame before Firebase restores the session.
 *
 * This is convenience, not security — every protected operation is also authorised
 * server-side against the verified ID token.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, initialising } = useAuth();
  const location = useLocation();

  if (initialising) {
    return <PageSkeleton label="Checking your session" />;
  }

  if (!user) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <>{children}</>;
}
