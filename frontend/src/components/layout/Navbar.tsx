import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Bookmark,
  CalendarHeart,
  CalendarPlus,
  Compass,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  Moon,
  Sun,
  Trophy,
  User as UserIcon,
  X,
} from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Primitives';
import { useAuth, useDisplayName } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { to: '/', label: 'Board' },
  { to: '/ask', label: 'Ask the Board' },
  { to: '/pulse', label: 'Pulse' },
  { to: '/community', label: 'Community' },
];

export function Navbar({ theme, onToggleTheme }: { theme: 'light' | 'dark'; onToggleTheme: () => void }) {
  const { user, profile, signOut, initialising } = useAuth();
  const displayName = useDisplayName();
  const toast = useToast();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  // A solid background only once scrolled, so the hero sits flush under a transparent bar.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (pointerEvent: MouseEvent) => {
      if (!menuRef.current?.contains(pointerEvent.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  // Stop the page scrolling behind the open mobile sheet.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const onSignOut = async () => {
    setMenuOpen(false);
    setMobileOpen(false);
    await signOut();
    toast.info('Signed out', 'See you next time.');
    navigate('/');
  };

  const visibleLinks = NAV_LINKS.filter((link) => !link.protected || user);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 transition-all duration-200',
        scrolled ? 'bg-surface/85 shadow-sm backdrop-blur-xl' : 'bg-transparent',
      )}
    >
      <div className="container-page">
        <nav className="flex h-16 items-center justify-between gap-4" aria-label="Main">
          {/* ------------------------------------------------------- wordmark */}
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2.5 rounded-lg font-display text-[1.15rem] font-extrabold tracking-tight text-ink"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md">
              <MapPin className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
            </span>
            Radius
          </Link>

          {/* ------------------------------------------------- desktop links */}
          <div className="hidden items-center gap-4 md:flex ml-8">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end
                className={({ isActive }) =>
                  cn(
                    'rounded-full px-5 py-1.5 text-sm font-semibold transition-colors',
                    isActive ? 'bg-brand-soft text-brand-ink' : 'text-ink-muted hover:text-ink',
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </div>

          {/* ----------------------------------------------------- right side */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleTheme}
              className="text-ink-muted hover:text-ink hover:bg-transparent"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? (
                <Sun className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Moon className="h-5 w-5" aria-hidden="true" />
              )}
            </Button>

            <ButtonLink to="/events/new" variant="primary" size="sm" className="hidden sm:inline-flex rounded-full px-5 bg-brand hover:bg-brand-hover text-white border-0">
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              Post Event
            </ButtonLink>

            {/*
              While the session is being restored we know neither way, so showing "Sign in"
              would contradict the page itself — which may already be rendering a signed-in
              view. A neutral placeholder holds the same space until the answer arrives.
            */}
            {initialising ? (
              <div
                className="hidden h-8 w-8 animate-pulse rounded-full bg-surface-sunken md:block"
                aria-hidden="true"
              />
            ) : user ? (
              <div ref={menuRef} className="relative hidden md:block">
                <button
                  type="button"
                  onClick={() => setMenuOpen((value) => !value)}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  className="flex items-center gap-2 rounded-full p-0.5 transition-opacity hover:opacity-85"
                  aria-label={`Account menu for ${displayName}`}
                >
                  <Avatar name={displayName} src={user.photoURL} size="sm" />
                </button>

                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 z-30 mt-2 w-60 animate-scale-in overflow-hidden rounded-xl bg-surface-raised p-1.5 shadow-lg ring-1 ring-border"
                  >
                    <div className="px-3 py-2.5">
                      <p className="truncate text-sm font-bold text-ink">{displayName}</p>
                      {user.email && <p className="truncate text-xs text-ink-muted">{user.email}</p>}
                      {profile && (
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-brand">
                          <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="tabular-nums">{profile.points}</span> points · {profile.level.name}
                        </p>
                      )}
                    </div>

                    <div className="my-1 h-px bg-border" role="separator" />

                    {[
                      { to: '/my-events', label: 'My events', icon: CalendarHeart },
                      { to: '/my-rsvps', label: "Events I'm attending", icon: CalendarPlus },
                      { to: '/my-rsvps?tab=saved', label: 'Saved events', icon: Bookmark },
                      { to: '/profile', label: 'Profile', icon: UserIcon },
                    ].map((item) => (
                      <Link
                        key={item.to}
                        role="menuitem"
                        to={item.to}
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-sunken"
                      >
                        <item.icon className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                        {item.label}
                      </Link>
                    ))}

                    <div className="my-1 h-px bg-border" role="separator" />

                    <button
                      type="button"
                      role="menuitem"
                      onClick={onSignOut}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-danger-ink transition-colors hover:bg-danger-soft"
                    >
                      <LogOut className="h-4 w-4" aria-hidden="true" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <ButtonLink to="/login" variant="secondary" size="sm" className="hidden md:inline-flex">
                Sign in
              </ButtonLink>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>
        </nav>
      </div>

      {/* ---------------------------------------------------- mobile sheet */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 right-0 flex w-[min(20rem,85vw)] animate-fade-up flex-col bg-surface shadow-lg"
          >
            <div className="flex h-16 items-center justify-between px-4">
              <span className="font-display font-bold text-ink">Menu</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>

            <div className="flex-1 space-y-1 overflow-y-auto p-4">
              {user && (
                <div className="mb-4 flex items-center gap-3 rounded-xl bg-surface-sunken p-3">
                  <Avatar name={displayName} src={user.photoURL} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{displayName}</p>
                    {user.email && <p className="truncate text-xs text-ink-muted">{user.email}</p>}
                  </div>
                </div>
              )}

              {[
                { to: '/', label: 'Board', icon: Compass },
                { to: '/ask', label: 'Ask the Board', icon: MessageSquare },
                { to: '/pulse', label: 'Pulse', icon: Activity },
                { to: '/events/new', label: 'Create event', icon: CalendarPlus },
                ...(user
                  ? [
                      { to: '/my-events', label: 'My events', icon: CalendarHeart },
                      { to: '/my-rsvps', label: "Events I'm attending", icon: CalendarPlus },
                      { to: '/profile', label: 'Profile', icon: UserIcon },
                    ]
                  : []),
                { to: '/community', label: 'Community', icon: Trophy },
              ].map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors',
                      isActive ? 'bg-brand-soft text-brand-ink' : 'text-ink hover:bg-surface-sunken',
                    )
                  }
                >
                  <item.icon className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
                  {item.label}
                </NavLink>
              ))}
            </div>

            <div className="border-t border-border p-4">
              {user ? (
                <Button variant="danger-soft" full onClick={onSignOut}>
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sign out
                </Button>
              ) : (
                <div className="space-y-2">
                  <ButtonLink to="/login" variant="primary" full onClick={() => setMobileOpen(false)}>
                    Sign in
                  </ButtonLink>
                  <ButtonLink to="/register" variant="secondary" full onClick={() => setMobileOpen(false)}>
                    Create an account
                  </ButtonLink>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
