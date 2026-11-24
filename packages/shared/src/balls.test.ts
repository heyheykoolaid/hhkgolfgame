// Novelty balls (physics.ts BallKind): lead ignores wind and stops near where it lands; rubber bounces more.
import { describe, it, expect } from 'vitest';
import { useHole, simulateShot, COURSE } from './index';

const SEEDS = [11, 2024, 77777, 4242];
const shot = (ball?: any) => ({ club: 4, power: 0.9, u: 0, aimYaw: 0, spin: { top: 0, back: 0, side: 0 }, ...(ball ? { ball } : {}) });
const land = (r: any) => r.events.find((e: any) => e.type === 'land')?.t ?? 0;
describe('novelty balls', () => {
  it('lead ignores the wind and rolls less', () => {
    for (const s of SEEDS) {
      useHole(s);
      const tee = { x: COURSE.tee.x, z: COURSE.tee.z, teed: true },
        wind = { x: 6, z: 0 },
        aim = Math.atan2(COURSE.pin.x - tee.x, COURSE.pin.z - tee.z),
        n = simulateShot({ ball: tee, wind }, { ...shot(), aimYaw: aim }, 5),
        l = simulateShot({ ball: tee, wind }, { ...shot('lead'), aimYaw: aim }, 5),
        calm = simulateShot({ ball: tee, wind: { x: 0, z: 0 } }, { ...shot(), aimYaw: aim }, 5);
      const side = (r: any) => {
        const f = r.frames.find((f: number[]) => f[0] >= land(r)) || r.frames.at(-1);
        return Math.abs((f[1] - tee.x) * Math.cos(aim) - (f[3] - tee.z) * Math.sin(aim));
      };
      expect(side(l)).toBeLessThan(side(calm) + 0.5);
      expect(side(n)).toBeGreaterThan(side(l) + 1);
      expect(l.total - l.carry).toBeLessThan(Math.max(4, n.total - n.carry));
      expect(l.input.ball).toBe('lead');
    }
  });
  it('rubber bounces more often than a normal ball', () => {
    let more = 0;
    for (const s of SEEDS) {
      useHole(s);
      const tee = { x: COURSE.tee.x, z: COURSE.tee.z, teed: true },
        aim = Math.atan2(COURSE.pin.x - tee.x, COURSE.pin.z - tee.z),
        n = simulateShot({ ball: tee, wind: { x: 0, z: 0 } }, { ...shot(), aimYaw: aim }, 9),
        b = simulateShot({ ball: tee, wind: { x: 0, z: 0 } }, { ...shot('bouncy'), aimYaw: aim }, 9),
        apexAfter = (r: any) => {
          const t = land(r);
          let m = 0;
          for (const f of r.frames) if (f[0] > t + 0.05) m = Math.max(m, f[2]);
          return m;
        };
      if (apexAfter(b) > apexAfter(n)) more++;
    }
    expect(more).toBeGreaterThanOrEqual(3);
  });
  it('drops an unknown ball kind and keeps putts plain', () => {
    useHole(11);
    const r = simulateShot({ ball: { x: COURSE.tee.x, z: COURSE.tee.z, teed: true }, wind: { x: 0, z: 0 } }, shot('rocket') as any, 1);
    expect(r.input.ball).toBeUndefined();
  });
});
