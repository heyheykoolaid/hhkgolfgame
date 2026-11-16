// The ball in the cup. The shot simulation (shared, the same for everyone) decides IF a ball is holed; this plays the
// last moment properly for the eye: over the lip, down, off the liner and the pin, and a rattle to rest on the floor.
// It's a small local simulation in the cup's own space (origin = the middle of the hole at ground level, y up).
import * as THREE from 'three';
import { COURSE, heightAt, clamp, type ShotBroadcast } from '@gh/shared';
import { CUP_HOLE_R } from '../world/nature';

export const CUP_DEPTH = 0.105,
  CUP_PIN_R = 0.007;
const BALL_R = 0.0214;
export interface CupSim {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
  in: boolean;
  knock: number;
  floored: boolean;
  still: number;
}
export function cupStart(b: ShotBroadcast): CupSim {
  const f = b.result.frames,
    n = f.length,
    l = f[Math.max(0, n - 2)],
    k = f[Math.max(0, n - 3)],
    dt = Math.max(1e-3, l[0] - k[0]),
    pin = COURSE.pin,
    gy = heightAt(pin.x, pin.z);
  let vx = (l[1] - k[1]) / dt,
    vz = (l[3] - k[3]) / dt;
  const sp = Math.hypot(vx, vz),
    cap = sp > 2.2 ? 2.2 / sp : 1; // the simulation only holes a ball that's slow enough to drop
  vx *= cap;
  vz *= cap;
  const y = Math.max(BALL_R, l[2] - gy);
  return {
    x: l[1] - pin.x,
    y,
    z: l[3] - pin.z,
    vx,
    vy: y > BALL_R + 0.01 ? clamp((l[2] - k[2]) / dt, -7, 0) : 0,
    vz,
    t: 0,
    in: false,
    knock: 0,
    floored: false,
    still: 0,
  };
}
/** Advance the drop; returns false once the ball has come to rest (or after 2 s). */
export function cupStep(c: CupSim, dt: number, out: THREE.Vector3, knock: (hard: boolean, vol: number) => void, vol: number) {
  const r = BALL_R,
    Rc = CUP_HOLE_R,
    lim = Rc - r,
    steps = Math.max(1, Math.ceil(Math.min(dt, 0.05) / 0.002)),
    h = Math.min(dt, 0.05) / steps;
  for (let i = 0; i < steps; i++) {
    c.t += h;
    c.knock -= h;
    let rho = Math.hypot(c.x, c.z);
    if (!c.in) {
      // still on the green (or in the air above it): it is going in, so it curls toward the middle of the hole
      if (c.y > r + 1e-4) {
        c.vy -= 9.81 * h;
        c.y = Math.max(r, c.y + c.vy * h);
      } else c.vy = 0;
      if (rho > 1e-5) {
        const sp = Math.max(0.35, Math.hypot(c.vx, c.vz)),
          k = Math.min(1, h * 16);
        c.vx += ((-c.x / rho) * sp - c.vx) * k;
        c.vz += ((-c.z / rho) * sp - c.vz) * k;
      }
      c.x += c.vx * h;
      c.z += c.vz * h;
      if (Math.hypot(c.x, c.z) < Rc - 0.006) c.in = true; // its middle is over the edge: it tips in
      continue;
    }
    c.vy -= 9.81 * h;
    c.x += c.vx * h;
    c.y += c.vy * h;
    c.z += c.vz * h;
    rho = Math.hypot(c.x, c.z);
    if (rho > lim) {
      // the liner (or the far lip on the way in)
      const nx = c.x / rho,
        nz = c.z / rho,
        vn = c.vx * nx + c.vz * nz;
      if (vn > 0) {
        c.vx -= 1.5 * vn * nx;
        c.vz -= 1.5 * vn * nz;
        if (vn > 0.3 && c.knock <= 0) {
          c.knock = 0.07;
          knock(false, vol * Math.min(1, vn));
        }
      }
      c.x = nx * lim;
      c.z = nz * lim;
    } else if (rho < CUP_PIN_R + r && rho > 1e-5) {
      // the pin standing in the middle
      const nx = c.x / rho,
        nz = c.z / rho,
        vn = c.vx * nx + c.vz * nz;
      if (vn < 0) {
        c.vx -= 1.5 * vn * nx;
        c.vz -= 1.5 * vn * nz;
      }
      c.x = nx * (CUP_PIN_R + r);
      c.z = nz * (CUP_PIN_R + r);
    }
    if (c.y < -CUP_DEPTH + r) {
      c.y = -CUP_DEPTH + r;
      if (c.vy < -0.4) {
        knock(true, vol * Math.min(1, -c.vy / 1.4) * (c.floored ? 0.5 : 1));
        c.floored = true;
        c.vy = -c.vy * 0.36;
        c.vx *= 0.75;
        c.vz *= 0.75;
      } else {
        c.vy = 0;
        c.vx *= 1 - 5 * h;
        c.vz *= 1 - 5 * h;
      }
    }
    if (c.y > -0.012 && c.vy > 0) c.vy = Math.min(c.vy, 0.5); // once it's in, it stays in
    c.still = c.y <= -CUP_DEPTH + r + 1e-4 && Math.hypot(c.vx, c.vz) < 0.04 ? c.still + h : 0;
  }
  const pin = COURSE.pin;
  out.set(pin.x + c.x, heightAt(pin.x, pin.z) + c.y, pin.z + c.z);
  return c.still < 0.35 && c.t < 2;
}
