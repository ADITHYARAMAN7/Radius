/**
 * intelligenceService.ts
 *
 * Local Relevance Score engine for the "Recommended for You" feature.
 *
 * This is a transparent, heuristic scoring system — NOT a prediction model or ML system.
 * Each event receives a 0–100 integer score computed from five configurable signals.
 * Human-readable reasons are returned alongside the score so the UI can explain
 * why each event was recommended.
 *
 * Signals and default weights:
 *   distance       30%   — how close the event is to the user's reported location
 *   interest match 25%   — whether the event category matches user interests
 *   time relevance 20%   — how soon the event is happening
 *   freshness      15%   — how recently the event was posted
 *   engagement     10%   — community RSVP count as a proxy for social proof
 *
 * All weights are configurable via RELEVANCE_WEIGHTS. They must sum to 1.0.
 * Signals gracefully return neutral values when data is unavailable.
 */

import { distanceKm } from '../utils/dates';
import type { EventRecord, Category, Paginated } from '../types';
import { listEvents } from './eventService';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface RelevanceWeights {
    distance: number;      // 0–1; distance from user location
    interest: number;      // 0–1; category-to-interest match
    timeRelevance: number; // 0–1; how soon the event starts
    freshness: number;     // 0–1; how recently the event was created
    engagement: number;    // 0–1; community RSVP count
}

/** Adjust these to change how the ranking is weighted. Must sum to 1.0. */
export const RELEVANCE_WEIGHTS: RelevanceWeights = {
    distance: 0.30,
    interest: 0.25,
    timeRelevance: 0.20,
    freshness: 0.15,
    engagement: 0.10,
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RecommendationContext {
    /** User's latitude, if available. */
    lat?: number;
    /** User's longitude, if available. */
    lng?: number;
    /** Categories the user is interested in. Empty array = no preference. */
    interests?: Category[];
    page?: number;
    pageSize?: number;
}

export interface RecommendedEvent extends EventRecord {
    /** 0–100 relevance score. */
    relevanceScore: number;
    /** 2–4 short human-readable reasons explaining the recommendation. */
    relevanceReasons: string[];
}

// ---------------------------------------------------------------------------
// Individual signal scorers (each returns 0.0–1.0)
// ---------------------------------------------------------------------------

/**
 * Distance score: 1.0 at 0 km, decays linearly to 0.0 at 50 km.
 * Returns 0.0 when no location is available (rather than a neutral 0.5)
 * so distance-lacking events don't unfairly win the top spots.
 */
function distanceScore(
    event: EventRecord,
    lat?: number,
    lng?: number,
): { score: number; reason: string | null } {
    if (
        lat === undefined ||
        lng === undefined ||
        event.latitude === null ||
        event.longitude === null
    ) {
        return { score: 0, reason: null };
    }

    const km = distanceKm(lat, lng, event.latitude, event.longitude);
    const score = Math.max(0, 1 - km / 50);

    let reason: string | null = null;
    if (km < 1) reason = 'Less than 1 km away';
    else if (km < 5) reason = `${km.toFixed(1)} km away`;
    else if (km < 20) reason = `${Math.round(km)} km away`;
    // Beyond 20 km we don't surface distance as a selling point.

    return { score, reason };
}

/**
 * Interest match score: 1.0 = category matches one of the user's interests,
 * 0.5 = no interests provided (neutral, not penalised), 0.0 = mismatch.
 */
function interestScore(
    event: EventRecord,
    interests?: Category[],
): { score: number; reason: string | null } {
    if (!interests || interests.length === 0) {
        return { score: 0.5, reason: null };
    }

    const match = interests.includes(event.category);
    return {
        score: match ? 1.0 : 0.0,
        reason: match ? `Matches your ${event.category} interest` : null,
    };
}

const HOUR_MS = 3_600_000;

/**
 * Time relevance: rewards upcoming events, with a steep boost for < 24 h.
 * Events starting now or in the past return 0 (they should be excluded by the
 * activeonly Firestore query, but we guard defensively).
 */
function timeRelevanceScore(
    event: EventRecord,
): { score: number; reason: string | null } {
    const hoursAway = (new Date(event.startsAt).getTime() - Date.now()) / HOUR_MS;

    if (hoursAway <= 0) return { score: 0, reason: null };

    let score: number;
    let reason: string;

    if (hoursAway < 24) {
        score = 1.0;
        reason = 'Happening today';
    } else if (hoursAway < 48) {
        score = 0.85;
        reason = 'Happening tomorrow';
    } else if (hoursAway < 168) {
        const days = Math.ceil(hoursAway / 24);
        score = 0.65;
        reason = `Coming up in ${days} days`;
    } else if (hoursAway < 336) {
        score = 0.45;
        reason = 'Happening in the next 2 weeks';
    } else {
        score = 0.2;
        reason = 'Upcoming event';
    }

    return { score, reason };
}

/**
 * Freshness: rewards recently posted events.
 */
function freshnessScore(
    event: EventRecord,
): { score: number; reason: string | null } {
    if (!event.createdAt) return { score: 0.2, reason: null };

    const hoursOld = (Date.now() - new Date(event.createdAt).getTime()) / HOUR_MS;

    let score: number;
    let reason: string | null = null;

    if (hoursOld < 24) {
        score = 1.0;
        reason = 'Just posted';
    } else if (hoursOld < 72) {
        score = 0.8;
        reason = 'Posted recently';
    } else if (hoursOld < 168) {
        score = 0.6;
    } else if (hoursOld < 336) {
        score = 0.4;
    } else {
        score = 0.2;
    }

    return { score, reason };
}

/**
 * Engagement: uses RSVP count as a proxy for community interest.
 */
function engagementScore(
    event: EventRecord,
): { score: number; reason: string | null } {
    const count = event.rsvpCount ?? 0;

    let score: number;
    let reason: string | null = null;

    if (count === 0) {
        score = 0;
    } else if (count <= 5) {
        score = 0.4;
    } else if (count <= 15) {
        score = 0.6;
    } else if (count <= 40) {
        score = 0.8;
        reason = 'Good community engagement';
    } else {
        score = 1.0;
        reason = 'Highly popular in your area';
    }

    return { score, reason };
}

// ---------------------------------------------------------------------------
// Main scoring function (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Scores a single event against the given recommendation context.
 * Returns a 0–100 integer score plus 2–4 human-readable reasons.
 *
 * This is a pure function — it reads no external state, making it easily testable.
 */
export function scoreEvent(
    event: EventRecord,
    context: RecommendationContext,
    weights: RelevanceWeights = RELEVANCE_WEIGHTS,
): { score: number; reasons: string[] } {
    const dist = distanceScore(event, context.lat, context.lng);
    const interest = interestScore(event, context.interests);
    const time = timeRelevanceScore(event);
    const fresh = freshnessScore(event);
    const engage = engagementScore(event);

    const rawScore =
        dist.score * weights.distance +
        interest.score * weights.interest +
        time.score * weights.timeRelevance +
        fresh.score * weights.freshness +
        engage.score * weights.engagement;

    const score = Math.min(100, Math.max(0, Math.round(rawScore * 100)));

    // Build up to 4 reasons, prioritised by signal importance.
    const candidates: string[] = [
        interest.reason,
        dist.reason,
        time.reason,
        fresh.reason,
        engage.reason,
    ].filter((r): r is string => r !== null);

    // Deduplicate: time + freshness can overlap ("Just posted" + "Happening today").
    const reasons = [...new Set(candidates)].slice(0, 4);

    // Always surface at least one reason so cards are never empty.
    if (reasons.length === 0) reasons.push('Upcoming community event');

    return { score, reasons };
}

// ---------------------------------------------------------------------------
// Query + rank function
// ---------------------------------------------------------------------------

const DEFAULT_RECOMMENDATION_PAGE_SIZE = 6;
// We pull a broader set of active events then rank in-memory.
// This is intentionally modest: we rely on the existing 400-doc cap in listEvents.
const CANDIDATE_FETCH_SIZE = 60;

/**
 * Fetches upcoming active events, scores and sorts them by relevance,
 * then returns the requested page as a `Paginated<RecommendedEvent>`.
 *
 * Reuses the existing `listEvents` function to respect all existing query machinery.
 */
export async function getRecommendations(
    context: RecommendationContext,
    viewerUid?: string,
): Promise<Paginated<RecommendedEvent>> {
    const page = Math.max(1, context.page ?? 1);
    const pageSize = Math.min(24, Math.max(1, context.pageSize ?? DEFAULT_RECOMMENDATION_PAGE_SIZE));

    // Fetch a wider candidate set using the existing service. We sort by 'soonest'
    // first so the time-relevance signal has a reasonable candidate pool.
    const candidates = await listEvents(
        { dateFilter: 'upcoming', sort: 'soonest', pageSize: CANDIDATE_FETCH_SIZE, page: 1 },
        viewerUid,
    );

    // Score every candidate against the user context.
    const scored: RecommendedEvent[] = candidates.items.map((event) => {
        const { score, reasons } = scoreEvent(event, context);
        return { ...event, relevanceScore: score, relevanceReasons: reasons };
    });

    // Sort descending by score, then by start time as a tiebreaker.
    scored.sort(
        (a, b) =>
            b.relevanceScore - a.relevanceScore ||
            new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
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
