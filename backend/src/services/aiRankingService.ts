import { Type } from '@google/genai';
import { generateWithFallback } from './aiService';
import type { EventRecord } from '../types';

const RANKING_SCHEMA = {
  type: Type.ARRAY,
  description: 'A list of ranked event recommendations based on the user query.',
  items: {
    type: Type.OBJECT,
    properties: {
      eventId: { type: Type.STRING, description: 'The ID of the recommended event.' },
      reason: { type: Type.STRING, description: 'A short 1-sentence reason why this event matches the query.' },
    },
    required: ['eventId', 'reason'],
  },
} as const;

export async function rankEventsWithAi(query: string, events: EventRecord[]): Promise<Array<{ eventId: string, reason: string }>> {
  if (events.length === 0) return [];
  
  const eventsPayload = events.map(e => ({
    id: e.id,
    title: e.title,
    summary: e.summary,
    category: e.category,
    date: e.date,
  }));
  
  try {
    const { response } = await generateWithFallback('event ranking', {
      contents: `Query: "${query}"\n\nEvents:\n${JSON.stringify(eventsPayload, null, 2)}\n\nSelect the best matching events and provide a 1-sentence reason for each.`,
      config: {
        systemInstruction: 'You act as an event recommendation assistant. Evaluate the provided list of events against the user query. Return an array of the best matching events, ranking them from best to worst. Include a short, conversational 1-sentence reason for why each was chosen.',
        temperature: 0.2,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        responseSchema: RANKING_SCHEMA,
      }
    });

    const text = response.text;
    if (!text) return [];
    
    return JSON.parse(text) as Array<{ eventId: string, reason: string }>;
  } catch (error) {
    console.error('Error ranking events with AI:', error);
    return [];
  }
}
