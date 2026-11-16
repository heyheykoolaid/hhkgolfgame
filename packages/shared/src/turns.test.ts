import { describe, it, expect } from 'vitest';
import { turnOf, teeOrderFor, groupStrokes, type TurnPlayer } from './index';
const pin = { x: 0, z: 300 };
const P = (id: string, o: Partial<TurnPlayer> = {}): TurnPlayer => ({
  id,
  uid: id,
  strokes: 0,
  done: false,
  busy: false,
  teed: true,
  x: 0,
  z: 0,
  sk: 0,
  skAt: 0,
  ...o,
});
describe('turns', () => {
  it('tees off in list order, then farthest from the hole', () => {
    expect(turnOf([P('b'), P('a'), P('c')], pin, ['a', 'b', 'c']).id).toBe('a');
    expect(turnOf([P('a', { teed: false, strokes: 1, z: 250 }), P('b'), P('c')], pin, ['a', 'b', 'c']).id).toBe('b');
    const after = [
      P('a', { teed: false, strokes: 1, z: 250 }),
      P('b', { teed: false, strokes: 1, z: 200 }),
      P('c', { teed: false, strokes: 1, z: 260 }),
    ];
    expect(turnOf(after, pin, ['a', 'b', 'c'])).toEqual({ id: 'b', phase: 'play' }); // 100 m out is farthest
  });
  it('waits while a ball is in the air', () => {
    expect(turnOf([P('a', { busy: true }), P('b')], pin, ['a', 'b']).phase).toBe('flight');
  });
  it('holed-out players are out of the order', () => {
    const ps = [P('a', { teed: false, strokes: 3, done: true, z: 300 }), P('b', { teed: false, strokes: 2, z: 290 })];
    expect(turnOf(ps, pin, ['a', 'b']).id).toBe('b');
    expect(turnOf([P('a', { done: true }), P('b', { done: true })], pin, []).phase).toBe('done');
  });
  it('a skipped player sits out until someone else hits', () => {
    const ps = [P('a', { teed: false, strokes: 2, z: 100, sk: 1 }), P('b', { teed: false, strokes: 1, z: 200 })];
    ps[0].skAt = groupStrokes(ps); // a was farthest, timed out (penalty already counted)
    expect(turnOf(ps, pin, ['a', 'b']).id).toBe('b');
    ps[1].strokes = 2;
    ps[1].z = 280; // b hits → a is back (still farthest)
    expect(turnOf(ps, pin, ['a', 'b']).id).toBe('a');
  });
  it('if the skipped player is the only one left, it comes back to them', () => {
    const ps = [P('a', { teed: false, strokes: 4, z: 100, sk: 1 }), P('b', { done: true, teed: false, strokes: 3 })];
    ps[0].skAt = groupStrokes(ps);
    expect(turnOf(ps, pin, ['a', 'b']).id).toBe('a');
  });
  it('later holes: last place tees off first, ties keep the previous order', () => {
    const scores = new Map([
      ['a', -1],
      ['b', 2],
      ['c', 2],
    ]);
    expect(teeOrderFor(['a', 'b', 'c'], ['c', 'a', 'b'], scores)).toEqual(['c', 'b', 'a']);
    expect(teeOrderFor(['a', 'b', 'c'], null, null)).toEqual(['a', 'b', 'c']);
  });
});
