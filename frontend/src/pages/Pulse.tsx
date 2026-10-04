import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, BadgeCheck, BarChart3, CalendarCheck2, CalendarX2, MapPin, TrendingUp, Users, Tag } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { Card, StatTile } from '@/components/ui/Primitives';
import { EmptyState, ErrorState, PageSkeleton } from '@/components/common/States';
import { api } from '@/lib/api';
import type { InsightsPayload, TrendingEvent } from '@/lib/types';

/**
 * One hue per category, matching the badge colours elsewhere so a bar and a card badge
 * for the same category read as the same thing.
 */
const CATEGORY_COLORS: Record<string, string> = {
  Sports: '#007AFF', // Blue
  Music: '#AF52DE', // Purple
  Food: '#FF9500', // Orange
  'Yard Sale': '#FFCC00', // Yellow
  Community: '#00C7BE', // Cyan
  Education: '#5E5CE6', // Indigo
  Technology: '#32ADE6', // Light blue
  Art: '#FF2D55', // Pink
  Health: '#34C759', // Green
  Other: '#8E8E93', // Gray
};

const AXIS_STYLE = { fontSize: 12, fill: 'hsl(var(--ink-muted))' } as const;

/** Themed tooltip — Recharts' default is a white box that is unreadable in dark mode. */
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl bg-surface-raised p-3 shadow-lg ring-1 ring-border">
      <p className="text-xs font-bold text-ink">{label}</p>
      <ul className="mt-1.5 space-y-0.5">
        {payload.map((entry, index) => (
          <li key={index} className="flex items-center gap-2 text-xs text-ink-soft">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: entry.color }}
              aria-hidden="true"
            />
            {entry.name}: <span className="font-semibold tabular-nums text-ink">{entry.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChartCard({
  title,
  description,
  children,
  /** Plain-text equivalent, so the data is available to screen readers too. */
  summary,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  summary: string;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-base font-bold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-soft">{description}</p>

      <div className="mt-5 h-64" role="img" aria-label={summary}>
        {children}
      </div>

      <p className="sr-only">{summary}</p>
    </Card>
  );
}

export default function Pulse() {
  const [data, setData] = useState<InsightsPayload | null>(null);
  const [trendingEvents, setTrendingEvents] = useState<TrendingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    document.title = 'Pulse — Radius';
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([
      api.insights(),
      api.trending({ pageSize: 4 })
    ])
      .then(([insightsResult, trendingResult]) => {
        if (active) {
          setData(insightsResult);
          setTrendingEvents(trendingResult.items);
        }
      })
      .catch((caught: unknown) => {
        if (active) setError(caught);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [nonce]);

  if (loading) return <PageSkeleton label="Crunching the numbers" />;

  if (error) {
    return (
      <div className="container-page py-16">
        <ErrorState error={error} onRetry={() => setNonce((value) => value + 1)} />
      </div>
    );
  }

  if (!data) return null;

  const categoryData = data.byCategory.filter((row) => row.events > 0);

  if (data.totals.events === 0) {
    return (
      <div className="container-page py-8">
        <header className="mb-8">
          <h1 className="text-display-lg flex items-center gap-3">
            <Activity className="h-8 w-8 text-brand" aria-hidden="true" />
            Pulse
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-soft sm:text-base">
            A read on what is happening across the board.
          </p>
        </header>

        <EmptyState
          icon={<Activity className="h-7 w-7" aria-hidden="true" />}
          title="No data to chart yet"
          description="Once events start going on the board, this page fills with category trends, the busiest neighbourhoods and how RSVPs are moving."
          action={
            <>
              <ButtonLink to="/events/new" variant="primary">
                Create the first event
              </ButtonLink>
              <ButtonLink to="/explore" variant="secondary">
                Browse the board
              </ButtonLink>
            </>
          }
        />
      </div>
    );
  }

  return (
    <div className="container-page py-8 space-y-6">
      <header className="mb-4">
        <h1 className="text-display-lg flex items-center gap-3">
          <Activity className="h-8 w-8 text-brand" aria-hidden="true" />
          Pulse
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft sm:text-base">
          A read on what is happening across the board.
        </p>
      </header>
      {/* Top Stat Tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="flex flex-col items-center justify-center p-6 text-center shadow-sm">
          <CalendarCheck2 className="mb-3 h-6 w-6 text-ink-soft" />
          <div className="text-4xl font-bold text-[#32ADE6]">{data.totals.active}</div>
          <div className="mt-2 text-xs font-semibold tracking-wider text-ink-soft uppercase">
            Active Events
          </div>
        </Card>
        <Card className="flex flex-col items-center justify-center p-6 text-center shadow-sm">
          <Users className="mb-3 h-6 w-6 text-ink-soft" />
          <div className="text-4xl font-bold text-[#32ADE6]">{data.totals.rsvps}</div>
          <div className="mt-2 text-xs font-semibold tracking-wider text-ink-soft uppercase">
            Total RSVPs
          </div>
        </Card>
        <Card className="flex flex-col items-center justify-center p-6 text-center shadow-sm">
          <Tag className="mb-3 h-6 w-6 text-ink-soft" />
          <div className="text-4xl font-bold text-[#32ADE6]">{categoryData.length}</div>
          <div className="mt-2 text-xs font-semibold tracking-wider text-ink-soft uppercase">
            Categories
          </div>
        </Card>
        <Card className="flex flex-col items-center justify-center p-6 text-center shadow-sm">
          <MapPin className="mb-3 h-6 w-6 text-ink-soft" />
          <div className="text-4xl font-bold text-[#32ADE6]">{data.byNeighborhood.length}</div>
          <div className="mt-2 text-xs font-semibold tracking-wider text-ink-soft uppercase">
            Neighborhoods
          </div>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Categories"
          description=""
          summary={
            categoryData.length
              ? `Events by category: ${categoryData.map((row) => `${row.category} ${row.events}`).join(', ')}.`
              : 'No events yet.'
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={categoryData}
              layout="vertical"
              margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
            >
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="category"
                tick={AXIS_STYLE}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--surface-sunken))' }} />
              <Bar dataKey="events" name="Events" radius={[0, 12, 12, 0]} barSize={24}>
                {categoryData.map((row) => (
                  <Cell key={row.category} fill={CATEGORY_COLORS[row.category] ?? '#64748b'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {data.byNeighborhood.length > 0 && (
          <ChartCard
            title="Neighborhoods"
            description=""
            summary={`Busiest neighbourhoods: ${data.byNeighborhood
              .map((row) => `${row.neighborhood} ${row.events} events`)
              .join(', ')}.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.byNeighborhood}
                layout="vertical"
                margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="neighborhood"
                  tick={AXIS_STYLE}
                  axisLine={false}
                  tickLine={false}
                  width={100}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--surface-sunken))' }} />
                <Bar dataKey="events" name="Events" radius={[0, 12, 12, 0]} barSize={24} fill="#32ADE6" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {/* Trending Events List */}
      {trendingEvents.length > 0 && (
        <Card className="p-5 sm:p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="h-5 w-5 text-ink" aria-hidden="true" />
            <div>
              <h2 className="font-display text-base font-bold text-ink">Trending Events</h2>
              <p className="text-xs text-ink-soft">Powered by real-time Google BigQuery analytics</p>
            </div>
          </div>
          <div className="space-y-4">
            {trendingEvents.map((event, index) => {
              const eventDate = new Date(event.startsAt);
              const formattedDate = new Intl.DateTimeFormat('en-GB', {
                weekday: 'short',
                day: 'numeric',
                month: 'short'
              }).format(eventDate);
              
              return (
                <div key={event.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-raised font-bold text-[#32ADE6]">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="font-semibold text-ink">{event.title}</h3>
                      <div className="flex items-center gap-1.5 text-xs">
                        <span style={{ color: CATEGORY_COLORS[event.category] ?? '#64748b' }} className="font-medium">
                          {event.category}
                        </span>
                        <span className="text-ink-soft">· {formattedDate}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-[#32ADE6] font-semibold">
                    <div className="flex items-center gap-1.5">
                      <span>+{event.recentRsvps ?? event.rsvpCount}</span>
                      <Users className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-ink-muted">Recent RSVPs</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <p className="mt-6 text-xs text-ink-muted text-center opacity-0 h-0">
        Figures are computed live from Firestore each time this page loads
        {data.busiestDay && ` · Busiest day of the week: ${data.busiestDay.name}`} · Generated{' '}
        {new Date(data.generatedAt).toLocaleTimeString()}
      </p>
    </div>
  );
}
