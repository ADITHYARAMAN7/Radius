import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth, type AuthedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';
import { CATEGORIES } from '../types';
import { getTrending } from '../services/pulseService';

export const trendingRouter = Router();

const trendingQuerySchema = z.object({
    page: z.coerce.number().int().min(1).max(500).optional(),
    pageSize: z.coerce.number().int().min(1).max(24).optional(),
    category: z.enum(CATEGORIES).optional(),
    neighborhood: z.string().trim().optional(),
    city: z.string().trim().optional(),
});

/**
 * GET /api/events/trending
 *
 * Returns upcoming active events ranked by community momentum (Pulse Score).
 *
 * The pulse score measures RECENT engagement growth — not lifetime popularity.
 * It uses RSVP timestamps from the existing Firestore subcollection.
 *
 * Auth is optional: signed-in users get isAttending / isOwner enrichment.
 *
 * Query params:
 *   page, pageSize  — standard pagination
 *   category        — filter candidates to a category before scoring
 *   neighborhood    — filter candidates by neighbourhood
 *   city            — filter candidates by city
 */
trendingRouter.get(
    '/trending',
    optionalAuth,
    asyncHandler(async (req: AuthedRequest, res) => {
        const query = trendingQuerySchema.parse(req.query);

        const result = await getTrending(
            {
                page: query.page,
                pageSize: query.pageSize,
                category: query.category,
                neighborhood: query.neighborhood,
                city: query.city,
            },
            req.user?.uid,
        );

        res.json(result);
    }),
);
