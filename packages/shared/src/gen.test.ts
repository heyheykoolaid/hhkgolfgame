import { describe, it, expect } from 'vitest';
import { useHole, holeProblem, seedFromMatch, matchIdFor, holeCode, codeSeed, COURSE, HOLE1, TREES } from './index';
describe('random holes', () => {
  it('are playable for many seeds and deterministic', () => {
    for (let s = 1; s <= 40; s++) {
      const h = useHole(s * 7919);
      expect(holeProblem()).toBe('');
      expect([3, 4, 5]).toContain(h.par);
    }
    const a = useHole(12345),
      ta = TREES.length,
      pa = JSON.stringify(a);
    const b = useHole(12345);
    expect(JSON.stringify(b)).toBe(pa);
    expect(TREES.length).toBe(ta);
  });
  it('travel in match ids', () => {
    const seed = codeSeed('4KQ2B');
    expect(holeCode(seed)).toBe('4KQ2B');
    expect(seedFromMatch(matchIdFor(seed, 'abc12'))).toBe(seed);
    expect(seedFromMatch(matchIdFor(0, 'abc12'))).toBe(0);
    useHole(0);
    expect(COURSE).toBe(HOLE1);
  });
});

import { generateHole as gen2, holeProblem as prob2 } from './holegen';
it('every hole archetype shows up and is playable', () => {
  const kinds = new Set<string>();
  for (let s = 1; s <= 300; s++) {
    const h = gen2(s * 7717);
    expect(prob2()).toBe('');
    kinds.add(h.plan!.kind);
    expect(h.plan!.tip.length).toBeGreaterThan(10);
  }
  expect([...kinds].sort()).toEqual(['cape', 'carry', 'corner', 'double', 'driveable', 'reachable', 'redan', 'ridge', 'split', 'stamp', 'valley']);
});
