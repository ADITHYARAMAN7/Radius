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
import { Activity, BadgeCheck, BarChart3, CalendarCheck2, CalendarX2, MapPin, TrendingUp, Users } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { Card, StatTile } from '@/components/ui/Primitives';
import { EmptyState, ErrorState, PageSkeleton } from '@/components/common/States';
import { api } from '@/lib/api';
import type { InsightsPayload } from '@/lib/types';

/**
 * One hue per category, matching the badge colours elsewhere so a bar and a card badge
 * for the same category read as the same thing.
 */
const CATEGORY_COLORS: Record<string, string> = {
  Sports: '#10b981',
  Music: '#8b5cf6',
  Food: '#f97316',
  'Yard Sale': '#f59e0b',
  Community: '#0ea5e9',
  Education: '#3b82f6',
  Technology: '#6366f1',
  Other: '#64748b',
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

export default function Insights() {
  const [data, setData] = useState<InsightsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    document.title = 'Community insights — Nearby-Events';
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    api
      .insights()
      .then((result) => {
        if (active) setData(result);
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

  /**
   * With nothing on the board, the charts would render as empty axes — which reads as
   * broken rather than as "no data yet". Say so instead.
   */
  if (data.totals.events === 0) {
    return (
      <div className="container-page py-8">
        <header className="mb-8">
          <h1 className="text-display-lg">Community insights</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-soft sm:text-base">
            A read on what is happening across the board.
          </p>
        </header>

        <EmptyState
          icon={<BarChart3 className="h-7 w-7" aria-hidden="true" />}
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
    <div className="container-page py-8">
      <header className="mb-8">
        <h1 className="text-display-lg">Community insights</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft sm:text-base">
          A read on what is happening across the board — which categories are busiest, which
          neighbourhoods are most active, and how RSVPs are trending.
        </p>
      </header>

      {/* --------------------------------------------------------- stat tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          label="Total events"
          value={data.totals.events}
          hint={`${data.totals.organisers} organiser${data.totals.organisers === 1 ? '' : 's'}`}
          icon={<Activity className="h-4 w-4" aria-hidden="true" />}
        />
        <StatTile
          label="Active now"
          value={data.totals.active}
          hint="Upcoming and not cancelled"
          icon={<CalendarCheck2 className="h-4 w-4" aria-hidden="true" />}
        />
        <StatTile
          label="Expired"
          value={data.totals.expired}
          hint="Kept for the record, hidden from the board"
          icon={<CalendarX2 className="h-4 w-4" aria-hidden="true" />}
        />
        <StatTile
          label="Total RSVPs"
          value={data.totals.rsvps}
          hint={
            data.totals.events > 0
              ? `${Math.round(data.totals.rsvps / data.totals.events)} per event on average`
              : undefined
          }
          icon={<Users className="h-4 w-4" aria-hidden="true" />}
        />
        <StatTile
          label="Checked in at the door"
          value={data.totals.checkIns}
          hint={
            data.totals.rsvps > 0
              ? `${Math.round((data.totals.checkIns / data.totals.rsvps) * 100)}% of all RSVPs turned up`
              : 'People who actually turned up'
          }
          icon={<BadgeCheck className="h-4 w-4" aria-hidden="true" />}
        />
        <StatTile
          label="Most popular category"
          value={data.topCategory?.name ?? '—'}
          hint={data.topCategory ? `${data.topCategory.count} events` : undefined}
          icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
        />
        <StatTile
          label="Most active neighbourhood"
          value={data.topNeighborhood?.name ?? '—'}
          hint={data.topNeighborhood ? `${data.topNeighborhood.count} events` : undefined}
          icon={<MapPin className="h-4 w-4" aria-hidden="true" />}
        />
      </div>

      {/* ------------------------------------------------------------- charts */}
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="Events by category"
          description="Where organisers are putting their energy."
          summary={
            categoryData.length
              ? `Events by category: ${categoryData.map((row) => `${row.category} ${row.events}`).join(', ')}.`
              : 'No events yet.'
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="category"
                tick={AXIS_STYLE}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={-35}
                textAnchor="end"
                height={70}
              />
              <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--surface-sunken))' }} />
              <Bar dataKey="events" name="Events" radius={[6, 6, 0, 0]}>
                {categoryData.map((row) => (
                  <Cell key={row.category} fill={CATEGORY_COLORS[row.category] ?? '#64748b'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="RSVPs by category"
          description="Which kinds of event people actually turn up for."
          summary={
            categoryData.length
              ? `RSVPs by category: ${categoryData.map((row) => `${row.category} ${row.rsvps}`).join(', ')}.`
              : 'No RSVPs yet.'
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="category"
                tick={AXIS_STYLE}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={-35}
                textAnchor="end"
                height={70}
              />
              <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--surface-sunken))' }} />
              <Bar dataKey="rsvps" name="RSVPs" radius={[6, 6, 0, 0]} fill="hsl(var(--brand))" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {data.overTime.length > 1 && (
          <ChartCard
            title="Events and RSVPs over time"
            description="How the board has grown month by month."
            summary={`Monthly totals: ${data.overTime
              .map((row) => `${row.month}, ${row.events} events and ${row.rsvps} RSVPs`)
              .join('; ')}.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.overTime} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="events"
                  name="Events"
                  stroke="hsl(var(--brand))"
                  strokeWidth={2.5}
                  dot={{ r: 3.5, strokeWidth: 0, fill: 'hsl(var(--brand))' }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="rsvps"
                  name="RSVPs"
                  stroke="hsl(var(--accent))"
                  strokeWidth={2.5}
                  dot={{ r: 3.5, strokeWidth: 0, fill: 'hsl(var(--accent))' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/*
          Spans both columns when the time-series card is absent, so a third card never
          sits alone beside an empty half.
        */}
        {data.byNeighborhood.length > 0 && (
          <div className={data.overTime.length > 1 ? '' : 'lg:col-span-2'}>
          <ChartCard
            title="Busiest neighbourhoods"
            description="Where the most is going on."
            summary={`Busiest neighbourhoods: ${data.byNeighborhood
              .map((row) => `${row.neighborhood} ${row.events} events`)
              .join(', ')}.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.byNeighborhood}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={AXIS_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="neighborhood"
                  tick={AXIS_STYLE}
                  axisLine={false}
                  tickLine={false}
                  width={100}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--surface-sunken))' }} />
                <Bar dataKey="events" name="Events" radius={[0, 6, 6, 0]} fill="hsl(var(--accent))" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          </div>
        )}
      </div>

      <p className="mt-6 text-xs text-ink-muted">
        Figures are computed live from Firestore each time this page loads
        {data.busiestDay && ` · Busiest day of the week: ${data.busiestDay.name}`} · Generated{' '}
        {new Date(data.generatedAt).toLocaleTimeString()}
      </p>
    </div>
  );
}
