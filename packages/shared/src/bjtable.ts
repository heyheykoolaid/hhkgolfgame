// Multi-seat blackjack (design/blackjack-multiplayer.md). No server: one seated client (the lowest uid) is the table
// host and publishes the round clock + a seed (TableHost). Every client deals the same 6-deck shoe from that seed and
// replays each seat's actions (from that player's presence) in seat order, so all screens agree on every card.
// Seat 0 is first base (the dealer's left); play goes clockwise 0 → 4. A turn timer that runs out stands the hand.
import {
  newShoe,
  handValue,
  isBlackjack,
  isBust,
  hit,
  stand,
  double,
  split,
  canHit,
  canDouble,
  canSplit,
  settleHands,
  BJ_MIN,
  type BJState,
  type BJHand,
  type BJOutcome,
} from './blackjack';

export const BJ_SEATS = 5,
  BJ_BET_MS = 10000,
  BJ_TURN_MS = 20000,
  BJ_DONE_MS = 4500;
/** The host's published round state. e = when the current phase (or the current turn) ends, as a Date.now() time. */
export interface TableHost {
  r: number;
  ph: 'bet' | 'play' | 'done';
  e: number;
  seed: number;
  p: [number, string, number][];
  to: Record<number, number>;
}
/** What each seated player publishes: seat, the bet they want, and their actions ('h' 's' 'd' 'p') in round r. k = ready for round k. */
export interface SeatPres {
  s: number;
  b: number;
  r: number;
  a: string;
  k?: number;
}
export interface SeatView {
  seat: number;
  uid: string;
  bet: number;
  hands: BJHand[];
  active: number;
  results: { outcome: BJOutcome; payout: number }[];
  done: boolean;
}
export interface RoundView {
  seats: SeatView[];
  dealer: number[];
  activeSeat: number;
  consumed: Record<number, number>;
  done: boolean;
  holeUp: boolean;
}

export function seededRand(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** The round's shoe. Each card carries its draw order (card + 52·i, i = 0 for the first card dealt) so it has a stable id. */
export function roundShoe(seed: number) {
  const s = newShoe(seededRand(seed));
  return s.map((c, j) => c + 52 * (s.length - 1 - j));
}
export const cardId = (c: number) => Math.floor(c / 52);

/** Replay a round from the host's state and every seat's actions. Stops at the first seat still waiting to act. */
export function replayRound(h: TableHost, acts: Record<number, string>): RoundView {
  const shoe = roundShoe(h.seed),
    dealer: number[] = [];
  const seats = [...h.p]
    .sort((a, b) => a[0] - b[0])
    .map(([seat, uid, bet]) => ({
      seat,
      uid,
      bet,
      st: {
        noDealer: true,
        shoe,
        dealer,
        hands: [{ cards: [] as number[], bet, doubled: false, done: false, fromSplit: false, splitAces: false }],
        active: 0,
        phase: 'play',
        results: [],
      } as BJState,
    }));
  for (let k = 0; k < 2; k++) {
    for (const s of seats) s.st.hands[0].cards.push(shoe.pop()!);
    dealer.push(shoe.pop()!);
  }
  const consumed: Record<number, number> = {};
  let activeSeat = -1;
  const dBJ = handValue(dealer).total === 21;
  for (const s of seats) {
    const a = acts[s.seat] || '',
      lim = h.to[s.seat];
    let i = 0;
    if (dBJ || isBlackjack(s.st.hands[0])) {
      s.st.phase = 'done';
      consumed[s.seat] = 0;
      continue;
    }
    while (s.st.phase === 'play') {
      if (lim !== undefined && i >= lim) {
        stand(s.st);
        continue;
      }
      if (i >= a.length) break;
      const c = a[i++];
      if (c === 'h') hit(s.st);
      else if (c === 'd') double(s.st);
      else if (c === 'p') split(s.st);
      else stand(s.st);
    }
    consumed[s.seat] = i;
    if (s.st.phase === 'play') {
      activeSeat = s.seat;
      break;
    }
  }
  const done = activeSeat < 0;
  if (done) {
    const live = seats.some(s => s.st.hands.some(x => !isBust(x.cards) && !(s.st.hands.length === 1 && isBlackjack(x))));
    if (live && !dBJ) while (handValue(dealer).total < 17) dealer.push(shoe.pop()!);
    for (const s of seats) s.st.results = settleHands(s.st.hands, dealer);
  }
  return {
    seats: seats.map(s => ({
      seat: s.seat,
      uid: s.uid,
      bet: s.bet,
      hands: s.st.hands,
      active: s.st.active,
      results: done ? s.st.results : [],
      done: s.st.phase === 'done',
    })),
    dealer,
    activeSeat,
    consumed,
    done,
    holeUp: done,
  };
}
/** Which actions the active seat may take right now. */
export function seatOptions(h: TableHost, acts: Record<number, string>, seat: number) {
  const v = replayRound(h, acts);
  if (v.activeSeat !== seat) return null;
  const sv = v.seats.find(s => s.seat === seat)!,
    st = { noDealer: true, shoe: [], dealer: v.dealer, hands: sv.hands, active: sv.active, phase: 'play', results: [] } as BJState;
  return { hit: canHit(st), double: canDouble(st), split: canSplit(st), hand: sv.hands[sv.active] };
}

/** Host step: given the current host state and everyone's seat presence, return the next host state (or the same object). */
export function hostStep(
  h: TableHost | null,
  seated: Map<number, { uid: string; p: SeatPres }>,
  now: number,
  rand: () => number = Math.random,
  turnKey?: { k: string },
): TableHost {
  if (!h) return { r: 0, ph: 'bet', e: now + BJ_BET_MS, seed: 0, p: [], to: {} };
  if (h.ph === 'bet') {
    const bettors = [...seated.entries()].filter(([, x]) => x.p.b >= BJ_MIN).sort((a, b) => a[0] - b[0]);
    const allReady = bettors.length > 0 && [...seated.values()].every(x => x.p.b < BJ_MIN || x.p.k === h.r + 1);
    if (now < h.e && !allReady) return h;
    if (!bettors.length) return { ...h, e: now + BJ_BET_MS };
    if (turnKey) turnKey.k = '';
    return {
      r: h.r + 1,
      ph: 'play',
      e: now + BJ_TURN_MS + 2500,
      seed: Math.floor(rand() * 2 ** 31) + 1,
      p: bettors.map(([s, x]) => [s, x.uid, x.p.b]),
      to: {},
    };
  }
  if (h.ph === 'play') {
    const acts: Record<number, string> = {};
    for (const [s, x] of seated) if (x.p.r === h.r) acts[s] = x.p.a;
    const v = replayRound(h, acts);
    if (v.done) return { ...h, ph: 'done', e: now + BJ_DONE_MS + 600 * Math.max(0, v.dealer.length - 2) };
    const k = `${v.activeSeat}:${v.consumed[v.activeSeat]}`;
    if (turnKey && turnKey.k !== k) {
      const first = turnKey.k === '';
      turnKey.k = k;
      return { ...h, e: Math.max(h.e, now + (first ? 0 : BJ_TURN_MS)) };
    }
    const gone = !seated.has(v.activeSeat) || seated.get(v.activeSeat)!.uid !== h.p.find(x => x[0] === v.activeSeat)?.[1];
    if (now >= h.e || gone) return { ...h, to: { ...h.to, [v.activeSeat]: v.consumed[v.activeSeat] }, e: now + BJ_TURN_MS };
    return h;
  }
  if (now >= h.e) return { ...h, ph: 'bet', e: now + BJ_BET_MS };
  return h;
}

// ---- untrusted presence → well-formed data (a malformed table must never throw inside the game loop) ----
const _int = (v: any, lo: number, hi: number, d = lo) => {
  const x = Math.floor(+v);
  return isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d;
};
/** A peer's seat state, made safe. Null if it isn't one. */
export function cleanSeatPres(v: any): SeatPres | null {
  if (!v || typeof v !== 'object' || typeof v.s !== 'number') return null;
  return {
    s: _int(v.s, -1, BJ_SEATS - 1, -1),
    b: _int(v.b, 0, 1e7),
    r: _int(v.r, -1, 1e9, -1),
    a: typeof v.a === 'string' ? v.a.replace(/[^hdps]/g, '').slice(0, 40) : '',
    k: _int(v.k, 0, 1e9) || undefined,
  };
}
/** The host's table state, made safe. Null if it isn't one. */
export function cleanTableHost(v: any): TableHost | null {
  if (!v || typeof v !== 'object' || typeof v.r !== 'number' || !['bet', 'play', 'done'].includes(v.ph)) return null;
  const p: [number, string, number][] = [],
    used = new Set<number>();
  if (Array.isArray(v.p))
    for (const e of v.p.slice(0, BJ_SEATS)) {
      if (!Array.isArray(e) || typeof e[1] !== 'string') continue;
      const s = _int(e[0], 0, BJ_SEATS - 1);
      if (used.has(s)) continue;
      used.add(s);
      p.push([s, e[1].slice(0, 80), _int(e[2], 1, 1e7, 1)]);
    }
  const to: Record<number, number> = {};
  if (v.to && typeof v.to === 'object')
    for (const k of Object.keys(v.to).slice(0, BJ_SEATS)) {
      if (!/^\d+$/.test(k)) continue;
      const s = _int(k, 0, BJ_SEATS - 1);
      to[s] = _int(v.to[k], 0, 40);
    }
  return { r: _int(v.r, 0, 1e9), ph: v.ph, e: isFinite(+v.e) ? +v.e : 0, seed: _int(v.seed, 0, 2 ** 31), p, to };
}
