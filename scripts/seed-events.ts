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
 * On top of the events it seeds the things that make the board feel lived-in: a cast of
 * neighbours with points and badges, attendee lists, check-ins on past events, and a few
 * question-and-answer threads. One event is always "happening now" so the check-in flow
 * can be demonstrated at any time — its code is NEARBY.
 *
 * Usage:
 *   npx tsx scripts/seed-events.ts              # Add / refresh demo events
 *   npx tsx scripts/seed-events.ts --clear      # Clear seeded events first
 *   npx tsx scripts/seed-events.ts --if-empty   # Seed only when the board has no events
 *   npx tsx scripts/seed-events.ts --local      # What `npm run dev` runs: emulator only,
 *                                               # and never fails the command after it
 */

import net from 'node:net';
import { env } from '../backend/src/config/env';
import { FieldValue, Timestamp, getDb, initFirebase } from '../backend/src/config/firebase';

initFirebase();
const db = getDb();
const SEED_TAG = 'seed:nearby-objects-demo';

/** Check-in code of the always-live demo event. */
const LIVE_EVENT_CODE = 'NEARBY';

/**
 * `npm run dev` starts the emulators and this script at the same moment, and the Firestore
 * emulator takes a few seconds to boot its JVM. Waiting for the port beats failing with a
 * connection error the first time someone runs the project.
 */
async function waitForEmulator(timeoutMs = 90_000): Promise<void> {
  const target = env.firestoreEmulatorHost;
  if (!target) return;

  const [host, portRaw] = target.split(':');
  const port = Number(portRaw);
  const deadline = Date.now() + timeoutMs;
  let announced = false;

  while (Date.now() < deadline) {
    const open = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ host: host || '127.0.0.1', port });
      socket.setTimeout(1500);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      const fail = () => {
        socket.destroy();
        resolve(false);
      };
      socket.once('error', fail);
      socket.once('timeout', fail);
    });

    if (open) return;

    if (!announced) {
      console.log(`[Seed] Waiting for the Firestore emulator on ${target}...`);
      announced = true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(
    `The Firestore emulator did not come up on ${target}. Start it with "npm run emulators".`,
  );
}

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

/** People who turn up to things — they fill the attendee lists and the leaderboard. */
const NEIGHBOURS = [
  { id: 'seed-user-anitha', name: 'Anitha Raman', neighborhood: 'R S Puram' },
  { id: 'seed-user-vignesh', name: 'Vignesh Kumar', neighborhood: 'Gandhipuram' },
  { id: 'seed-user-lakshmi', name: 'Lakshmi Narayanan', neighborhood: 'Saibaba Colony' },
  { id: 'seed-user-imran', name: 'Imran Sheriff', neighborhood: 'Peelamedu' },
  { id: 'seed-user-divya', name: 'Divya Subramaniam', neighborhood: 'Race Course' },
  { id: 'seed-user-sanjay', name: 'Sanjay Venkat', neighborhood: 'Saravanampatti' },
  { id: 'seed-user-kavya', name: 'Kavya Mohan', neighborhood: 'R S Puram' },
  { id: 'seed-user-joseph', name: 'Joseph Anand', neighborhood: 'Singanallur' },
  { id: 'seed-user-revathi', name: 'Revathi Iyer', neighborhood: 'Peelamedu' },
  { id: 'seed-user-naveen', name: 'Naveen Prakash', neighborhood: 'Gandhipuram' },
  { id: 'seed-user-shreya', name: 'Shreya Nair', neighborhood: 'Race Course' },
  { id: 'seed-user-ganesh', name: 'Ganesh Murthy', neighborhood: 'Vadavalli' },
];

/** Question-and-answer threads, matched to events by a word in the title. */
const COMMENT_THREADS: Array<{ match: string; thread: Array<{ from: 'guest' | 'host'; text: string }> }> = [
  {
    match: 'Football',
    thread: [
      { from: 'guest', text: 'Is there parking near the ground, or is it better to come by bus?' },
      { from: 'host', text: 'There is free two-wheeler parking by the pavilion gate. Cars are easier on the Nanjappa Road side.' },
      { from: 'guest', text: 'First time joining — do I need to bring my own bib?' },
      { from: 'host', text: 'No need, we bring bibs for both teams. Just bring water.' },
    ],
  },
  {
    match: 'Live now',
    thread: [
      { from: 'guest', text: 'Just arrived — where exactly is the group sitting?' },
      { from: 'host', text: 'Under the big rain tree near the east gate. Look for the green banner, and ask me for the check-in code.' },
    ],
  },
];

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
  /** Ignores daysFromNow and the times: the event always started 45 minutes ago. */
  liveNow?: boolean;
}

// 25 realistic upcoming events across all 7 categories + 7 expired events
const UPCOMING_EVENTS: SeedEventDefinition[] = [
  // -------------------------------------------------------------------------
  // 0. HAPPENING NOW — keeps the "live" badge and the check-in flow demonstrable
  // -------------------------------------------------------------------------
  {
    title: 'Live now: Race Course Neighbours Meet & Walk',
    description:
      'An easy-paced loop of the Race Course walking track with whoever turns up, followed by tea at the stall near the east gate. No fixed agenda — it is simply a standing excuse for people who live nearby to meet each other.\n\nJoin for one lap or for the whole thing. Children and dogs on leads are welcome.\n\nThis listing is always in progress on the demo board, so you can try checking in: ask the organiser for the code, or scan the check-in QR from the organiser view.',
    summary: 'A relaxed walk and tea for people who live around Race Course. Join any time.',
    category: 'Community',
    tags: ['walk', 'meetup', 'outdoor', 'family friendly', 'live'],
    daysFromNow: 0,
    startTime: '00:00',
    endTime: '00:00',
    timeFormatted: '',
    location: 'Race Course Walking Track, East Gate',
    address: 'Race Course Road, Race Course, Coimbatore 641018',
    neighborhood: 'Race Course',
    city: 'Coimbatore',
    latitude: 11.0006,
    longitude: 76.9783,
    rsvpCount: 18,
    organiser: ORGANISERS.david,
    image: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=1200&q=80',
    liveNow: true,
  },
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

function hhmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function ymd(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Resolves when an event happens. The live event is pinned around the current moment. */
function scheduleFor(item: SeedEventDefinition): { date: string; startsAt: Date; endsAt: Date; startTime: string; endTime: string } {
  if (!item.liveNow) {
    const date = dateStringWithOffset(item.daysFromNow);
    return {
      date,
      startsAt: combineDateTime(date, item.startTime),
      endsAt: combineDateTime(date, item.endTime),
      startTime: item.startTime,
      endTime: item.endTime,
    };
  }

  const now = new Date();
  let startsAt = new Date(now.getTime() - 45 * 60_000);
  let endsAt = new Date(now.getTime() + 2 * 3_600_000);

  // The form model is one calendar day with start < end, so keep the event inside today.
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart.getTime() + 86_400_000 - 60_000);
  if (startsAt < dayStart) startsAt = dayStart;
  if (endsAt > dayEnd) endsAt = dayEnd;

  return { date: ymd(now), startsAt, endsAt, startTime: hhmm(startsAt), endTime: hhmm(endsAt) };
}

function formatClock(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = (h ?? 0) >= 12 ? 'PM' : 'AM';
  const hour = (h ?? 0) % 12 === 0 ? 12 : (h ?? 0) % 12;
  return `${hour}:${String(m ?? 0).padStart(2, '0')} ${suffix}`;
}

interface SeededEvent {
  ref: FirebaseFirestore.DocumentReference;
  item: SeedEventDefinition;
  isNew: boolean;
  expired: boolean;
  startsAt: Date;
}

/**
 * Attendee lists, check-ins and comment threads for events that were just created.
 *
 * Only new events get them: re-running the seed must not duplicate comments or undo an
 * RSVP somebody made by hand while trying the app.
 */
async function seedEngagement(events: SeededEvent[]): Promise<Map<string, { rsvps: number; checkIns: number; categories: Map<string, number> }>> {
  const activity = new Map<string, { rsvps: number; checkIns: number; categories: Map<string, number> }>();
  const noteRsvp = (uid: string, category: string, checkedIn: boolean) => {
    const entry = activity.get(uid) ?? { rsvps: 0, checkIns: 0, categories: new Map<string, number>() };
    entry.rsvps += 1;
    if (checkedIn) entry.checkIns += 1;
    entry.categories.set(category, (entry.categories.get(category) ?? 0) + 1);
    activity.set(uid, entry);
  };

  let cursor = 0;

  for (const seeded of events) {
    if (!seeded.isNew) continue;

    const { ref, item, expired } = seeded;
    const batch = db.batch();

    // A visible handful of named attendees; the rest of the count stays anonymous.
    const visible = Math.min(8, item.rsvpCount, NEIGHBOURS.length);
    // Past events show a believable turnout, the live one has a few people already in.
    const checkedInShare = expired ? 0.75 : item.liveNow ? 0.4 : 0;
    let checkedInVisible = 0;

    for (let i = 0; i < visible; i += 1) {
      const neighbour = NEIGHBOURS[(cursor + i) % NEIGHBOURS.length]!;
      const checkedIn = i < Math.round(visible * checkedInShare);
      if (checkedIn) checkedInVisible += 1;

      const joinedAt = Timestamp.fromDate(new Date(Date.now() - (i + 1) * 3_600_000 * 5));

      batch.set(ref.collection('rsvps').doc(neighbour.id), {
        uid: neighbour.id,
        displayName: neighbour.name,
        photoURL: null,
        createdAt: joinedAt,
        ...(checkedIn ? { checkedInAt: Timestamp.fromDate(seeded.startsAt) } : {}),
      });

      batch.set(db.collection('users').doc(neighbour.id).collection('attending').doc(ref.id), {
        eventId: ref.id,
        title: item.title,
        category: item.category,
        startsAt: Timestamp.fromDate(seeded.startsAt),
        imageUrl: item.image,
        createdAt: joinedAt,
      });

      noteRsvp(neighbour.id, item.category, checkedIn);
    }

    cursor += 3;

    // The headline turnout scales with the full RSVP count, not just the visible names.
    const checkedInCount = expired
      ? Math.max(checkedInVisible, Math.round(item.rsvpCount * 0.78))
      : checkedInVisible;

    const thread = COMMENT_THREADS.find((entry) => item.title.includes(entry.match))?.thread ?? [];
    thread.forEach((comment, index) => {
      const guest = NEIGHBOURS[(cursor + index) % NEIGHBOURS.length]!;
      const author =
        comment.from === 'host'
          ? { id: item.organiser.id, name: item.organiser.name }
          : { id: guest.id, name: guest.name };

      batch.set(ref.collection('comments').doc(), {
        uid: author.id,
        displayName: author.name,
        photoURL: null,
        text: comment.text,
        isOrganiser: comment.from === 'host',
        // Spaced out so the thread reads in order.
        createdAt: Timestamp.fromDate(new Date(Date.now() - (thread.length - index) * 40 * 60_000)),
      });
    });

    batch.set(ref, { checkedInCount, commentCount: thread.length }, { merge: true });
    await batch.commit();
  }

  return activity;
}

async function seedProfiles(
  hosted: Map<string, number>,
  activity: Map<string, { rsvps: number; checkIns: number; categories: Map<string, number> }>,
): Promise<void> {
  console.log('[Seed] Ensuring demo organiser and neighbour profiles exist...');
  const batch = db.batch();

  const people = [
    ...Object.values(ORGANISERS).map((person) => ({
      id: person.id,
      name: person.name,
      bio: person.bio,
      neighborhood: 'Coimbatore Central',
    })),
    ...NEIGHBOURS.map((person) => ({
      id: person.id,
      name: person.name,
      bio: 'Lives nearby and turns up to things.',
      neighborhood: person.neighborhood,
    })),
  ];

  for (const person of people) {
    const hostedCount = hosted.get(person.id) ?? 0;
    const entry = activity.get(person.id);

    const profile: Record<string, unknown> = {
      uid: person.id,
      displayName: person.name,
      email: `${person.id}@nearby-events.demo`,
      photoURL: null,
      bio: person.bio,
      neighborhood: person.neighborhood,
      city: 'Coimbatore',
      seedTag: SEED_TAG,
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Points are only (re)computed when this run actually created the activity behind
    // them — otherwise a refresh would wipe what has accumulated since.
    if (hostedCount > 0 || entry) {
      const rsvps = entry?.rsvps ?? 0;
      const checkIns = entry?.checkIns ?? 0;

      // Mirrors POINTS in backend/src/services/gamificationService.ts.
      profile.points = hostedCount * 20 + rsvps * 5 + checkIns * 15;
      profile.stats = { hosted: hostedCount, rsvps, checkIns };
      profile.categoryCounts = Object.fromEntries(entry?.categories ?? []);
      profile.createdAt = FieldValue.serverTimestamp();
    }

    batch.set(db.collection('users').doc(person.id), profile, { merge: true });
  }

  await batch.commit();
  console.log(`[Seed] Created / updated ${people.length} demo profiles.`);
}

/**
 * `--local` is the mode `npm run dev` uses. It refreshes the demo board on every start —
 * which keeps the dates current and the live event live however long ago it was first
 * seeded — but only ever against the emulator, so starting the dev server can never write
 * demo data into a real Firestore.
 */
const LOCAL_ONLY = process.argv.includes('--local');

async function seedEvents(): Promise<void> {
  if (LOCAL_ONLY && !env.firestoreEmulatorHost) {
    console.log('[Seed] Not running against the emulator — skipping the demo data refresh.');
    return;
  }

  await waitForEmulator();

  if (process.argv.includes('--if-empty')) {
    const existing = await db.collection('events').limit(1).get();
    if (!existing.empty) {
      console.log('[Seed] The board already has events — leaving it as it is.');
      return;
    }
  }

  const shouldClear = process.argv.includes('--clear');
  if (shouldClear) {
    await clearPreviouslySeeded();
  }

  const allEventsToSeed = [...UPCOMING_EVENTS, ...EXPIRED_EVENTS];
  console.log(
    `[Seed] Seeding ${allEventsToSeed.length} events (${UPCOMING_EVENTS.length} upcoming, ${EXPIRED_EVENTS.length} expired)...`,
  );

  let insertedCount = 0;
  let updatedCount = 0;

  const seeded: SeededEvent[] = [];
  const hostedNew = new Map<string, number>();

  for (let i = 0; i < allEventsToSeed.length; i += 20) {
    const chunk = allEventsToSeed.slice(i, i + 20);
    const batch = db.batch();

    for (const item of chunk) {
      const { date, startsAt, endsAt, startTime, endTime } = scheduleFor(item);

      const isActuallyExpired = item.isExpired || endsAt.getTime() < Date.now();
      const status: 'ACTIVE' | 'EXPIRED' = isActuallyExpired ? 'EXPIRED' : 'ACTIVE';

      // Check for existing event with the same title to ensure idempotency
      const existing = await db
        .collection('events')
        .where('seedTag', '==', SEED_TAG)
        .where('title', '==', item.title)
        .limit(1)
        .get();

      const isNew = existing.empty;
      const docRef = isNew ? db.collection('events').doc() : existing.docs[0]!.ref;
      if (isNew) {
        insertedCount++;
        hostedNew.set(item.organiser.id, (hostedNew.get(item.organiser.id) ?? 0) + 1);
      } else {
        updatedCount++;
      }

      seeded.push({ ref: docRef, item, isNew, expired: isActuallyExpired, startsAt });

      const eventPayload = {
        // Core fields specified by user requirements
        title: item.title,
        description: item.description,
        summary: item.summary,
        category: item.category,
        date: date,
        time: item.liveNow ? `${formatClock(startTime)} - ${formatClock(endTime)}` : item.timeFormatted,
        startTime,
        endTime,
        location: item.location,
        address: item.address,
        neighborhood: item.neighborhood,
        city: item.city,
        latitude: item.latitude,
        longitude: item.longitude,
        image: item.image,
        imageUrl: item.image,
        imagePath: null,
        tags: item.tags,

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
        updatedAt: FieldValue.serverTimestamp(),

        // Counters and the check-in code are set once. A refresh moves the dates forward
        // but must not reset RSVPs people have made or reissue a code already handed out.
        ...(isNew
          ? {
              rsvpCount: item.rsvpCount,
              'RSVP count': item.rsvpCount,
              checkedInCount: 0,
              commentCount: 0,
              checkInCode: item.liveNow ? LIVE_EVENT_CODE : randomCheckInCode(),
              createdAt: FieldValue.serverTimestamp(),
            }
          : {}),
      };

      batch.set(docRef, eventPayload, { merge: true });
    }

    await batch.commit();
  }

  const activity = await seedEngagement(seeded);
  await seedProfiles(hostedNew, activity);

  console.log('\n================================================================');
  console.log(`✅ Demo/Seed completed successfully!`);
  console.log(`   - Upcoming events seeded: ${UPCOMING_EVENTS.length}`);
  console.log(`   - Expired events seeded:  ${EXPIRED_EVENTS.length}`);
  console.log(`   - Total seeded events:    ${allEventsToSeed.length} (${insertedCount} new, ${updatedCount} refreshed)`);
  console.log(`   - Categories covered:     Sports, Music, Food, Technology, Education, Community, Yard Sale`);
  console.log(`   - Live demo event:        check-in code ${LIVE_EVENT_CODE}`);
  console.log('================================================================\n');
}

/** Same alphabet as the API: no 0/O or 1/I/L, since the code gets typed by hand. */
function randomCheckInCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

// Execute
seedEvents()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Seed failed with error:', err);

    // In dev the API should still start, so the error above is the whole consequence.
    if (LOCAL_ONLY) {
      console.error('[Seed] Continuing without demo data. Is Java installed? The emulators need it.');
      process.exit(0);
    }

    process.exit(1);
  });
