import { describe, it, expect } from 'vitest';
import {
  settle,
  lockOffer,
  splitPot,
  offerId,
  potOf,
  stakeOf,
  cleanBetPres,
  outcomeFits,
  type Offer,
  type Locked,
  type BetPlayer,
  type Outcome,
} from './index';
const ctx = { holes: 3, pin: { x: 0, z: 100 }, onGreen: (x: number, z: number) => Math.hypot(x, z - 100) < 10 };
const P = (uid: string, o: Partial<BetPlayer> = {}): BetPlayer => ({
  uid,
  here: true,
  gone: false,
  h: 0,
  done: false,
  busy: false,
  picked: false,
  strokes: 0,
  sk: 0,
  card: [],
  x: 0,
  z: 0,
  ...o,
});
const M = (...ps: BetPlayer[]) => new Map(ps.map(p => [p.uid, p]));
const offer = (o: Partial<Offer> & Pick<Offer, 't' | 'by'>): Offer => {
  const b = { a: 100, h: 0, ...o } as Offer;
  b.id = offerId(b);
  return b;
};
const total = (o: Outcome) => o.pay.reduce((t, [, v]) => t + v, 0);
const done = (uid: string, strokes: number, o: Partial<BetPlayer> = {}) => P(uid, { done: true, strokes, ...o });

describe('bets: locking', () => {
  it('needs two players; the roster is sorted; skins and round run to the end', () => {
    expect(lockOffer(offer({ t: 'hole', by: 'b' }), [], 3)).toBeNull();
    expect(lockOffer(offer({ t: 'hole', by: 'b' }), ['b'], 3)).toBeNull();
    expect(lockOffer(offer({ t: 'hole', by: 'b' }), ['c', 'a', 'a'], 3)!.r).toEqual(['a', 'b', 'c']);
    const sk = lockOffer(offer({ t: 'skins', by: 'a' }), ['b'], 9)!;
    expect(sk.n).toBe(9);
    expect(stakeOf(sk, sk.n)).toBe(900);
    expect(potOf(sk)).toBe(1800);
    expect(lockOffer(offer({ t: 'make', by: 'b', on: 'c', ts: 2, side: 0 }), ['c', 'a'], 3)!.r).toEqual(['b', 'a']); // first taker only
  });
  it('splits whole dollars the same way everywhere', () => {
    expect(splitPot(100, ['b', 'a', 'c'])).toEqual([
      ['a', 34],
      ['b', 33],
      ['c', 33],
    ]);
    expect(splitPot(0, ['a'])).toEqual([]);
  });
});
describe('bets: hole winner', () => {
  const b = lockOffer(offer({ t: 'hole', by: 'a' }), ['b', 'c'], 1)!;
  it('waits for everyone, pays the low score, splits ties, and always pays out exactly the pot', () => {
    expect(settle(b, M(done('a', 4), done('b', 5), P('c', { strokes: 3 })), ctx, {}, 0)).toBeNull();
    const r = settle(b, M(done('a', 4), done('b', 5), done('c', 6)), ctx, {}, 0)!;
    expect(r.out.pay).toEqual([['a', 300]]);
    expect(r.key).toBe(b.id);
    const t = settle(b, M(done('a', 4), done('b', 4), done('c', 6)), ctx, {}, 0)!;
    expect(t.out.pay).toEqual([
      ['a', 150],
      ['b', 150],
    ]);
    expect(total(t.out)).toBe(potOf(b));
  });
  it('leaving is forfeiting: wait out the grace, then the leaver cannot win even with the best score', () => {
    const blip = M(done('a', 5), done('b', 6), P('c', { here: false, gone: false, done: true, strokes: 2 }));
    expect(settle(b, blip, ctx, {}, 0)).toBeNull();
    const left = M(done('a', 5), done('b', 6), P('c', { here: false, gone: true, done: true, strokes: 2 }));
    expect(settle(b, left, ctx, {}, 0)!.out.pay).toEqual([['a', 300]]);
    expect(settle(b, M(P('a', { strokes: 1 }), P('b', { here: false, gone: true }), P('c', { here: false, gone: true })), ctx, {}, 0)!.out).toEqual({
      pay: [['a', 300]],
      end: 1,
      note: 'left',
    });
  });
  it('reads a finished hole from the card once the player has moved on', () => {
    const r = settle(b, M(P('a', { h: 1, card: [3] }), done('b', 4), done('c', 5)), ctx, {}, 0)!;
    expect(r.out.pay).toEqual([['a', 300]]);
  });
});
describe('bets: closest to the pin', () => {
  const b = lockOffer(offer({ t: 'ctp', by: 'a', a: 50 }), ['b', 'c'], 1)!;
  it('waits for every tee shot; a penalty is out; nobody in play splits it', () => {
    expect(settle(b, M(P('a', { tp: [0, 4.2] }), P('b', { tp: [0, 9] }), P('c')), ctx, {}, 0)).toBeNull();
    expect(settle(b, M(P('a', { tp: [0, 4.2] }), P('b', { tp: [0, 9] }), P('c', { tp: [0, -1] })), ctx, {}, 0)!.out.pay).toEqual([['a', 150]]);
    expect(settle(b, M(P('a', { tp: [1, 0.5] }), P('b', { tp: [0, 9] }), P('c', { tp: [0, -1] })), ctx, {}, 0)).toBeNull(); // last hole's number doesn't count
    expect(settle(b, M(P('a', { tp: [0, -1] }), P('b', { tp: [0, -1] }), P('c', { tp: [0, -1] })), ctx, {}, 0)!.out.pay).toEqual([
      ['a', 50],
      ['b', 50],
      ['c', 50],
    ]);
  });
});
describe('bets: skins', () => {
  const b = lockOffer(offer({ t: 'skins', by: 'a', a: 10 }), ['b', 'c'], 3)!; // $30 a hole, $90 in all
  it('carries ties, pays the carry with the next skin, and is zero-sum over the round', () => {
    const outs: Record<string, Outcome> = {};
    const h0 = settle(b, M(done('a', 4), done('b', 4), done('c', 5)), ctx, outs, 0)!;
    expect(h0.out).toEqual({ pay: [], note: 'carry' });
    outs[h0.key] = h0.out;
    expect(settle(b, M(done('a', 4, { h: 2 }), done('b', 4, { h: 2 }), done('c', 5, { h: 2 })), ctx, outs, 2)).toBeNull(); // hole 2 can't settle before hole 1
    const h1 = settle(b, M(done('a', 3, { h: 1, card: [4] }), done('b', 4, { h: 1, card: [4] }), done('c', 5, { h: 1, card: [5] })), ctx, outs, 1)!;
    expect(h1.out.pay).toEqual([['a', 60]]);
    expect(h1.out.end).toBeUndefined();
    outs[h1.key] = h1.out;
    const h2 = settle(b, M(done('a', 4, { h: 2 }), done('b', 4, { h: 2 }), done('c', 4, { h: 2 })), ctx, outs, 2)!;
    expect(h2.out.pay).toEqual([
      ['a', 10],
      ['b', 10],
      ['c', 10],
    ]);
    expect(h2.out.end).toBe(1);
    outs[h2.key] = h2.out;
    expect(Object.values(outs).reduce((t, o) => t + total(o), 0)).toBe(potOf(b));
  });
  it('gives the rest to the last player standing', () => {
    const outs: Record<string, Outcome> = { [`${b.id}@0`]: { pay: [['b', 30]] } };
    const r = settle(b, M(P('a', { h: 1 }), P('b', { here: false, gone: true }), P('c', { here: false, gone: true })), ctx, outs, 1)!;
    expect(r.out).toEqual({ pay: [['a', 60]], end: 1, note: 'left' });
  });
});
describe('bets: round winner', () => {
  const b = lockOffer(offer({ t: 'round', by: 'a', a: 500 }), ['b'], 3)!;
  it('settles only after the last hole, on total strokes', () => {
    expect(settle(b, M(P('a', { h: 2, card: [4, 4] }), P('b', { h: 2, card: [5, 3] })), ctx, {}, 2)).toBeNull();
    expect(settle(b, M(done('a', 4, { h: 2, card: [4, 4] }), done('b', 3, { h: 2, card: [5, 3] })), ctx, {}, 2)!.out.pay).toEqual([['b', 1000]]);
    expect(settle(b, M(done('a', 3, { h: 2, card: [4, 4] }), done('b', 3, { h: 2, card: [5, 3] })), ctx, {}, 2)!.out.pay).toEqual([
      ['a', 500],
      ['b', 500],
    ]);
  });
});
describe('bets: live shot bets', () => {
  const mk = (side: 0 | 1, t: 'make' | 'green' = 'make') => lockOffer(offer({ t, by: 'a', on: 'c', ts: 2, sk: 0, side, a: 100 }), ['b'], 1)!;
  it('waits for the shot to stop, then pays the right side', () => {
    const b = mk(0); // a says c misses
    expect(settle(b, M(P('a'), P('b'), P('c', { strokes: 2 })), ctx, {}, 0)).toBeNull();
    expect(settle(b, M(P('a'), P('b'), P('c', { strokes: 3, busy: true })), ctx, {}, 0)).toBeNull();
    expect(settle(b, M(P('a'), P('b'), P('c', { strokes: 3, x: 1, z: 99 })), ctx, {}, 0)!.out.pay).toEqual([['a', 200]]);
    expect(settle(b, M(P('a'), P('b'), P('c', { strokes: 3, done: true, x: 0, z: 100 })), ctx, {}, 0)!.out.pay).toEqual([['b', 200]]);
    expect(settle(mk(1), M(P('a'), P('b'), P('c', { strokes: 3, done: true, x: 0, z: 100 })), ctx, {}, 0)!.out.pay).toEqual([['a', 200]]);
  });
  it('a penalty shot is not a make or a green; reaching the stroke limit is not a make', () => {
    expect(settle(mk(1, 'green'), M(P('a'), P('b'), P('c', { strokes: 4, x: 0, z: 95 })), ctx, {}, 0)!.out.pay).toEqual([['b', 200]]);
    expect(settle(mk(1, 'green'), M(P('a'), P('b'), P('c', { strokes: 3, x: 0, z: 95 })), ctx, {}, 0)!.out.pay).toEqual([['a', 200]]);
    expect(settle(mk(1), M(P('a'), P('b'), P('c', { strokes: 3, done: true, x: 30, z: 60 })), ctx, {}, 0)!.out.pay).toEqual([['b', 200]]);
  });
  it('is called off (stakes back) if the shot never happens; a bettor who left forfeits', () => {
    expect(settle(mk(1), M(P('a'), P('b'), P('c', { strokes: 3, sk: 1 })), ctx, {}, 0)!.out).toEqual({
      pay: [
        ['a', 100],
        ['b', 100],
      ],
      end: 1,
      note: 'void',
    });
    expect(settle(mk(1), M(P('a'), P('b'), P('c', { here: false, gone: true })), ctx, {}, 0)!.out.pay).toEqual([
      ['a', 100],
      ['b', 100],
    ]);
    expect(settle(mk(1), M(P('a'), P('b', { here: false, gone: true }), P('c', { strokes: 3, x: 5, z: 80 })), ctx, {}, 0)!.out.pay).toEqual([
      ['a', 200],
    ]); // b won, but left
    expect(settle(mk(1), M(P('a'), P('b', { here: false }), P('c', { strokes: 3, x: 5, z: 80 })), ctx, {}, 0)).toBeNull();
  });
});
describe('bets: untrusted presence', () => {
  it('re-derives ids, pins offers to their publisher, and drops junk', () => {
    const c = cleanBetPres(
      {
        of: [
          { id: 'x', t: 'hole', a: 100.7, h: 0, by: 'someone-else' },
          { t: 'nope', a: 1 },
          { t: 'hole', a: -5 },
        ],
        jn: ['a.hole.100.0', 5, '<b>'],
        lk: [
          { t: 'hole', a: 10, h: 0, by: 'a', r: ['a', 'zed'] },
          { t: 'hole', a: 10, h: 0, by: 'a', r: ['a', 'b'] },
        ],
        out: {
          k: {
            pay: [
              ['a', 5],
              ['b', 'x'],
            ],
          },
          bad: { pay: 'no' },
        },
        tp: [0, 'NaN'],
      },
      'zed',
    );
    expect(c.of).toEqual([{ id: 'zed.hole.100.0', t: 'hole', a: 100, h: 0, by: 'zed' }]);
    expect(c.jn).toEqual(['a.hole.100.0']);
    expect(c.lk.length).toBe(1);
    expect(c.lk[0].r).toEqual(['a', 'zed']); // only bets the publisher is in
    expect(c.out).toEqual({
      k: {
        pay: [
          ['a', 5],
          ['b', 0],
        ],
      },
    });
    expect(c.tp).toEqual([0, -1]);
    expect(cleanBetPres(null, 'a')).toEqual({ of: [], jn: [], ps: [], lk: [], out: {} });
  });
  it('rejects outcomes that overpay or pay outsiders', () => {
    const b = lockOffer(offer({ t: 'hole', by: 'a' }), ['b'], 1)! as Locked;
    expect(outcomeFits(b, { pay: [['a', 200]] })).toBe(true);
    expect(outcomeFits(b, { pay: [['a', 201]] })).toBe(false);
    expect(outcomeFits(b, { pay: [['z', 1]] })).toBe(false);
  });
});
