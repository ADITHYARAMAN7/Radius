import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, CalendarPlus, Flame, MapPin, Sparkles, TrendingUp, Users } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { Badge, Card } from '@/components/ui/Primitives';
import { EventCard } from '@/components/events/EventCard';
import { CategoryIcon } from '@/components/events/CategoryBadge';
import { NearbyEvents } from '@/components/events/NearbyEvents';
import { RecommendedSection } from '@/components/events/RecommendedSection';
import { TrendingSection } from '@/components/events/TrendingSection';
import { EmptyState, EventGridSkeleton, ErrorState } from '@/components/common/States';
import { useEvents } from '@/hooks/useEvents';
import { useRsvp } from '@/hooks/useRsvp';
import { api } from '@/lib/api';
import { CATEGORIES, type CategoryCount } from '@/lib/types';
import { CATEGORY_STYLES, cn } from '@/lib/utils';

function Hero() {
  return (
    <section className="bg-bg text-ink relative overflow-hidden pb-12 pt-16">
      <div className="container-page relative flex flex-col items-center text-center">
        <h1 className="text-display-xl lg:text-[4rem] font-serif font-extrabold tracking-tight">
          <span className="text-white">Discover What's</span>
          <br />
          <span className="bg-gradient-to-r from-brand to-[#D4CE70] bg-clip-text text-transparent">
            Happening Nearby
          </span>
        </h1>

        {/* Search Bar */}
        <div className="mt-8 w-full max-w-2xl relative animate-fade-up [animation-delay:60ms]">
          <input 
            type="text" 
            placeholder="Search events, locations, neighborhoods..." 
            className="w-full bg-surface-raised border border-border rounded-full py-4 pl-6 pr-12 text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-brand/50 transition-shadow"
          />
        </div>

        {/* Category Pills */}
        <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-3xl animate-fade-up [animation-delay:120ms]">
          <button className="px-4 py-1.5 rounded-full bg-brand/20 text-brand font-medium text-sm transition-colors hover:bg-brand/30 border border-brand/20">
            All
          </button>
          
          {[
            { label: 'Sports', color: 'bg-green-500' },
            { label: 'Music', color: 'bg-purple-500' },
            { label: 'Food', color: 'bg-orange-500' },
            { label: 'Yard Sale', color: 'bg-yellow-500' },
            { label: 'Community', color: 'bg-blue-500' },
            { label: 'Education', color: 'bg-indigo-500' },
            { label: 'Technology', color: 'bg-fuchsia-500' },
            { label: 'Other', color: 'bg-gray-500' }
          ].map((cat) => (
            <button key={cat.label} className="px-4 py-1.5 rounded-full bg-surface-raised text-ink-muted hover:text-ink font-medium text-sm transition-colors border border-border flex items-center gap-2 hover:bg-surface-sunken">
              <span className={`w-2 h-2 rounded-full ${cat.color}`}></span>
              {cat.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function CategoryTiles() {
  const [counts, setCounts] = useState<CategoryCount[] | null>(null);

  useEffect(() => {
    let active = true;
    api
      .categories()
      .then((result) => {
        if (active) setCounts(result.categories);
      })
      // A failed count is cosmetic — the tiles still work as navigation.
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const countFor = (category: string) =>
    counts?.find((entry) => entry.category === category)?.count ?? null;

  return (
    <section className="container-page py-12">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-display-md">Browse by category</h2>
          <p className="mt-1.5 text-sm text-ink-soft">
            Eight kinds of thing happen around here. Pick the one you are in the mood for.
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {CATEGORIES.map((category) => {
          const style = CATEGORY_STYLES[category];
          const count = countFor(category);

          return (
            <Link
              key={category}
              to={`/explore?category=${encodeURIComponent(category)}`}
              className="group rounded-card bg-surface p-4 ring-1 ring-border transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md hover:ring-border-strong"
            >
              <span
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-inset',
                  style.badge,
                )}
              >
                <CategoryIcon category={category} className="h-5 w-5" />
              </span>

              <h3 className="mt-3 font-display text-sm font-bold text-ink transition-colors group-hover:text-brand">
                {category}
              </h3>
              <p className="mt-0.5 text-xs leading-snug text-ink-muted">{style.blurb}</p>

              {count !== null && (
                <p className="mt-2 text-xs font-semibold tabular-nums text-ink-soft">
                  {count} upcoming
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/** A horizontal section of event cards, used three times with different queries. */
function EventSection({
  title,
  description,
  icon,
  filters,
  viewAllHref,
  limit = 3,
  onResolved,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  filters: Parameters<typeof useEvents>[0];
  viewAllHref: string;
  limit?: number;
  /** Lets the page know whether anything exists at all, so it can show guidance. */
  onResolved?: (hasEvents: boolean) => void;
}) {
  const { events, loading, error, reload, applyRsvp } = useEvents({ ...filters, pageSize: limit });
  const { toggle, isPending } = useRsvp({ onChange: applyRsvp });

  useEffect(() => {
    if (!loading && !error) onResolved?.(events.length > 0);
  }, [loading, error, events.length, onResolved]);

  if (error) {
    return (
      <section className="container-page py-8">
        <h2 className="text-display-md">{title}</h2>
        <ErrorState error={error} onRetry={reload} className="mt-5" />
      </section>
    );
  }

  // An empty section is noise on a landing page, so it simply does not render.
  if (!loading && events.length === 0) return null;

  return (
    <section className="container-page py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-display-md text-white">
            {icon}
            {title}
          </h2>
          <p className="mt-1.5 text-sm text-gray-300">{description}</p>
        </div>

        <Link
          to={viewAllHref}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand transition-colors hover:text-brand-hover"
        >
          View all
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      {loading ? (
        <div className="mt-6">
          <EventGridSkeleton count={limit} />
        </div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              pending={isPending(event.id)}
              onToggleRsvp={toggle}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      title: 'Find something nearby',
      body: 'Search by neighbourhood or city, filter by category and date, and switch to the map when you want to see what is close.',
      icon: MapPin,
    },
    {
      title: 'Say you are going — then turn up',
      body: 'One tap to RSVP, and a quick QR check-in at the venue. Both earn neighbour points, and turning up earns the most.',
      icon: Users,
    },
    {
      title: 'Post your own',
      body: 'Add the details, upload a photo, and let the AI assistant tidy up your description if you would rather not write it yourself.',
      icon: Sparkles,
    },
  ];

  return (
    <section className="container-page py-12">
      <div className="rounded-panel bg-surface-sunken p-6 ring-1 ring-border sm:p-10">
        <h2 className="text-display-md">How it works</h2>
        <p className="mt-1.5 text-sm text-ink-soft">Three steps, no learning curve.</p>

        <ol className="mt-8 grid gap-6 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title}>
              <Card className="h-full p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-sm font-bold text-white">
                    {index + 1}
                  </span>
                  <step.icon className="h-5 w-5 text-brand" aria-hidden="true" />
                </div>

                <h3 className="mt-4 font-display text-base font-bold text-ink">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{step.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default function Home() {
  // "Most popular" has no date or category constraint, so it is the honest proxy for
  // whether the board holds anything at all.
  const [boardHasEvents, setBoardHasEvents] = useState<boolean | null>(null);

  useEffect(() => {
    document.title = 'Radius — Discover. Connect. Participate.';
  }, []);

  const onPopularResolved = useCallback((hasEvents: boolean) => setBoardHasEvents(hasEvents), []);

  return (
    <>
      <Hero />

      {/*
        Placed directly under the hero: "what is near me" is the question the product
        exists to answer, so it should not be below three other sections.
      */}
      {/* View Toggle */}
      <div className="container-page py-6">
        <div className="inline-flex bg-surface-raised p-1.5 rounded-full border border-border shadow-sm">
          <button className="flex items-center gap-2 px-6 py-2 rounded-full bg-white text-ink font-semibold shadow-sm transition-all">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
            List
          </button>
          <button className="flex items-center gap-2 px-6 py-2 rounded-full text-ink-muted hover:text-ink hover:bg-surface-sunken transition-all">
            <MapPin className="w-[1.125rem] h-[1.125rem]" />
            Map
          </button>
          <button className="flex items-center gap-2 px-6 py-2 rounded-full text-ink-muted hover:text-ink hover:bg-surface-sunken transition-all">
            <CalendarDays className="w-[1.125rem] h-[1.125rem]" />
            Calendar
          </button>
        </div>
      </div>

      <NearbyEvents />

      <RecommendedSection />

      <TrendingSection />

      <EventSection
        title="Happening this week"
        description="The next few days on the board, soonest first."
        icon={<CalendarDays className="h-6 w-6 text-brand" aria-hidden="true" />}
        filters={{ date: 'week', sort: 'soonest' }}
        viewAllHref="/explore?date=week"
      />

      <EventSection
        title="Most popular"
        description="Where your neighbours are already going."
        icon={<TrendingUp className="h-6 w-6 text-accent" aria-hidden="true" />}
        filters={{ sort: 'popular' }}
        viewAllHref="/explore?sort=popular"
        onResolved={onPopularResolved}
      />

      {/*
        Without this, an empty board renders a hero followed by nothing at all, because
        every section hides itself when it has no events.
      */}
      {boardHasEvents === false && (
        <section className="container-page py-8">
          <EmptyState
            icon={<CalendarPlus className="h-7 w-7" aria-hidden="true" />}
            title="Nothing on the board yet"
            description="No upcoming events have been posted in your area. If you know of something happening — a weekly game, a clean-up, a yard sale — you can be the first to put it up."
            action={
              <>
                <ButtonLink to="/events/new" variant="primary">
                  Create the first event
                </ButtonLink>
                <ButtonLink to="/explore" variant="secondary">
                  Browse anyway
                </ButtonLink>
              </>
            }
          />
        </section>
      )}



      <EventSection
        title="Just added"
        description="The newest listings from people nearby."
        icon={<Flame className="h-6 w-6 text-warning" aria-hidden="true" />}
        filters={{ sort: 'recent' }}
        viewAllHref="/explore?sort=recent"
      />

      <HowItWorks />
    </>
  );
}
