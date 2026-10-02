/**
 * pulseService.ts
 *
 * Event Pulse — Community Momentum Scoring.
 *
 * This system identifies events that are GAINING community interest, not just events
 * with the most total RSVPs. An event with 5 RSVPs in the past 24 hours may be more
 * "trending" than one with 40 RSVPs accumulated over 3 weeks.
 *
 * DATA SOURCES (existing Firestore data only — nothing invented):
 *   - events/{id}/rsvps/{uid}.createdAt   — RSVP timestamp, for recent-window queries
 *   - events/{id}.rsvpCount               — total RSVP count, for engagement floor signal
 *   - events/{id}.createdAt               — event freshness
 *
 * SCORING FORMULA:
 *   recentVelocity = recentRsvps / RECENT_WINDOW_DAYS    (RSVPs per day, recent window)
 *   velocityScore  = clamp(recentVelocity / 5, 0, 1)    (saturates at 5 RSVPs/day)
 *   growthFactor   = recentRsvps / max(baselineRsvps, 1) (ratio vs prior equal window)
 *   growthScore    = clamp((growthFactor – 1) / 4, 0, 1) (5x growth = 1.0)
 *   totalScore     = clamp(totalRsvps / 40, 0, 1)        (saturates at 40 total RSVPs)
 *
 *   pulseScore = (velocityScore * 0.50 + growthScore * 0.35 + totalScore * 0.15) * 100
 *
 * CLASSIFICATION (configurable via PULSE_THRESHOLDS):
 *   TRENDING : pulseScore >= 60
 *   GROWING  : pulseScore >= 25
 *   NORMAL   : pulseScore <  25
 *
 * NOT a prediction model. Does not claim to predict future popularity.
 */

import { Timestamp, getDb } from '../config/firebase';
import { listEvents } from './eventService';
import type { EventRecord, Category, Paginated } from '../types';

// ---------------------------------------------------------------------------
// Configuration — adjust these to rebalance the system
// ---------------------------------------------------------------------------

export interface PulseThresholds {
    trending: number; // score >= this → TRENDING
    growing: number;  // score >= this → GROWING
    // below growing = NORMAL
}

export interface PulseWeights {
    velocity: number;  // recent RSVPs per day
    growth: number;    // growth ratio vs baseline window
    total: number;     // total engagement floor
}

export interface PulseWindows {
    recentDays: number;   // "recent" window (default 7 days)
    baselineDays: number; // "prior" comparison window (default 7 days)
}

export const PULSE_THRESHOLDS: PulseThresholds = {
    trending: 60,
    growing: 25,
};

export const PULSE_WEIGHTS: PulseWeights = {
    velocity: 0.50,
    growth: 0.35,
    total: 0.15,
};

export const PULSE_WINDOWS: PulseWindows = {
    recentDays: 7,
    baselineDays: 7,
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PulseStatus = 'NORMAL' | 'GROWING' | 'TRENDING';

export interface TrendingEvent extends EventRecord {
    pulseScore: number;
    pulseStatus: PulseStatus;
    pulseReasons: string[];
}

export interface PulseTrendingOptions {
    page?: number;
    pageSize?: number;
    category?: Category;
    neighborhood?: string;
    city?: string;
}

// ---------------------------------------------------------------------------
// Pure scoring functions (exported for unit testing — no Firestore calls)
// ---------------------------------------------------------------------------

/**
 * Classifies an event's pulse status from raw signal counts.
 * Pure function — no side effects.
 */
export function classifyPulse(
    pulseScore: number,
    thresholds: PulseThresholds = PULSE_THRESHOLDS,
): PulseStatus {
    if (pulseScore >= thresholds.trending) return 'TRENDING';
    if (pulseScore >= thresholds.growing) return 'GROWING';
    return 'NORMAL';
}

/**
 * Computes a 0–100 pulse score from recent/baseline RSVP counts and the total.
 * Pure function — no side effects.
 *
 * @param recentRsvps  — RSVPs in the last `recentDays` days
 * @param baselineRsvps — RSVPs in the preceding `baselineDays` days
 * @param totalRsvps   — total lifetime RSVP count
 * @param recentDays   — window length (default: PULSE_WINDOWS.recentDays)
 */
export function scorePulse(
    recentRsvps: number,
    baselineRsvps: number,
    totalRsvps: number,
    recentDays: number = PULSE_WINDOWS.recentDays,
    weights: PulseWeights = PULSE_WEIGHTS,
): number {
    const clamp = (v: number) => Math.max(0, Math.min(1, v));

    // RSVPs per day in the recent window, normalised to 0–1 (saturates at 5/day)
    const recentVelocity = recentRsvps / Math.max(1, recentDays);
    const velocityScore = clamp(recentVelocity / 5);

    // Growth ratio vs the baseline window (1.0 = flat, 2.0 = doubled, 5.0 = 5×)
    // Saturates at 5× growth (value 5.0 → normalised to 1.0 via /4)
    const growthFactor = recentRsvps / Math.max(baselineRsvps, 1);
    const growthScore = clamp((growthFactor - 1) / 4);

    // Total engagement as a floor signal (saturates at 40 RSVPs)
    const totalScore = clamp(totalRsvps / 40);

    const raw =
        velocityScore * weights.velocity +
        growthScore * weights.growth +
        totalScore * weights.total;

    return Math.min(100, Math.max(0, Math.round(raw * 100)));
}

/**
 * Generates 1–3 human-readable pulse reasons.
 * Pure function — never invents data that was not actually measured.
 */
export function buildPulseReasons(
    recentRsvps: number,
    baselineRsvps: number,
    totalRsvps: number,
    status: PulseStatus,
    eventCreatedAt: string | null,
    recentDays: number = PULSE_WINDOWS.recentDays,
): string[] {
    const reasons: string[] = [];

    // Reason 1: recent RSVP count
    if (recentRsvps >= 3) {
        const unit = recentDays === 1 ? 'day' : `${recentDays} days`;
        reasons.push(`${recentRsvps} new RSVPs in the last ${unit}`);
    } else if (recentRsvps > 0 && status !== 'NORMAL') {
        reasons.push(`${recentRsvps} new RSVP${recentRsvps > 1 ? 's' : ''} recently`);
    }

    // Reason 2: growth rate vs baseline
    if (baselineRsvps > 0 && recentRsvps > 0) {
        const growthPct = Math.round(((recentRsvps - baselineRsvps) / baselineRsvps) * 100);
        if (growthPct >= 50) {
            reasons.push(`Engagement up ${growthPct}% this week`);
        }
    } else if (recentRsvps > 0 && baselineRsvps === 0 && totalRsvps > 0) {
        // All RSVPs came in the recent window — the event is new and gaining attention.
        reasons.push('Gaining attention quickly');
    }

    // Reason 3: total popularity
    if (totalRsvps >= 10 && reasons.length < 3) {
        reasons.push(`${totalRsvps} people going`);
    }

    // Reason 4: new event with any activity
    if (reasons.length === 0 && eventCreatedAt) {
        const ageHours = (Date.now() - new Date(eventCreatedAt).getTime()) / 3_600_000;
        if (ageHours < 72 && totalRsvps > 0) {
            reasons.push('New event gaining community interest');
        }
    }

    // Always guarantee at least one reason when status is not NORMAL
    if (reasons.length === 0 && status !== 'NORMAL') {
        reasons.push('Community activity picking up');
    }

    return reasons.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Firestore data fetcher + ranker
// ---------------------------------------------------------------------------

const DEFAULT_TRENDING_PAGE_SIZE = 6;
// Cap candidate pool to avoid reading thousands of docs
const CANDIDATE_LIMIT = 40;
// RSVP subcollection read limit per window per event
const RSVP_WINDOW_LIMIT = 50;

/**
 * Fetches upcoming active events, queries their RSVP subcollections for
 * recent and baseline windows, scores each event, and returns a sorted
 * paginated list of TrendingEvent objects.
 */
export async function getTrending(
    options: PulseTrendingOptions = {},
    viewerUid?: string,
): Promise<Paginated<TrendingEvent>> {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(24, Math.max(1, options.pageSize ?? DEFAULT_TRENDING_PAGE_SIZE));

    const now = new Date();
    const recentCutoff = new Date(now.getTime() - PULSE_WINDOWS.recentDays * 86_400_000);
    const baselineCutoff = new Date(recentCutoff.getTime() - PULSE_WINDOWS.baselineDays * 86_400_000);

    // Fetch candidate events using existing listEvents machinery
    const candidates = await listEvents(
        {
            dateFilter: 'upcoming',
            sort: 'popular',
            pageSize: CANDIDATE_LIMIT,
            page: 1,
            category: options.category,
            neighborhood: options.neighborhood,
            city: options.city,
        },
        viewerUid,
    );

    const db = getDb();

    // For each event, count RSVPs in the recent and baseline windows
    const scored: TrendingEvent[] = await Promise.all(
        candidates.items.map(async (event) => {
            const rsvpRef = db.collection('events').doc(event.id).collection('rsvps');

            const [recentSnap, baselineSnap] = await Promise.all([
                rsvpRef
                    .where('createdAt', '>=', Timestamp.fromDate(recentCutoff))
                    .limit(RSVP_WINDOW_LIMIT)
                    .get(),
                rsvpRef
                    .where('createdAt', '>=', Timestamp.fromDate(baselineCutoff))
                    .where('createdAt', '<', Timestamp.fromDate(recentCutoff))
                    .limit(RSVP_WINDOW_LIMIT)
                    .get(),
            ]);

            const recentRsvps = recentSnap.size;
            const baselineRsvps = baselineSnap.size;
            const totalRsvps = event.rsvpCount ?? 0;

            const pulseScore = scorePulse(recentRsvps, baselineRsvps, totalRsvps);
            const pulseStatus = classifyPulse(pulseScore);
            const pulseReasons = buildPulseReasons(
                recentRsvps,
                baselineRsvps,
                totalRsvps,
                pulseStatus,
                event.createdAt,
            );

            return { ...event, pulseScore, pulseStatus, pulseReasons };
        }),
    );

    // Sort: TRENDING first, then GROWING, then NORMAL; ties broken by pulseScore desc
    const STATUS_ORDER: Record<PulseStatus, number> = { TRENDING: 0, GROWING: 1, NORMAL: 2 };
    scored.sort(
        (a, b) =>
            STATUS_ORDER[a.pulseStatus] - STATUS_ORDER[b.pulseStatus] ||
            b.pulseScore - a.pulseScore,
    );

    const total = scored.length;
    const start = (page - 1) * pageSize;
    const items = scored.slice(start, start + pageSize);

    return {
        items,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        hasMore: start + pageSize < total,
    };
}
