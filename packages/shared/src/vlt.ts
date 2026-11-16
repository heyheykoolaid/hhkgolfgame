// The lounge's machines: a three-reel slot and Jacks-or-Better video poker. Pure rules, no drawing; the client rolls
// its own random numbers (single player against the house, like the blackjack wallet: fine for friends, not tamper-proof).

// ------------------------------------------------------------------ slots
export type SlotSym = 'cherry' | 'lemon' | 'bell' | 'flag' | 'seven' | 'gem';
/** How many of each symbol are on a reel (32 stops; every reel is the same). */
export const SLOT_WEIGHTS: Record<SlotSym, number> = { cherry: 9, lemon: 8, bell: 6, flag: 5, seven: 3, gem: 1 };
/** Three of a kind pays this many times the bet (the bet itself included). */
export const SLOT_THREE: Record<SlotSym, number> = { cherry: 6, lemon: 10, bell: 18, flag: 35, seven: 100, gem: 500 };
export const SLOT_TWO_CHERRIES = 2,
  SLOT_ONE_CHERRY = 1;
export const SLOT_SYMS = Object.keys(SLOT_WEIGHTS) as SlotSym[];
const STRIP: SlotSym[] = SLOT_SYMS.flatMap(s => Array<SlotSym>(SLOT_WEIGHTS[s]).fill(s));
/** One reel stop from a random number in [0, 1). */
export const slotStop = (r: number): SlotSym => STRIP[Math.min(STRIP.length - 1, Math.floor(r * STRIP.length))];
/** What a line pays, in bets: three of a kind, else cherries from the left (two, or one: your money back). */
export function slotPay(a: SlotSym, b: SlotSym, c: SlotSym): number {
  if (a === b && b === c) return SLOT_THREE[a];
  if (a === 'cherry' && b === 'cherry') return SLOT_TWO_CHERRIES;
  if (a === 'cherry') return SLOT_ONE_CHERRY;
  return 0;
}
/** The machine's long-run return per unit bet (exact, from the reel strips). */
export function slotReturn(): number {
  let r = 0;
  for (const a of SLOT_SYMS)
    for (const b of SLOT_SYMS)
      for (const c of SLOT_SYMS) r += (SLOT_WEIGHTS[a] * SLOT_WEIGHTS[b] * SLOT_WEIGHTS[c] * slotPay(a, b, c)) / STRIP.length ** 3;
  return r;
}

// ------------------------------------------------------------------ video poker (Jacks or Better, 9/6)
/** A card is 0–51: rank = card % 13 (0 = two … 12 = ace), suit = floor(card / 13). */
export type PokerHand = 'royal' | 'straightflush' | 'four' | 'fullhouse' | 'flush' | 'straight' | 'three' | 'twopair' | 'jacks' | 'none';
/** Total returned per unit bet (the bet included), best first. */
export const POKER_PAYS: [PokerHand, string, number][] = [
  ['royal', 'Royal flush', 800],
  ['straightflush', 'Straight flush', 50],
  ['four', 'Four of a kind', 25],
  ['fullhouse', 'Full house', 9],
  ['flush', 'Flush', 6],
  ['straight', 'Straight', 4],
  ['three', 'Three of a kind', 3],
  ['twopair', 'Two pair', 2],
  ['jacks', 'Jacks or better', 1],
];
export const pokerPay = (h: PokerHand) => POKER_PAYS.find(p => p[0] === h)?.[2] ?? 0;
export function pokerHand(cards: number[]): PokerHand {
  const ranks = cards.map(c => c % 13).sort((a, b) => a - b),
    flush = cards.every(c => Math.floor(c / 13) === Math.floor(cards[0] / 13)),
    count = new Map<number, number>();
  for (const r of ranks) count.set(r, (count.get(r) || 0) + 1);
  const groups = [...count.values()].sort((a, b) => b - a),
    distinct = count.size === 5,
    wheel = distinct && ranks.join() === '0,1,2,3,12', // ace low
    straight = distinct && (ranks[4] - ranks[0] === 4 || wheel);
  if (straight && flush) return ranks[0] === 8 ? 'royal' : 'straightflush';
  if (groups[0] === 4) return 'four';
  if (groups[0] === 3 && groups[1] === 2) return 'fullhouse';
  if (flush) return 'flush';
  if (straight) return 'straight';
  if (groups[0] === 3) return 'three';
  if (groups[0] === 2 && groups[1] === 2) return 'twopair';
  if (groups[0] === 2) for (const [r, n] of count) if (n === 2 && r >= 9) return 'jacks';
  return 'none';
}
/** A shuffled deck from a random source (Fisher–Yates). */
export function pokerDeck(rnd: () => number): number[] {
  const d = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
