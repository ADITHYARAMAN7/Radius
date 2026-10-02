import { GoogleGenAI, Type } from '@google/genai';
import { capabilities, env } from '../config/env';
import { logger } from '../config/logger';
import { AppError } from '../middleware/error';
import { CATEGORIES, type AiSuggestion, type Category, type DateFilter } from '../types';
import { parseSearchLocally, suggestLocally } from './localAssistant';
import { getPlaceIndex } from './statsService';

/** Which engine answered: Gemini, or the rule-based assistant that needs no key. */
export type AiSource = 'gemini' | 'local';

let client: GoogleGenAI | null = null;

/**
 * One client, two deployment shapes:
 *   AI_PROVIDER=api    — Gemini Developer API with an API key (fastest to set up)
 *   AI_PROVIDER=vertex — Vertex AI using the Cloud Run service account, no key at all
 *
 * The second is what you want in production: credentials are never stored, and the
 * calls are billed and audited inside the same GCP project as everything else.
 */
function getClient(): GoogleGenAI {
  if (client) return client;

  if (!capabilities.ai) {
    throw AppError.unavailable(
      'The AI assistant is not configured on this deployment. Set GEMINI_API_KEY, or AI_PROVIDER=vertex with a project id.',
    );
  }

  client =
    env.aiProvider === 'vertex'
      ? new GoogleGenAI({ vertexai: true, project: env.projectId, location: env.vertexLocation })
      : new GoogleGenAI({ apiKey: env.geminiApiKey });

  logger.info('Gemini client initialised', { provider: env.aiProvider, model: env.geminiModel });
  return client;
}

const SUGGESTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: 'A clear, specific event title of 4 to 10 words. No clickbait, no emoji.',
    },
    description: {
      type: Type.STRING,
      description:
        'Two or three short paragraphs: what happens, who it suits, and what to bring or expect. Plain text, no markdown.',
    },
    summary: {
      type: Type.STRING,
      description: 'A single sentence under 140 characters, suitable for a preview card.',
    },
    category: {
      type: Type.STRING,
      enum: [...CATEGORIES],
      description: 'The single best-fitting category.',
    },
    tags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3 to 6 short lowercase tags, one or two words each, no hash symbol.',
    },
  },
  required: ['title', 'description', 'summary', 'category', 'tags'],
} as const;

const SYSTEM_INSTRUCTION = [
  'You help neighbours write listings for a community event board.',
  'Stay strictly faithful to the details you are given: never invent a date, time, price, address, venue, phone number or organiser name.',
  'If a detail is missing, write around it rather than guessing.',
  'Keep the tone warm, concrete and local. Avoid marketing language and exclamation marks.',
].join(' ');

function coerceCategory(value: unknown, fallback: Category): Category {
  return CATEGORIES.includes(value as Category) ? (value as Category) : fallback;
}

function coerceTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim().toLowerCase().replace(/^#/, ''))
    .filter((tag) => tag.length > 1 && tag.length <= 30)
    .slice(0, 6);
}

export interface AssistInput {
  title: string;
  description: string;
  category?: Category;
  city: string;
  neighborhood: string;
}

/**
 * Turns a rough note ("football match this sunday near college") into a polished
 * listing. Purely additive: the caller decides which suggested fields to accept, and
 * event creation never depends on this succeeding.
 */
export async function generateEventSuggestion(
  input: AssistInput,
): Promise<AiSuggestion & { source: AiSource }> {
  // No Gemini on this deployment: the built-in assistant does the same job with rules.
  if (!capabilities.ai) return { ...suggestLocally(input), source: 'local' };

  const ai = getClient();

  const place = [input.neighborhood, input.city].filter(Boolean).join(', ');

  const prompt = [
    'Improve this community event listing.',
    '',
    `Draft title: ${input.title || '(none given)'}`,
    `Draft description: ${input.description || '(none given)'}`,
    input.category ? `Organiser picked category: ${input.category}` : '',
    place ? `Location context: ${place}` : '',
    '',
    'Rewrite it so a neighbour scrolling the board immediately understands what it is and whether it is for them.',
    'Do not state a date or time in the description — the board renders those separately from its own fields.',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const response = await ai.models.generateContent({
      model: env.geminiModel,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
        maxOutputTokens: 1200,
        responseMimeType: 'application/json',
        responseSchema: SUGGESTION_SCHEMA,
      },
    });

    const text = response.text;
    if (!text) throw new Error('Gemini returned an empty response');

    const parsed = JSON.parse(text) as Record<string, unknown>;

    const suggestion: AiSuggestion = {
      title: String(parsed.title ?? input.title).trim().slice(0, 120),
      description: String(parsed.description ?? input.description).trim().slice(0, 5000),
      summary: String(parsed.summary ?? '').trim().slice(0, 200),
      category: coerceCategory(parsed.category, input.category ?? 'Other'),
      tags: coerceTags(parsed.tags),
    };

    logger.info('AI suggestion generated', {
      provider: env.aiProvider,
      model: env.geminiModel,
      category: suggestion.category,
    });

    return { ...suggestion, source: 'gemini' };
  } catch (error) {
    if (error instanceof AppError) throw error;

    const message = (error as { message?: string }).message ?? 'unknown error';
    logger.error('Gemini request failed, using the built-in assistant', {
      reason: message,
      model: env.geminiModel,
    });

    // A quota error or an outage should not turn the button into a dead end.
    return { ...suggestLocally(input), source: 'local' };
  }
}

const SEARCH_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    keywords: {
      type: Type.STRING,
      description: 'The free-text part of the query — topic words only, no place or date words.',
    },
    category: {
      type: Type.STRING,
      enum: [...CATEGORIES, 'Any'],
      description: 'The category the user is asking for, or "Any" if they did not imply one.',
    },
    dateFilter: {
      type: Type.STRING,
      enum: ['today', 'tomorrow', 'weekend', 'week', 'upcoming'],
      description: 'The time window implied by the query. Use "upcoming" when none is implied.',
    },
    neighborhood: { type: Type.STRING, description: 'Neighborhood or area named, else empty.' },
    city: { type: Type.STRING, description: 'City or town named, else empty.' },
  },
  required: ['keywords', 'category', 'dateFilter', 'neighborhood', 'city'],
} as const;

export interface SearchIntent {
  keywords: string;
  category: Category | null;
  dateFilter: DateFilter;
  neighborhood: string;
  city: string;
  source: AiSource;
}

async function parseSearchWithRules(query: string): Promise<SearchIntent> {
  const places = await getPlaceIndex().catch(() => ({ neighborhoods: [], cities: [] }));
  return { ...parseSearchLocally(query, places), source: 'local' };
}

/**
 * Parses a sentence like "free outdoor things to do with kids this weekend in Gandhipuram"
 * into the structured filters the Explore page already understands. Gemini does the
 * language work; the existing Firestore pipeline does the retrieval.
 */
export async function parseSearchIntent(query: string): Promise<SearchIntent> {
  if (!capabilities.ai) return parseSearchWithRules(query);

  const ai = getClient();

  try {
    const response = await ai.models.generateContent({
      model: env.geminiModel,
      contents: `Extract search filters from this query about local community events:\n"${query}"`,
      config: {
        systemInstruction:
          'You convert a natural-language query into structured event-search filters. Only extract what the query actually says; never invent a city or a date window.',
        temperature: 0,
        maxOutputTokens: 400,
        responseMimeType: 'application/json',
        responseSchema: SEARCH_SCHEMA,
      },
    });

    const text = response.text;
    if (!text) throw new Error('Gemini returned an empty response');

    const parsed = JSON.parse(text) as Record<string, unknown>;
    const rawCategory = String(parsed.category ?? 'Any');

    return {
      keywords: String(parsed.keywords ?? '').trim().slice(0, 120),
      category: CATEGORIES.includes(rawCategory as Category) ? (rawCategory as Category) : null,
      dateFilter: (['today', 'tomorrow', 'weekend', 'week', 'upcoming'] as const).includes(
        parsed.dateFilter as DateFilter as 'today',
      )
        ? (parsed.dateFilter as DateFilter)
        : 'upcoming',
      neighborhood: String(parsed.neighborhood ?? '').trim().slice(0, 100),
      city: String(parsed.city ?? '').trim().slice(0, 100),
      source: 'gemini',
    };
  } catch (error) {
    if (error instanceof AppError) throw error;

    logger.warn('Smart search parse failed, falling back to the built-in parser', {
      reason: (error as { message?: string }).message,
    });

    // Degrading to rule-based parsing is better than failing the search outright.
    return parseSearchWithRules(query);
  }
}
