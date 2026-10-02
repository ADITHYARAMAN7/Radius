import { forwardRef, useId } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const controlBase =
  'w-full rounded-xl bg-surface px-3.5 text-sm text-ink ring-1 ring-inset ring-border transition-shadow placeholder:text-ink-muted hover:ring-border-strong focus:outline-none focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-60';

interface FieldShellProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  /** Shown on the right of the label, e.g. a character counter. */
  trailing?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * The shared label / hint / error frame.
 *
 * Errors are wired through aria-describedby and marked role="alert" so the message is
 * announced when it appears, instead of only being visible.
 */
export function FieldShell({
  label,
  htmlFor,
  error,
  hint,
  required,
  trailing,
  children,
  className,
}: FieldShellProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-sm font-semibold text-ink">
          {label}
          {required && (
            <span className="ml-1 text-danger" aria-hidden="true">
              *
            </span>
          )}
          {required && <span className="sr-only"> (required)</span>}
        </label>
        {trailing}
      </div>

      {children}

      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="text-xs leading-relaxed text-ink-muted">
          {hint}
        </p>
      )}

      {error && (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="flex items-start gap-1.5 text-xs font-medium text-danger-ink"
        >
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: string): string | undefined {
  const ids = [error && `${id}-error`, !error && hint && `${id}-hint`].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  trailing?: React.ReactNode;
  wrapperClassName?: string;
  /** Icon rendered inside the control, on the left. */
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, trailing, wrapperClassName, icon, className, id, required, ...props },
  ref,
) {
  const generated = useId();
  const fieldId = id ?? generated;

  return (
    <FieldShell
      label={label}
      htmlFor={fieldId}
      error={error}
      hint={hint}
      required={required}
      trailing={trailing}
      className={wrapperClassName}
    >
      <div className="relative">
        {icon && (
          <span
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, error, hint)}
          className={cn(
            controlBase,
            'h-11',
            icon && 'pl-10',
            error && 'ring-danger focus:ring-danger',
            className,
          )}
          {...props}
        />
      </div>
    </FieldShell>
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
  trailing?: React.ReactNode;
  wrapperClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, trailing, wrapperClassName, className, id, required, rows = 5, ...props },
  ref,
) {
  const generated = useId();
  const fieldId = id ?? generated;

  return (
    <FieldShell
      label={label}
      htmlFor={fieldId}
      error={error}
      hint={hint}
      required={required}
      trailing={trailing}
      className={wrapperClassName}
    >
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
        className={cn(
          controlBase,
          'resize-y py-3 leading-relaxed',
          error && 'ring-danger focus:ring-danger',
          className,
        )}
        {...props}
      />
    </FieldShell>
  );
});

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
  wrapperClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, wrapperClassName, className, id, required, children, ...props },
  ref,
) {
  const generated = useId();
  const fieldId = id ?? generated;

  return (
    <FieldShell
      label={label}
      htmlFor={fieldId}
      error={error}
      hint={hint}
      required={required}
      className={wrapperClassName}
    >
      <select
        ref={ref}
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
        className={cn(
          controlBase,
          'h-11 cursor-pointer appearance-none bg-[length:1.1rem] bg-[right_0.85rem_center] bg-no-repeat pr-10',
          error && 'ring-danger focus:ring-danger',
          className,
        )}
        style={{
          // Inline SVG chevron keeps the control consistent across browsers without an
          // extra wrapper element.
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        }}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
});
