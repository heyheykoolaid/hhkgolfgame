import { describe, it, expect } from 'vitest';
import {
  newPlant,
  tickPlant,
  water,
  feed,
  pour,
  fertilize,
  stageOf,
  qualityOf,
  yieldOf,
  growTotal,
  unitPrice,
  saleTotal,
  DAY_MS,
  STRAINS,
  preferredStrain,
} from './grow';
const run = (p: ReturnType<typeof newPlant>, secs: number, every: number, care: boolean) => {
  for (let t = 0; t < secs; t++) {
    if (care && t % every === 0) {
      if (p.w < 0.4) water(p);
      if (p.n < 0.4) feed(p);
    }
    tickPlant(p, 1);
  }
  return p;
};
describe('growing', () => {
  it('a cared-for plant reaches Ready in its grow time and grades well', () => {
    const p = run(newPlant('gc', 1), growTotal(newPlant('gc', 1)) + 5, 20, true);
    expect(stageOf(p)).toBe(3);
    expect(qualityOf(p, 'growbed')).toBe(3);
    expect(qualityOf(p, 'growpot')).toBe(2); // the pot caps it at Good
    expect(yieldOf(p, 'growpot')).toBeGreaterThanOrEqual(9);
  });
  it('a dry plant pauses (never dies), resumes once watered, and grades low', () => {
    const p = run(newPlant('gc', 2), growTotal(newPlant('gc', 2)) + 5, 1, false);
    expect(p.w).toBe(0);
    const g = p.g;
    run(p, 600, 1, false);
    expect(p.g).toBe(g); // paused
    for (let t = 0; t < 4000 && stageOf(p) < 3; t++) {
      if (p.w < 0.2) pour(p, 1);
      tickPlant(p, 1);
    }
    expect(stageOf(p)).toBeGreaterThanOrEqual(3);
    expect(qualityOf(p, 'growbed')).toBeLessThanOrEqual(2);
    expect(yieldOf(p, 'growbed')).toBeGreaterThan(0);
  });
  it('pouring fills to full and reports the spill; fertilizer tops up', () => {
    const p = newPlant('gc', 9);
    p.w = 0.7;
    expect(pour(p, 0.5)).toBeCloseTo(0.2, 5);
    expect(p.w).toBe(1);
    p.n = 0.2;
    fertilize(p, 0.5);
    expect(p.n).toBeCloseTo(0.7, 5);
    fertilize(p, 1);
    expect(p.n).toBe(1);
  });
  it('overwatering causes root rot, overripe plants lose quality', () => {
    const p = newPlant('gc', 3);
    water(p);
    water(p);
    expect(p.rot).toBe(1);
    const q = run(newPlant('dp', 4), growTotal(newPlant('dp', 4)) + 5, 20, true),
      before = qualityOf(q, 'growbed');
    run(q, 900, 1, false);
    expect(stageOf(q)).toBe(4);
    expect(qualityOf(q, 'growbed')).toBeLessThan(before);
  });
});
describe('dealer prices', () => {
  const day = (id: string) => STRAINS.findIndex(s => s.id === id) * DAY_MS + 1000;
  it('matches the economy doc, with the clamp only on the market part (Option B)', () => {
    expect(preferredStrain(day('bd'))).toBe('bd');
    expect(saleTotal('gc', 1, 12, day('bd'))).toBe(1140); // 12 × $95, Average, no preference
    expect(unitPrice('bd', 2, 28, day('bd')).unit).toBeCloseTo(185 * 1.2 * 1.22 * 1.06, 6); // Good, preferred, bulk 15+
    const u = unitPrice('gc', 3, 60, day('gc'));
    expect(u.market).toBeCloseTo(1.22 * 1.14, 6);
    expect(u.unit).toBeCloseTo(95 * 1.4 * 1.22 * 1.14, 6);
  });
});
