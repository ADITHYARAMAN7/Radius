/**
 * scripts/seed-events.ts
 *
 * Seeds Firestore with a rich, realistic local community event board.
 * Contains at least 20 realistic upcoming events across 7 core categories:
 *   - Sports
 *   - Music
 *   - Food
 *   - Technology
 *   - Education
 *   - Community
 *   - Yard Sale
 *
 * Also seeds realistic expired/past events to demonstrate past event filtering and archiving.
 *
 * Every event includes:
 *   - title, description, category, date, time (and startTime/endTime),
 *   - location, neighborhood, latitude, longitude,
 *   - image (and imageUrl), tags, RSVP count (rsvpCount).
 *
 * Usage:
 *   npx tsx scripts/seed-events.ts           # Add / refresh demo events
 *   npx tsx scripts/seed-events.ts --clear   # Clear seeded events first
 */

import { FieldValue, Timestamp, getDb, initFirebase } from '../backend/src/config/firebase';
import { env } from '../backend/src/config/env';

// Say out loud where the data is going, and never let a "demo-" (emulator-only) project
// fall through to real Google Cloud credentials.
const emulatorHost = env.firestoreEmulatorHost || process.env.FIRESTORE_EMULATOR_HOST;
if (emulatorHost) {
  console.log(`[Seed] Target: Firestore EMULATOR at ${emulatorHost} (project "${env.projectId || 'nearby-objects-local'}")`);
} else if (env.projectId.startsWith('demo-')) {
  console.error(
    `[Seed] Project "${env.projectId}" is emulator-only but FIRESTORE_EMULATOR_HOST is not set. ` +
      'Start the emulators (npm run dev:local) or set FIRESTORE_EMULATOR_HOST in backend/.env.',
  );
  process.exit(1);
} else {
  console.warn(`[Seed] Target: REAL Firestore in project "${env.projectId || '(from credentials)'}"`);
}

initFirebase();
const db = getDb();
const SEED_TAG = 'seed:nearby-objects-demo';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalise(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

function buildKeywords(inputs: string[]): string[] {
  const set = new Set<string>();
  for (const text of inputs) {
    if (!text) continue;
    const tokens = normalise(text)
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2);
    for (const t of tokens) set.add(t);
  }
  return Array.from(set);
}

function dateStringWithOffset(days: number): string {
  const target = new Date();
  target.setDate(target.getDate() + days);
  return [
    target.getFullYear(),
    String(target.getMonth() + 1).padStart(2, '0'),
    String(target.getDate()).padStart(2, '0'),
  ].join('-');
}

function combineDateTime(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(y!, m! - 1, d!, hh ?? 0, mm ?? 0, 0, 0);
}

// ---------------------------------------------------------------------------
// Organisers
// ---------------------------------------------------------------------------
const ORGANISERS = {
  arun: { id: 'seed-user-arun', name: 'Arun Sekar', bio: 'Community sports organizer and youth athletic mentor.' },
  priya: { id: 'seed-user-priya', name: 'Priya Raghunathan', bio: 'Culinary researcher and farm-to-table activist.' },
  meena: { id: 'seed-user-meena', name: 'Meena Krishnan', bio: 'Music director and traditional arts educator.' },
  karthik: { id: 'seed-user-karthik', name: 'Karthik Balan', bio: 'Cloud architect and developer community host.' },
  david: { id: 'seed-user-david', name: 'David Mathew', bio: 'Civic repair lead and neighborhood ecology volunteer.' },
  fatima: { id: 'seed-user-fatima', name: 'Fatima Noor', bio: 'Literature club curator and circular economy organizer.' },
};

// ---------------------------------------------------------------------------
// Seed Event Definitions
// ---------------------------------------------------------------------------
export type Category =
  | 'Sports'
  | 'Music'
  | 'Food'
  | 'Technology'
  | 'Education'
  | 'Community'
  | 'Yard Sale';

interface SeedEventDefinition {
  title: string;
  description: string;
  summary: string;
  category: Category;
  tags: string[];
  daysFromNow: number;
  startTime: string;
  endTime: string;
  timeFormatted: string;
  location: string;
  address: string;
  neighborhood: string;
  city: string;
  latitude: number;
  longitude: number;
  rsvpCount: number;
  organiser: (typeof ORGANISERS)[keyof typeof ORGANISERS];
  image: string;
  isExpired?: boolean;
}

// 25 realistic upcoming events across all 7 categories + 7 expired events
const UPCOMING_EVENTS: SeedEventDefinition[] = [
  // -------------------------------------------------------------------------
  // 1. SPORTS (4 upcoming events)
  // -------------------------------------------------------------------------
  {
    title: 'Sunday Morning 7-a-Side Football at VOC Grounds',
    description:
      'Our weekly seven-a-side game is open to anyone who turns up. We split into balanced teams on the spot, so you do not need to bring a group — plenty of regulars arrive alone and leave with a team.\n\nWe play two forty-minute halves with a short break. Boots are recommended but trainers are fine on the outer pitch. There is a water station by the pavilion, and most of us head for filter coffee at the stall across the road afterwards.\n\nBeginners are genuinely welcome. Mention it when you arrive and we will put you with players who are happy to talk you through positioning.',
    summary: 'Open seven-a-side football, balanced teams picked on the spot, all abilities welcome.',
    category: 'Sports',
    tags: ['football', 'weekly', 'outdoor', 'beginners welcome', 'fitness'],
    daysFromNow: 1,
    startTime: '06:30',
    endTime: '08:30',
    timeFormatted: '6:30 AM – 8:30 AM',
    location: 'VOC Park Grounds',
    address: 'VOC Park, Dr Nanjappa Road, Gandhipuram, Coimbatore 641018',
    neighborhood: 'Gandhipuram',
    city: 'Coimbatore',
    latitude: 11.0168,
    longitude: 76.9558,
    rsvpCount: 36,
    organiser: ORGANISERS.arun,
    image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Race Course 5K Morning Run & Mobility Session',
    description:
      'Join our community runners for a scenic 5K loop around Race Course promenade, followed by a 20-minute guided dynamic mobility and cool-down stretch.\n\nWe run in three pace groups: gentle walkers/joggers (7:30 min/km), steady tempo (6:00 min/km), and brisk pacers (5:00 min/km). Nobody gets left behind — each group has an experienced sweep runner.\n\nCarry your reusable water bottle. Filter water refills and seasonal electrolytes will be provided at the Thomas Park pavilion.',
    summary: 'Friendly 5K community run in 3 pace groups with guided mobility stretching.',
    category: 'Sports',
    tags: ['running', '5k', 'fitness', 'race course', 'morning'],
    daysFromNow: 3,
    startTime: '06:00',
    endTime: '07:30',
    timeFormatted: '6:00 AM - 7:30 AM',
    location: 'Thomas Park, Race Course Promenade',
    address: 'Thomas Park, Race Course Road, Coimbatore 641018',
    neighborhood: 'Race Course',
    city: 'Coimbatore',
    latitude: 10.9991,
    longitude: 76.9739,
    rsvpCount: 42,
    organiser: ORGANISERS.arun,
    image: 'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Badminton Doubles Ladder Challenge',
    description:
      'A rolling doubles ladder across four synthetic indoor courts. Pairs play a single game to fifteen points; winners move up one court, while runners-up move down to keep games evenly matched throughout the session.\n\nIntermediate level — you should be comfortable with serving reliably and basic overhead clears. Turn up alone and you will be paired on the court by the organizers.\n\nTournament grade feather shuttles and court fees are covered in the RSVP. Non-marking gum-sole badminton shoes are mandatory.',
    summary: 'Fast-paced rolling doubles badminton ladder across four courts. Non-marking shoes required.',
    category: 'Sports',
    tags: ['badminton', 'doubles', 'indoor', 'tournament', 'social'],
    daysFromNow: 4,
    startTime: '19:30',
    endTime: '22:00',
    timeFormatted: '7:30 PM - 10:00 PM',
    location: 'Smash Point Badminton Academy',
    address: '19 Mettupalayam Road, Thudiyalur, Coimbatore 641034',
    neighborhood: 'Thudiyalur',
    city: 'Coimbatore',
    latitude: 11.0747,
    longitude: 76.9397,
    rsvpCount: 22,
    organiser: ORGANISERS.arun,
    image: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Sunset Rooftop Vinyasa Yoga & Breathwork',
    description:
      'A sixty-minute restorative vinyasa flow on an open terrace overlooking the Western Ghats at sunset. We flow through gentle spine mobilization, sun salutations, warrior sequences, and close with ten minutes of guided pranayama.\n\nBeginners are warmly welcomed with modification options offered for every posture. Yoga mats are available for those who do not have one with them.\n\nPlease arrive 10 minutes early so everyone is settled before the opening chant.',
    summary: 'Rooftop restorative yoga flow and sunset breathwork session open to all levels.',
    category: 'Sports',
    tags: ['yoga', 'wellness', 'sunset', 'breathwork', 'mindfulness'],
    daysFromNow: 5,
    startTime: '17:45',
    endTime: '19:00',
    timeFormatted: '5:45 PM - 7:00 PM',
    location: 'Terrace, Anand Residency',
    address: 'Anand Residency, DB Road, R S Puram, Coimbatore 641002',
    neighborhood: 'R S Puram',
    city: 'Coimbatore',
    latitude: 11.0041,
    longitude: 76.9503,
    rsvpCount: 28,
    organiser: ORGANISERS.priya,
    image: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1200&q=80',
  },

  // -------------------------------------------------------------------------
  // 2. MUSIC (4 upcoming events)
  // -------------------------------------------------------------------------
  {
    title: 'Carnatic Classical & Contemporary Fusion Night',
    description:
      'A two-hour intimate concert from four acclaimed local musicians reworking centuries-old Tyagaraja and Dikshitar compositions with double bass, Spanish cajón, and electric violin.\n\nThe first half honors authentic classical roots; the second half opens into improvisational jugalbandi and contemporary rhythm exchanges.\n\nTraditional floor seating with comfortable cotton cushions, plus back-rest chairs for elderly guests. Entry is by donation at the reception desk.',
    summary: 'Carnatic compositions reimagined with acoustic double bass, cajón, and violin.',
    category: 'Music',
    tags: ['carnatic', 'fusion', 'live music', 'concert', 'acoustic'],
    daysFromNow: 2,
    startTime: '18:30',
    endTime: '20:45',
    timeFormatted: '6:30 PM - 8:45 PM',
    location: 'Kuruvai Community Hall',
    address: '12 Thadagam Road, R S Puram, Coimbatore 641002',
    neighborhood: 'R S Puram',
    city: 'Coimbatore',
    latitude: 11.0071,
    longitude: 76.9492,
    rsvpCount: 74,
    organiser: ORGANISERS.meena,
    image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Acoustic Indie Open Mic & Songwriters Jam',
    description:
      'An open floor for acoustic singer-songwriters, poets, and instrumentalists. Each performer receives an 8-minute stage slot. Both original songs and covers in Tamil, English, and Hindi are welcome.\n\nFirst-time performers are guaranteed the earliest slots. High quality Shure microphones and clean direct-in boxes for acoustic guitars are hooked up.\n\nAudience members are as essential as the performers. Filter brew coffee, herbal tea, and fresh banana walnut cakes available throughout the evening.',
    summary: 'Acoustic open mic for singer-songwriters and listeners with fresh brews and cake.',
    category: 'Music',
    tags: ['open mic', 'acoustic', 'indie', 'guitar', 'live performance'],
    daysFromNow: 6,
    startTime: '19:00',
    endTime: '21:30',
    timeFormatted: '7:00 PM - 9:30 PM',
    location: 'Paper Boat Café',
    address: '7 Race Course Road, Red Fields, Coimbatore 641018',
    neighborhood: 'Race Course',
    city: 'Coimbatore',
    latitude: 10.9991,
    longitude: 76.9739,
    rsvpCount: 51,
    organiser: ORGANISERS.fatima,
    image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Peelamedu Vinyl Listening Lounge & Jazz Appreciation',
    description:
      'An evening dedicated to original analogue pressings played through vintage tube amplification and restored Tannoy studio monitors. This edition focuses on classic Blue Note jazz (Miles Davis, John Coltrane, Thelonious Monk) and 1970s Ilaiyaraaja orchestral scores.\n\nMusic historian Meena Krishnan will share short 3-minute background contexts before dropping the needle on each record side.\n\nBYOR (Bring Your Own Record) session follows in the second hour. High-end record cleaning machine on site.',
    summary: 'Analogue vinyl listening on tube audio system featuring classic jazz and cinema vinyl.',
    category: 'Music',
    tags: ['vinyl', 'jazz', 'audiophile', 'analog', 'listening party'],
    daysFromNow: 8,
    startTime: '17:30',
    endTime: '20:00',
    timeFormatted: '5:30 PM - 8:00 PM',
    location: 'The Sound Lounge Studio',
    address: '14 Avinashi Road, Peelamedu, Coimbatore 641004',
    neighborhood: 'Peelamedu',
    city: 'Coimbatore',
    latitude: 11.0255,
    longitude: 77.0125,
    rsvpCount: 33,
    organiser: ORGANISERS.meena,
    image: 'https://images.unsplash.com/photo-1539185441755-769473a23570?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Community Choir Rehearsal: Voices of the Valley',
    description:
      'Come join twenty passionate local singers exploring 4-part polyphonic harmonies, Tamil folk choral arrangements, and world choral pieces. No formal music sight-reading required — parts are learned by ear and repetition.\n\nVoices of all vocal ranges (Soprano, Alto, Tenor, Bass) are needed as we prepare for the upcoming district charity showcase.\n\nPlease arrive on time for vocal warm-ups and diction exercises.',
    summary: 'Community choir group singing 4-part harmonies and folk pieces. All voices welcome.',
    category: 'Music',
    tags: ['choir', 'group singing', 'harmony', 'vocal', 'community music'],
    daysFromNow: 11,
    startTime: '16:00',
    endTime: '18:00',
    timeFormatted: '4:00 PM - 6:00 PM',
    location: 'St. Mark Community Hall',
    address: '88 Town Hall Road, Coimbatore 641001',
    neighborhood: 'Town Hall',
    city: 'Coimbatore',
    latitude: 10.9942,
    longitude: 76.9634,
    rsvpCount: 29,
    organiser: ORGANISERS.meena,
    image: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=80',
  },

  // -------------------------------------------------------------------------
  // 3. FOOD (4 upcoming events)
  // -------------------------------------------------------------------------
  {
    title: 'Saturday Organic Farmers Market & Heritage Tiffin Stalls',
    description:
      'Over 24 smallholder organic farmers from across the Coimbatore and Nilgiris belt bring freshly harvested vegetables, heirloom country greens, naturally dried spices, and cold-pressed sesame and groundnut oils.\n\nAlongside the produce, traditional tiffin stalls serve steamed idiyappam with freshly extracted coconut milk, ragi kali, piping hot kal dosai with shallot chutney, and artisanal jaggery filter coffee served in clay tumblers.\n\nStrictly plastic-free since 2021 — please bring your own cloth bags and steel containers for wet produce.',
    summary: 'Twenty-four organic regional growers and heritage tiffin stalls served on banana leaf.',
    category: 'Food',
    tags: ['farmers market', 'organic', 'tiffin', 'breakfast', 'sustainable'],
    daysFromNow: 2,
    startTime: '06:00',
    endTime: '11:30',
    timeFormatted: '6:00 AM - 11:30 AM',
    location: 'Kovai Pudur Market Yard',
    address: 'Market Yard, Kovaipudur Main Road, Coimbatore 641042',
    neighborhood: 'Kovaipudur',
    city: 'Coimbatore',
    latitude: 10.9344,
    longitude: 76.9219,
    rsvpCount: 135,
    organiser: ORGANISERS.priya,
    image: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Kongunadu Heritage Cooking Masterclass & Feast',
    description:
      'Learn the nuanced spices and stone-ground techniques that define Kongu cuisine. Led by veteran home cook Amutha and culinary educator Priya Raghunathan.\n\nParticipants will cook in small groups of three: roasting and stone-grinding whole spices for Arachuvitta Sambar, tempering Pallipalayam chicken (and vegetarian mushroom Pallipalayam), steaming kola urundai, and simmering coconut-milk Payasam.\n\nThe workshop concludes with an expansive banana-leaf feast of everything cooked. Printed recipe booklets with source ingredient notes are included.',
    summary: 'Hands-on heritage Kongunadu cooking workshop followed by a communal banana leaf feast.',
    category: 'Food',
    tags: ['cooking class', 'kongunadu', 'traditional food', 'hands on', 'feast'],
    daysFromNow: 7,
    startTime: '15:00',
    endTime: '19:30',
    timeFormatted: '3:00 PM - 7:30 PM',
    location: 'Amma’s Culinary Studio',
    address: '28 Bharathi Park Road, Saibaba Colony, Coimbatore 641011',
    neighborhood: 'Saibaba Colony',
    city: 'Coimbatore',
    latitude: 11.0305,
    longitude: 76.9512,
    rsvpCount: 20,
    organiser: ORGANISERS.priya,
    image: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Old Town Heritage Street Food Evening Walk',
    description:
      'A curated 2.5 km walking tour celebrating the culinary legends of Coimbatore’s oldest quarter. We make 7 curated food stops exploring storied recipes passed down across generations.\n\nHighlights include wood-fired Kari Dosai, fluffy bun butter jam at a 60-year-old Iranian style tea shop, authentic Burmese Atho noodles, tender kuzhi paniyaram, and Coimbatore’s signature Madurai-style cold jigarthanda.\n\nComfortable walking sneakers recommended. Vegetarian tastings are available at every single stop.',
    summary: 'Guided 7-stop walking tour tasting Coimbatore old town street food delicacies.',
    category: 'Food',
    tags: ['street food', 'walking tour', 'heritage', 'local food', 'evening'],
    daysFromNow: 5,
    startTime: '17:30',
    endTime: '20:30',
    timeFormatted: '5:30 PM - 8:30 PM',
    location: 'Meeting Point: Clock Tower, Oppanakara Street',
    address: 'Oppanakara Street, Town Hall, Coimbatore 641001',
    neighborhood: 'Town Hall',
    city: 'Coimbatore',
    latitude: 10.9959,
    longitude: 76.9617,
    rsvpCount: 45,
    organiser: ORGANISERS.priya,
    image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Artisan Sourdough Baking & Specialty Coffee Pop-up',
    description:
      'An afternoon pop-up bringing together natural sourdough bakers and estate coffee roasters. Taste naturally leavened country sourdoughs, wild herb focaccia, and sea salt brioche paired with pour-overs from Shevaroys and Anamalais coffee estates.\n\nLive demonstration on maintaining a sourdough wild yeast starter in tropical weather, shaping high-hydration doughs, and scoring techniques for home ovens.\n\nFree starter cultures given out in jars to everyone who brings a glass container.',
    summary: 'Artisan sourdough tasting, live baking demonstration, and single-origin coffee pop-up.',
    category: 'Food',
    tags: ['baking', 'sourdough', 'coffee', 'specialty coffee', 'pop up'],
    daysFromNow: 9,
    startTime: '14:00',
    endTime: '17:30',
    timeFormatted: '2:00 PM - 5:30 PM',
    location: 'Bake & Brew Atelier',
    address: '22 Race Course Road, Red Fields, Coimbatore 641018',
    neighborhood: 'Race Course',
    city: 'Coimbatore',
    latitude: 11.0018,
    longitude: 76.9765,
    rsvpCount: 38,
    organiser: ORGANISERS.priya,
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80',
  },

  // -------------------------------------------------------------------------
  // 4. TECHNOLOGY (4 upcoming events)
  // -------------------------------------------------------------------------
  {
    title: 'Build & Deploy Fullstack Web Apps on Google Cloud',
    description:
      'A practical hands-on evening workshop for developers, college students, and tech enthusiasts. We start from a completely blank Git repository and deploy a production-grade fullstack web application to Cloud Run with Firestore in under two hours.\n\nTopics covered:\n• Containerizing Node.js & TypeScript microservices with multi-stage Docker builds\n• Connecting to Firestore with IAM security and zero hardcoded credentials\n• Deploying automatically to Cloud Run with custom domains and SSL certs\n\nPlease bring a laptop with Node.js 20+ and Git installed. Cloud credits will be provided to participants.',
    summary: 'Hands-on workshop: empty repo to deployed Cloud Run web application with Firestore.',
    category: 'Technology',
    tags: ['google cloud', 'cloud run', 'firestore', 'docker', 'typescript'],
    daysFromNow: 3,
    startTime: '18:00',
    endTime: '20:30',
    timeFormatted: '6:00 PM - 8:30 PM',
    location: 'Kovai Tech Collective',
    address: '4th Floor, Sri Krishna Towers, Avinashi Road, Peelamedu, Coimbatore 641004',
    neighborhood: 'Peelamedu',
    city: 'Coimbatore',
    latitude: 11.0272,
    longitude: 77.0263,
    rsvpCount: 48,
    organiser: ORGANISERS.karthik,
    image: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Python & Generative AI for Absolute Beginners',
    description:
      'A welcoming, zero-jargon Saturday session for people who want to understand programming and modern AI tools from scratch. No mathematics or prior coding experience required.\n\nIn three hours, we will write our first Python scripts, connect to the Gemini API, and build an interactive personal assistant that summarizes local news and answers community questions.\n\nLab machines with Python 3.12 are provided for 25 attendees on a first-come basis, or bring your own personal laptop.',
    summary: 'Beginner-friendly coding session writing Python and building a Gemini AI assistant.',
    category: 'Technology',
    tags: ['python', 'ai', 'gemini', 'beginners', 'coding'],
    daysFromNow: 4,
    startTime: '09:30',
    endTime: '12:30',
    timeFormatted: '9:30 AM - 12:30 PM',
    location: 'Kovai Skill Lab',
    address: '2nd Floor, Lakshmi Complex, Trichy Road, Singanallur, Coimbatore 641005',
    neighborhood: 'Singanallur',
    city: 'Coimbatore',
    latitude: 11.0068,
    longitude: 77.0286,
    rsvpCount: 56,
    organiser: ORGANISERS.karthik,
    image: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Startup Founders & Indie Builders Breakfast Meetup',
    description:
      'An informal monthly gathering for software founders, SaaS creators, hardware builders, and freelancers in Coimbatore. No formal pitch decks, no sponsors, and no long speeches.\n\nWe organize into round tables of six to exchange candid feedback on customer acquisition, technical stack choices, pricing, and hiring challenges.\n\nEveryone pays for their own breakfast from the cafe counter. RSVP to ensure table seating.',
    summary: 'Casual breakfast exchange for local software, hardware, and startup builders.',
    category: 'Technology',
    tags: ['startups', 'founders', 'networking', 'saas', 'breakfast'],
    daysFromNow: 10,
    startTime: '08:30',
    endTime: '10:45',
    timeFormatted: '8:30 AM - 10:45 AM',
    location: 'The Bagel Factory',
    address: '14 Avinashi Road, Red Fields, Coimbatore 641018',
    neighborhood: 'Race Course',
    city: 'Coimbatore',
    latitude: 11.0038,
    longitude: 76.9794,
    rsvpCount: 39,
    organiser: ORGANISERS.karthik,
    image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Open Source Community Hack Night & Lightning Demos',
    description:
      'Bring whatever you are building — web applications, open source libraries, robotics code, or design systems. Work alongside fellow engineers in a vibrant co-working environment with high-speed fiber internet and coffee.\n\nThe final 45 minutes feature 5-minute lightning project demos where anyone can showcase what they built or solved during the evening.\n\nMentors available to guide open source newcomers in making their first GitHub pull request.',
    summary: 'Evening co-working hackathon with 5-minute lightning demo presentations.',
    category: 'Technology',
    tags: ['open source', 'hackathon', 'demos', 'github', 'coworking'],
    daysFromNow: 12,
    startTime: '18:30',
    endTime: '22:00',
    timeFormatted: '6:30 PM - 10:00 PM',
    location: 'TIDEL Innovation Hub',
    address: 'Module 102, TIDEL Park, Aerodrome Post, Coimbatore 641014',
    neighborhood: 'Peelamedu',
    city: 'Coimbatore',
    latitude: 11.0312,
    longitude: 77.0392,
    rsvpCount: 62,
    organiser: ORGANISERS.karthik,
    image: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1200&q=80',
  },

  // -------------------------------------------------------------------------
  // 5. EDUCATION (4 upcoming events)
  // -------------------------------------------------------------------------
  {
    title: 'Spoken English & Conversational Confidence Circle',
    description:
      'A welcoming weekly practice circle designed for anyone who reads and understands English comfortably but feels anxious or hesitant when speaking in public or in workplace meetings.\n\nStrictly zero grammar drills or corrections from the front of the room. We run three rounds:\n1. A two-minute friendly self-introduction\n2. Paired conversations on prompts drawn randomly from a bowl\n3. Group problem-solving discussion where every voice is heard\n\nAttended by over 30 people weekly ranging from college students to working professionals. Free of cost.',
    summary: 'Zero-pressure weekly speaking practice circle designed to build spoken English confidence.',
    category: 'Education',
    tags: ['spoken english', 'public speaking', 'free', 'weekly', 'confidence'],
    daysFromNow: 1,
    startTime: '17:30',
    endTime: '19:15',
    timeFormatted: '5:30 PM - 7:15 PM',
    location: 'District Central Library, Seminar Hall 2',
    address: 'District Central Library, VKK Menon Road, Gandhipuram, Coimbatore 641012',
    neighborhood: 'Gandhipuram',
    city: 'Coimbatore',
    latitude: 11.0152,
    longitude: 76.9639,
    rsvpCount: 44,
    organiser: ORGANISERS.david,
    image: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Kids STEM Workshop: Build a Working Hydraulic Robotic Arm',
    description:
      'An engaging, two-hour hands-on engineering lab for school children aged 8 to 14. Every participant builds a fully functioning hydraulic robotic arm using medical syringes, flexible silicone tubing, balsa wood, and cardboard joints.\n\nStudents learn Pascal’s law of fluid pressure and mechanical advantage by seeing it move physical levers in real time. Each child tests their arm in a friendly marshmallow-stacking challenge and takes their creation home.\n\nAll tools and safety-tested materials included in the ticket. Parents may observe or relax in the adjacent lounge.',
    summary: 'Children 8–14 build and take home a working hydraulic robotic crane arm.',
    category: 'Education',
    tags: ['kids', 'stem', 'science', 'engineering', 'hands on'],
    daysFromNow: 6,
    startTime: '10:00',
    endTime: '12:30',
    timeFormatted: '10:00 AM - 12:30 PM',
    location: 'Curiosity STEM Lab',
    address: '5 Kumaran Road, Tirupur Road, Sungam, Coimbatore 641045',
    neighborhood: 'Sungam',
    city: 'Coimbatore',
    latitude: 10.9847,
    longitude: 76.9733,
    rsvpCount: 26,
    organiser: ORGANISERS.meena,
    image: 'https://images.unsplash.com/photo-1581092921461-eab62e97a780?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Urban Terrace Gardening & Composting Workshop',
    description:
      'Turn small balconies, patios, and building rooftops into abundant edible gardens. This comprehensive morning session covers soil biome rejuvenation, potting mixes with cocopeat and red soil, companion planting, and odor-free kitchen waste composting.\n\nPractical demonstrations include preparing organic neem sprays for pest control and transplanting heirloom tomato and chili seedlings.\n\nParticipants take home an active seedling starter tray and a block of nutrient-enriched coco-peat.',
    summary: 'Practical urban gardening masterclass: balcony vegetables, organic potting, and composting.',
    category: 'Education',
    tags: ['gardening', 'composting', 'urban farming', 'terrace garden', 'sustainability'],
    daysFromNow: 7,
    startTime: '09:00',
    endTime: '11:45',
    timeFormatted: '9:00 AM - 11:45 AM',
    location: 'Horticulture Community Studio',
    address: '42 Alagesan Road, Saibaba Colony, Coimbatore 641011',
    neighborhood: 'Saibaba Colony',
    city: 'Coimbatore',
    latitude: 11.0267,
    longitude: 76.9452,
    rsvpCount: 37,
    organiser: ORGANISERS.priya,
    image: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Youth Financial Literacy & Smart Investing Basics',
    description:
      'A practical financial navigation masterclass for young adults, college graduates, and early career workers. We cut through the hype and break down real-world financial literacy:\n\n• Budgeting principles that survive lifestyle inflation\n• Decoding mutual funds, index investing, and sovereign gold bonds\n• Understanding compounding, tax deductions, and avoiding predatory credit cards\n\nInteractive spreadsheets and calculation templates provided to all attendees. Led by a certified independent financial educator with no products to sell.',
    summary: 'Actionable financial literacy workshop on index investing, budgeting, and tax basics.',
    category: 'Education',
    tags: ['finance', 'investing', 'young adults', 'budgeting', 'literacy'],
    daysFromNow: 13,
    startTime: '10:30',
    endTime: '13:00',
    timeFormatted: '10:30 AM - 1:00 PM',
    location: 'Vadavalli Community Cultural Hall',
    address: '15 Marudhamalai Main Road, Vadavalli, Coimbatore 641041',
    neighborhood: 'Vadavalli',
    city: 'Coimbatore',
    latitude: 11.0289,
    longitude: 76.9012,
    rsvpCount: 49,
    organiser: ORGANISERS.david,
    image: 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?auto=format&fit=crop&w=1200&q=80',
  },

  // -------------------------------------------------------------------------
  // 6. COMMUNITY (4 upcoming events)
  // -------------------------------------------------------------------------
  {
    title: 'Noyyal Riverbank Conservation & Cleanup Drive',
    description:
      'Our seventh collaborative community cleanup along the Noyyal River stretch behind the Ukkadam water works. Last month, 52 dedicated volunteers removed over 14 large sacks of discarded non-biodegradable plastics and cleared choked water channels.\n\nHeavy-duty rubber gloves, metal litter grabbers, and thick compostable sacks are provided on site. Please wear closed waterproof shoes and comfortable work clothes.\n\nChildren are welcome when accompanied by a supervising guardian (dry bank areas designated). Fresh tender coconuts and hot breakfast snacks provided for all volunteers.',
    summary: 'Seventh community riverbank cleanup drive. Gloves, tools, and volunteer breakfast provided.',
    category: 'Community',
    tags: ['cleanup', 'environment', 'volunteering', 'river', 'conservation'],
    daysFromNow: 1,
    startTime: '06:30',
    endTime: '09:00',
    timeFormatted: '6:30 AM - 9:00 AM',
    location: 'Noyyal Riverbank, behind Ukkadam Water Works',
    address: 'Noyyal Riverbank Road, Ukkadam, Coimbatore 641001',
    neighborhood: 'Ukkadam',
    city: 'Coimbatore',
    latitude: 10.9892,
    longitude: 76.9617,
    rsvpCount: 68,
    organiser: ORGANISERS.priya,
    image: 'https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Neighbourhood Native Tree Planting: 200 Saplings',
    description:
      'Help us plant 200 indigenous native shade trees along the school pedestrian stretch: Pungai, Neem, Vagai, and Iluppai saplings chosen because they thrive in local soil with minimal irrigation once rooted.\n\nPits will be pre-dug by our machinery team the afternoon prior, so morning volunteers can focus on proper root positioning, organic vermicompost enrichment, tree guard staking, and initial deep watering.\n\nEach volunteer adopts a sapling and receives a monthly digital check-in to monitor growth over the first year.',
    summary: 'Planting 200 native drought-tolerant shade trees along the school pedestrian avenue.',
    category: 'Community',
    tags: ['tree planting', 'native species', 'volunteering', 'green', 'climate'],
    daysFromNow: 8,
    startTime: '07:00',
    endTime: '10:00',
    timeFormatted: '7:00 AM - 10:00 AM',
    location: 'Kalapatti Main Road, Panchayat School Stretch',
    address: 'Kalapatti Main Road, near Panchayat School, Coimbatore 641048',
    neighborhood: 'Kalapatti',
    city: 'Coimbatore',
    latitude: 11.0789,
    longitude: 77.0292,
    rsvpCount: 82,
    organiser: ORGANISERS.david,
    image: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Community Repair Café: Fix What You Own',
    description:
      'Don’t toss out repairable goods! Skilled volunteer tinkerers and retired technicians help you fix broken everyday household items for free.\n\nStations operating this edition:\n• Small kitchen appliances (mixers, toasters, electric kettles)\n• Bicycle mechanical tune-ups and flat tire rescues\n• Electronics soldering (table lamps, headphones, radios)\n• Garment mending and zipper replacements by our tailor volunteer\n\nYou work side-by-side with the repairer so you learn how your item operates and how to fix it yourself next time. Free event supported by voluntary tool fund contributions.',
    summary: 'Free volunteer repair clinic: small electronics, kitchen appliances, bikes, and clothing.',
    category: 'Community',
    tags: ['repair cafe', 'sustainability', 'free', 'diy', 'fix'],
    daysFromNow: 9,
    startTime: '10:00',
    endTime: '14:30',
    timeFormatted: '10:00 AM - 2:30 PM',
    location: 'Peelamedu Community Centre',
    address: 'Community Centre, Hope College Road, Peelamedu, Coimbatore 641004',
    neighborhood: 'Peelamedu',
    city: 'Coimbatore',
    latitude: 11.0244,
    longitude: 77.0183,
    rsvpCount: 41,
    organiser: ORGANISERS.david,
    image: 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Board Game Social Night: Strategy & Casual Tables',
    description:
      'An evening dedicated to board gaming across eight distinct tables. Whether you love heavy strategy titles (Terraforming Mars, Brass Birmingham, Wingspan) or friendly party games (Codenames, Dixit, Ticket to Ride), there is an open seat for you.\n\nGame teachers will be on hand at every beginner table to explain the rules in under 10 minutes so no one has to read dense instruction booklets alone.\n\nSmall venue cover includes unlimited warm masala chai and biscuits.',
    summary: 'Eight tables of modern board games with friendly rules teachers for newcomers.',
    category: 'Community',
    tags: ['board games', 'social', 'evening', 'strategy', 'tabletop'],
    daysFromNow: 5,
    startTime: '18:00',
    endTime: '22:30',
    timeFormatted: '6:00 PM - 10:30 PM',
    location: 'The Meeple House',
    address: '9 Nava India Road, Peelamedu, Coimbatore 641004',
    neighborhood: 'Peelamedu',
    city: 'Coimbatore',
    latitude: 11.0219,
    longitude: 77.0106,
    rsvpCount: 35,
    organiser: ORGANISERS.david,
    image: 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=1200&q=80',
  },

  // -------------------------------------------------------------------------
  // 7. YARD SALE (5 upcoming events)
  // -------------------------------------------------------------------------
  {
    title: 'Multi-Family Street Yard Sale & Second-hand Fair',
    description:
      'Ten households along Thirumal Street are joining forces for a large neighborhood clearance. Great bargains on solid teak coffee tables, kitchenware, children’s bicycles, board games, sewing supplies, and hundreds of paperback books.\n\nAll items are tested, clean, and priced reasonably for quick adoption. Two families offering larger furniture can provide loading assistance.\n\nPrices negotiable after 11:30 AM. Anything unsold by 2:00 PM will be donated directly to the local community shelter.',
    summary: 'Ten families clearing out furniture, bicycles, books, and appliances at fair prices.',
    category: 'Yard Sale',
    tags: ['yard sale', 'flea market', 'furniture', 'second hand', 'bargains'],
    daysFromNow: 2,
    startTime: '08:30',
    endTime: '14:00',
    timeFormatted: '8:30 AM - 2:00 PM',
    location: 'Thirumal Street Community Lane',
    address: 'Thirumal Street, Saibaba Colony, Coimbatore 641011',
    neighborhood: 'Saibaba Colony',
    city: 'Coimbatore',
    latitude: 11.0283,
    longitude: 76.9478,
    rsvpCount: 54,
    organiser: ORGANISERS.fatima,
    image: 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Relocating Abroad Flat Clear-out: Home Appliances & Furniture',
    description:
      'Liquidating a complete two-bedroom apartment before moving overseas next month. Every single item has been gently used and maintained in excellent condition:\n\n• Samsung 324L double-door frost-free refrigerator (2.5 years old)\n• IFB 7kg front-loading washing machine\n• Solid sheesham wood study desk and ergonomic mesh chair\n• Dual suspension hybrid bicycle with helmet\n• Heavy stainless steel cookware and glassware sets\n\nCash, Google Pay, and UPI accepted. Ground-floor parking with direct elevator access for smooth pickup.',
    summary: 'Full 2BHK flat liquidation: major home appliances, solid wood furniture, and kitchenware.',
    category: 'Yard Sale',
    tags: ['garage sale', 'appliances', 'furniture', 'moving sale', 'electronics'],
    daysFromNow: 6,
    startTime: '09:00',
    endTime: '17:00',
    timeFormatted: '9:00 AM - 5:00 PM',
    location: 'Flat 3B, Sunrise Apartments',
    address: 'Sunrise Apartments, 2nd Street, Vadavalli, Coimbatore 641041',
    neighborhood: 'Vadavalli',
    city: 'Coimbatore',
    latitude: 11.0272,
    longitude: 76.9036,
    rsvpCount: 31,
    organiser: ORGANISERS.fatima,
    image: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Vintage Books, Vinyl Records & Classic Magazines Swap',
    description:
      'A cozy weekend trunk exchange for collectors of classic literature, Tamil novels (Kalki, Sujatha, Jayakanthan), art history monographs, and vintage vinyl records.\n\nBring books or records you have finished enjoying and swap directly with fellow bibliophiles, or buy items starting as low as ₹30.\n\nOutdoor garden seating with shaded canopies and filter coffee available on site.',
    summary: 'Book lovers and record collectors swap meet with classic literature and vintage vinyl.',
    category: 'Yard Sale',
    tags: ['books', 'records', 'swap', 'vintage', 'literature'],
    daysFromNow: 7,
    startTime: '10:00',
    endTime: '15:30',
    timeFormatted: '10:00 AM - 3:30 PM',
    location: 'Old Town Heritage Courtyard',
    address: '54 Old Station Road, Town Hall, Coimbatore 641001',
    neighborhood: 'Town Hall',
    city: 'Coimbatore',
    latitude: 10.9931,
    longitude: 76.9648,
    rsvpCount: 40,
    organiser: ORGANISERS.fatima,
    image: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Neighbourhood Plant, Seedling & Garden Tool Swap',
    description:
      'Got overgrown monstera cuttings, extra terracotta pots, or garden trowels sitting in your shed? Bring them to our friendly community propagation swap!\n\nTables arranged by category: succulents & indoor foliage, medicinal herb saplings, organic seeds, and garden hand tools.\n\nEven if you do not have plants to trade, come by — regular gardeners always bring plenty of extra rooted cuttings to share freely with beginners.',
    summary: 'Community plant swap: cuttings, potted saplings, seeds, and extra gardening tools.',
    category: 'Yard Sale',
    tags: ['plants', 'swap', 'gardening', 'seeds', 'cuttings'],
    daysFromNow: 10,
    startTime: '09:00',
    endTime: '12:30',
    timeFormatted: '9:00 AM - 12:30 PM',
    location: 'Greenways Colony Park',
    address: 'Greenways Colony, Kovaipudur, Coimbatore 641042',
    neighborhood: 'Kovaipudur',
    city: 'Coimbatore',
    latitude: 10.9385,
    longitude: 76.9248,
    rsvpCount: 27,
    organiser: ORGANISERS.priya,
    image: 'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&w=1200&q=80',
  },
  {
    title: 'Children’s Toys, Cycles & Board Games Clear-out',
    description:
      'A dedicated morning market for outgrown kids’ bicycles, trikes, Lego collections, educational wooden toys, and storybooks.\n\nAll toys have been sanitized and verified complete with all components. Perfect for parents looking for high quality developmental toys and outdoor scooters at a fraction of store prices.\n\nChildren are invited to play in the sandbox while parents browse the stalls.',
    summary: 'Sanitized outgrown bicycles, Lego sets, and children’s books at community prices.',
    category: 'Yard Sale',
    tags: ['kids toys', 'bicycles', 'board games', 'second hand', 'family'],
    daysFromNow: 14,
    startTime: '09:30',
    endTime: '13:00',
    timeFormatted: '9:30 AM - 1:00 PM',
    location: 'Kovai Children’s Park Grounds',
    address: 'Cross Cut Road, Gandhipuram, Coimbatore 641012',
    neighborhood: 'Gandhipuram',
    city: 'Coimbatore',
    latitude: 11.0185,
    longitude: 76.9672,
    rsvpCount: 33,
    organiser: ORGANISERS.fatima,
    image: 'https://images.unsplash.com/photo-1558060370-d644479cb6f7?auto=format&fit=crop&w=1200&q=80',
  },
];

// ---------------------------------------------------------------------------
// 7 Realistic Expired / Past Events (Demonstrated separately)
// ---------------------------------------------------------------------------
const EXPIRED_EVENTS: SeedEventDefinition[] = [
  {
    title: '[Past] District Monsoon Football Tournament Final',
    description:
      'The thrilling final clash of the monsoon 7-a-side community tournament. Eight teams competed over two weekends, culminating in an electric showdown between Saibaba Strikers and Gandhipuram FC.\n\nRefreshments and medal distribution ceremony followed the final whistle.',
    summary: 'Championship final match of the regional monsoon football league.',
    category: 'Sports',
    tags: ['football', 'tournament', 'finals', 'sports', 'past'],
    daysFromNow: -5,
    startTime: '16:00',
    endTime: '18:30',
    timeFormatted: '4:00 PM - 6:30 PM',
    location: 'VOC Park Football Stadium',
    address: 'VOC Park, Gandhipuram, Coimbatore 641018',
    neighborhood: 'Gandhipuram',
    city: 'Coimbatore',
    latitude: 11.0168,
    longitude: 76.9558,
    rsvpCount: 112,
    organiser: ORGANISERS.arun,
    image: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1200&q=80',
    isExpired: true,
  },
  {
    title: '[Past] Classical Bamboo Flute & Mridangam Evening',
    description:
      'An enchanting classical flute recital by maestro R. Venkataraman, accompanied by veteran mridangist S. Sundaram. Features memorable ragas including Kalyani, Mohanam, and Sindhu Bhairavi in the tranquil courtyard setting.',
    summary: 'Acoustic bamboo flute and mridangam classical recital in the heritage courtyard.',
    category: 'Music',
    tags: ['carnatic', 'flute', 'classical', 'acoustic', 'past'],
    daysFromNow: -10,
    startTime: '18:00',
    endTime: '20:15',
    timeFormatted: '6:00 PM - 8:15 PM',
    location: 'Kuruvai Heritage Hall',
    address: '12 Thadagam Road, R S Puram, Coimbatore 641002',
    neighborhood: 'R S Puram',
    city: 'Coimbatore',
    latitude: 11.0071,
    longitude: 76.9492,
    rsvpCount: 88,
    organiser: ORGANISERS.meena,
    image: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=1200&q=80',
    isExpired: true,
  },
  {
    title: '[Past] Kovai Monsoon Biryani & Kebab Festival',
    description:
      'A celebrated weekend gathering of nine historic catering families showcasing distinct dum biryani styles: Seeraga Samba mutton biryani, Thalassery chicken dum, and fragrant jackfruit biryani with traditional brinjal pachadi.\n\nOver four hundred plates served across the two-day festival.',
    summary: 'Celebration of traditional wood-fired dum biryani styles with nine culinary masters.',
    category: 'Food',
    tags: ['biryani', 'food festival', 'kongu', 'street food', 'past'],
    daysFromNow: -4,
    startTime: '12:00',
    endTime: '16:00',
    timeFormatted: '12:00 PM - 4:00 PM',
    location: 'Ukkadam Lake Promenade Courtyard',
    address: 'Lake Road, Ukkadam, Coimbatore 641001',
    neighborhood: 'Ukkadam',
    city: 'Coimbatore',
    latitude: 10.9892,
    longitude: 76.9617,
    rsvpCount: 164,
    organiser: ORGANISERS.priya,
    image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=1200&q=80',
    isExpired: true,
  },
  {
    title: '[Past] Introduction to Generative AI with Google Vertex AI',
    description:
      'An in-depth architecture walkthrough exploring multimodal models, function calling, and structured outputs on Google Cloud Vertex AI and Cloud Run.\n\nAttendees built a semantic search pipeline across PDF documentation using Cloud Run microservices.',
    summary: 'Technical workshop on building multimodal applications with Google Vertex AI.',
    category: 'Technology',
    tags: ['vertex ai', 'gemini', 'google cloud', 'ai', 'past'],
    daysFromNow: -8,
    startTime: '18:00',
    endTime: '20:30',
    timeFormatted: '6:00 PM - 8:30 PM',
    location: 'Kovai Tech Collective',
    address: 'Sri Krishna Towers, Avinashi Road, Peelamedu, Coimbatore 641004',
    neighborhood: 'Peelamedu',
    city: 'Coimbatore',
    latitude: 11.0272,
    longitude: 77.0263,
    rsvpCount: 65,
    organiser: ORGANISERS.karthik,
    image: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&q=80',
    isExpired: true,
  },
  {
    title: '[Past] Night Sky Observation & Telescope Stargazing',
    description:
      'A clear-sky observation session with two 8-inch Dobsonian telescopes. Over fifty participants viewed Saturn’s rings, Jupiter with its Galilean moons, and the Orion nebula.\n\nAstronomer David Mathew guided children through constellations and basic astronomical coordinates.',
    summary: 'Stargazing with Dobsonian telescopes observing Saturn rings and Jupiter moons.',
    category: 'Education',
    tags: ['astronomy', 'stargazing', 'science', 'telescope', 'past'],
    daysFromNow: -14,
    startTime: '19:30',
    endTime: '22:00',
    timeFormatted: '7:30 PM - 10:00 PM',
    location: 'Vellingiri Foothills Clear Horizon Point',
    address: 'Poondi Bus Stand Road, Perur, Coimbatore 641010',
    neighborhood: 'Perur',
    city: 'Coimbatore',
    latitude: 10.9667,
    longitude: 76.8833,
    rsvpCount: 57,
    organiser: ORGANISERS.david,
    image: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1200&q=80',
    isExpired: true,
  },
  {
    title: '[Past] Perur Lake Birdwatching & Habitat Restoration Walk',
    description:
      'An early-morning guided wetland bird census. We observed 42 resident and migratory species including Spot-billed Pelicans, Painted Storks, and Glossy Ibises.\n\nVolunteers collected plastic debris from nesting shores and documented bird population health.',
    summary: 'Annual wetland bird count identifying 42 resident and migratory bird species.',
    category: 'Community',
    tags: ['birdwatching', 'wildlife', 'conservation', 'lake', 'past'],
    daysFromNow: -20,
    startTime: '06:00',
    endTime: '08:45',
    timeFormatted: '6:00 AM - 8:45 AM',
    location: 'Perur Lake North Bund',
    address: 'Perur Pateeswarar Temple Road, Perur, Coimbatore 641010',
    neighborhood: 'Perur',
    city: 'Coimbatore',
    latitude: 10.9739,
    longitude: 76.8906,
    rsvpCount: 46,
    organiser: ORGANISERS.david,
    image: 'https://images.unsplash.com/photo-1552728089-57bdde30beb3?auto=format&fit=crop&w=1200&q=80',
    isExpired: true,
  },
  {
    title: '[Past] Pre-Monsoon Attic & Garage Clearance Sale',
    description:
      'Seven Saibaba Colony households cleared their attics and sheds before the heavy rain season. High demand for vintage brass lamps, folding card tables, solid wood bookshelves, and second-hand musical instruments.\n\nAll funds raised supported neighborhood stray animal vaccinations.',
    summary: 'Community clearance of antique brassware, bookshelves, and folding furniture.',
    category: 'Yard Sale',
    tags: ['garage sale', 'vintage', 'brassware', 'bookshelves', 'past'],
    daysFromNow: -12,
    startTime: '08:30',
    endTime: '13:30',
    timeFormatted: '8:30 AM - 1:30 PM',
    location: '28 Bharathi Park Road',
    address: '28 Bharathi Park Road, Saibaba Colony, Coimbatore 641011',
    neighborhood: 'Saibaba Colony',
    city: 'Coimbatore',
    latitude: 11.0305,
    longitude: 76.9512,
    rsvpCount: 39,
    organiser: ORGANISERS.fatima,
    image: 'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?auto=format&fit=crop&w=1200&q=80',
    isExpired: true,
  },
];

// ---------------------------------------------------------------------------
// Seeding Engine
// ---------------------------------------------------------------------------
async function clearPreviouslySeeded(): Promise<number> {
  console.log('[Seed] Clearing previously seeded events...');
  const snapshot = await db.collection('events').where('seedTag', '==', SEED_TAG).get();
  if (snapshot.empty) {
    console.log('[Seed] No existing seeded events found to remove.');
    return 0;
  }

  const docs = snapshot.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    for (const doc of docs.slice(i, i + 400)) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }

  console.log(`[Seed] Cleared ${docs.length} previously seeded events.`);
  return docs.length;
}

async function seedOrganiserProfiles(): Promise<void> {
  console.log('[Seed] Ensuring demo organiser user profiles exist...');
  const batch = db.batch();

  for (const organiser of Object.values(ORGANISERS)) {
    const userRef = db.collection('users').doc(organiser.id);
    batch.set(
      userRef,
      {
        uid: organiser.id,
        displayName: organiser.name,
        email: `${organiser.id}@nearby-events.demo`,
        photoURL: null,
        bio: organiser.bio,
        neighborhood: 'Coimbatore Central',
        city: 'Coimbatore',
        seedTag: SEED_TAG,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  await batch.commit();
  console.log(`[Seed] Created / updated ${Object.keys(ORGANISERS).length} organiser profiles.`);
}

async function seedEvents(): Promise<void> {
  const shouldClear = process.argv.includes('--clear');
  if (shouldClear) {
    await clearPreviouslySeeded();
  }

  await seedOrganiserProfiles();

  const allEventsToSeed = [...UPCOMING_EVENTS, ...EXPIRED_EVENTS];
  console.log(
    `[Seed] Seeding ${allEventsToSeed.length} events (${UPCOMING_EVENTS.length} upcoming, ${EXPIRED_EVENTS.length} expired)...`,
  );

  let insertedCount = 0;
  let updatedCount = 0;

  for (let i = 0; i < allEventsToSeed.length; i += 20) {
    const chunk = allEventsToSeed.slice(i, i + 20);
    const batch = db.batch();

    for (const item of chunk) {
      const date = dateStringWithOffset(item.daysFromNow);
      const startsAt = combineDateTime(date, item.startTime);
      const endsAt = combineDateTime(date, item.endTime);

      const isActuallyExpired = item.isExpired || endsAt.getTime() < Date.now();
      const status: 'ACTIVE' | 'EXPIRED' = isActuallyExpired ? 'EXPIRED' : 'ACTIVE';

      // Check for existing event with the same title to ensure idempotency
      const existing = await db
        .collection('events')
        .where('seedTag', '==', SEED_TAG)
        .where('title', '==', item.title)
        .limit(1)
        .get();

      const docRef = existing.empty ? db.collection('events').doc() : existing.docs[0]!.ref;
      if (existing.empty) {
        insertedCount++;
      } else {
        updatedCount++;
      }

      const eventPayload = {
        // Core fields specified by user requirements
        title: item.title,
        description: item.description,
        summary: item.summary,
        category: item.category,
        date: date,
        time: item.timeFormatted,
        startTime: item.startTime,
        endTime: item.endTime,
        location: item.location,
        neighborhood: item.neighborhood,
        city: item.city,
        latitude: item.latitude,
        longitude: item.longitude,
        image: item.image,
        imageUrl: item.image,
        imagePath: null,
        tags: item.tags,
        rsvpCount: item.rsvpCount,
        'RSVP count': item.rsvpCount,

        // Temporal & lifecycle fields
        startsAt: Timestamp.fromDate(startsAt),
        endsAt: Timestamp.fromDate(endsAt),
        status: status,

        // Organiser & attribution
        creatorId: item.organiser.id,
        creatorName: item.organiser.name,
        creatorPhotoURL: null,

        // Search indexes
        neighborhoodLower: normalise(item.neighborhood),
        cityLower: normalise(item.city),
        searchKeywords: buildKeywords([
          item.title,
          item.summary,
          item.category,
          item.location,
          item.neighborhood,
          item.city,
          item.tags.join(' '),
          item.description.slice(0, 500),
        ]),

        // Audit tags
        seedTag: SEED_TAG,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      batch.set(docRef, eventPayload, { merge: true });
    }

    await batch.commit();
  }

  console.log('\n================================================================');
  console.log(`✅ Demo/Seed completed successfully!`);
  console.log(`   - Upcoming events seeded: ${UPCOMING_EVENTS.length}`);
  console.log(`   - Expired events seeded:  ${EXPIRED_EVENTS.length}`);
  console.log(`   - Total seeded events:    ${allEventsToSeed.length} (${insertedCount} new, ${updatedCount} refreshed)`);
  console.log(`   - Categories covered:     Sports, Music, Food, Technology, Education, Community, Yard Sale`);
  console.log(`   - Expired events:         Available for separate demonstration`);
  console.log('================================================================\n');
}

// Execute
seedEvents()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Seed failed with error:', err);
    process.exit(1);
  });
