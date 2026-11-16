// Blackjack rules (house game, one player vs the dealer). Pure functions: the client keeps the state and calls these.
// Rules: 6-deck shoe (reshuffled at 75% penetration), dealer stands on all 17s, blackjack pays 3:2, double on any first
// two cards (also after a split), split once (split aces get one card each, and 21 there isn't a blackjack), no insurance.
// A card is 0..51: rank = c % 13 (0 = A … 12 = K), suit = floor(c / 13) (clubs, diamonds, hearts, spades).

export const BJ_DECKS = 6,
  BJ_MIN = 10,
  BJ_MAX = 5000;
export const rankOf = (c: number) => c % 13,
  suitOf = (c: number) => Math.floor((c % 52) / 13); // a card may carry its draw index as c + 52·i (multi-seat tables)
export const cardValue = (c: number) => Math.min(10, rankOf(c) + 1); // ace counts 1 here; handValue lifts it to 11

export function handValue(cards: number[]) {
  let t = 0,
    aces = 0;
  for (const c of cards) {
    t += cardValue(c);
    if (rankOf(c) === 0) aces++;
  }
  const soft = aces > 0 && t + 10 <= 21;
  return { total: soft ? t + 10 : t, soft };
}
export const isBust = (cards: number[]) => handValue(cards).total > 21;

export interface BJHand {
  cards: number[];
  bet: number;
  doubled: boolean;
  done: boolean;
  fromSplit: boolean;
  splitAces: boolean;
}
export type BJOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';
export interface BJState {
  noDealer?: boolean;
  shoe: number[];
  dealer: number[];
  hands: BJHand[];
  active: number;
  phase: 'bet' | 'play' | 'done';
  results: { outcome: BJOutcome; payout: number }[];
}

export function newShoe(rand: () => number = Math.random) {
  const s: number[] = [];
  for (let d = 0; d < BJ_DECKS; d++) for (let c = 0; c < 52; c++) s.push(c);
  for (let i = s.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [s[i], s[j]] = [s[j], s[i]];
  }
  return s;
}
export const needsShuffle = (shoe: number[]) => shoe.length < BJ_DECKS * 52 * 0.25;
const draw = (st: BJState) => {
  if (!st.shoe.length) st.shoe = newShoe();
  return st.shoe.pop()!;
};
export const isBlackjack = (h: BJHand) => !h.fromSplit && h.cards.length === 2 && handValue(h.cards).total === 21;

export function newTable(rand: () => number = Math.random): BJState {
  return { shoe: newShoe(rand), dealer: [], hands: [], active: 0, phase: 'bet', results: [] };
}

/** Start a round: player, dealer (up), player, dealer (hole). Ends at once if either side has blackjack. */
export function deal(st: BJState, bet: number, rand: () => number = Math.random): BJState {
  if (needsShuffle(st.shoe)) st.shoe = newShoe(rand);
  const h: BJHand = { cards: [], bet, doubled: false, done: false, fromSplit: false, splitAces: false };
  st.hands = [h];
  st.dealer = [];
  st.active = 0;
  st.results = [];
  st.phase = 'play';
  h.cards.push(draw(st));
  st.dealer.push(draw(st));
  h.cards.push(draw(st));
  st.dealer.push(draw(st));
  if (isBlackjack(h) || handValue(st.dealer).total === 21) {
    h.done = true;
    return finish(st);
  }
  return st;
}

const cur = (st: BJState) => st.hands[st.active];
export const canHit = (st: BJState) => st.phase === 'play' && !cur(st).done && !cur(st).splitAces;
export const canDouble = (st: BJState) => canHit(st) && cur(st).cards.length === 2;
export const canSplit = (st: BJState) =>
  st.phase === 'play' && st.hands.length === 1 && cur(st).cards.length === 2 && cardValue(cur(st).cards[0]) === cardValue(cur(st).cards[1]);
/** Extra chips each action needs (the client checks the wallet before calling it). */
export const extraFor = (st: BJState, a: 'double' | 'split') => cur(st).bet;

function next(st: BJState) {
  while (st.active < st.hands.length && st.hands[st.active].done) st.active++;
  if (st.active >= st.hands.length) return finish(st);
  const h = cur(st);
  if (h.cards.length === 1) {
    h.cards.push(draw(st));
    if (h.splitAces || handValue(h.cards).total === 21) {
      h.done = true;
      return next(st);
    }
  }
  return st;
}
export function hit(st: BJState) {
  if (!canHit(st)) return st;
  const h = cur(st);
  h.cards.push(draw(st));
  if (handValue(h.cards).total >= 21) h.done = true;
  return h.done ? next(st) : st;
}
export function stand(st: BJState) {
  if (st.phase !== 'play') return st;
  cur(st).done = true;
  return next(st);
}
export function double(st: BJState) {
  if (!canDouble(st)) return st;
  const h = cur(st);
  h.bet *= 2;
  h.doubled = true;
  h.cards.push(draw(st));
  h.done = true;
  return next(st);
}
export function split(st: BJState) {
  if (!canSplit(st)) return st;
  const h = cur(st),
    aces = rankOf(h.cards[0]) === 0;
  const a: BJHand = { cards: [h.cards[0]], bet: h.bet, doubled: false, done: false, fromSplit: true, splitAces: aces };
  const b: BJHand = { cards: [h.cards[1]], bet: h.bet, doubled: false, done: false, fromSplit: true, splitAces: aces };
  st.hands = [a, b];
  st.active = 0;
  return next(st);
}

/** Dealer plays (only if a player hand is still live), then every hand is settled. payout = chips returned (stake included). */
function finish(st: BJState): BJState {
  if (st.noDealer) {
    st.phase = 'done';
    st.active = 0;
    return st;
  } // multi-seat: the table plays the dealer once everyone is done
  const live = st.hands.some(h => !isBust(h.cards)) && !(st.hands.length === 1 && isBlackjack(st.hands[0]));
  if (live) while (handValue(st.dealer).total < 17) st.dealer.push(draw(st));
  st.results = settleHands(st.hands, st.dealer);
  st.phase = 'done';
  st.active = 0;
  return st;
}
/** Settle hands against a finished dealer hand. payout = chips returned (stake included). */
export function settleHands(hands: BJHand[], dealer: number[]) {
  const d = handValue(dealer).total,
    dBJ = dealer.length === 2 && d === 21;
  return hands.map(h => {
    const p = handValue(h.cards).total;
    if (p > 21) return { outcome: 'bust' as const, payout: 0 };
    if (isBlackjack(h))
      return dBJ ? { outcome: 'push' as const, payout: h.bet } : { outcome: 'blackjack' as const, payout: h.bet + Math.floor(h.bet * 1.5) };
    if (dBJ) return { outcome: 'lose' as const, payout: 0 };
    if (d > 21 || p > d) return { outcome: 'win' as const, payout: h.bet * 2 };
    if (p === d) return { outcome: 'push' as const, payout: h.bet };
    return { outcome: 'lose' as const, payout: 0 };
  });
}
export const totalStake = (st: BJState) => st.hands.reduce((a, h) => a + h.bet, 0);
export const totalPayout = (st: BJState) => st.results.reduce((a, r) => a + r.payout, 0);
