/**
 * verify-intelligence.ts
 *
 * Unit tests for the Event Intelligence Service scoring engine.
 *
 * These tests exercise the pure `scoreEvent()` function directly — no Firestore,
 * no emulator, and no network calls needed.
 *
 * Run:
 *   npx tsx backend/src/scripts/verify-intelligence.ts
 */

import { scoreEvent, getRecommendations, type RecommendationContext } from '../services/intelligenceService';
import type { EventRecord, Category } from '../types';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ''): void {
    if (condition) {
        passed += 1;
        console.log(`  PASS  ${name}`);
    } else {
        failed += 1;
        console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysFromNow(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString();
}

/** Build a minimal EventRecord suitable for scoring tests. */
function makeEvent(overrides: Partial<EventRecord> & { category: Category }): EventRecord {
    return {
        id: 'test-event',
        title: 'Test Event Title Here',
        description: 'A description for the test event sufficient for validation.',
        summary: 'A summary.',
        tags: [],
        date: '2026-10-10',
        startTime: '18:00',
        endTime: '20:00',
        startsAt: daysFromNow(1),
        endsAt: daysFromNow(1),
        location: 'Test Venue',
        address: '1 Test Street, Coimbatore',
        latitude: 11.0244,
        longitude: 77.0183,
        neighborhood: 'Peelamedu',
        city: 'Coimbatore',
        imageUrl: null,
        imagePath: null,
        creatorId: 'seed-user',
        creatorName: 'Test Organiser',
        creatorPhotoURL: null,
        rsvpCount: 10,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Test: Nearby event (high distance score)
// ---------------------------------------------------------------------------
console.log('\n=== Test 1: Nearby event gets high distance contribution ===');
{
    const event = makeEvent({ category: 'Sports', latitude: 11.0250, longitude: 77.0190 });
    const context: RecommendationContext = { lat: 11.0244, lng: 77.0183 };

    const { score, reasons } = scoreEvent(event, context);

    // The event is < 1 km away — it should score above 60.
    check('Nearby event scores above 60', score > 60, `got ${score}`);
    check('Nearby event has a distance reason', reasons.some((r) => r.includes('km') || r.includes('Less than')));
}

// ---------------------------------------------------------------------------
// Test: Far event (low distance score)
// ---------------------------------------------------------------------------
console.log('\n=== Test 2: Far event gets low distance contribution ===');
{
    // Vadavalli is ~11 km from Peelamedu, well beyond the 50 km cap but enough to see decay.
    const event = makeEvent({ category: 'Sports', latitude: 11.0272, longitude: 76.9036 });
    const ctx: RecommendationContext = { lat: 11.0244, lng: 77.0183 };

    const near = makeEvent({ category: 'Sports', latitude: 11.0250, longitude: 77.0190 });
    const nearScore = scoreEvent(near, ctx).score;
    const farScore = scoreEvent(event, ctx).score;

    check('Far event scores lower than nearby event', farScore < nearScore, `near=${nearScore} far=${farScore}`);
}

// ---------------------------------------------------------------------------
// Test: Matching category/interest
// ---------------------------------------------------------------------------
console.log('\n=== Test 3: Matching category gives interest reason ===');
{
    const event = makeEvent({ category: 'Technology' });
    const context: RecommendationContext = { interests: ['Technology', 'Sports'] };

    const { score, reasons } = scoreEvent(event, context);

    check('Matching category scores above non-matching baseline', score > 40, `got ${score}`);
    check('Interest reason mentions the category', reasons.some((r) => r.includes('Technology')));
}

// ---------------------------------------------------------------------------
// Test: Non-matching category
// ---------------------------------------------------------------------------
console.log('\n=== Test 4: Non-matching category has no interest reason ===');
{
    const event = makeEvent({ category: 'Food' });
    const context: RecommendationContext = { interests: ['Technology', 'Sports'] };

    const { reasons } = scoreEvent(event, context);

    check('Non-matching category has no interest-match reason', !reasons.some((r) => r.includes('interest')));
}

// ---------------------------------------------------------------------------
// Test: Upcoming event (happening tomorrow)
// ---------------------------------------------------------------------------
console.log('\n=== Test 5: Event happening tomorrow gets time reason ===');
{
    const event = makeEvent({
        category: 'Community',
        startsAt: daysFromNow(1),
        endsAt: daysFromNow(1),
    });
    const context: RecommendationContext = {};

    const { reasons } = scoreEvent(event, context);

    check('Event happening tomorrow has time-relevance reason', reasons.some((r) => r.toLowerCase().includes('tomorrow') || r.toLowerCase().includes('today')));
}

// ---------------------------------------------------------------------------
// Test: No location provided
// ---------------------------------------------------------------------------
console.log('\n=== Test 6: Score is non-zero even without user location ===');
{
    const event = makeEvent({ category: 'Music' });
    const context: RecommendationContext = {}; // no lat/lng

    const { score, reasons } = scoreEvent(event, context);

    check('Score > 0 with no location', score > 0, `got ${score}`);
    check('Returns at least one reason with no location', reasons.length >= 1);
}

// ---------------------------------------------------------------------------
// Test: No interests provided
// ---------------------------------------------------------------------------
console.log('\n=== Test 7: Score is non-zero even without user interests ===');
{
    const event = makeEvent({ category: 'Education' });
    const context: RecommendationContext = { lat: 11.0244, lng: 77.0183 }; // no interests

    const { score, reasons } = scoreEvent(event, context);

    check('Score > 0 with no interests', score > 0, `got ${score}`);
    // Interest should be neutral (0.5 × 0.25 = 0.125 contribution) rather than 0.
    const matchScore = scoreEvent(makeEvent({ category: 'Education' }), { interests: ['Education'] }).score;
    const noInterestScore = scoreEvent(makeEvent({ category: 'Education' }), {}).score;
    check('No-interest score is between 0 and full-match score', noInterestScore > 0 && noInterestScore <= matchScore);
}

// ---------------------------------------------------------------------------
// Test: Pagination shape
// ---------------------------------------------------------------------------
console.log('\n=== Test 8: Pagination shape is correct ===');
{
    // Test the shape of the paginated output by scoring a batch manually.
    // We don't call getRecommendations (needs Firestore) — instead we simulate
    // the pagination logic by verifying the public interface contract.

    const events = Array.from({ length: 10 }, (_, i) =>
        makeEvent({ id: `event-${i}`, category: 'Community', rsvpCount: i }),
    );

    const scored = events.map((e) => {
        const { score, reasons } = scoreEvent(e, {});
        return { ...e, relevanceScore: score, relevanceReasons: reasons };
    });

    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

    const page = 1;
    const pageSize = 3;
    const total = scored.length;
    const items = scored.slice((page - 1) * pageSize, page * pageSize);
    const totalPages = Math.ceil(total / pageSize);
    const hasMore = page * pageSize < total;

    check('Page 1 has 3 items', items.length === 3, `got ${items.length}`);
    check('Total pages is 4', totalPages === 4, `got ${totalPages}`);
    check('hasMore is true on page 1', hasMore === true);
    check('Each scored item has relevanceScore and relevanceReasons', items.every((e) => typeof e.relevanceScore === 'number' && Array.isArray(e.relevanceReasons)));
}

// ---------------------------------------------------------------------------
// Test: Score bounds
// ---------------------------------------------------------------------------
console.log('\n=== Test 9: Score is always 0–100 ===');
{
    const scenarios: [Partial<EventRecord> & { category: Category }, RecommendationContext][] = [
        [{ category: 'Sports', rsvpCount: 999, latitude: 11.0244, longitude: 77.0183, createdAt: new Date().toISOString() },
        { lat: 11.0244, lng: 77.0183, interests: ['Sports'] }],
        [{ category: 'Music', rsvpCount: 0, latitude: null, longitude: null, createdAt: null },
        {}],
        [{ category: 'Yard Sale', rsvpCount: 5 },
        { interests: ['Technology'], lat: 0, lng: 0 }],
    ];

    for (const [overrides, ctx] of scenarios) {
        const event = makeEvent(overrides);
        const { score } = scoreEvent(event, ctx);
        check(`Score for ${overrides.category} is between 0 and 100`, score >= 0 && score <= 100, `got ${score}`);
    }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'='.repeat(60)}`);
console.log(`Intelligence tests: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
