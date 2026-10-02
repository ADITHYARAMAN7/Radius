import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Mail, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { LoadingState } from '@/components/common/States';
import { AuthNotConfigured, AuthShell } from './Login';
import { cn, safeRedirectPath } from '@/lib/utils';

/** Four cheap checks that cover most weak passwords without a dependency. */
function passwordStrength(password: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score += 1;

  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'] as const;
  return { score: score as 0 | 1 | 2 | 3 | 4, label: labels[score] ?? 'Weak' };
}

export default function Register() {
  const { register, signInGoogle, user, initialising, configured } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'email' | 'google' | null>(null);

  const next = safeRedirectPath(searchParams.get('next'));

  useEffect(() => {
    document.title = 'Create an account — Nearby-objects';
  }, []);

  if (!configured) return <AuthNotConfigured />;
  if (initialising) return <LoadingState label="Checking your session" className="min-h-[60vh]" />;
  if (user) return <Navigate to={next} replace />;

  const strength = passwordStrength(password);

  const onSubmit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    setError('');

    if (displayName.trim().length < 2) {
      setError('Add your name — it is shown as the organiser on events you post.');
      return;
    }
    if (!email.trim()) {
      setError('Enter the email address you want to sign in with.');
      return;
    }
    if (password.length < 6) {
      setError('Pick a password of at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setBusy('email');
    try {
      await register(email.trim(), password, displayName.trim());
      toast.success('Account created', 'Welcome to Nearby-objects.');
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
      title="Create your account"
      subtitle="It takes a moment, and lets you RSVP to events and post your own."
      footer={
        <>
          Already have an account?{' '}
          <Link
            to={`/login${next !== '/explore' ? `?next=${encodeURIComponent(next)}` : ''}`}
            className="font-semibold text-brand hover:text-brand-hover"
          >
            Sign in
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
          label="Your name"
          required
          autoComplete="name"
          value={displayName}
          onChange={(changeEvent) => setDisplayName(changeEvent.target.value)}
          hint="Shown as the organiser on events you post."
          placeholder="Priya Raghunathan"
        />

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

        <div>
          <Input
            label="Password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(changeEvent) => setPassword(changeEvent.target.value)}
            placeholder="At least 6 characters"
          />

          {password.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex flex-1 gap-1" aria-hidden="true">
                {[1, 2, 3, 4].map((step) => (
                  <span
                    key={step}
                    className={cn(
                      'h-1 flex-1 rounded-full transition-colors',
                      strength.score >= step
                        ? strength.score <= 1
                          ? 'bg-danger'
                          : strength.score === 2
                            ? 'bg-warning'
                            : 'bg-success'
                        : 'bg-border',
                    )}
                  />
                ))}
              </div>
              {/* aria-live so the strength is announced as it changes. */}
              <span className="text-xs font-medium text-ink-muted" aria-live="polite">
                {strength.label}
              </span>
            </div>
          )}
        </div>

        <Input
          label="Confirm password"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(changeEvent) => setConfirm(changeEvent.target.value)}
          error={confirm && confirm !== password ? 'The two passwords do not match.' : undefined}
          placeholder="Type it once more"
        />

        <Button type="submit" variant="primary" full size="lg" loading={busy === 'email'} loadingLabel="Creating account">
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Create account
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
        Continue with Google
      </Button>
    </AuthShell>
  );
}
