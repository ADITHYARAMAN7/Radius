import { Flame, TrendingUp, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PulseStatus } from '@/lib/types';

interface TrendingBadgeProps {
    status: PulseStatus;
    score?: number;
    className?: string;
}

/**
 * Event Pulse status badge.
 *
 * Visual indicators:
 *   TRENDING : Flame icon, vibrant rose/orange tone
 *   GROWING  : TrendingUp icon, amber/warm tone
 *   NORMAL   : Activity icon, subtle neutral tone
 */
export function TrendingBadge({ status, score, className }: TrendingBadgeProps) {
    const config: Record<
        PulseStatus,
        { label: string; style: string; icon: React.ReactNode }
    > = {
        TRENDING: {
            label: 'Trending',
            style: 'bg-rose-500/12 text-rose-700 dark:text-rose-300 ring-rose-500/25',
            icon: <Flame className="h-3 w-3 text-rose-500 animate-pulse" aria-hidden="true" />,
        },
        GROWING: {
            label: 'Growing',
            style: 'bg-amber-500/12 text-amber-700 dark:text-amber-300 ring-amber-500/25',
            icon: <TrendingUp className="h-3 w-3 text-amber-500" aria-hidden="true" />,
        },
        NORMAL: {
            label: 'Steady',
            style: 'bg-slate-500/12 text-slate-600 dark:text-slate-400 ring-slate-500/20',
            icon: <Activity className="h-3 w-3 text-slate-400" aria-hidden="true" />,
        },
    };

    const item = config[status] ?? config.NORMAL;

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1',
                item.style,
                className,
            )}
            title={`Community Momentum (Pulse) Score: ${score ?? 0}/100 — ${status}`}
        >
            {item.icon}
            {item.label}
            {score !== undefined && (
                <span className="font-mono text-[0.7rem] opacity-75">({score})</span>
            )}
        </span>
    );
}
