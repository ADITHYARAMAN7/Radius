import { z } from 'zod';
import { capabilities } from '../config/env';
import { isLocalUploadUrl } from '../services/storageService';
import { CATEGORIES } from '../types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const trimmed = (max: number) => z.string().trim().max(max);

/**
 * `z.string().url()` is not a safety check — it is backed by `new URL()`, which happily
 * accepts `javascript:alert(1)`, `data:text/html,...` and `file:///etc/passwd`. This value
 * ends up in an `<img src>`, so the scheme has to be constrained explicitly.
 *
 * https only: it rules out the script-bearing schemes, blocks mixed-content warnings, and
 * matches what the upload endpoint actually returns.
 */
const httpsUrl = (max = 600) =>
  z
    .string()
    .trim()
    .max(max)
    .superRefine((value, ctx) => {
      // The one exception to "https only": a path this API issued itself for a photo kept
      // on local disk in development. It is matched against a strict pattern, so it cannot
      // smuggle a scheme, a host or a traversal.
      if (capabilities.localStorage && isLocalUploadUrl(value)) return;

      let parsed: URL;
      try {
        parsed = new URL(value);
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'That image URL is not valid.' });
        return;
      }

      if (parsed.protocol !== 'https:') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Image URLs must start with https://',
        });
        return;
      }

      if (!parsed.hostname) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'That image URL is not valid.' });
      }
    });

export const categorySchema = z.enum(CATEGORIES);

/**
 * Server-side validation mirrors the client form rules. The browser copy exists for
 * fast feedback; this copy is the one that actually protects the data, because a
 * request can always be sent straight to the API.
 */
export const eventInputSchema = z
  .object({
    title: trimmed(120).min(5, 'Give your event a title of at least 5 characters.'),
    description: trimmed(5000).min(20, 'Add a description of at least 20 characters.'),
    summary: trimmed(200).optional().default(''),
    category: categorySchema,
    tags: z.array(trimmed(30).min(1)).max(10, 'Up to 10 tags.').optional().default([]),

    date: z.string().regex(DATE_RE, 'Pick a valid date.'),
    startTime: z.string().regex(TIME_RE, 'Start time must be in HH:mm format.'),
    endTime: z.string().regex(TIME_RE, 'End time must be in HH:mm format.'),
    /** Minutes, from getTimezoneOffset() in the browser. */
    tzOffsetMinutes: z.number().int().min(-840).max(840).optional(),

    location: trimmed(140).min(3, 'Name the venue or meeting point.'),
    address: trimmed(300).min(5, 'Add a street address.'),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    neighborhood: trimmed(100).min(2, 'Add a neighborhood.'),
    city: trimmed(100).min(2, 'Add a city.'),

    imageUrl: httpsUrl().nullable().optional(),
    imagePath: trimmed(500).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.endTime <= value.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'End time must be after the start time.',
      });
    }
  });

export type EventInput = z.infer<typeof eventInputSchema>;

/** Edits may be partial, but any field provided still has to be valid. */
export const eventUpdateSchema = eventInputSchema.innerType().partial().superRefine((value, ctx) => {
  if (value.startTime && value.endTime && value.endTime <= value.startTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endTime'],
      message: 'End time must be after the start time.',
    });
  }
});

export type EventUpdateInput = z.infer<typeof eventUpdateSchema>;

const optionalString = z.string().trim().optional();

export const eventQuerySchema = z.object({
  search: optionalString,
  category: categorySchema.optional(),
  neighborhood: optionalString,
  city: optionalString,
  date: z.enum(['today', 'tomorrow', 'weekend', 'week', 'upcoming', 'all', 'past']).optional(),
  sort: z.enum(['soonest', 'popular', 'recent']).optional(),
  page: z.coerce.number().int().min(1).max(500).optional(),
  pageSize: z.coerce.number().int().min(1).max(60).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(500).optional(),
});

/** A 6-week month grid plus a day of margin either side. */
const MAX_CALENDAR_SPAN_MS = 43 * 24 * 60 * 60 * 1000;

/**
 * Month view range. `from`/`to` are instants the browser computed from its own local
 * midnights, so the server never has to guess the user's timezone.
 */
export const calendarQuerySchema = z
  .object({
    from: z.string().datetime({ offset: true, message: 'from must be an ISO date-time.' }),
    to: z.string().datetime({ offset: true, message: 'to must be an ISO date-time.' }),
    category: categorySchema.optional(),
    neighborhood: optionalString,
    city: optionalString,
  })
  .superRefine((value, ctx) => {
    const span = Date.parse(value.to) - Date.parse(value.from);
    if (!(span > 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'to must be after from.' });
    } else if (span > MAX_CALENDAR_SPAN_MS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'A calendar range can be at most 6 weeks.' });
    }
  });

export const profileUpdateSchema = z.object({
  displayName: trimmed(80).min(2, 'Your name needs at least 2 characters.').optional(),
  bio: trimmed(500).optional(),
  neighborhood: trimmed(100).optional(),
  city: trimmed(100).optional(),
  photoURL: httpsUrl().nullable().optional(),
});

export const aiAssistSchema = z.object({
  title: trimmed(200).optional().default(''),
  description: trimmed(2000).optional().default(''),
  category: categorySchema.optional(),
  city: trimmed(100).optional().default(''),
  neighborhood: trimmed(100).optional().default(''),
});

/**
 * Snap-a-Poster text fields. They arrive as multipart form fields next to an optional
 * image, so everything is a string; an unknown timezone falls back in the service.
 */
export const aiExtractSchema = z.object({
  text: z
    .string()
    .trim()
    .max(4000, 'That message is too long — paste up to 4000 characters.')
    .optional()
    .default(''),
  timezone: trimmed(64).optional().default(''),
});

export const commentSchema = z.object({
  text: z
    .string()
    .trim()
    .min(2, 'Write at least a couple of characters.')
    .max(500, 'Keep it under 500 characters.'),
});

export const checkInSchema = z.object({
  code: z.string().trim().min(4, 'Enter the check-in code.').max(12, 'That code is too long.'),
});

export const geocodeSchema = z
  .object({
    address: trimmed(300).optional().default(''),
    neighborhood: trimmed(100).optional().default(''),
    city: trimmed(100).optional().default(''),
  })
  .refine((value) => Boolean(value.address || value.neighborhood || value.city), {
    message: 'Add an address, a neighbourhood or a city first.',
  });

export const rsvpStatusSchema = z.object({
  status: z.enum(['going', 'cancelled']).optional().default('going'),
});
