import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, LogIn, Mail, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Card } from '@/components/ui/Primitives';
import { useAuth } from '@/context/AuthContext';
import { safeRedirectPath } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import { LoadingState } from '@/components/common/States';

/** Google's mark, inline so the button needs no extra asset or icon dependency. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-[1.125rem] w-[1.125rem]" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.74 3.27-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

/** The frame shared by Login and Register. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="container-page flex min-h-[80vh] max-w-md flex-col justify-center py-12">
      <Link
        to="/"
        className="mx-auto flex items-center gap-2.5 font-display text-lg font-extrabold tracking-tight text-ink"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white shadow-sm">
          <MapPin className="h-5 w-5" aria-hidden="true" />
        </span>
        Nearby-objects
      </Link>

      <Card className="mt-8 p-6 sm:p-8">
        <h1 className="text-display-sm">{title}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{subtitle}</p>

        <div className="mt-6">{children}</div>
      </Card>

      <div className="mt-6 text-center text-sm text-ink-soft">{footer}</div>
    </div>
  );
}

/** Shown when the Firebase keys are missing, instead of a button that cannot work. */
export function AuthNotConfigured() {
  return (
    <AuthShell
      title="Sign-in is not configured yet"
      subtitle="This deployment has no Firebase Authentication credentials, so accounts are switched off."
      footer={
        <Link to="/explore" className="font-semibold text-brand hover:text-brand-hover">
          Browse events without an account
        </Link>
      }
    >
      <div className="flex gap-3 rounded-xl bg-warning-soft p-4 ring-1 ring-warning/25">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
        <div className="text-sm text-warning-ink">
          <p className="font-semibold">To switch accounts on</p>
          <p className="mt-1 leading-relaxed">
            Add the <code className="rounded bg-surface/60 px-1 py-0.5 text-xs">VITE_FIREBASE_*</code>{' '}
            values to <code className="rounded bg-surface/60 px-1 py-0.5 text-xs">frontend/.env</code>{' '}
            and enable Email/Password sign-in in the Firebase console. The README walks through it.
          </p>
          <p className="mt-2 leading-relaxed">
            Browsing, searching and the map all work without signing in. Creating events and RSVPs
            need an account.
          </p>
        </div>
      </div>
    </AuthShell>
  );
}

export default function Login() {
  const { signIn, signInGoogle, user, initialising, configured } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'email' | 'google' | null>(null);

  // Where to land after signing in — set by ProtectedRoute and the RSVP flow.
  const next = safeRedirectPath(searchParams.get('next'));

  useEffect(() => {
    document.title = 'Sign in — Nearby-objects';
  }, []);

  if (!configured) return <AuthNotConfigured />;
  if (initialising) return <LoadingState label="Checking your session" className="min-h-[60vh]" />;
  if (user) return <Navigate to={next} replace />;

  const onSubmit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Enter your email and password to continue.');
      return;
    }

    setBusy('email');
    try {
      await signIn(email.trim(), password);
      toast.success('Welcome back');
      navigate(next, { replace: true });
    } catch (caught) {
      setError((caught as Error).message);
      setBusy(null);
    }
  };

  const onGoogle = async () => {
    setError('');
    setBusy('google');

    try {
      await signInGoogle();
      toast.success('Signed in with Google');
      navigate(next, { replace: true });
    } catch (caught) {
      setError((caught as Error).message);
      setBusy(null);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to RSVP, post your own events and keep track of what you are going to."
      footer={
        <>
          New here?{' '}
          <Link
            to={`/register${next !== '/explore' ? `?next=${encodeURIComponent(next)}` : ''}`}
            className="font-semibold text-brand hover:text-brand-hover"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {error && (
          <div role="alert" className="flex gap-2.5 rounded-xl bg-danger-soft p-3 ring-1 ring-danger/25">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
            <p className="text-sm font-medium text-danger-ink">{error}</p>
          </div>
        )}

        <Input
          label="Email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(changeEvent) => setEmail(changeEvent.target.value)}
          icon={<Mail className="h-4 w-4" aria-hidden="true" />}
          placeholder="you@example.com"
        />

        <Input
          label="Password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(changeEvent) => setPassword(changeEvent.target.value)}
          placeholder="••••••••"
        />

        <Button type="submit" variant="primary" full size="lg" loading={busy === 'email'} loadingLabel="Signing in">
          <LogIn className="h-4 w-4" aria-hidden="true" />
          Sign in
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button
        variant="secondary"
        full
        size="lg"
        onClick={onGoogle}
        loading={busy === 'google'}
        loadingLabel="Opening Google"
      >
        <GoogleMark />
        Continue with Google
      </Button>
    </AuthShell>
  );
}
