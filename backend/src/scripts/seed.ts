/**
 * Seeds Firestore with a realistic Coimbatore event board.
 *
 * Dates are generated relative to today, so the board is always populated with
 * genuinely upcoming events no matter when the demo runs — which is what keeps the
 * "Today", "Tomorrow" and "This Weekend" filters meaningful on stage.
 *
 *   npm run seed           add/refresh the demo events
 *   npm run seed:clear     remove previously seeded events first
 */
import { FieldValue, Timestamp, getDb, initFirebase } from '../config/firebase';
import { logger } from '../config/logger';
import { combineDateTime } from '../utils/dates';
import { buildKeywords, normalise } from '../utils/search';
import type { Category } from '../types';

const SEED_TAG = 'seed:nearby-objects-demo';

interface SeedEvent {
  title: string;
  description: string;
  summary: string;
  category: Category;
  tags: string[];
  /** Days from today. */
  inDays: number;
  startTime: string;
  endTime: string;
  location: string;
  address: string;
  neighborhood: string;
  city: string;
  latitude: number;
  longitude: number;
  rsvpCount: number;
  organiser: { id: string; name: string };
  imageQuery: string;
}

const ORGANISERS = {
  priya: { id: 'seed-user-priya', name: 'Priya Raghunathan' },
  arun: { id: 'seed-user-arun', name: 'Arun Sekar' },
  fatima: { id: 'seed-user-fatima', name: 'Fatima Noor' },
  david: { id: 'seed-user-david', name: 'David Mathew' },
  meena: { id: 'seed-user-meena', name: 'Meena Krishnan' },
  karthik: { id: 'seed-user-karthik', name: 'Karthik Balan' },
};

const EVENTS: SeedEvent[] = [
  {
    title: 'Sunday Morning Football at VOC Grounds',
    description:
      'Our weekly seven-a-side game is open to anyone who turns up. We split into balanced teams on the spot, so you do not need to bring a group — plenty of regulars arrive alone and leave with a team.\n\nWe play two forty-minute halves with a short break. Boots are recommended but trainers are fine on the outer pitch. There is a water station by the pavilion, and most of us head for filter coffee at the stall across the road afterwards.\n\nBeginners are genuinely welcome. Mention it when you arrive and we will put you with players who are happy to talk you through positioning.',
    summary: 'Open seven-a-side football, balanced teams picked on the spot, all abilities welcome.',
    category: 'Sports',
    tags: ['football', 'weekly', 'beginners welcome', 'outdoor'],
    inDays: 0,
    startTime: '06:30',
    endTime: '08:30',
    location: 'VOC Park Grounds',
    address: 'VOC Park, Dr Nanjappa Road, Gandhipuram, Coimbatore 641018',
    neighborhood: 'Gandhipuram',
    city: 'Coimbatore',
    latitude: 11.0168,
    longitude: 76.9558,
    rsvpCount: 34,
    organiser: ORGANISERS.arun,
    imageQuery: 'football-pitch',
  },
  {
    title: 'Carnatic Fusion Evening at Kuruvai Hall',
    description:
      'A two-hour set from four young musicians reworking classical Carnatic compositions with a double bass and a cajón. The first half stays close to tradition; the second half is where things get interesting.\n\nSeating is on the floor with cushions provided, and there are chairs along the back wall for anyone who needs them. Doors open thirty minutes early.\n\nEntry is by donation at the door — whatever you can give goes to the hall upkeep fund.',
    summary: 'Four musicians rework Carnatic compositions with double bass and cajón. Entry by donation.',
    category: 'Music',
    tags: ['carnatic', 'live music', 'fusion', 'donation entry'],
    inDays: 1,
    startTime: '18:30',
    endTime: '20:30',
    location: 'Kuruvai Community Hall',
    address: '12 Thadagam Road, R S Puram, Coimbatore 641002',
    neighborhood: 'R S Puram',
    city: 'Coimbatore',
    latitude: 11.0071,
    longitude: 76.9492,
    rsvpCount: 67,
    organiser: ORGANISERS.meena,
    imageQuery: 'live-music',
  },
  {
    title: 'Saturday Farmers Market and Tiffin Stalls',
    description:
      'Twenty-two growers from around Coimbatore district bring produce straight from the field, alongside eight tiffin stalls running from six in the morning.\n\nExpect millets, country vegetables, cold-pressed oils, nattu sakkarai and a changing selection of greens. The tiffin row does idiyappam, kal dosai and ragi kali, with everything served on banana leaf.\n\nBring your own bags — the market has been plastic-free for three years. Cash is easiest, though most stalls accept UPI.',
    summary: 'Twenty-two local growers plus eight tiffin stalls. Plastic-free, bring your own bags.',
    category: 'Food',
    tags: ['farmers market', 'millets', 'breakfast', 'plastic free'],
    inDays: 2,
    startTime: '06:00',
    endTime: '11:00',
    location: 'Kovai Pudur Market Yard',
    address: 'Market Yard, Kovaipudur Main Road, Coimbatore 641042',
    neighborhood: 'Kovaipudur',
    city: 'Coimbatore',
    latitude: 10.9344,
    longitude: 76.9219,
    rsvpCount: 128,
    organiser: ORGANISERS.priya,
    imageQuery: 'farmers-market',
  },
  {
    title: 'Build Your First App on Google Cloud',
    description:
      'A hands-on evening session for students and early-career developers. We start from an empty folder and finish with a working web application deployed on Cloud Run.\n\nWe cover containerising a small Node service, storing data in Firestore, and wiring a deploy that takes one command. You will leave with a running URL you can share.\n\nBring a laptop with Node 20 and the gcloud CLI installed. There are fifteen seats and we have run this twice before — both filled within a day.',
    summary: 'Hands-on session: empty folder to a deployed Cloud Run app in one evening. Fifteen seats.',
    category: 'Technology',
    tags: ['google cloud', 'workshop', 'hands on', 'students'],
    inDays: 3,
    startTime: '18:00',
    endTime: '20:30',
    location: 'Kovai Tech Collective',
    address: '4th Floor, Sri Krishna Towers, Avinashi Road, Peelamedu, Coimbatore 641004',
    neighborhood: 'Peelamedu',
    city: 'Coimbatore',
    latitude: 11.0272,
    longitude: 77.0263,
    rsvpCount: 15,
    organiser: ORGANISERS.karthik,
    imageQuery: 'tech-workshop',
  },
  {
    title: 'Street Multi-Family Yard Sale',
    description:
      'Nine households on the same street are clearing out together. Furniture, kitchenware, children’s clothes, cycles, board games, a sewing machine and a great deal of books.\n\nEverything is priced to move and most of it is negotiable after eleven. Two families have larger items — a dining table and a double bed frame — and can help load if you bring transport.\n\nWe stop at two, and anything left goes to the Udhavum Karangal collection van at half past.',
    summary: 'Nine households clearing out together. Furniture, cycles, books, negotiable after 11am.',
    category: 'Yard Sale',
    tags: ['yard sale', 'furniture', 'second hand', 'books'],
    inDays: 2,
    startTime: '08:00',
    endTime: '14:00',
    location: 'Thirumal Street',
    address: 'Thirumal Street, Saibaba Colony, Coimbatore 641011',
    neighborhood: 'Saibaba Colony',
    city: 'Coimbatore',
    latitude: 11.0283,
    longitude: 76.9478,
    rsvpCount: 41,
    organiser: ORGANISERS.fatima,
    imageQuery: 'yard-sale',
  },
  {
    title: 'Noyyal River Clean-Up Drive',
    description:
      'The sixth clean-up of the stretch behind the water works. Last time forty-three of us filled nine sacks in two hours, and the difference has held since.\n\nGloves, sacks and grabbers are provided. Wear closed shoes and clothes you do not mind ruining. Children are welcome with an adult, and we keep them to the dry bank.\n\nBreakfast and tender coconut afterwards for everyone who shows up, courtesy of the residents association.',
    summary: 'Sixth clean-up of the stretch behind the water works. Gloves and sacks provided.',
    category: 'Community',
    tags: ['environment', 'volunteering', 'river', 'family friendly'],
    inDays: 1,
    startTime: '06:30',
    endTime: '09:00',
    location: 'Noyyal Riverbank, behind the water works',
    address: 'Noyyal Riverbank, Ukkadam, Coimbatore 641001',
    neighborhood: 'Ukkadam',
    city: 'Coimbatore',
    latitude: 10.9892,
    longitude: 76.9617,
    rsvpCount: 58,
    organiser: ORGANISERS.priya,
    imageQuery: 'river-cleanup',
  },
  {
    title: 'Spoken English Practice Circle',
    description:
      'A free weekly circle for anyone who can read English but freezes when it is time to speak. No grammar drills and no corrections from the front of the room.\n\nWe run three rounds: a two-minute introduction, a paired conversation on a prompt drawn at random, and a short group discussion. Everyone speaks in every round, which is the entire point.\n\nAbout thirty people come each week, ranging from college students to retired bank staff. Walk in, no registration.',
    summary: 'Free weekly circle for anyone who freezes when speaking English. Everyone speaks every round.',
    category: 'Education',
    tags: ['spoken english', 'free', 'weekly', 'practice'],
    inDays: 4,
    startTime: '17:30',
    endTime: '19:00',
    location: 'District Central Library, Hall 2',
    address: 'District Central Library, VKK Menon Road, Gandhipuram, Coimbatore 641012',
    neighborhood: 'Gandhipuram',
    city: 'Coimbatore',
    latitude: 11.0152,
    longitude: 76.9639,
    rsvpCount: 29,
    organiser: ORGANISERS.david,
    imageQuery: 'study-group',
  },
  {
    title: 'Dawn Trek to Vellingiri Foothills',
    description:
      'A moderate six-kilometre trek along the lower trail, leaving before first light so we are above the treeline for sunrise. Back at the base by half past nine.\n\nThis is a walking trek, not a climb, but the last kilometre is steep and loose underfoot. Carry two litres of water, a hat and grippy shoes. We travel together from the meeting point in two shared vans.\n\nThe group caps at twenty-five so the trail stays pleasant for everyone on it.',
    summary: 'Moderate 6km dawn trek along the lower trail, above the treeline for sunrise. Caps at 25.',
    category: 'Sports',
    tags: ['trekking', 'sunrise', 'outdoor', 'moderate'],
    inDays: 6,
    startTime: '04:30',
    endTime: '09:30',
    location: 'Meeting point: Poondi Bus Stand',
    address: 'Poondi Bus Stand, Perur Main Road, Coimbatore 641010',
    neighborhood: 'Perur',
    city: 'Coimbatore',
    latitude: 10.9667,
    longitude: 76.8833,
    rsvpCount: 25,
    organiser: ORGANISERS.arun,
    imageQuery: 'mountain-trek',
  },
  {
    title: 'Kongunadu Home Cooking Exchange',
    description:
      'Six home cooks each teach one dish from their family kitchen, and everyone rotates through all six stations across the afternoon.\n\nThis round: arachuvitta sambar, kola urundai, thengai paal payasam, ulundhu kali, ennai kathirikai and a Kongu-style rasam that has caused arguments at previous sessions.\n\nYou cook, you taste, and you leave with written recipes for all six. Ingredients are covered by the ticket; bring a container for leftovers because there always are some.',
    summary: 'Six home cooks, six family dishes, everyone rotates through every station. Recipes to take home.',
    category: 'Food',
    tags: ['cooking class', 'kongunadu', 'hands on', 'recipes'],
    inDays: 8,
    startTime: '15:00',
    endTime: '19:00',
    location: 'Amma’s Kitchen Studio',
    address: '28 Bharathi Park Road, Saibaba Colony, Coimbatore 641011',
    neighborhood: 'Saibaba Colony',
    city: 'Coimbatore',
    latitude: 11.0305,
    longitude: 76.9512,
    rsvpCount: 18,
    organiser: ORGANISERS.meena,
    imageQuery: 'cooking-class',
  },
  {
    title: 'Open Mic Night for New Writers',
    description:
      'Eight slots of six minutes each, for poetry, short fiction or anything in between. Tamil and English both welcome, and a few people switch mid-piece.\n\nFirst-timers get the first three slots by tradition, because going later gets harder the longer you wait. The room holds about sixty and listeners are as welcome as readers.\n\nSign-up opens at seven at the door. The café keeps the filter coffee coming until we are done.',
    summary: 'Eight six-minute slots for poetry and short fiction. Tamil and English. First-timers go first.',
    category: 'Music',
    tags: ['open mic', 'poetry', 'spoken word', 'tamil'],
    inDays: 5,
    startTime: '19:00',
    endTime: '21:30',
    location: 'Paper Boat Café',
    address: '7 Race Course Road, Coimbatore 641018',
    neighborhood: 'Race Course',
    city: 'Coimbatore',
    latitude: 10.9991,
    longitude: 76.9739,
    rsvpCount: 44,
    organiser: ORGANISERS.fatima,
    imageQuery: 'open-mic',
  },
  {
    title: 'Repair Café: Bring Something Broken',
    description:
      'Volunteers with the right tools help you fix what you own instead of replacing it. Small appliances, bicycles, clothing, furniture joints and basic electronics.\n\nTwelve fixers are confirmed this round, including two retired electricians and a tailor who can rescue almost any zip. You work alongside them rather than handing it over, so you learn the fix.\n\nFree, though donations keep the tool fund going. Roughly two in three items go home working.',
    summary: 'Volunteers help you fix what you own — appliances, bikes, clothing, electronics. Free.',
    category: 'Community',
    tags: ['repair', 'sustainability', 'free', 'diy'],
    inDays: 9,
    startTime: '10:00',
    endTime: '14:00',
    location: 'Peelamedu Community Centre',
    address: 'Community Centre, Hope College Road, Peelamedu, Coimbatore 641004',
    neighborhood: 'Peelamedu',
    city: 'Coimbatore',
    latitude: 11.0244,
    longitude: 77.0183,
    rsvpCount: 36,
    organiser: ORGANISERS.david,
    imageQuery: 'repair-workshop',
  },
  {
    title: 'Python for Absolute Beginners — Session 1',
    description:
      'The first of four free Saturday sessions for people who have never written a line of code. We finish session one with a small program that actually does something useful.\n\nNo maths background needed and no laptop required — the lab has twenty machines, first come first served. If you prefer your own machine, bring it with Python 3.12 installed.\n\nThe four sessions build on each other, so plan to attend all of them. Material is shared afterwards either way.',
    summary: 'First of four free Saturday sessions for complete beginners. Lab machines provided.',
    category: 'Education',
    tags: ['python', 'beginners', 'free', 'coding'],
    inDays: 2,
    startTime: '09:30',
    endTime: '12:30',
    location: 'Kovai Skill Lab',
    address: '2nd Floor, Lakshmi Complex, Trichy Road, Singanallur, Coimbatore 641005',
    neighborhood: 'Singanallur',
    city: 'Coimbatore',
    latitude: 11.0068,
    longitude: 77.0286,
    rsvpCount: 52,
    organiser: ORGANISERS.karthik,
    imageQuery: 'coding-class',
  },
  {
    title: 'Badminton Doubles Ladder',
    description:
      'A rolling doubles ladder across four courts. Pairs play a single game to fifteen, winners move up a court, losers move down, and we keep rotating for two hours.\n\nIntermediate level — you should be able to rally consistently and serve reliably. Bring your own racquet; shuttles are covered by the court fee split on the day.\n\nTurn up alone and you will be paired. The group has run every week for two years and the same faces keep coming back.',
    summary: 'Rolling doubles ladder across four courts. Intermediate level, pairing sorted on the day.',
    category: 'Sports',
    tags: ['badminton', 'doubles', 'intermediate', 'weekly'],
    inDays: 3,
    startTime: '20:00',
    endTime: '22:00',
    location: 'Smash Point Badminton Academy',
    address: '19 Mettupalayam Road, Thudiyalur, Coimbatore 641034',
    neighborhood: 'Thudiyalur',
    city: 'Coimbatore',
    latitude: 11.0747,
    longitude: 76.9397,
    rsvpCount: 16,
    organiser: ORGANISERS.arun,
    imageQuery: 'badminton',
  },
  {
    title: 'Garage Sale: Moving Abroad Next Month',
    description:
      'Clearing out a full two-bedroom flat before a move. A washing machine and a refrigerator both under three years old, a work desk, two office chairs, a bookshelf, kitchen equipment and a mountain bike.\n\nEverything is in working order and I would rather it went to neighbours than to a scrap dealer. Prices are firm on the appliances and flexible on everything else.\n\nCome and see on the day. Larger items need your own transport — I can help carry down.',
    summary: 'Full two-bedroom flat clear-out before a move abroad. Appliances under three years old.',
    category: 'Yard Sale',
    tags: ['garage sale', 'appliances', 'moving sale', 'furniture'],
    inDays: 7,
    startTime: '09:00',
    endTime: '17:00',
    location: 'Flat 3B, Sunrise Apartments',
    address: 'Sunrise Apartments, 2nd Street, Vadavalli, Coimbatore 641041',
    neighborhood: 'Vadavalli',
    city: 'Coimbatore',
    latitude: 11.0272,
    longitude: 76.9036,
    rsvpCount: 23,
    organiser: ORGANISERS.fatima,
    imageQuery: 'garage-sale',
  },
  {
    title: 'Street Food Walk: Oppanakara to Town Hall',
    description:
      'A guided three-hour walk through eight stalls in the old town, eating at every one. We cover the history of the street alongside the food, which is more interesting than it sounds.\n\nOn the route: kari dosai, bun butter jam, atho, kuzhi paniyaram, a seventy-year-old jigarthanda cart and two sweet stalls. Vegetarian route available — mention it when you RSVP.\n\nCome hungry and wear comfortable shoes. We cover about two and a half kilometres at a slow pace.',
    summary: 'Guided three-hour walk through eight old-town stalls. Vegetarian route available.',
    category: 'Food',
    tags: ['street food', 'walking tour', 'old town', 'guided'],
    inDays: 5,
    startTime: '17:00',
    endTime: '20:00',
    location: 'Start: Oppanakara Street junction',
    address: 'Oppanakara Street, Town Hall, Coimbatore 641001',
    neighborhood: 'Town Hall',
    city: 'Coimbatore',
    latitude: 10.9959,
    longitude: 76.9617,
    rsvpCount: 31,
    organiser: ORGANISERS.priya,
    imageQuery: 'street-food',
  },
  {
    title: 'Neighbourhood Tree Planting — 200 Saplings',
    description:
      'Two hundred native saplings going into the ground along the stretch between the school and the bus stop: pungai, neem, vagai and iluppai, chosen because they survive here without watering once established.\n\nPits are dug the day before, so the work on the day is planting, staking and watering. Bring a hat and a water bottle. Expect to be done by ten.\n\nEach sapling gets adopted by whoever plants it — we send a reminder every month for the first year.',
    summary: 'Two hundred native saplings along the school stretch. Pits pre-dug, done by ten.',
    category: 'Community',
    tags: ['tree planting', 'native species', 'volunteering', 'green'],
    inDays: 10,
    startTime: '07:00',
    endTime: '10:00',
    location: 'Kalapatti Main Road, school stretch',
    address: 'Kalapatti Main Road, near Panchayat School, Coimbatore 641048',
    neighborhood: 'Kalapatti',
    city: 'Coimbatore',
    latitude: 11.0789,
    longitude: 77.0292,
    rsvpCount: 74,
    organiser: ORGANISERS.david,
    imageQuery: 'tree-planting',
  },
  {
    title: 'Startup Founders Breakfast',
    description:
      'An informal breakfast for people building something in Coimbatore. No pitches, no panel, no deck — six tables of six, and you move tables after the first hour.\n\nMost attendees are pre-revenue or early-revenue founders, with a handful of operators and two angels who come regularly and prefer not to be introduced as such.\n\nPay for your own breakfast. The only rule is that you are actually building something, however small.',
    summary: 'Informal breakfast for people building something locally. No pitches, no panel.',
    category: 'Technology',
    tags: ['startups', 'founders', 'networking', 'breakfast'],
    inDays: 11,
    startTime: '08:30',
    endTime: '10:30',
    location: 'The Bagel Factory',
    address: '14 Avinashi Road, Red Fields, Coimbatore 641018',
    neighborhood: 'Race Course',
    city: 'Coimbatore',
    latitude: 11.0038,
    longitude: 76.9794,
    rsvpCount: 38,
    organiser: ORGANISERS.karthik,
    imageQuery: 'breakfast-meetup',
  },
  {
    title: 'Kids Science Workshop: Build a Working Hydraulic Arm',
    description:
      'A two-hour workshop for children aged eight to thirteen. Each child builds a hydraulic arm from syringes, tubing and cardboard that can lift a small object, and takes it home.\n\nThe point is not the model but the moment the pressure concept clicks. We have run this eleven times and it lands every single time.\n\nParents are welcome to stay or to come back at the end. Materials included. Twenty places.',
    summary: 'Children 8–13 build a working hydraulic arm from syringes and cardboard, and take it home.',
    category: 'Education',
    tags: ['kids', 'science', 'hands on', 'stem'],
    inDays: 9,
    startTime: '10:00',
    endTime: '12:00',
    location: 'Curiosity Lab',
    address: '5 Kumaran Road, Tirupur Road, Coimbatore 641045',
    neighborhood: 'Sungam',
    city: 'Coimbatore',
    latitude: 10.9847,
    longitude: 76.9733,
    rsvpCount: 20,
    organiser: ORGANISERS.meena,
    imageQuery: 'kids-science',
  },
  {
    title: 'Sunset Yoga on the Terrace',
    description:
      'A sixty-minute hatha session on an open terrace as the light goes. Suitable for beginners, with options given for every posture that needs them.\n\nMats are available but bring your own if you have one. Come without having eaten for two hours beforehand. The session ends with ten minutes of guided stillness, which for most people is the part they come back for.\n\nBy donation. About twenty-five people each week.',
    summary: 'Sixty-minute hatha session on an open terrace at sunset. Beginner friendly, by donation.',
    category: 'Other',
    tags: ['yoga', 'sunset', 'beginners', 'wellbeing'],
    inDays: 4,
    startTime: '17:45',
    endTime: '19:00',
    location: 'Terrace, Anand Residency',
    address: 'Anand Residency, DB Road, R S Puram, Coimbatore 641002',
    neighborhood: 'R S Puram',
    city: 'Coimbatore',
    latitude: 11.0041,
    longitude: 76.9503,
    rsvpCount: 27,
    organiser: ORGANISERS.priya,
    imageQuery: 'yoga-terrace',
  },
  {
    title: 'Board Game Night: Heavy Games Table',
    description:
      'Four tables running longer games with a two-hour-plus playtime. This round we have Brass Birmingham, Ark Nova, Terraforming Mars and a teaching table for whatever people want to learn.\n\nAll games are provided from the collective library and there is always someone who can teach. If you have never played anything heavier than Catan, the teaching table is genuinely for you.\n\nSmall table fee covers the venue and chai. We go until about eleven.',
    summary: 'Four tables of longer board games, all provided, with a teaching table for newcomers.',
    category: 'Other',
    tags: ['board games', 'strategy', 'evening', 'social'],
    inDays: 6,
    startTime: '18:00',
    endTime: '23:00',
    location: 'The Meeple House',
    address: '9 Nava India Road, Peelamedu, Coimbatore 641004',
    neighborhood: 'Peelamedu',
    city: 'Coimbatore',
    latitude: 11.0219,
    longitude: 77.0106,
    rsvpCount: 22,
    organiser: ORGANISERS.david,
    imageQuery: 'board-games',
  },
  {
    title: 'Cycle the Siruvani Road at First Light',
    description:
      'A forty-kilometre out-and-back on the Siruvani road, leaving at half five to be back before the traffic builds. Rolling terrain with one real climb at the twenty-two kilometre mark.\n\nWe ride as one group at a conversational pace and nobody gets dropped — there is a designated sweep every week. Helmet required, no exceptions, and a rear light if you have one.\n\nTea and vadai at the halfway point, paid for individually.',
    summary: 'Forty-kilometre group ride at conversational pace. Helmet required, nobody gets dropped.',
    category: 'Sports',
    tags: ['cycling', 'group ride', 'early morning', 'endurance'],
    inDays: 7,
    startTime: '05:30',
    endTime: '09:00',
    location: 'Start: Perur Pateeswarar Temple',
    address: 'Perur Pateeswarar Temple, Perur, Coimbatore 641010',
    neighborhood: 'Perur',
    city: 'Coimbatore',
    latitude: 10.9739,
    longitude: 76.8906,
    rsvpCount: 19,
    organiser: ORGANISERS.arun,
    imageQuery: 'cycling-group',
  },
];

/**
 * Deterministic placeholder images. Using a seeded picsum URL keeps the demo board
 * looking real without committing binary assets or depending on an image API key.
 */
function imageFor(query: string): string {
  return `https://picsum.photos/seed/${query}/1200/675`;
}

function dateStringIn(days: number): string {
  const target = new Date();
  target.setDate(target.getDate() + days);
  return [
    target.getFullYear(),
    String(target.getMonth() + 1).padStart(2, '0'),
    String(target.getDate()).padStart(2, '0'),
  ].join('-');
}

function minutesOf(time: string): number {
  const [hh, mm] = time.split(':').map(Number);
  return (hh ?? 0) * 60 + (mm ?? 0);
}

function timeOf(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
  return [
    String(Math.floor(clamped / 60)).padStart(2, '0'),
    String(clamped % 60).padStart(2, '0'),
  ].join(':');
}

/**
 * Keeps every seeded event genuinely upcoming.
 *
 * The board correctly hides anything that has already finished, so a 06:30 event seeded on
 * the day of an afternoon demo would disappear entirely. This slides a same-day event to
 * start shortly from now, preserving its duration, which is what makes the Today,
 * "Starting soon" and "Happening now" states demonstrable at any hour.
 *
 * If it is late enough that the event can no longer fit before midnight, it rolls to the
 * same time the next day rather than being dropped — a seeded event must never be missing
 * from the board.
 *
 * Events already scheduled for a later day are left exactly as written.
 */
function shiftIntoFuture(
  event: SeedEvent,
  now = new Date(),
): { dayOffset: number; startTime: string; endTime: string } {
  const unchanged = { dayOffset: event.inDays, startTime: event.startTime, endTime: event.endTime };
  if (event.inDays !== 0) return unchanged;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const start = minutesOf(event.startTime);
  const durationMinutes = Math.max(30, minutesOf(event.endTime) - start);

  // Still comfortably ahead today? Leave it alone.
  if (start > nowMinutes + 30) return unchanged;

  // Next half hour, at least 45 minutes out, and early enough to still end today.
  const target = Math.ceil((nowMinutes + 45) / 30) * 30;
  const latestStart = 23 * 60 - durationMinutes;

  if (target > latestStart) {
    // Too late to fit today — keep the original time, run it tomorrow.
    return { ...unchanged, dayOffset: 1 };
  }

  return { dayOffset: 0, startTime: timeOf(target), endTime: timeOf(target + durationMinutes) };
}

async function clearSeeded(): Promise<number> {
  const db = getDb();
  const snapshot = await db.collection('events').where('seedTag', '==', SEED_TAG).get();
  if (snapshot.empty) return 0;

  for (let i = 0; i < snapshot.docs.length; i += 400) {
    const batch = db.batch();
    for (const doc of snapshot.docs.slice(i, i + 400)) batch.delete(doc.ref);
    await batch.commit();
  }

  return snapshot.size;
}

async function seedOrganiserProfiles(): Promise<void> {
  const db = getDb();
  const batch = db.batch();

  for (const organiser of Object.values(ORGANISERS)) {
    batch.set(
      db.collection('users').doc(organiser.id),
      {
        uid: organiser.id,
        displayName: organiser.name,
        email: null,
        photoURL: null,
        bio: 'Demo organiser seeded for the Nearby-objects walkthrough.',
        neighborhood: '',
        city: 'Coimbatore',
        seedTag: SEED_TAG,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  await batch.commit();
}

async function seed(): Promise<void> {
  initFirebase();
  const db = getDb();

  const shouldClear = process.argv.includes('--clear');
  if (shouldClear) {
    const removed = await clearSeeded();
    logger.info('Cleared previously seeded events', { removed });
  }

  await seedOrganiserProfiles();

  let written = 0;
  let skipped = 0;

  for (let i = 0; i < EVENTS.length; i += 20) {
    const batch = db.batch();

    for (const event of EVENTS.slice(i, i + 20)) {
      const { dayOffset, startTime, endTime } = shiftIntoFuture(event);
      const date = dateStringIn(dayOffset);

      // One seeded event per title keeps repeated runs idempotent.
      const existing = await db
        .collection('events')
        .where('seedTag', '==', SEED_TAG)
        .where('title', '==', event.title)
        .limit(1)
        .get();

      const ref = existing.empty ? db.collection('events').doc() : existing.docs[0]!.ref;
      if (!existing.empty) skipped += 1;

      const startsAt = combineDateTime(date, startTime);
      const endsAt = combineDateTime(date, endTime);

      batch.set(ref, {
        title: event.title,
        description: event.description,
        summary: event.summary,
        category: event.category,
        tags: event.tags,

        date,
        startTime,
        endTime,
        startsAt: Timestamp.fromDate(startsAt),
        endsAt: Timestamp.fromDate(endsAt),

        location: event.location,
        address: event.address,
        latitude: event.latitude,
        longitude: event.longitude,
        neighborhood: event.neighborhood,
        city: event.city,

        imageUrl: imageFor(event.imageQuery),
        imagePath: null,

        creatorId: event.organiser.id,
        creatorName: event.organiser.name,
        creatorPhotoURL: null,

        rsvpCount: event.rsvpCount,
        status: 'ACTIVE',

        neighborhoodLower: normalise(event.neighborhood),
        cityLower: normalise(event.city),
        searchKeywords: buildKeywords([
          event.title,
          event.summary,
          event.category,
          event.location,
          event.neighborhood,
          event.city,
          event.tags.join(' '),
          event.description.slice(0, 600),
        ]),

        seedTag: SEED_TAG,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      written += 1;
    }

    await batch.commit();
  }

  logger.info('Seed complete', {
    events: written,
    refreshed: skipped,
    organisers: Object.keys(ORGANISERS).length,
  });

  process.stdout.write(
    `\nSeeded ${written} events across ${Object.keys(ORGANISERS).length} demo organisers.\n` +
      `RSVP counts are pre-populated for the demo; your own RSVPs add to them.\n\n`,
  );
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.critical('Seed failed', { reason: (error as { message?: string }).message });
    process.stderr.write(`\n${String((error as Error).stack ?? error)}\n`);
    process.exit(1);
  });
