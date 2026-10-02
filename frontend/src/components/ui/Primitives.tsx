import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ Card */

export function Card({
  className,
  interactive = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-card bg-surface ring-1 ring-border',
        interactive &&
          'transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md hover:ring-border-strong',
        className,
      )}
      {...props}
    />
  );
}

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-panel bg-surface p-6 ring-1 ring-border', className)} {...props} />;
}

/* ----------------------------------------------------------------- Badge */

const badgeStyles = cva(
  'inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset',
  {
    variants: {
      tone: {
        brand: 'bg-brand-soft text-brand-ink ring-brand/20',
        neutral: 'bg-surface-sunken text-ink-soft ring-border',
        success: 'bg-success-soft text-success-ink ring-success/25',
        danger: 'bg-danger-soft text-danger-ink ring-danger/25',
        warning: 'bg-warning-soft text-warning-ink ring-warning/25',
        accent: 'bg-accent-soft text-accent-ink ring-accent/25',
        /** For category badges, which bring their own colour classes. */
        custom: '',
      },
      size: {
        sm: 'px-2 py-0.5 text-[0.6875rem]',
        md: 'px-2.5 py-1 text-xs',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeStyles> {}

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeStyles({ tone, size }), className)} {...props} />;
}

/* ---------------------------------------------------------------- Avatar */

export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    xs: 'h-6 w-6 text-[0.625rem]',
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-14 w-14 text-base',
  } as const;

  // Imported lazily at call sites to keep this file dependency-light.
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase() || '?';

  if (src) {
    return (
      <img
        src={src}
        // Decorative next to a visible name, so the name is not read twice.
        alt=""
        loading="lazy"
        className={cn('shrink-0 rounded-full object-cover ring-2 ring-surface', sizes[size], className)}
      />
    );
  }

  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const palette = [
    'bg-indigo-500', 'bg-emerald-500', 'bg-orange-500', 'bg-violet-500',
    'bg-sky-500', 'bg-rose-500', 'bg-teal-500', 'bg-amber-500',
  ];

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-2 ring-surface',
        palette[hash % palette.length],
        sizes[size],
        className,
      )}
    >
      {initials}
    </span>
  );
}

/* -------------------------------------------------------------- Skeleton */

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('shimmer rounded-lg', className)} aria-hidden="true" {...props} />;
}

/* ------------------------------------------------------------- Separator */

export function Separator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="separator" className={cn('h-px w-full bg-border', className)} {...props} />;
}

/* ------------------------------------------------------------ Stat tile */

export function StatTile({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-soft">{label}</p>
        {icon && <span className="text-ink-muted">{icon}</span>}
      </div>
      {/* Tabular figures stop the number jittering when it updates. */}
      <p className="mt-2 font-display text-3xl font-bold tabular-nums tracking-tight text-ink">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </Card>
  );
}

/* ----------------------------------------------------------------- Toggle */

/**
 * Segmented control. Uses role="tablist" semantics via buttons with aria-pressed so
 * each option is reachable and its state is announced.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: Array<{ value: T; label: string; icon?: React.ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('inline-flex rounded-xl bg-surface-sunken p-1 ring-1 ring-border', className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-all duration-150',
              active
                ? 'bg-surface text-ink shadow-xs ring-1 ring-border'
                : 'text-ink-soft hover:text-ink',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
