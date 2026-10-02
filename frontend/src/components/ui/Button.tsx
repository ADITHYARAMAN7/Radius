import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonStyles = cva(
  // `active:scale` gives a physical press; disabled state never looks clickable.
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-white shadow-sm hover:bg-brand-hover hover:shadow-md',
        secondary: 'bg-surface text-ink ring-1 ring-inset ring-border hover:bg-surface-sunken hover:ring-border-strong',
        soft: 'bg-brand-soft text-brand-ink hover:bg-brand/15',
        ghost: 'text-ink-soft hover:bg-surface-sunken hover:text-ink',
        danger: 'bg-danger text-white shadow-sm hover:brightness-95',
        'danger-soft': 'bg-danger-soft text-danger-ink hover:bg-danger/15',
        success: 'bg-success text-white shadow-sm hover:brightness-95',
        outline: 'bg-transparent text-ink ring-1 ring-inset ring-border-strong hover:bg-surface-sunken',
      },
      size: {
        sm: 'h-9 px-3.5 text-[0.8125rem]',
        md: 'h-11 px-5 text-sm',
        lg: 'h-12 px-6 text-[0.9375rem]',
        icon: 'h-10 w-10',
        'icon-sm': 'h-9 w-9',
      },
      full: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', full: false },
  },
);

type ButtonBaseProps = VariantProps<typeof buttonStyles> & {
  loading?: boolean;
  /** Announced while `loading` is true, so a screen reader is told what is happening. */
  loadingLabel?: string;
};

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'>,
    ButtonBaseProps {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, full, loading = false, loadingLabel, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(buttonStyles({ variant, size, full }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>{loadingLabel ?? children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
});

export interface ButtonLinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement>,
    VariantProps<typeof buttonStyles> {
  to: string;
  /** External destinations open in a new tab with the usual rel protections. */
  external?: boolean;
}

/**
 * A link styled as a button. Kept distinct from Button rather than overloading it,
 * because navigation must stay an anchor for keyboard and middle-click behaviour.
 */
export function ButtonLink({
  to,
  external = false,
  className,
  variant,
  size,
  full,
  children,
  ...props
}: ButtonLinkProps) {
  const classes = cn(buttonStyles({ variant, size, full }), className);

  if (external) {
    return (
      <a href={to} target="_blank" rel="noopener noreferrer" className={classes} {...props}>
        {children}
      </a>
    );
  }

  return (
    <Link to={to} className={classes} {...props}>
      {children}
    </Link>
  );
}
