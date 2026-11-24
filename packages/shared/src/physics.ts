// @ts-nocheck — ported from the prototype; types are added incrementally
// Ball flight, bounce and roll. Deterministic given the RNG (setRng) — the server is the authority.
import { heightAt, gradAt, normalAt, surfaceAt, treesNear, COURSE, clamp, buggyAt } from './course';
let rand: () => number = Math.random;
export function setRng(fn: () => number) {
  rand = fn;
}
export const G = 9.81,
  BALL_R = 0.0214,
  CUP_R = 0.054,
  DT = 1 / 240;
export const KD = 0.0046; // drag
export const KL = 0.011; // lift per unit backspin
export const KS = 0.003; // side force per unit sidespin
export const CHECK = 14; // how hard backspin bites on landing
export const ZERO_WIND = { x: 0, z: 0 };
/** Novelty balls (sold at the Pro Shop, one shot each): lead ignores the wind and dies where it lands; the
 * rubber ball bounces like mad; smoke flies like a normal ball (the client draws its cloud). Set per shot by
 * simulateShot, so every replay agrees. */
export type BallKind = '' | 'lead' | 'bouncy' | 'smoke';
let ballKind: BallKind = '';
export function setBallKind(k: BallKind) {
  ballKind = k;
}

// e: bounce restitution, f: tangential speed kept on impact, mu: rolling friction, grip: how much spin bites
export const SURF = {
  tee: { e: 0.35, f: 0.5, mu: 0.16, grip: 0.7 },
  fairway: { e: 0.35, f: 0.5, mu: 0.16, grip: 0.7 },
  fringe: { e: 0.3, f: 0.55, mu: 0.11, grip: 0.85 },
  green: { e: 0.28, f: 0.6, mu: 0.065, grip: 1.0 },
  rough: { e: 0.18, f: 0.3, mu: 0.42, grip: 0.25 },
  bunker: { e: 0.03, f: 0.12, mu: 1.8, grip: 0.1 },
  heavy: { e: 0.1, f: 0.18, mu: 0.75, grip: 0.1 },
  hardpan: { e: 0.48, f: 0.72, mu: 0.09, grip: 0.3 },
  path: { e: 0.55, f: 0.78, mu: 0.07, grip: 0.25 },
  rock: { e: 0.66, f: 0.82, mu: 0.12, grip: 0.05 }, // bare granite: a big bounce, and it kicks off line (see groundContact)
  ob: { e: 0.18, f: 0.3, mu: 0.42, grip: 0.25 },
  water: { e: 0, f: 0, mu: 5, grip: 0 },
};

// The Moon: grey dust that a ball plugs into and stops dead in (no roll to speak of), everywhere but the green
// (a smooth landing pad) and the cart path. Read through surf(): the table above stays Earth's.
export const MOON_SURF = {
  tee: { e: 0.14, f: 0.18, mu: 1.1, grip: 0.9 },
  fairway: { e: 0.14, f: 0.18, mu: 1.1, grip: 0.9 },
  fringe: { e: 0.14, f: 0.22, mu: 0.6, grip: 0.9 },
  rough: { e: 0.08, f: 0.1, mu: 1.8, grip: 0.4 },
  heavy: { e: 0.05, f: 0.06, mu: 2.4, grip: 0.2 },
  ob: { e: 0.08, f: 0.1, mu: 1.8, grip: 0.4 },
  hardpan: { e: 0.2, f: 0.3, mu: 0.6, grip: 0.4 },
  bunker: { e: 0.02, f: 0.08, mu: 2.6, grip: 0.1 },
};
// The Old Estate: its cart paths are old cobbles, and a ball landing on them leaps and kicks off line (groundContact)
export const HAUNT_SURF = {
  path: { e: 0.62, f: 0.8, mu: 0.08, grip: 0.2 },
  hardpan: { e: 0.55, f: 0.75, mu: 0.09, grip: 0.25 },
};
export const surfP = (s: string) => (COURSE.locale === 'moon' && MOON_SURF[s]) || (COURSE.locale === 'haunt' && HAUNT_SURF[s]) || SURF[s];
/** gravity in flight on the current hole */
export const gFlight = () => G * (COURSE.grav ?? 1);
/** a moon buggy's body, for a ball: a short upright cylinder round its middle */
export const BUGGY_R = 1.5,
  BUGGY_H = 1.4;

export const CLUBS = [
  { name: 'Driver', short: '1W', carry: 228, launch: 11, spin: 0.32, sens: 1.0 },
  { name: '3 Wood', short: '3W', carry: 208, launch: 12.5, spin: 0.42, sens: 0.95 },
  { name: '5 Wood', short: '5W', carry: 193, launch: 14, spin: 0.5, sens: 0.9 },
  { name: '3 Iron', short: '3i', carry: 183, launch: 13.5, spin: 0.5, sens: 0.95 },
  { name: '4 Iron', short: '4i', carry: 174, launch: 14.5, spin: 0.55, sens: 0.9 },
  { name: '5 Iron', short: '5i', carry: 165, launch: 15.5, spin: 0.6, sens: 0.85 },
  { name: '6 Iron', short: '6i', carry: 155, launch: 17, spin: 0.66, sens: 0.82 },
  { name: '7 Iron', short: '7i', carry: 145, launch: 18.5, spin: 0.72, sens: 0.8 },
  { name: '8 Iron', short: '8i', carry: 133, launch: 21, spin: 0.8, sens: 0.75 },
  { name: '9 Iron', short: '9i', carry: 121, launch: 23.5, spin: 0.86, sens: 0.7 },
  { name: 'Pitching Wedge', short: 'PW', carry: 107, launch: 27, spin: 0.95, sens: 0.65 },
  { name: 'Sand Wedge', short: 'SW', carry: 84, launch: 32, spin: 1.05, sens: 0.6 },
  { name: 'Lob Wedge', short: 'LW', carry: 64, launch: 38, spin: 1.12, sens: 0.6 },
  { name: 'Putter', short: 'P', carry: 30, launch: 0, spin: 0, sens: 0.3, putter: true },
];

export interface Ball {
  [k: string]: any;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  sb: number;
  ss: number;
  state: string;
}
export function newBall(x: number, z: number, teed?: boolean): Ball {
  return {
    x,
    z,
    y: heightAt(x, z) + BALL_R + (teed ? 0.03 : 0),
    vx: 0,
    vy: 0,
    vz: 0,
    sb: 0,
    ss: 0,
    state: 'rest',
    teed: !!teed,
    landed: false,
    apex: 0,
    canopy: -1,
    lipped: false,
  };
}

export function launchBall(b, o) {
  const la = (o.launchDeg * Math.PI) / 180,
    h = o.speed * Math.cos(la);
  b.vx = Math.sin(o.yaw) * h;
  b.vz = Math.cos(o.yaw) * h;
  b.vy = o.speed * Math.sin(la);
  b.sb = o.sb;
  b.ss = o.ss;
  b.state = 'air';
  b.landed = false;
  b.apex = b.y;
  b.canopy = -1;
  b.teed = false;
  b.lipped = false;
}

export function airStep(b, dt, wind) {
  const rvx = b.vx - wind.x,
    rvy = b.vy,
    rvz = b.vz - wind.z;
  const sp = Math.hypot(rvx, rvy, rvz) || 1e-6;
  let ax = -KD * sp * rvx,
    ay = -KD * sp * rvy - gFlight(),
    az = -KD * sp * rvz;
  // lift: perpendicular to velocity, in the vertical plane containing it
  const uy = rvy / sp;
  const lx = (-uy * rvx) / sp,
    ly = 1 - uy * uy,
    lz = (-uy * rvz) / sp;
  const ll = Math.hypot(lx, ly, lz) || 1e-6;
  const L = (KL * b.sb * sp * sp) / ll;
  ax += lx * L;
  ay += ly * L;
  az += lz * L;
  // side force: +ss curves LEFT (cross(up, v) points left)
  const hh = Math.hypot(rvx, rvz) || 1e-6;
  const S = (KS * b.ss * sp * sp) / hh;
  ax += rvz * S;
  az += -rvx * S;
  b.vx += ax * dt;
  b.vy += ay * dt;
  b.vz += az * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  const k = Math.exp(-dt / 7);
  b.sb *= k;
  b.ss *= k;
  if (b.y > b.apex) b.apex = b.y;
}

export function treeHitsAir(b) {
  let hit = false;
  for (const t of treesNear(b.x, b.z)) {
    const dx = b.x - t.x,
      dz = b.z - t.z,
      dh = Math.hypot(dx, dz);
    if (b.y < t.y + t.trunkH + 0.5 && dh < t.trunkR + BALL_R) {
      const nx = dx / (dh || 1),
        nz = dz / (dh || 1),
        vn = b.vx * nx + b.vz * nz;
      if (vn < 0) {
        b.vx -= 1.5 * vn * nx;
        b.vz -= 1.5 * vn * nz;
        b.vx *= 0.6;
        b.vz *= 0.6;
        b.sb *= 0.3;
        hit = true;
      }
      b.x = t.x + nx * (t.trunkR + BALL_R);
      b.z = t.z + nz * (t.trunkR + BALL_R);
    }
    const dc = Math.hypot(dx, b.y - (t.y + t.cy), dz);
    if (dc < t.cr) {
      if (b.canopy !== t.id) {
        b.canopy = t.id;
        const sp = Math.hypot(b.vx, b.vy, b.vz);
        b.vx = b.vx * 0.3 + (rand() - 0.5) * sp * 0.25;
        b.vz = b.vz * 0.3 + (rand() - 0.5) * sp * 0.25;
        b.vy = b.vy * 0.25 - rand() * 1.5;
        b.sb *= 0.2;
        b.ss = 0;
        hit = true;
      }
    } else if (b.canopy === t.id) b.canopy = -1;
  }
  return hit;
}

export function cupCheck(b, px, pz, speed) {
  const P = COURSE.pin;
  const dx = b.x - px,
    dz = b.z - pz;
  const L2 = dx * dx + dz * dz;
  let t = L2 > 0 ? ((P.x - px) * dx + (P.z - pz) * dz) / L2 : 0;
  t = clamp(t, 0, 1);
  const d = Math.hypot(px + dx * t - P.x, pz + dz * t - P.z);
  if (d < CUP_R) {
    if (speed < 1.6 || (d < CUP_R * 0.5 && speed < 2.2)) return 'holed';
    if (!b.lipped) {
      // lip out: deflect and slow
      b.lipped = true;
      const a = (rand() - 0.5) * 1.2,
        c = Math.cos(a),
        s = Math.sin(a);
      const vx = b.vx * c - b.vz * s,
        vz = b.vx * s + b.vz * c;
      b.vx = vx * 0.7;
      b.vz = vz * 0.7;
      return 'lip';
    }
  }
  return null;
}

// Advance the ball one step. Returns an event string or null:
// 'land' (first ground contact), 'tree', 'lip', 'water', 'ob', 'holed', 'rest'
/** A ball meeting a moon buggy at time t (shared-clock seconds) bounces off its side, and picks up some of its speed. */
export function buggyHit(b, t) {
  const L = COURSE.buggies;
  if (!L || t == null) return false;
  let hit = false;
  for (const g of L) {
    const p = buggyAt(g, t),
      dx = b.x - p.x,
      dz = b.z - p.z,
      dh = Math.hypot(dx, dz);
    if (dh >= BUGGY_R + BALL_R || b.y > heightAt(p.x, p.z) + BUGGY_H) continue;
    const nx = dx / (dh || 1),
      nz = dz / (dh || 1),
      vn = (b.vx - p.vx) * nx + (b.vz - p.vz) * nz;
    if (vn < 0) {
      b.vx -= 1.6 * vn * nx;
      b.vz -= 1.6 * vn * nz;
      b.vx = b.vx * 0.7 + p.vx * 0.5;
      b.vz = b.vz * 0.7 + p.vz * 0.5;
      if (b.state === 'air') b.vy = Math.max(b.vy, 1.5);
      b.sb *= 0.3;
      hit = true;
    }
    b.x = p.x + nx * (BUGGY_R + BALL_R);
    b.z = p.z + nz * (BUGGY_R + BALL_R);
  }
  return hit;
}

/** Pillars (gargoyle plinths, gate piers): a ball below the top bounces off the side. */
export function pillarHit(b) {
  const L = COURSE.pillars;
  if (!L) return false;
  let hit = false;
  for (const p of L) {
    const dx = b.x - p.x,
      dz = b.z - p.z,
      dh = Math.hypot(dx, dz);
    if (dh >= p.r + BALL_R || b.y > heightAt(p.x, p.z) + p.h) continue;
    const nx = dx / (dh || 1),
      nz = dz / (dh || 1),
      vn = b.vx * nx + b.vz * nz;
    if (vn < 0) {
      b.vx -= 1.55 * vn * nx;
      b.vz -= 1.55 * vn * nz;
      b.vx *= 0.75;
      b.vz *= 0.75;
      b.sb *= 0.4;
      hit = true;
    }
    b.x = p.x + nx * (p.r + BALL_R);
    b.z = p.z + nz * (p.r + BALL_R);
  }
  return hit;
}
/** Warp pipes: into a mouth and out of its other end, rolling toward the green. Once a shot. */
export function pipeHit(b) {
  const L = COURSE.pipes;
  if (!L || b.warped) return false;
  for (const p of L) {
    if (Math.hypot(b.x - p.ax, b.z - p.az) > p.r || b.y > heightAt(p.ax, p.az) + 1.2) continue;
    const gx = COURSE.pin.x - p.bx,
      gz = COURSE.pin.z - p.bz,
      L2 = Math.hypot(gx, gz) || 1,
      sp = clamp(Math.hypot(b.vx, b.vz), 4, 9);
    b.x = p.bx + (gx / L2) * (p.r + 0.6);
    b.z = p.bz + (gz / L2) * (p.r + 0.6);
    b.y = heightAt(b.x, b.z) + BALL_R;
    b.vx = (gx / L2) * sp;
    b.vz = (gz / L2) * sp;
    b.vy = 0;
    b.sb = b.ss = 0;
    b.state = 'roll';
    b.warped = true;
    return true;
  }
  return false;
}
/** a pad under the ball, if it still has a bounce in it (three a shot, so a ball can't bounce on one for ever) */
const padFor = b => ((b.pads || 0) < 3 ? COURSE.pads?.find(p => Math.hypot(b.x - p.x, b.z - p.z) < p.r) : undefined);

export function stepBall(b, dt, env) {
  if (COURSE.pillars && b.state !== 'rest' && pillarHit(b)) return 'post';
  if (COURSE.pipes && b.state !== 'rest' && pipeHit(b)) return 'warp';
  if (COURSE.pads && b.state === 'roll' && padFor(b)) {
    b.pads = (b.pads || 0) + 1;
    // rolling onto a pad: it pops the ball up and on
    b.state = 'air';
    b.vy = 7;
    b.y += 0.05;
    return 'pad';
  }
  if (env.t != null && buggyHit(b, env.t)) {
    if (b.state === 'rest') b.state = 'roll';
    return 'buggy';
  }
  if (b.state === 'air') {
    airStep(b, dt, ballKind === 'lead' ? ZERO_WIND : env.wind || ZERO_WIND);
    let ev = null;
    if (env.trees && treeHitsAir(b)) ev = 'tree';
    const gh = heightAt(b.x, b.z);
    if (b.y < gh + BALL_R) return groundContact(b, gh) || ev;
    return ev;
  }
  if (b.state === 'roll') {
    const surf = surfaceAt(b.x, b.z);
    if (surf === 'water') return 'water';
    if (surf === 'ob') return 'ob';
    const P = surfP(surf);
    const [gx, gz] = gradAt(b.x, b.z);
    const asx = -G * gx,
      asz = -G * gz;
    b.vx += asx * dt;
    b.vz += asz * dt;
    let s = Math.hypot(b.vx, b.vz);
    const dec = P.mu * (ballKind === 'lead' ? 1.6 : 1) * G * dt;
    if (s <= dec) {
      b.vx = 0;
      b.vz = 0;
      s = 0;
    } else {
      const k = (s - dec) / s;
      b.vx *= k;
      b.vz *= k;
      s -= dec;
    }
    const px = b.x,
      pz = b.z;
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    if (env.trees)
      for (const t of treesNear(b.x, b.z)) {
        const dx = b.x - t.x,
          dz = b.z - t.z,
          dh = Math.hypot(dx, dz);
        if (dh < t.trunkR + BALL_R) {
          const nx = dx / dh,
            nz = dz / dh,
            vn = b.vx * nx + b.vz * nz;
          if (vn < 0) {
            b.vx -= 1.4 * vn * nx;
            b.vz -= 1.4 * vn * nz;
          }
          b.x = t.x + nx * (t.trunkR + BALL_R);
          b.z = t.z + nz * (t.trunkR + BALL_R);
        }
      }
    b.y = heightAt(b.x, b.z) + BALL_R;
    if (surf === 'green' || surf === 'fringe') {
      const c = cupCheck(b, px, pz, s);
      if (c === 'holed') {
        b.state = 'holed';
        b.x = COURSE.pin.x;
        b.z = COURSE.pin.z;
        b.y = heightAt(b.x, b.z) - 0.06;
        return 'holed';
      }
      if (c) return c;
    }
    if (s < 0.02 && Math.hypot(asx, asz) < P.mu * G) {
      b.state = 'rest';
      b.vx = b.vz = 0;
      return 'rest';
    }
    return null;
  }
  return null;
}

export function groundContact(b, gh) {
  let ev = null;
  if (!b.landed) {
    b.landed = true;
    b.landX = b.x;
    b.landZ = b.z;
    ev = 'land';
  }
  const surf = surfaceAt(b.x, b.z);
  if (surf === 'water') return 'water';
  if (surf === 'ob') return 'ob';
  const P = surfP(surf);
  const [nx, ny, nz] = normalAt(b.x, b.z);
  b.y = gh + BALL_R;
  const vn = b.vx * nx + b.vy * ny + b.vz * nz;
  if (vn >= 0) return ev;
  if (COURSE.pads && padFor(b)) {
    b.pads = (b.pads || 0) + 1;
    // a bounce pad throws the ball high, keeping most of its way forward
    b.vy = Math.max(-vn * 1.2, 13);
    b.vx *= 0.85;
    b.vz *= 0.85;
    b.sb *= 0.3;
    return 'pad';
  }
  // ball dropping straight into the cup
  if (surf === 'green' && Math.hypot(b.x - COURSE.pin.x, b.z - COURSE.pin.z) < CUP_R && -vn < 7) {
    b.state = 'holed';
    b.x = COURSE.pin.x;
    b.z = COURSE.pin.z;
    b.y = gh - 0.06;
    return 'holed';
  }
  const tx = b.vx - vn * nx,
    ty = b.vy - vn * ny,
    tz = b.vz - vn * nz;
  const ts = Math.hypot(tx, ty, tz);
  if (ballKind === 'lead') {
    // lead: no bounce at all; it thuds in and creeps on a little
    b.state = 'roll';
    b.vx = tx * 0.15;
    b.vz = tz * 0.15;
    b.vy = 0;
    b.sb = b.ss = 0;
    return ev;
  }
  if (-vn > (ballKind === 'bouncy' ? 0.6 : 1.3)) {
    let nt = ts * (ballKind === 'bouncy' ? Math.min(0.97, P.f + 0.15) : P.f) - b.sb * P.grip * CHECK;
    if (nt < 0) nt = Math.max(nt, -Math.min(2.2, ts * 0.35));
    const k = ts > 1e-6 ? nt / ts : 0,
      nvn = -vn * (ballKind === 'bouncy' ? Math.min(0.88, P.e * 1.9 + 0.3) : P.e);
    b.vx = tx * k + nvn * nx;
    b.vy = ty * k + nvn * ny;
    b.vz = tz * k + nvn * nz;
    if (surf === 'rock' || (surf === 'path' && COURSE.locale === 'haunt')) {
      // granite is never flat where the ball meets it: the bounce leaves up to 40° off line, either way
      const a = (rand() - 0.5) * 1.4,
        c = Math.cos(a),
        s = Math.sin(a),
        vx = b.vx * c - b.vz * s;
      b.vz = b.vx * s + b.vz * c;
      b.vx = vx;
    }
    b.sb *= 0.35;
    b.ss *= 0.2;
  } else {
    b.state = 'roll';
    b.vx = tx;
    b.vz = tz;
    b.vy = 0;
  }
  return ev;
}

// ---- carry solver: flat ground, no wind, used to map "power %" to "carry distance" ----
export function simulateFlat(speed, launchDeg, sb) {
  const b = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, sb: 0, ss: 0, apex: 0 };
  launchBall(b, { yaw: 0, speed, launchDeg, sb, ss: 0 });
  b.y = 0;
  let t = 0;
  while (t < 30) {
    airStep(b, DT, ZERO_WIND);
    t += DT;
    if (b.y < 0 && b.vy < 0) break;
  }
  return {
    carry: Math.hypot(b.x, b.z),
    apex: b.apex,
    time: t,
    land: (Math.atan2(-b.vy, Math.hypot(b.vx, b.vz)) * 180) / Math.PI,
    vland: Math.hypot(b.vx, b.vy, b.vz),
  };
}
export const _speedCache = new Map();
export function speedForCarry(target, launchDeg, sb) {
  const key = target.toFixed(1) + '|' + launchDeg + '|' + sb.toFixed(3) + '|' + (COURSE.grav ?? 1);
  if (_speedCache.has(key)) return _speedCache.get(key);
  // Carry is not monotonic in speed for high-spin, high-loft clubs (fast shots balloon and fall short),
  // so search only the rising branch: below the speed that gives maximum carry.
  let best = 0,
    vBest = 130;
  for (let v = 5; v <= 130; v += 5) {
    const c = simulateFlat(v, launchDeg, sb).carry;
    if (c > best) {
      best = c;
      vBest = v;
    } else break;
  }
  let lo = 1,
    hi = vBest + 5;
  for (let i = 0; i < 26; i++) {
    const m = (lo + hi) / 2;
    if (simulateFlat(m, launchDeg, sb).carry < target) lo = m;
    else hi = m;
  }
  const v = (lo + hi) / 2;
  _speedCache.set(key, v);
  return v;
}
