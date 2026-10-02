import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface State {
  error: Error | null;
}

/**
 * Last line of defence against a blank page.
 *
 * React unmounts the whole tree when a render throws, so without this a single bad field
 * anywhere leaves the user staring at white. Reloading is offered rather than attempted,
 * because an automatic reload on a deterministic crash would loop.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept to the console deliberately: shipping client errors to a collector is a
    // roadmap item, not something to fake here.
    console.error('Unhandled render error', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg p-4">
        <div
          role="alert"
          className="w-full max-w-lg rounded-panel bg-surface p-8 text-center ring-1 ring-border"
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft text-danger-ink">
            <AlertTriangle className="h-7 w-7" aria-hidden="true" />
          </div>

          <h1 className="mt-5 font-display text-2xl font-bold text-ink">Something broke</h1>

          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Nearby-Events hit an unexpected error and could not finish drawing the page. Reloading
            usually clears it.
          </p>

          <pre className="mt-4 max-h-32 overflow-auto rounded-xl bg-surface-sunken p-3 text-left text-xs text-ink-soft">
            {error.message}
          </pre>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reload the page
          </button>
        </div>
      </div>
    );
  }
}
