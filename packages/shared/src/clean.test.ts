import { describe, it, expect } from 'vitest';
import { cleanTableHost, cleanSeatPres, cleanGarden, replayRound } from './index';

describe('untrusted data never reaches the game raw', () => {
  it('table state: junk is rejected, odd shapes are repaired, and the result always replays', () => {
    expect(cleanTableHost(null)).toBeNull();
    expect(cleanTableHost({ r: 'x', ph: 'play' })).toBeNull();
    expect(cleanTableHost({ r: 1, ph: 'nope' })).toBeNull();
    const t = cleanTableHost({ r: 2.7, ph: 'play', e: 'soon', seed: -5, p: 'not a list', to: { 9: 99, a: 1 } })!;
    expect(t).toEqual({ r: 2, ph: 'play', e: 0, seed: 0, p: [], to: { 4: 40 } });
    const u = cleanTableHost({ r: 1, ph: 'play', e: 5, seed: 123, p: [[1, 'a', 50], [1, 'dup', 50], [7, 'b', -3], 'x', [2, 5, 5]], to: null })!;
    expect(u.p).toEqual([
      [1, 'a', 50],
      [4, 'b', 1],
    ]);
    expect(() => replayRound(u, { 1: 'hhhh', 4: 's' })).not.toThrow();
  });
  it('seat state: only real actions survive', () => {
    expect(cleanSeatPres({})).toBeNull();
    expect(cleanSeatPres({ s: 9, b: -1, r: 'x', a: 'hx<script>dps', k: 0 })).toEqual({ s: 4, b: 0, r: -1, a: 'hspdps', k: undefined });
  });
  it('gardens: unknown strains and broken numbers are dropped or clamped; no prototype tricks', () => {
    const g = cleanGarden(
      JSON.parse('{"a":{"s":"gc","id":1,"g":5,"w":9,"n":"x","cs":1,"ct":2,"rot":0,"pk":0},"b":{"s":"mystery"},"__proto__":{"s":"gc"},"c":7}'),
    );
    expect(Object.keys(g)).toEqual(['a', '__proto__'].filter(k => k in g));
    expect(g.a.w).toBe(1);
    expect(g.a.n).toBe(0);
    expect(({} as any).s).toBeUndefined();
    expect(cleanGarden(null)).toEqual({});
  });
});
