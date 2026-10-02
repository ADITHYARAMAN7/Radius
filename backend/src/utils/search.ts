const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'your', 'our', 'are', 'was',
  'will', 'you', 'all', 'can', 'has', 'have', 'into', 'out', 'about', 'near',
]);

export function normalise(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Matching key for neighbourhood and city names: lowercase letters and digits only.
 * Google writes "R.S. Puram", people write "R S Puram" or "RS Puram" — all become
 * "rspuram", so the neighbourhood filter treats them as the same place.
 * Kept separate from normalise(), which keyword search relies on.
 */
export function placeKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Tokens stored on the document so a keyword match never requires reading the whole
 * description. Firestore has no full-text index; keeping tokens on the document is
 * what makes the in-memory relevance pass cheap.
 */
export function buildKeywords(parts: Array<string | undefined | null>): string[] {
  const tokens = new Set<string>();

  for (const part of parts) {
    if (!part) continue;
    for (const raw of normalise(part).split(/[^a-z0-9]+/)) {
      if (raw.length < 3 || STOP_WORDS.has(raw)) continue;
      tokens.add(raw);
    }
  }

  // Firestore caps array fields; 60 tokens is far more than enough for matching.
  return Array.from(tokens).slice(0, 60);
}

export interface Searchable {
  title: string;
  description: string;
  summary?: string;
  category: string;
  tags: string[];
  location: string;
  address: string;
  neighborhood: string;
  city: string;
}

/**
 * Weighted relevance score. Returns 0 when the record does not match at all, so the
 * caller can both filter and order by the same number.
 */
export function relevanceScore(record: Searchable, query: string): number {
  const q = normalise(query);
  if (!q) return 1;

  const terms = q.split(/\s+/).filter(Boolean);
  if (!terms.length) return 1;

  const fields: Array<[string, number]> = [
    [normalise(record.title), 10],
    [normalise(record.category), 6],
    [normalise(record.neighborhood), 6],
    [normalise(record.city), 5],
    [normalise(record.location), 4],
    [normalise(record.address), 3],
    [normalise(record.tags.join(' ')), 3],
    [normalise(record.summary || ''), 2],
    [normalise(record.description), 2],
  ];

  let score = 0;
  let matchedTerms = 0;

  for (const term of terms) {
    let termScore = 0;
    for (const [text, weight] of fields) {
      if (!text) continue;
      if (text === term) termScore = Math.max(termScore, weight * 3);
      else if (text.startsWith(term)) termScore = Math.max(termScore, weight * 2);
      else if (text.includes(term)) termScore = Math.max(termScore, weight);
    }
    if (termScore > 0) matchedTerms += 1;
    score += termScore;
  }

  // Every term has to land somewhere, otherwise "sports coimbatore" would match a
  // music event in Coimbatore.
  return matchedTerms === terms.length ? score : 0;
}
