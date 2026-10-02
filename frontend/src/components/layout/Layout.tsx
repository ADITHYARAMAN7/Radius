import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, CalendarHeart, CalendarPlus, Compass, Home, MapPin } from 'lucide-react';
import { Navbar } from './Navbar';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

const MOBILE_TABS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/explore', label: 'Explore', icon: Compass, end: false },
  { to: '/events/new', label: 'Create', icon: CalendarPlus, end: false },
  { to: '/my-events', label: 'Mine', icon: CalendarHeart, end: false },
];

/** Compact tab bar on phones — thumb-reachable, with generous touch targets. */
function MobileNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <div className="flex items-stretch">
        {MOBILE_TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.6875rem] font-semibold transition-colors',
                isActive ? 'text-brand' : 'text-ink-muted',
              )
            }
          >
            {({ isActive }) => (
              <>
                <tab.icon
                  className={cn('h-5 w-5 transition-transform', isActive && 'scale-110')}
                  aria-hidden="true"
                />
                {tab.label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-20 border-t border-border bg-surface">
      <div className="container-page py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <div className="flex items-center gap-2.5 font-display text-[1.0625rem] font-extrabold tracking-tight text-ink">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white">
                <MapPin className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
              </span>
              Nearby-objects
            </div>

            <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">
              Discover. Connect. Participate. A community event board for the things happening on
              your own street — built on Google Cloud.
            </p>
          </div>

          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink-muted">Browse</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {[
                { to: '/explore', label: 'Explore events' },
                { to: '/events/new', label: 'Create an event' },
                { to: '/community', label: 'Community & leaderboard' },
                { to: '/insights', label: 'Community insights' },
              ].map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className="text-ink-soft transition-colors hover:text-brand">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink-muted">Account</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {[
                { to: '/my-events', label: 'Events I created' },
                { to: '/my-rsvps', label: "Events I'm attending" },
                { to: '/profile', label: 'Profile' },
              ].map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className="text-ink-soft transition-colors hover:text-brand">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-border pt-6 text-xs text-ink-muted sm:flex-row sm:items-center">
          <p>© {year} Nearby-objects · Cognizant NPN GCP Hackathon prototype</p>
          <p className="flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
            Cloud Run · Firestore · Cloud Storage · Gemini · Maps Platform
          </p>
        </div>
      </div>
    </footer>
  );
}

export function Layout() {
  const { theme, toggle } = useTheme();
  const { pathname } = useLocation();
  const { initialising } = useAuth();

  // React Router keeps scroll position between routes, which reads as a bug.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* First tab stop on every page, for keyboard and screen-reader users. */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <Navbar theme={theme} onToggleTheme={toggle} />

      <main id="main-content" className="flex-1 pb-20 md:pb-0">
        {/*
          Routes render immediately rather than waiting on auth — only the protected ones
          need to know, and blocking everything would delay the whole first paint.
        */}
        <Outlet context={{ initialising }} />
      </main>

      <Footer />
      <MobileNav />
    </div>
  );
}
