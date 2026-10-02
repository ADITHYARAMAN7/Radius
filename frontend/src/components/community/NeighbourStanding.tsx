import {
  BadgeCheck,
  CalendarCheck,
  Compass,
  Crown,
  Footprints,
  Megaphone,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { Card } from '@/components/ui/Primitives';
import { cn } from '@/lib/utils';
import type { Badge as BadgeRecord, UserProfile } from '@/lib/types';

const BADGE_ICONS: Record<string, LucideIcon> = {
  'first-rsvp': Footprints,
  regular: CalendarCheck,
  explorer: Compass,
  'showed-up': BadgeCheck,
  reliable: ShieldCheck,
  host: Megaphone,
  'super-host': Crown,
};

function BadgeTile({ badge }: { badge: BadgeRecord }) {
  const Icon = BADGE_ICONS[badge.id] ?? Sparkles;

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-xl p-3 ring-1 ring-inset',
        badge.earned ? 'bg-brand-soft ring-brand/20' : 'bg-surface-sunken ring-border',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
          badge.earned ? 'bg-brand text-white' : 'bg-surface text-ink-muted ring-1 ring-border',
        )}
      >
        <Icon className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
      </span>

      <span className="min-w-0">
        <span className={cn('block text-sm font-bold', badge.earned ? 'text-brand-ink' : 'text-ink-soft')}>
          {badge.name}
          {/* Not colour alone: the state is spelled out for screen readers. */}
          <span className="sr-only">{badge.earned ? ' — earned' : ' — not earned yet'}</span>
        </span>
        <span className="block text-xs leading-snug text-ink-muted">{badge.description}</span>
      </span>
    </li>
  );
}

/**
 * A neighbour's points, level and badges.
 *
 * Shown on the profile and on the community page. The progress bar always points at the
 * next level, so there is a concrete "what next" rather than a bare number.
 */
export function NeighbourStanding({ profile, className }: { profile: UserProfile; className?: string }) {
  const { points, level, stats, badges } = profile;

  const span = level.nextAt !== null ? level.nextAt - level.minPoints : 0;
  const progress = span > 0 ? Math.min(100, Math.round(((points - level.minPoints) / span) * 100)) : 100;
  const earned = badges.filter((badge) => badge.earned).length;

  return (
    <Card className={cn('p-5 sm:p-6', className)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Neighbour level</p>
          <p className="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink">{level.name}</p>
        </div>

        <p className="text-right">
          <span className="font-display text-3xl font-extrabold tabular-nums tracking-tight text-brand">
            {points.toLocaleString()}
          </span>
          <span className="ml-1.5 text-sm font-semibold text-ink-soft">points</span>
        </p>
      </div>

      <div className="mt-4">
        <div
          className="h-2.5 overflow-hidden rounded-full bg-surface-sunken ring-1 ring-inset ring-border"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-label="Progress to the next level"
        >
          <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>

        <p className="mt-2 text-xs text-ink-muted">
          {level.nextAt !== null && level.nextName ? (
            <>
              <span className="font-semibold tabular-nums text-ink-soft">{level.nextAt - points}</span> more
              points to reach <span className="font-semibold text-ink-soft">{level.nextName}</span>
            </>
          ) : (
            'You have reached the top level. The neighbourhood thanks you.'
          )}
        </p>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
        {[
          { label: 'Hosted', value: stats.hosted },
          { label: 'RSVPs', value: stats.rsvps },
          { label: 'Check-ins', value: stats.checkIns },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl bg-surface-sunken px-2 py-3">
            <dd className="font-display text-xl font-bold tabular-nums text-ink">{stat.value}</dd>
            <dt className="mt-0.5 text-xs font-medium text-ink-muted">{stat.label}</dt>
          </div>
        ))}
      </dl>

      <div className="mt-6">
        <h3 className="flex items-baseline justify-between gap-3 font-display text-sm font-bold text-ink">
          Badges
          <span className="text-xs font-semibold tabular-nums text-ink-muted">
            {earned} of {badges.length} earned
          </span>
        </h3>

        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {badges.map((badge) => (
            <BadgeTile key={badge.id} badge={badge} />
          ))}
        </ul>
      </div>
    </Card>
  );
}
