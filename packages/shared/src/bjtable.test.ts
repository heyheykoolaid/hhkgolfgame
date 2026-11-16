import { describe, it, expect } from 'vitest';
import { replayRound, hostStep, roundShoe, cardId, BJ_BET_MS, type TableHost, type SeatPres } from './bjtable';
import { handValue } from './blackjack';
const H = (seed: number, p: [number, string, number][], to: Record<number, number> = {}): TableHost => ({ r: 1, ph: 'play', e: 0, seed, p, to });
describe('multi-seat blackjack', () => {
  it('every client deals the same shoe from the seed, and cards keep their draw ids', () => {
    expect(roundShoe(42)).toEqual(roundShoe(42));
    expect(roundShoe(42)).not.toEqual(roundShoe(43));
    const v = replayRound(
      H(7, [
        [0, 'a', 10],
        [3, 'b', 20],
      ]),
      {},
    );
    expect(v.seats[0].hands[0].cards.map(cardId)).toEqual([0, 3]);
    expect(v.seats[1].hands[0].cards.map(cardId)).toEqual([1, 4]);
    expect(v.dealer.map(cardId)).toEqual([2, 5]);
  });
  it('waits on the first seat (in seat order) that still has to act, unless it has blackjack', () => {
    for (let seed = 1; seed < 40; seed++) {
      const v = replayRound(
        H(seed, [
          [2, 'a', 10],
          [0, 'b', 10],
        ]),
        {},
      );
      if (v.done) continue;
      const first = v.seats.find(s => !s.done)!;
      expect(v.activeSeat).toBe(first.seat);
      expect(first.seat === 0 || v.seats[0].done).toBe(true);
    }
  });
  it('standing (or timing out) everyone finishes the round and the dealer reaches 17+', () => {
    let n = 0;
    for (let seed = 1; seed < 60; seed++) {
      const p: [number, string, number][] = [
        [0, 'a', 10],
        [1, 'b', 50],
        [4, 'c', 100],
      ];
      const a = replayRound(H(seed, p), { 0: 's', 1: 's', 4: 's' }),
        b = replayRound(H(seed, p, { 0: 0, 1: 0, 4: 0 }), {});
      expect(a.done).toBe(true);
      expect(b.done).toBe(true);
      expect(a.seats.map(s => s.results)).toEqual(b.seats.map(s => s.results));
      const d = handValue(a.dealer).total,
        bj = a.dealer.length === 2 && d === 21;
      if (!bj) {
        expect(d).toBeGreaterThanOrEqual(17);
        n++;
      }
      for (const s of a.seats) expect(s.results.length).toBe(1);
    }
    expect(n).toBeGreaterThan(30);
  });
  it('a timeout after one hit stands the rest of the hand', () => {
    for (let seed = 1; seed < 80; seed++) {
      const v0 = replayRound(H(seed, [[0, 'a', 10]]), {});
      if (v0.done) continue;
      const v = replayRound(H(seed, [[0, 'a', 10]], { 0: 1 }), { 0: 'hhhh' });
      expect(v.done).toBe(true);
      expect(v.seats[0].hands[0].cards.length).toBeLessThanOrEqual(3);
      return;
    }
  });
  it('host: bets open, deal when everyone is ready, timeout stands, then a new betting phase', () => {
    const seat = (b: number, k?: number): { uid: string; p: SeatPres } => ({ uid: 'u' + b, p: { s: 0, b, r: 0, a: '', k } });
    let h = hostStep(null, new Map(), 1000);
    expect(h.ph).toBe('bet');
    expect(h.e).toBe(1000 + BJ_BET_MS);
    const m = new Map([[0, seat(50)]]);
    expect(hostStep(h, m, 2000)).toBe(h); // still betting
    m.set(0, seat(50, 1));
    const tk = { k: '' };
    h = hostStep(h, m, 2000, () => 0.5, tk);
    expect(h.ph).toBe('play');
    expect(h.p).toEqual([[0, 'u50', 50]]);
    let t = 2000;
    for (let i = 0; i < 20 && h.ph === 'play'; i++) {
      t += 20000;
      h = hostStep(h, m, t, Math.random, tk);
    }
    expect(h.ph).toBe('done');
    h = hostStep(h, m, t + 10000);
    expect(h.ph).toBe('bet');
    expect(h.r).toBe(1);
  });
});
