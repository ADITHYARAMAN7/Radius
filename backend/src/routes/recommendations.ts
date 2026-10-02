import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth, type AuthedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';
import { CATEGORIES, type Category } from '../types';
import { getRecommendations } from '../services/intelligenceService';

export const recommendationsRouter = Router();

const recommendationsQuerySchema = z.object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    /**
     * Comma-separated list of preferred categories,
     * e.g. ?interests=Sports,Technology
     */
    interests: z
        .string()
        .optional()
        .transform((val) => {
            if (!val) return [];
            return val
                .split(',')
                .map((s) => s.trim())
                .filter((s): s is Category => CATEGORIES.includes(s as Category));
        }),
    page: z.coerce.number().int().min(1).max(500).optional(),
    pageSize: z.coerce.number().int().min(1).max(24).optional(),
});

/**
 * GET /api/events/recommended
 *
 * Returns upcoming active events sorted by Local Relevance Score.
 * Auth is optional — works for anonymous visitors, enriches with
 * isAttending/isOwner when signed in.
 *
 * Query params:
 *   lat, lng       — user position (optional)
 *   interests      — comma-separated Category values (optional)
 *   page, pageSize — standard pagination
 */
recommendationsRouter.get(
    '/recommended',
    optionalAuth,
    asyncHandler(async (req: AuthedRequest, res) => {
        const query = recommendationsQuerySchema.parse(req.query);

        const result = await getRecommendations(
            {
                lat: query.lat,
                lng: query.lng,
                interests: query.interests,
                page: query.page,
                pageSize: query.pageSize,
            },
            req.user?.uid,
        );

        res.json(result);
    }),
);
