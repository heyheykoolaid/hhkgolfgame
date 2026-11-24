// The Old Estate (holegen.hauntHole) and the Bad Batch (holegen.tripHole): their extra rules hold and stay fair.
import { describe, it, expect } from 'vitest';
import { useHole, COURSE, classify, simulateShot, heightAt, inMoat, onBridge, pillarHit, pipeHit, groundContact, BALL_R } from './index';

const SEEDS = Array.from({ length: 40 }, (_, i) => 3000 + i * 7919);

describe('the Old Estate', () => {
  it('rings every par 3 green with a moat that has a dry drawbridge, and keeps the pin on the green', () => {
    let moats = 0;
    for (const s of SEEDS) {
      const h = useHole(s, 'haunt');
      expect(h.locale).toBe('haunt');
      expect(classify(h.pin.x, h.pin.z).s).toBe('green');
      if (h.par === 3) expect(h.moat).toBeTruthy();
      const m = h.moat;
      if (!m) continue;
      moats++;
      // the water stands below both banks, all the way round
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        for (const rr of [m.r0 - 0.8, m.r1 + 0.8]) {
          const x = m.x + Math.sin(a) * rr,
            z = m.z + Math.cos(a) * rr;
          if (!onBridge(x, z)) expect(heightAt(x, z)).toBeGreaterThan(m.level);
        }
      }
      // across the moat along the bridge it's dry; beside the bridge it's water
      const mid = (m.r0 + m.r1) / 2,
        bx = m.x + Math.sin(m.ang) * mid,
        bz = m.z + Math.cos(m.ang) * mid;
      expect(classify(bx, bz).s).toBe('fringe');
      const ox = m.x + Math.sin(m.ang + Math.PI / 2) * mid,
        oz = m.z + Math.cos(m.ang + Math.PI / 2) * mid;
      expect(inMoat(ox, oz)).toBe(true);
      expect(classify(ox, oz).s).toBe('water');
    }
    expect(moats).toBeGreaterThan(8);
  });
  it('stands gate piers by the landing zone that turn a ball back', () => {
    let tested = 0;
    for (const s of SEEDS) {
      useHole(s, 'haunt');
      const p = COURSE.pillars!.find(q => q.kind === 'gate');
      if (!p) continue;
      const b: any = { x: p.x - p.r - 0.01, z: p.z, y: heightAt(p.x, p.z) + 1, vx: 20, vy: 0, vz: 0, sb: 0, ss: 0, state: 'air' };
      expect(pillarHit(b)).toBe(true);
      expect(b.vx).toBeLessThan(0);
      tested++;
    }
    expect(tested).toBeGreaterThan(10);
  });
});

describe('the Bad Batch', () => {
  it('has pads, flips the wind and keeps the pin on the green', () => {
    for (const s of SEEDS) {
      const h = useHole(s, 'trip');
      expect(h.locale).toBe('trip');
      expect(h.flip).toBe(true);
      expect(h.trees.count).toBe(0);
      expect(h.pads!.length).toBeGreaterThan(2);
      expect(classify(h.pin.x, h.pin.z).s).toBe('green');
    }
  });
  it('sends a ball through a warp pipe to the fairway near the green, rolling at the pin', () => {
    const s = SEEDS.find(x => useHole(x, 'trip').pipes!.length)!;
    const h = useHole(s, 'trip'),
      p = h.pipes![0],
      b: any = { x: p.ax, z: p.az, y: heightAt(p.ax, p.az) + BALL_R, vx: 3, vy: 0, vz: 3, sb: 0, ss: 0, state: 'roll' };
    expect(pipeHit(b)).toBe(true);
    expect(Math.hypot(b.x - p.bx, b.z - p.bz)).toBeLessThan(3);
    const toPin = Math.hypot(h.pin.x - b.x, h.pin.z - b.z),
      after = Math.hypot(h.pin.x - (b.x + b.vx * 0.1), h.pin.z - (b.z + b.vz * 0.1));
    expect(after).toBeLessThan(toPin);
    expect(pipeHit(b)).toBe(false); // once a shot
  });
  it('throws a ball that lands on a pad back into the air, three times a shot at most', () => {
    const h = useHole(SEEDS[2], 'trip'),
      pad = h.pads![0],
      b: any = { x: pad.x, z: pad.z, y: 0, vx: 2, vy: -10, vz: 0, sb: 0, ss: 0, state: 'air', landed: true };
    for (let k = 0; k < 3; k++) {
      b.vy = -10;
      expect(groundContact(b, heightAt(b.x, b.z))).toBe('pad');
      expect(b.vy).toBeGreaterThanOrEqual(13);
    }
    b.vy = -10;
    expect(groundContact(b, heightAt(b.x, b.z))).not.toBe('pad');
  });
});
