import { describe, it, expect } from 'vitest';
import { CLUBS, simulateFlat, speedForCarry, simulateShot, evaluateImpact, windows, sanitize, COURSE, surfaceAt, CENTER_PTS } from './index';

describe('ball flight', () => {
  it('every club carries its rated distance on a perfect strike (flat, no wind)', () => {
    for (const c of CLUBS) {
      if (c.putter) continue;
      const v = speedForCarry(c.carry, c.launch, c.spin);
      const r = simulateFlat(v, c.launch, c.spin);
      expect(Math.abs(r.carry - c.carry) / c.carry).toBeLessThan(0.01);
      expect(r.apex).toBeGreaterThan(14);
      expect(r.apex).toBeLessThan(35);
    }
  });
});

describe('impact grading', () => {
  const win = { p: 0.1, g: 0.34 };
  it('perfect / good / miss bands', () => {
    expect(evaluateImpact(0, win, false).grade).toBe('perfect');
    expect(evaluateImpact(0.2, win, false).grade).toBe('good');
    expect(evaluateImpact(-0.8, win, false).grade).toBe('miss');
  });
  it('early pulls left (negative dev), late pushes right', () => {
    expect(evaluateImpact(-0.5, win, false).dev).toBeLessThan(0);
    expect(evaluateImpact(0.5, win, false).dev).toBeGreaterThan(0);
  });
  it('no press is a topped shot', () => {
    expect(evaluateImpact(1.2, win, false).label).toBe('Topped it!');
  });
  it('overswing shrinks the window', () => {
    expect(windows(1.15, CLUBS[0], 'tee').p).toBeLessThan(windows(1, CLUBS[0], 'tee').p);
  });
});

describe('authoritative shot', () => {
  const tee = { ball: { x: 0, z: -1, teed: true }, wind: { x: 0, z: 0 } };
  const aimDrive = (() => {
    const p = CENTER_PTS.find(p => p.along > 228)!;
    return Math.atan2(p.x, p.z + 1);
  })();
  it('is deterministic for the same seed', () => {
    const a = simulateShot(tee, { club: 0, power: 1, u: 0.01, aimYaw: aimDrive }, 42);
    const b = simulateShot(tee, { club: 0, power: 1, u: 0.01, aimYaw: aimDrive }, 42);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('a perfect drive down the line finds the fairway', () => {
    const r = simulateShot(tee, { club: 0, power: 1, u: 0, aimYaw: aimDrive }, 7);
    expect(r.outcome).toBe('rest');
    expect(r.restSurface).toBe('fairway');
    expect(r.total).toBeGreaterThan(220);
  });
  it('a short putt holes out', () => {
    const P = COURSE.pin,
      s = { ball: { x: P.x + 0.2, z: P.z + 0.05, teed: false }, wind: { x: 0, z: 0 } };
    const r = simulateShot(s, { club: CLUBS.length - 1, power: 0.12, u: 0, aimYaw: Math.atan2(-0.2, -0.05), puttRange: 0 }, 1);
    expect(r.outcome).toBe('holed');
  });
  it('sanitises hostile input', () => {
    const s = sanitize({ club: 99, power: 50, u: -9, aimYaw: NaN as any, spin: { top: 5, back: 0, side: 9 } as any });
    expect(s.club).toBe(CLUBS.length - 1);
    expect(s.power).toBe(1.15);
    expect(s.u).toBe(-1.4);
    expect(s.aimYaw).toBe(0);
    expect(s.spin!.side).toBe(1);
  });
  it('water costs a stroke and drops the ball on dry land', () => {
    const aim = Math.atan2(52, 195); // straight at the pond
    const r = simulateShot(tee, { club: 2, power: 1, u: 0, aimYaw: aim }, 3);
    if (r.outcome === 'water') {
      expect(r.penalty).toBe(1);
      expect(surfaceAt(r.end.x, r.end.z)).not.toBe('water');
    } else expect(['rest', 'ob']).toContain(r.outcome);
  });
});
