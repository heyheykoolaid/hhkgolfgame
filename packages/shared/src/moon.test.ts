// The Moon (holegen.moonHole): low gravity, dust that stops the ball, craters and moon buggies — and still playable.
import { describe, it, expect } from 'vitest';
import { useHole, COURSE, classify, simulateShot, buggyAt, buggyHit, heightAt, greenEd } from './index';

const SEEDS = Array.from({ length: 40 }, (_, i) => 2000 + i * 7919);
const drive = { club: 0, power: 1, u: 0, aimYaw: 0, spin: { top: 0, back: 0, side: 0 } };
const flight = (r: any) => r.events.find((e: any) => e.type === 'land')?.t ?? 0;

describe('Moon holes', () => {
  it('keep the pin on the green, with moon rules and no water or trees', () => {
    for (const s of SEEDS) {
      const h = useHole(s, 'moon');
      expect(h.locale).toBe('moon');
      expect(h.grav).toBe(0.4);
      expect(h.pond).toBeNull();
      expect(h.trees.count).toBe(0);
      expect(classify(h.pin.x, h.pin.z).s).toBe('green');
      expect(h.craters!.length).toBeGreaterThanOrEqual(h.bunkers.length);
      expect(h.buggies!.length).toBeGreaterThan(0);
    }
  });
  it('keep every buggy line inside the hole and off the green', () => {
    for (const s of SEEDS) {
      const h = useHole(s, 'moon');
      for (const b of h.buggies!)
        for (let t = 0; t < 60; t += 0.5) {
          const p = buggyAt(b, 1.7e9 + t);
          expect(greenEd(p.x, p.z)).toBeGreaterThan(3.5);
          expect(p.x).toBeGreaterThan(h.bounds.x0 + 30);
          expect(p.x).toBeLessThan(h.bounds.x1 - 30);
        }
    }
  });
  it('carry a drive about as far as at Golden Hills, but hang far longer and roll far less', () => {
    let n = 0;
    for (const s of SEEDS.slice(0, 12)) {
      useHole(s, 'hills');
      const e = simulateShot({ ball: { x: 0, z: 0, teed: true }, wind: { x: 0, z: 0 } }, drive, 5);
      useHole(s, 'moon');
      const m = simulateShot({ ball: { x: 0, z: 0, teed: true }, wind: { x: 0, z: 0 } }, drive, 5);
      if (e.outcome !== 'rest' || m.outcome !== 'rest') continue;
      n++;
      expect(Math.abs(m.carry - e.carry)).toBeLessThan(e.carry * 0.25);
      expect(flight(m)).toBeGreaterThan(flight(e) * 1.3);
      expect(m.total - m.carry).toBeLessThan(Math.max(4, (e.total - e.carry) * 0.5));
    }
    expect(n).toBeGreaterThan(5);
  });
  it('let the wind push a ball further than at Golden Hills', () => {
    const wind = { x: 4, z: 0 };
    useHole(SEEDS[0], 'hills');
    const e = simulateShot({ ball: { x: 0, z: 0, teed: true }, wind }, drive, 5),
      e0 = simulateShot({ ball: { x: 0, z: 0, teed: true }, wind: { x: 0, z: 0 } }, drive, 5);
    useHole(SEEDS[0], 'moon');
    const m = simulateShot({ ball: { x: 0, z: 0, teed: true }, wind: { x: 4 * (COURSE.gust ?? 1), z: 0 } }, drive, 5),
      m0 = simulateShot({ ball: { x: 0, z: 0, teed: true }, wind: { x: 0, z: 0 } }, drive, 5);
    const land = (r: any) => {
      const t = flight(r);
      return r.frames.find((f: number[]) => f[0] >= t) || r.frames[r.frames.length - 1];
    };
    const de = Math.abs(land(e)[1] - land(e0)[1]),
      dm = Math.abs(land(m)[1] - land(m0)[1]);
    expect(dm).toBeGreaterThan(de * 1.5);
    expect(dm).toBeLessThan(de * 3.5);
  });
  it('bounce a ball off a buggy it runs into', () => {
    const h = useHole(SEEDS[3], 'moon'),
      g = h.buggies![0],
      t = 1.7e9 + 12,
      p = buggyAt(g, t),
      // rolling straight at the buggy's side, from 1.6 m away along the hole
      nx = -g.tz,
      nz = g.tx,
      ball: any = { x: p.x - nx * 1.52, z: p.z - nz * 1.52, y: heightAt(p.x, p.z) + 0.02, vx: nx * 6, vy: 0, vz: nz * 6, sb: 0, ss: 0, state: 'roll' };
    expect(buggyHit(ball, t)).toBe(true);
    expect(ball.vx * nx + ball.vz * nz).toBeLessThan(0); // sent back the way it came
    // and a ball high above it flies over
    const high: any = { ...ball, x: p.x - nx * 1.52, z: p.z - nz * 1.52, y: heightAt(p.x, p.z) + 5, vx: nx * 6, vz: nz * 6, state: 'air' };
    expect(buggyHit(high, t)).toBe(false);
  });
  it('raise a rim round every crater', () => {
    for (const s of SEEDS.slice(0, 10)) {
      const h = useHole(s, 'moon');
      for (const c of h.craters!) {
        const mid = heightAt(c.x, c.z),
          rim = Math.max(...[0, 1.5, 3, 4.5].map(a => heightAt(c.x + Math.cos(a) * c.r, c.z + Math.sin(a) * c.r)));
        expect(rim).toBeGreaterThan(mid + 0.3);
      }
    }
  });
});
