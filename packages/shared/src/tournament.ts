// Tournaments: a mini cup (3 holes) or a championship (9 holes). Everything about one comes from a single seed,
// so every player in the group derives the same holes, the same order and the same cup from the match id.
import { mulberry32 } from './course';
import { holeIdea, holeCode, codeSeed } from './holegen';

export type TourSize = 3 | 9;
export const TOUR_SIZES: TourSize[] = [3, 9];
const SEED_MAX = 36 ** 5 - 2;

/** Match id for a tournament: "t" + size + the 5-char tournament code + a few random chars (≤ 12 chars in all). */
export function tournamentIdFor(n: TourSize, seed: number, rand: string) {
  const tail = rand
    .toLowerCase()
    .replace(/[^0-9a-z]/g, 'x')
    .slice(0, 5)
    .padEnd(5, 'x');
  return 't' + n + holeCode(seed).toLowerCase() + tail;
}
/** The tournament inside a match id, or null for a single-hole match. */
export function parseTournament(id: string): { n: TourSize; seed: number; code: string; card?: Card; course?: number } | null {
  const k = /^k([39])[0-9a-z]([0-9a-z]{5})([0-9a-z]{3})/.exec(String(id || ''));
  if (k) {
    // a real course's card: the holes come from its pars and its hardest holes; the seed is made from the card and the course
    const card = cardFromCode(k[2], +k[1] as TourSize),
      course = parseInt(k[3], 36);
    return {
      n: +k[1] as TourSize,
      seed: (((parseInt(k[2], 36) * 31 + course) % SEED_MAX) + 1) >>> 0,
      code: (k[2] + k[3]).toUpperCase(),
      card,
      course,
    };
  }
  const m = /^t([39])([0-9a-z]{5})/.exec(String(id || ''));
  if (!m) return null;
  return { n: +m[1] as TourSize, seed: codeSeed(m[2]) || 1, code: m[2].toUpperCase() };
}
/** A real course's card for a round: each hole's par, and whether it is one of the course's hardest. */
export interface Card {
  pars: number[];
  hard: boolean[];
}
/** A card from its nine digits, one per hole: (par − 3) × 2 + (1 if hard). */
export function cardFromDigits(digits: string, n: TourSize): Card {
  const d = [...String(digits)].slice(0, n).map(c => Math.max(0, Math.min(5, +c || 0)));
  while (d.length < n) d.push(2);
  return { pars: d.map(v => 3 + (v >> 1)), hard: d.map(v => (v & 1) === 1) };
}
const cardCode = (c: Card) =>
  c.pars
    .reduce((t, p, i) => t + ((p - 3) * 2 + (c.hard[i] ? 1 : 0)) * 6 ** i, 0)
    .toString(36)
    .padStart(5, '0');
function cardFromCode(code: string, n: TourSize): Card {
  let v = parseInt(code, 36) || 0,
    digits = '';
  for (let i = 0; i < n; i++) {
    digits += v % 6;
    v = Math.floor(v / 6);
  }
  return cardFromDigits(digits, n);
}
/** Match id for a round on a real course's card: "k" + size + a slot for our own course's letter + the card (5 chars)
 *  + the real course's number in the shipped list (3 chars) + a few random characters, so two groups who start the
 *  same course at the same moment get separate rounds and every win is its own trophy. 15 characters, so a casual
 *  "c" still fits in front of the 16 a match id may have. The holes and the cup's name come from the first 11 only. */
export function courseIdFor(n: TourSize, digits: string, course: number, rand = '') {
  return (
    'k' +
    n +
    '0' +
    cardCode(cardFromDigits(digits, n)) +
    Math.max(0, Math.min(36 ** 3 - 1, course))
      .toString(36)
      .padStart(3, '0') +
    rand
      .toLowerCase()
      .replace(/[^0-9a-z]/g, '')
      .slice(0, 4)
  );
}
export function randomTourSeed() {
  return 1 + Math.floor(Math.random() * SEED_MAX);
}

// ---------------------------------------------------------------- the holes, "teach then test"
// Open with a hole that explains itself, close with one that asks a hard question, and don't repeat an idea.
const EASY = new Set(['corner', 'ridge', 'valley', 'reachable', 'stamp']);
const HARD = new Set(['cape', 'split', 'carry', 'redan', 'double', 'driveable']);
const PARS: Record<TourSize, number[][]> = {
  3: [
    [4, 3, 5],
    [4, 5, 3],
    [4, 3, 4],
    [5, 3, 4],
  ],
  9: [
    [4, 5, 3, 4, 4, 3, 4, 5, 4],
    [4, 4, 3, 5, 4, 3, 4, 4, 5],
    [5, 4, 3, 4, 4, 5, 3, 4, 4],
    [4, 3, 5, 4, 4, 3, 4, 5, 4],
  ],
};
const KINDS: Record<number, string[]> = {
  3: ['carry', 'valley', 'stamp', 'redan'],
  4: ['cape', 'corner', 'split', 'driveable', 'ridge'],
  5: ['reachable', 'double'],
};
/** The hole seeds of a tournament, in playing order. */
export function tournamentHoles(seed: number, n: TourSize, card?: Card): number[] {
  const r = mulberry32((seed * 40503 + n * 7) >>> 0),
    pars = card ? card.pars.slice(0, n) : PARS[n][Math.floor(r() * PARS[n].length)];
  // 1. plan the ideas: shuffle each par's archetypes and deal them out until the opener is easy and the finisher hard
  let plan: string[] = [];
  for (let t = 0; t < 400; t++) {
    const decks: Record<number, string[]> = {};
    for (const p of [3, 4, 5]) {
      const d = [...KINDS[p]];
      for (let i = d.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [d[i], d[j]] = [d[j], d[i]];
      }
      decks[p] = d;
    }
    const pos: Record<number, number> = { 3: 0, 4: 0, 5: 0 };
    if (card) {
      // a real card decides: its hardest holes get the ideas that ask the hard questions, the rest the gentler ones
      plan = pars.map((p, i) => {
        const want = card.hard[i] ? HARD : EASY,
          fit = decks[p].filter(k => want.has(k)),
          from = fit.length ? fit : decks[p];
        return from[pos[p]++ % from.length];
      });
      break;
    }
    plan = pars.map(p => decks[p][pos[p]++ % decks[p].length]);
    if (EASY.has(plan[0]) && HARD.has(plan[plan.length - 1])) break;
  }
  // 2. find a seed with that par and idea for each slot
  return pars.map((par, i) => {
    let fallback = 0;
    for (let k = 0; k < 5000; k++) {
      const s = 1 + Math.floor(r() * SEED_MAX),
        idea = holeIdea(s);
      if (idea.par !== par) continue;
      if (idea.kind === plan[i]) return s;
      fallback = fallback || s;
    }
    return fallback || 1;
  });
}

// ---------------------------------------------------------------- the cup: a name and the look of its trophy
export type Topper = 'cup' | 'ball' | 'golfer' | 'flag' | 'star' | 'club';
export type Metal = 'gold' | 'silver' | 'bronze' | 'chrome' | 'rose';
export interface Cup {
  title: string;
  event: string;
  topper: Topper;
  metal: Metal;
  accent: string;
  base: 'wood' | 'marble' | 'stone' | 'onyx';
  tiers: number;
  handles: boolean;
}

const PLACES = [
  'Golden Hills',
  'Palm Street',
  'Dry Creek',
  'Sunset Mesa',
  'Arroyo Seco',
  'Orange Grove',
  'Coyote Flats',
  'Rancho Polvo',
  'Dusty Acres',
  'Laguna Lucky',
  'Cactus Canyon',
  'Salton Shores',
  'El Dorado Hills',
  'Sagebrush',
  'Mirage Valley',
  'Hazy Acres',
];
const SPONSORS = [
  'Cactus Cola',
  "Big Lou's Muffler",
  'Sunset Liquor',
  'Rusty Cart',
  'Palm Street Pawn',
  'El Pollo Dorado',
  'Speedy Tire & Lube',
  'Desert Rose Motel',
  'Golden Taco',
  'Lucky Seven Laundromat',
  'Green Thumb Garden Supply',
  'Sticky Fingers BBQ',
  'Mulligan Brothers Moving',
  'Blue Agave Cantina',
  'Hi-Life Donuts',
];
const PEOPLE = [
  'Chet Rawlings',
  'Big Earl',
  'Doc Halvorsen',
  'Duke Delgado',
  'Lefty Marchetti',
  'Bunny Fairweather',
  'Hank "Sandtrap" Sullivan',
  'Rosa Montoya',
  'Skip Wexley',
  'Old Man Pruitt',
];
const ADJ = [
  'Sundowner',
  'Dust Devil',
  'Heatwave',
  'Tumbleweed',
  'Golden Hour',
  'Palm Frond',
  'Back Nine',
  'Low Rider',
  'Mirage',
  'Santa Ana',
  'Fairway Fever',
  'Greenside',
  'Hole-in-One',
  'Double Eagle',
];
// event word → the trophy it gets (so the name and the trophy belong together)
const EVENTS: Record<TourSize, [string, Topper][]> = {
  3: [
    ['Shootout', 'ball'],
    ['Scramble', 'flag'],
    ['Skins Game', 'flag'],
    ['Showdown', 'star'],
    ['Challenge', 'club'],
    ['Cup', 'cup'],
    ['Dash', 'ball'],
  ],
  9: [
    ['Open', 'cup'],
    ['Invitational', 'golfer'],
    ['Classic', 'golfer'],
    ['Championship', 'cup'],
    ['Cup', 'cup'],
    ['Pro-Am', 'club'],
    ['Trophy', 'star'],
    ['Memorial', 'golfer'],
  ],
};
const ORD = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const ACCENTS = ['#b8322a', '#2a5fa8', '#2f7a4b', '#7a3fa0', '#d8902a', '#1d1d1f', '#c8452f', '#2e8a8a'];

/** The tournament's name and its trophy's look, from the seed. */
export function cupFor(seed: number, n: TourSize): Cup {
  const r = mulberry32((seed * 69069 + n * 1013) >>> 0),
    pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const [event, topper] = pick(EVENTS[n]);
  let title: string;
  const form = r();
  if (event === 'Memorial') title = `The ${pick(PEOPLE)} Memorial`;
  else if (form < 0.3) title = `The ${pick(PLACES)} ${event}`;
  else if (form < 0.58) title = `The ${pick(SPONSORS)} ${event}`;
  else if (form < 0.8) title = `The ${pick(ADJ)} ${event}`;
  else if (form < 0.9) title = `The ${pick(PEOPLE)} ${event}`;
  else title = `${pick(PLACES)} ${pick(ADJ)} ${event}`;
  if (r() < 0.22) title = `The ${ORD(2 + Math.floor(r() * 48))} Annual ${title.replace(/^The /, '')}`;
  const metal = (
    n === 9 ? pick(['gold', 'gold', 'gold', 'silver', 'chrome', 'rose']) : pick(['gold', 'silver', 'bronze', 'chrome', 'rose'])
  ) as Metal;
  return {
    title,
    event,
    topper,
    metal,
    accent: pick(ACCENTS),
    base: pick(['wood', 'marble', 'stone', 'onyx']),
    tiers: n === 9 ? 2 + Math.floor(r() * 2) : 1 + Math.floor(r() * 2),
    handles: r() < 0.6,
  };
}
