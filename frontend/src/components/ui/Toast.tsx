import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastTone = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastContextValue {
  toast: (input: { tone?: ToastTone; title: string; description?: string }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONES: Record<ToastTone, { icon: typeof CheckCircle2; ring: string; iconClass: string }> = {
  success: { icon: CheckCircle2, ring: 'ring-success/30', iconClass: 'text-success' },
  error: { icon: XCircle, ring: 'ring-danger/30', iconClass: 'text-danger' },
  warning: { icon: AlertTriangle, ring: 'ring-warning/30', iconClass: 'text-warning' },
  info: { icon: Info, ring: 'ring-brand/30', iconClass: 'text-brand' },
};

const DURATION_MS = 5000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback<ToastContextValue['toast']>(
    ({ tone = 'info', title, description }) => {
      const id = nextId.current;
      nextId.current += 1;

      // Cap the stack so a burst of errors cannot cover the page.
      setToasts((current) => [...current.slice(-2), { id, tone, title, description }]);
      window.setTimeout(() => dismiss(id), DURATION_MS);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (title, description) => toast({ tone: 'success', title, description }),
      error: (title, description) => toast({ tone: 'error', title, description }),
      info: (title, description) => toast({ tone: 'info', title, description }),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/*
        aria-live region so screen readers announce each toast. Positioned above the
        mobile bottom nav so it never sits underneath it.
      */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[90] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:left-auto sm:right-6 sm:items-end"
      >
        {toasts.map((item) => {
          const { icon: Icon, ring, iconClass } = TONES[item.tone];

          return (
            <div
              key={item.id}
              role={item.tone === 'error' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-3 rounded-xl bg-surface-raised p-3.5 shadow-lg ring-1',
                ring,
              )}
            >
              <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', iconClass)} aria-hidden="true" />

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{item.title}</p>
                {item.description && (
                  <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ink-soft">
                    {item.description}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="-m-1 shrink-0 rounded-lg p-1 text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToastProvider');
  return context;
}
