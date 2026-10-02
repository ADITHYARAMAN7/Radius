import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, CalendarPlus, Flame, MapPin, Sparkles, TrendingUp, Users } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { Badge, Card } from '@/components/ui/Primitives';
import { EventCard } from '@/components/events/EventCard';
import { CategoryIcon } from '@/components/events/CategoryBadge';
import { NearbyEvents } from '@/components/events/NearbyEvents';
import { RecommendedSection } from '@/components/events/RecommendedSection';
import { EmptyState, EventGridSkeleton, ErrorState } from '@/components/common/States';
import { useEvents } from '@/hooks/useEvents';
import { useRsvp } from '@/hooks/useRsvp';
import { api } from '@/lib/api';
import { CATEGORIES, type CategoryCount } from '@/lib/types';
import { CATEGORY_STYLES, cn } from '@/lib/utils';

function Hero() {
  return (
    <section className="hero-glow relative overflow-hidden border-b border-border">
      {/* Tightened from py-28: the old spacing left a dead band before the first section. */}
      <div className="container-page relative py-14 sm:py-16 lg:py-20">
        <div className="max-w-3xl">
          <Badge tone="brand" className="animate-fade-up">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Built on Google Cloud for the Cognizant NPN Hackathon
          </Badge>

          <h1 className="mt-5 animate-fade-up text-display-xl text-ink [animation-delay:60ms]">
            Discover What&rsquo;s
            <br />
            Happening <span className="text-brand">Around You</span>
          </h1>

          <p className="mt-5 max-w-xl animate-fade-up text-base leading-relaxed text-ink-soft [animation-delay:120ms] sm:text-lg">
            Find local events, meetups, activities and community experiences near you. Post what you
            are organising, and see who else is going.
          </p>

          <div className="mt-7 flex animate-fade-up flex-col gap-3 [animation-delay:180ms] sm:flex-row">
            <ButtonLink to="/explore" variant="primary" size="lg">
              Explore Events
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </ButtonLink>

            <ButtonLink to="/events/new" variant="secondary" size="lg">
              Create Event
            </ButtonLink>
          </div>

          <dl className="mt-10 grid max-w-lg animate-fade-up grid-cols-3 gap-6 [animation-delay:240ms]">
            {[
              { label: 'Neighbourhoods', value: 'Coimbatore', icon: MapPin },
              { label: 'Categories', value: '8 kinds', icon: Flame },
              { label: 'Always', value: 'Up to date', icon: CalendarDays },
            ].map((stat) => (
              <div key={stat.label}>
                <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                  <stat.icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {stat.label}
                </dt>
                <dd className="mt-1 font-display text-sm font-bold text-ink sm:text-base">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
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
          <h2 className="flex items-center gap-2 text-display-md">
            {icon}
            {title}
          </h2>
          <p className="mt-1.5 text-sm text-ink-soft">{description}</p>
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
      title: 'Say you are going',
      body: 'One tap to RSVP. The organiser sees the count, you get the event in your own list, and you can cancel any time.',
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
    document.title = 'Nearby-objects — Discover. Connect. Participate.';
  }, []);

  const onPopularResolved = useCallback((hasEvents: boolean) => setBoardHasEvents(hasEvents), []);

  return (
    <>
      <Hero />

      {/*
        Placed directly under the hero: "what is near me" is the question the product
        exists to answer, so it should not be below three other sections.
      */}
      <NearbyEvents />

      <RecommendedSection />

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

      <CategoryTiles />

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
