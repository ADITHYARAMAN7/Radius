import { useEffect, useState } from 'react';
import { BadgeCheck, CalendarPlus, Medal, Trophy, UserPlus } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { Avatar, Badge, Card } from '@/components/ui/Primitives';
import { EmptyState, ErrorState, PageSkeleton } from '@/components/common/States';
import { NeighbourStanding } from '@/components/community/NeighbourStanding';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { LeaderboardPayload } from '@/lib/types';

/** Gold, silver, bronze for the podium; everyone else gets a plain number. */
const PODIUM = ['text-amber-500', 'text-slate-400', 'text-orange-700'] as const;

export default function Community() {
  const { user, profile, refreshProfile } = useAuth();

  const [data, setData] = useState<LeaderboardPayload | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    document.title = 'Community — Nearby-Events';
  }, []);

  useEffect(() => {
    let active = true;
    setError(null);

    api
      .leaderboard()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught);
      });

    return () => {
      active = false;
    };
  }, [nonce]);

  // Points change as people RSVP and check in elsewhere in the app.
  useEffect(() => {
    if (user) void refreshProfile().catch(() => undefined);
  }, [user, refreshProfile]);

  if (error) {
    return (
      <div className="container-page py-16">
        <ErrorState error={error} onRetry={() => setNonce((value) => value + 1)} />
      </div>
    );
  }

  if (!data) return <PageSkeleton label="Loading the community" />;

  const rules = [
    {
      icon: CalendarPlus,
      points: data.points.host,
      title: 'Host an event',
      body: 'Post something for the neighbourhood — a game, a clean-up, a sale.',
    },
    {
      icon: UserPlus,
      points: data.points.rsvp,
      title: 'Say you are going',
      body: 'RSVP so the organiser knows how many people to expect.',
    },
    {
      icon: BadgeCheck,
      points: data.points.checkIn,
      title: 'Turn up and check in',
      body: 'Scan the organiser’s QR at the venue. Showing up counts the most.',
    },
  ];

  return (
    <div className="container-page py-8">
      <header className="mb-8">
        <h1 className="text-display-lg">Community</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft sm:text-base">
          A board is only as good as the people on it. Neighbour points recognise the ones who
          post events, say they are coming — and then actually turn up.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        {/* --------------------------------------------------------- leaderboard */}
        <section aria-labelledby="leaderboard-heading" className="min-w-0">
          <h2 id="leaderboard-heading" className="flex items-center gap-2 text-display-sm">
            <Trophy className="h-5 w-5 text-brand" aria-hidden="true" />
            Most active neighbours
          </h2>

          {data.leaders.length === 0 ? (
            <EmptyState
              className="mt-4"
              icon={<Trophy className="h-7 w-7" aria-hidden="true" />}
              title="Nobody on the board yet"
              description="RSVP to an event or post one of your own and you will be first on the list."
              action={
                <ButtonLink to="/explore" variant="primary">
                  Find an event
                </ButtonLink>
              }
            />
          ) : (
            <ol className="mt-4 space-y-2.5">
              {data.leaders.map((leader, index) => {
                const isYou = leader.uid === user?.uid;

                return (
                  <li key={leader.uid}>
                    <Card
                      className={cn(
                        'flex items-center gap-3 p-3 sm:gap-4 sm:p-4',
                        isYou && 'bg-brand-soft/60 ring-brand/30',
                      )}
                    >
                      <span
                        className="flex w-7 shrink-0 justify-center font-display text-base font-extrabold tabular-nums text-ink-muted"
                        aria-label={`Rank ${index + 1}`}
                      >
                        {index < 3 ? (
                          <Medal className={cn('h-6 w-6', PODIUM[index])} aria-hidden="true" />
                        ) : (
                          index + 1
                        )}
                      </span>

                      <Avatar name={leader.displayName} src={leader.photoURL} size="md" />

                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="truncate text-sm font-bold text-ink">{leader.displayName}</span>
                          {isYou && (
                            <Badge tone="brand" size="sm">
                              You
                            </Badge>
                          )}
                          <Badge tone="neutral" size="sm">
                            {leader.level}
                          </Badge>
                        </p>
                        <p className="mt-0.5 truncate text-xs text-ink-muted">
                          {[
                            leader.neighborhood,
                            `${leader.stats.hosted} hosted`,
                            `${leader.stats.rsvps} RSVPs`,
                            `${leader.stats.checkIns} check-ins`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>

                      <p className="shrink-0 text-right">
                        <span className="font-display text-lg font-extrabold tabular-nums text-ink">
                          {leader.points.toLocaleString()}
                        </span>
                        <span className="block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-muted">
                          points
                        </span>
                      </p>
                    </Card>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* ------------------------------------------------------------- sidebar */}
        <aside className="space-y-6">
          {user && profile ? (
            <NeighbourStanding profile={profile} />
          ) : (
            <Card className="p-5 sm:p-6">
              <h2 className="font-display text-base font-bold text-ink">Join in</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                Sign in to start earning neighbour points and collecting badges.
              </p>
              <ButtonLink to="/login?next=%2Fcommunity" variant="primary" full className="mt-4">
                Sign in
              </ButtonLink>
            </Card>
          )}

          <Card className="p-5 sm:p-6">
            <h2 className="font-display text-base font-bold text-ink">How points work</h2>

            <ul className="mt-4 space-y-4">
              {rules.map((rule) => (
                <li key={rule.title} className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                    <rule.icon className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink">
                      {rule.title}
                      <Badge tone="success" size="sm">
                        +{rule.points}
                      </Badge>
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{rule.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
