// Boulder Peak (holegen.peakHole): the mountain version of a generated hole stays playable.
import { describe, it, expect } from 'vitest';
import { useHole, COURSE, CENTER_PTS, HOLE_LEN, WATER_Y, TEE_H, GREEN_H, heightAt, classify, pondPd, simulateShot, CLUBS } from './index';

const SEEDS = Array.from({ length: 40 }, (_, i) => 1000 + i * 7919);
describe('Boulder Peak holes', () => {
  it('keep the pin on the green and give every hole its mountain rules', () => {
    for (const s of SEEDS) {
      const h = useHole(s, 'peak');
      expect(h.locale).toBe('peak');
      expect(classify(h.pin.x, h.pin.z).s).toBe('green');
      expect(h.air).toBe(1.1);
      expect(h.gust).toBeGreaterThan(1);
    }
  });
  it('change height from tee to green: par 3s drop, par 5s climb', () => {
    let drops = 0,
      n3 = 0;
    for (const s of SEEDS) {
      const h = useHole(s, 'peak');
      if (h.par === 3) {
        n3++;
        if (GREEN_H < TEE_H - 3) drops++;
      }
      if (h.par === 5) expect(GREEN_H).toBeGreaterThan(TEE_H + 3);
    }
    expect(drops).toBeGreaterThan(n3 * 0.8);
  });
  it('never leave ravine water standing above its banks', () => {
    for (const s of SEEDS) {
      const h = useHole(s, 'peak');
      if (!h.pond) continue;
      for (let a = 0; a < 6.28; a += 0.2)
        for (let k = 0.2; k < 1.5; k += 0.1) {
          const c = Math.cos(h.pond.ang || 0),
            sn = Math.sin(h.pond.ang || 0),
            lx = Math.cos(a) * h.pond.rx * k,
            lz = Math.sin(a) * h.pond.rz * k,
            // local → world is the inverse of the turn ell() applies
            x = h.pond.x + lx * c + lz * sn,
            z = h.pond.z - lx * sn + lz * c;
          if (pondPd(x, z) > 1.35 && pondPd(x, z) < 1.7) expect(heightAt(x, z)).toBeGreaterThan(WATER_Y - 0.02);
        }
    }
  });
  it('let a solid drive clear the ravine on par 4s and 5s', () => {
    let wet = 0,
      n = 0;
    for (const s of SEEDS) {
      const h = useHole(s, 'peak');
      if (!h.pond || h.par === 3) continue;
      n++;
      const p = CENTER_PTS.find(q => q.along > Math.min(HOLE_LEN - 30, 215))!,
        r = simulateShot(
          { ball: { x: 0, z: -1, teed: true }, wind: { x: 0, z: 0 } },
          { club: 0, power: 1, u: 0, aimYaw: Math.atan2(p.x, p.z + 1) },
          5,
        );
      if (r.outcome === 'water') wet++;
    }
    expect(n).toBeGreaterThan(3);
    expect(wet).toBeLessThanOrEqual(Math.floor(n * 0.15));
  });
  it('fly the ball farther than at sea level', () => {
    const tee = { ball: { x: 0, z: -1, teed: true }, wind: { x: 0, z: 0 } };
    useHole(4242, 'hills');
    const a = simulateShot(tee, { club: 7, power: 1, u: 0, aimYaw: 0 }, 3).carry;
    useHole(4242, 'peak');
    const b = simulateShot(tee, { club: 7, power: 1, u: 0, aimYaw: 0 }, 3).carry;
    expect(b).toBeGreaterThan(a * 1.03);
    expect(CLUBS[7].carry).toBe(145);
    expect(COURSE.rocks!.length).toBeGreaterThanOrEqual(0);
  });
});
