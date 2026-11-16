import { describe, it, expect } from 'vitest';
import { setHole, HOLE1, heightAt } from './course';
import { lieSlope, slopeFx, simulateShot } from './swing';

// Hole 1 plus a long mound running down the fairway at x = 6 (so x < 6 is its right-hand flank, rising to the left)
const MOUND = { ...HOLE1, land: [{ x: 6, z: 150, rx: 7, rz: 60, ang: 0, h: 2.2 }] } as any;
const shot = (x: number, z: number, aim = 0) =>
  simulateShot(
    { ball: { x, z, teed: false }, wind: { x: 0, z: 0 } },
    { club: 7, power: 1, u: 0, aimYaw: aim, spin: { top: 0, back: 0, side: 0 } },
    7,
  );

describe('sloping lies', () => {
  it('measures slopes the right way round', () => {
    setHole(MOUND);
    // standing at x = 6 + 6 (left of the ridge line): ground falls toward +x (the golfer's side) → ball above the feet
    const s1 = lieSlope(12, 150, 0);
    expect(s1.side).toBeLessThan(-0.05);
    const s2 = lieSlope(0, 150, 0);
    expect(s2.side).toBeGreaterThan(0.05);
    // facing toward +x from the right flank = uphill
    expect(lieSlope(1.5, 150, Math.PI / 2).up).toBeGreaterThan(0.05);
    expect(slopeFx(s1, false).label).toContain('above feet');
    expect(slopeFx({ up: 0.01, side: 0.01 }, false).label).toBe('');
    void heightAt;
  });
  it('ball above the feet draws left, below fades right; uphill flies higher and shorter', () => {
    setHole(HOLE1);
    const flat = shot(0, 150);
    setHole(MOUND);
    const above = shot(12, 150),
      below = shot(0, 150);
    setHole(HOLE1);
    const dxA = above.end.x - 12 - (flat.end.x - 0),
      dxB = below.end.x - 0 - (flat.end.x - 0);
    expect(dxA).toBeGreaterThan(2); // +x is left
    expect(dxB).toBeLessThan(-2);
    setHole(MOUND);
    const upS = shot(1.5, 150, Math.PI / 2),
      upFx = slopeFx(lieSlope(1.5, 150, Math.PI / 2), false);
    setHole(HOLE1);
    expect(upFx.launch).toBeGreaterThan(1);
    expect(upFx.dist).toBeLessThan(1);
    void upS;
  });
});
