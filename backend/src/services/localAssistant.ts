import type { AiSuggestion, Category, DateFilter } from '../types';

/**
 * Built-in assistant: the same two jobs the Gemini integration does — tidy a draft
 * listing, and turn a sentence into search filters — done with plain rules.
 *
 * It exists so the "Improve with AI" button and smart search are never dead controls:
 * they work on a fresh clone with no API key, and they keep working if Gemini is down or
 * out of quota. It only ever rearranges and labels what the organiser wrote — like the
 * Gemini prompt, it never invents a date, a price or a venue.
 */

const CATEGORY_KEYWORDS: Record<Exclude<Category, 'Other'>, string[]> = {
  Sports: [
    'sport', 'sports', 'football', 'soccer', 'cricket', 'basketball', 'badminton', 'tennis',
    'volleyball', 'run', 'running', 'marathon', 'cycling', 'cycle', 'ride', 'yoga', 'fitness',
    'gym', 'match', 'tournament', 'league', 'swim', 'swimming', 'trek', 'trekking', 'hike',
    'kabaddi', 'zumba', 'workout', 'skating', 'chess',
  ],
  Music: [
    'music', 'concert', 'gig', 'band', 'jam', 'karaoke', 'open mic', 'singing', 'song',
    'songs', 'guitar', 'dj', 'jazz', 'carnatic', 'acoustic', 'choir', 'orchestra', 'veena',
    'violin', 'drums', 'recital', 'kutcheri', 'playlist',
  ],
  Food: [
    'food', 'dinner', 'lunch', 'breakfast', 'brunch', 'cooking', 'cook', 'baking', 'bake',
    'tasting', 'potluck', 'biryani', 'dosa', 'coffee', 'tea', 'cafe', 'restaurant', 'recipe',
    'market', 'farmers', 'snacks', 'feast', 'barbecue', 'bbq', 'dessert', 'millet',
  ],
  'Yard Sale': [
    'yard sale', 'garage sale', 'sale', 'second hand', 'second-hand', 'secondhand', 'thrift',
    'flea', 'swap', 'pre-loved', 'preloved', 'used', 'bargain', 'clearance', 'exchange',
    'declutter', 'moving out',
  ],
  Community: [
    'community', 'cleanup', 'clean-up', 'clean up', 'volunteer', 'volunteering', 'donation',
    'donate', 'drive', 'neighbourhood', 'neighborhood', 'residents', 'association', 'charity',
    'fundraiser', 'blood', 'plantation', 'planting', 'meetup', 'meet-up', 'gathering',
    'festival', 'pongal', 'diwali', 'townhall', 'awareness',
  ],
  Education: [
    'education', 'class', 'classes', 'workshop', 'lecture', 'talk', 'seminar', 'study',
    'tuition', 'course', 'training', 'learn', 'learning', 'book club', 'reading', 'library',
    'quiz', 'tutorial', 'exam', 'career', 'language', 'science', 'history', 'gardening',
  ],
  Technology: [
    'technology', 'tech', 'coding', 'code', 'programming', 'hackathon', 'hack night', 'ai',
    'machine learning', 'cloud', 'developer', 'developers', 'software', 'robotics', 'robot',
    'web', 'app', 'startup', 'data', 'python', 'javascript', 'gcp', 'firebase', 'iot',
    'electronics', 'cyber',
  ],
  Art: [
    'art', 'painting', 'drawing', 'sketch', 'exhibition', 'gallery', 'museum', 'craft',
    'crafts', 'pottery', 'sculpture', 'design', 'creative', 'photography', 'photo',
    'theatre', 'theater', 'acting', 'drama', 'play', 'comedy', 'standup', 'poetry',
  ],
  Health: [
    'health', 'wellness', 'fitness', 'meditation', 'yoga', 'mental health', 'therapy',
    'healing', 'clinic', 'medical', 'blood donation', 'checkup', 'diet', 'nutrition',
    'mindfulness', 'wellbeing', 'well-being',
  ],
};

/** A sentence or two of practical, category-level guidance — true of any such event. */
const CATEGORY_GUIDANCE: Record<Category, string> = {
  Sports:
    'Wear something comfortable that you can move in and bring a bottle of water. All ability levels are welcome, so come along even if you have not played in a while.',
  Music:
    'Come to listen, or bring your instrument if you would like to join in. It is a relaxed setting, so there is no pressure to perform.',
  Food:
    'Come hungry and bring a friend. If you have any dietary requirements, let the organiser know beforehand so nobody is left out.',
  'Yard Sale':
    'Bring a carry bag and some small change. The best finds tend to go early, so it is worth arriving near the start.',
  Community:
    'Everyone from the neighbourhood is welcome, whether you come alone or with family. It is a good way to meet the people who live around you.',
  Education:
    'No prior experience is needed. Bring a notebook, and feel free to ask questions as you go.',
  Technology:
    'Beginners and experienced builders are both welcome. Bring a laptop if you have one, and your curiosity either way.',
  Art:
    'No prior experience is necessary, just bring your creativity and an open mind.',
  Health:
    'Wear comfortable clothing and bring water. Listen to your body and go at your own pace.',
  Other:
    'Everyone is welcome. Come along, bring a friend, and say hello to the organiser when you arrive.',
};

const CATEGORY_TAGS: Record<Category, string[]> = {
  Sports: ['sports', 'outdoor', 'fitness'],
  Music: ['music', 'live', 'evening'],
  Food: ['food', 'local', 'tasting'],
  'Yard Sale': ['yard sale', 'second hand', 'bargains'],
  Community: ['community', 'neighbours', 'volunteer'],
  Education: ['learning', 'workshop', 'beginners welcome'],
  Technology: ['tech', 'hands-on', 'meetup'],
  Art: ['art', 'creative', 'exhibition'],
  Health: ['wellness', 'health', 'mindfulness'],
  Other: ['local', 'community'],
};

const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'at', 'but', 'by', 'for', 'in', 'near', 'of', 'on', 'or', 'the', 'to', 'with',
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word (or whole-phrase) match, so "ai" does not fire inside "training". */
function containsTerm(haystack: string, term: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}([^a-z0-9]|$)`, 'i').test(haystack);
}

export function detectCategory(text: string): { category: Category | null; matched: string[] } {
  const lower = text.toLowerCase();
  let best: { category: Category; matched: string[] } | null = null;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as Array<
    [Exclude<Category, 'Other'>, string[]]
  >) {
    const matched = keywords.filter((keyword) => containsTerm(lower, keyword));
    if (matched.length > 0 && (!best || matched.length > best.matched.length)) {
      best = { category, matched };
    }
  }

  return best ?? { category: null, matched: [] };
}

function titleCase(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      // Leave anything the organiser capitalised deliberately (GCP, 5K, DJ) alone.
      if (/[A-Z0-9]/.test(word.slice(1)) || /^\d/.test(word)) return word;
      const lower = word.toLowerCase();
      if (index > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function sentenceCase(input: string): string {
  const cleaned = input.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .map((sentence) => sentence.charAt(0).toUpperCase() + sentence.slice(1));

  let result = sentences.join(' ');
  if (!/[.!?]$/.test(result)) result += '.';
  // The house style avoids shouting.
  return result.replace(/!+/g, '.');
}

function clip(input: string, max: number): string {
  if (input.length <= max) return input;
  const cut = input.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.-]+$/, '')}…`;
}

export interface LocalAssistInput {
  title: string;
  description: string;
  category?: Category;
  city: string;
  neighborhood: string;
}

export function suggestLocally(input: LocalAssistInput): AiSuggestion {
  const draftTitle = input.title.replace(/\s+/g, ' ').trim();
  const draftBody = input.description.replace(/[ \t]+/g, ' ').trim();
  const combined = `${draftTitle} ${draftBody}`;

  const detected = detectCategory(combined);
  // An explicit pick by the organiser always wins over a guess.
  const category: Category = input.category ?? detected.category ?? 'Other';

  const firstSentence = (draftBody.split(/(?<=[.!?])\s+|\n+/)[0] ?? '').trim();
  const titleSource = draftTitle || firstSentence.split(/\s+/).slice(0, 9).join(' ');
  let title = titleCase(titleSource.replace(/[.!?]+$/, ''));

  // Add the area when the title does not already say where it is.
  if (input.neighborhood && title && !title.toLowerCase().includes(input.neighborhood.toLowerCase())) {
    const withPlace = `${title} in ${input.neighborhood}`;
    if (withPlace.length <= 90) title = withPlace;
  }
  title = clip(title, 120);

  const place = [input.neighborhood, input.city].filter(Boolean).join(', ');
  const opening = sentenceCase(draftBody || draftTitle);

  const paragraphs = [
    opening,
    CATEGORY_GUIDANCE[category],
    place
      ? `It is happening in ${place}. Tap "I'm Going" so the organiser knows how many people to expect, and share the link with anyone nearby who might enjoy it.`
      : `Tap "I'm Going" so the organiser knows how many people to expect, and share the link with anyone who might enjoy it.`,
  ].filter(Boolean);

  const summarySource = sentenceCase(firstSentence || draftTitle);
  const summary = clip(summarySource, 140);

  const tags = new Set<string>();
  for (const keyword of detected.matched) tags.add(keyword.toLowerCase());
  for (const tag of CATEGORY_TAGS[category]) tags.add(tag);
  if (input.neighborhood) tags.add(input.neighborhood.toLowerCase());

  return {
    title,
    description: paragraphs.join('\n\n').slice(0, 5000),
    summary,
    category,
    tags: Array.from(tags)
      .filter((tag) => tag.length > 1 && tag.length <= 30)
      .slice(0, 6),
  };
}

/* ------------------------------------------------------------------ search */

const DATE_PATTERNS: Array<{ filter: DateFilter; pattern: RegExp }> = [
  { filter: 'tomorrow', pattern: /\b(tomorrow|tmrw|tmr)\b/i },
  { filter: 'today', pattern: /\b(today|tonight|this evening|this morning|this afternoon|right now|now)\b/i },
  { filter: 'weekend', pattern: /\b(this weekend|the weekend|weekend|saturday|sunday)\b/i },
  { filter: 'week', pattern: /\b(this week|next few days|coming days|next 7 days|in the week)\b/i },
];

/** Words that carry no search meaning once the structured filters are pulled out. */
const FILLER = new Set([
  'a', 'an', 'the', 'any', 'some', 'all', 'me', 'my', 'i', 'we', 'us', 'our', 'you', 'your',
  'show', 'find', 'search', 'looking', 'look', 'want', 'need', 'give', 'list', 'see', 'get',
  'event', 'events', 'thing', 'things', 'stuff', 'activity', 'activities', 'something',
  'anything', 'happening', 'going', 'on', 'to', 'do', 'for', 'with', 'in', 'at', 'near',
  'around', 'nearby', 'close', 'by', 'of', 'and', 'or', 'is', 'are', 'there', 'what',
  "what's", 'whats', 'where', 'when', 'this', 'that', 'please', 'can', 'could', 'would',
  'like', 'good', 'best', 'fun', 'cool', 'nice', 'local', 'area', 'from', 'up', 'coming',
  'upcoming', 'next',
]);

/** Category names and their bare synonyms — implied by the category filter itself. */
const CATEGORY_WORDS = new Set([
  'sport', 'sports', 'sporty', 'music', 'musical', 'food', 'foodie', 'yard', 'sale', 'sales',
  'garage', 'community', 'education', 'educational', 'technology', 'tech', 'techie',
]);

export interface LocalSearchIntent {
  keywords: string;
  category: Category | null;
  dateFilter: DateFilter;
  neighborhood: string;
  city: string;
}

export interface PlaceIndex {
  neighborhoods: string[];
  cities: string[];
}

/**
 * Matches a place name however it is spaced or punctuated: an event filed under
 * "R S Puram" should be found by "RS Puram" and "R.S. Puram" alike.
 */
function placePattern(name: string): RegExp | null {
  const parts = name.toLowerCase().match(/[a-z0-9]+/g);
  if (!parts || parts.join('').length < 3) return null;

  const body = parts.map(escapeRegExp).join('[\\s.\\-]*');
  return new RegExp(`(^|[^a-z0-9])${body}(?=[^a-z0-9]|$)`, 'gi');
}

/** Longest name first, so "Race Course Road" wins over "Race Course". */
function extractPlace(query: string, names: string[]): { name: string; rest: string } {
  const sorted = [...names].sort((a, b) => b.length - a.length);

  for (const name of sorted) {
    const pattern = placePattern(name);
    if (pattern && pattern.test(query)) {
      pattern.lastIndex = 0;
      // The canonical spelling is returned, because that is what the filter compares to.
      return { name, rest: query.replace(pattern, '$1 ') };
    }
  }

  return { name: '', rest: query };
}

export function parseSearchLocally(query: string, places: PlaceIndex): LocalSearchIntent {
  let remaining = ` ${query.trim()} `;

  let dateFilter: DateFilter = 'upcoming';
  for (const { filter, pattern } of DATE_PATTERNS) {
    if (pattern.test(remaining)) {
      dateFilter = filter;
      remaining = remaining.replace(new RegExp(pattern.source, 'gi'), ' ');
      break;
    }
  }

  // Only ever a place that really is on the board — never a guess.
  const area = extractPlace(remaining, places.neighborhoods);
  const neighborhood = area.name;
  remaining = area.rest;

  const town = extractPlace(remaining, places.cities);
  const city = town.name;
  remaining = town.rest;

  const { category } = detectCategory(remaining);

  const keywords = remaining
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !FILLER.has(word))
    // "music events" means the Music category, not the literal word "music" in a title.
    .filter((word) => !(category && CATEGORY_WORDS.has(word)))
    .join(' ')
    .slice(0, 120);

  return { keywords, category, dateFilter, neighborhood, city };
}
