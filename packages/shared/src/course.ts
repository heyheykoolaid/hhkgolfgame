// @ts-nocheck — ported from the prototype; types are added incrementally
// Hole 1 — "The Dogleg" (Golden Hills municipal). Pure data + terrain/surface queries, no rendering.
// Units: metres. +z runs from the tee toward the green. Looking down the hole, +x is LEFT.
// Units: metres. +z runs from the tee toward the green. Looking down the hole, +x is LEFT.
export const YD_PER_M = 1.09361;
export const FT_PER_M = 3.28084;

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
export function smoothstep(e0, e1, x) {
  let t = (x - e0) / (e1 - e0);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- the hole being played
// Everything below reads the *current* hole. `setHole()` swaps it (ES module live bindings: importers see the new
// values). Hole 1 is hand-tuned; random holes come from `generateHole(seed)` in holegen.ts, built from the same knobs.
export interface HoleDef {
  name: string;
  number: number;
  par: number;
  seed?: number;
  code?: string;
  tee: { x: number; z: number };
  pin: { x: number; z: number };
  green: {
    x: number;
    z: number;
    rx: number;
    rz: number;
    sx: number;
    sz: number;
    mound: { x: number; z: number; h: number };
    /** rotation of the ellipse (radians, about +y) */ ang?: number;
    /** a second level: the part of the green beyond `off` metres along (dx, dz) sits `h` higher */ tier?: {
      dx: number;
      dz: number;
      off: number;
      h: number;
    };
    /** false front: the side facing (dx, dz) falls away by `h` over its outer part */ ff?: { dx: number; dz: number; h: number };
  };
  /** level: the water's height, when it isn't simply just below the ground at the pond's middle (a ravine on a slope) */
  pond: { x: number; z: number; rx: number; rz: number; ang?: number; level?: number } | null;
  /** rock outcrops (Boulder Peak): bare granite just off the fairway; a ball landing on one kicks away hard */
  rocks?: { x: number; z: number; r: number }[];
  /** how far the ball flies compared with sea level (thin mountain air: 1.1) */
  air?: number;
  /** how much stronger the wind blows here (1 = as usual) */
  gust?: number;
  /** which course this hole was dressed for */
  locale?: string;
  /** gravity in flight compared with Earth's (the Moon: 0.4). The roll keeps Earth's: it's arcade friction */
  grav?: number;
  /** craters (the Moon): a bowl with a raised rim; a bunker can sit in one (its sand is the floor) */
  craters?: { x: number; z: number; r: number; dep: number; rim: number }[];
  /** moon buggies: each drives back and forth along a line across the hole, on the shared clock (see buggyAt) */
  buggies?: { x: number; z: number; tx: number; tz: number; half: number; v: number; ph: number }[];
  /** upright things a ball bounces off (the Old Estate's gargoyle plinths and gate piers): cylinders standing h high */
  pillars?: { x: number; z: number; r: number; h: number; kind?: string }[];
  /** a moat round the green (the Old Estate): water from r0 to r1 out from (x, z), except a drawbridge `bw` wide
   *  running out from the green toward angle `ang` (atan2(dx, dz)); the water stands at `level` */
  moat?: { x: number; z: number; r0: number; r1: number; ang: number; bw: number; level: number } | null;
  /** bounce pads (the Bad Batch): land on one and the ball is thrown high */
  pads?: { x: number; z: number; r: number }[];
  /** warp pipes (the Bad Batch): a ball that rolls or drops into a mouth at (ax, az) comes out of (bx, bz), rolling
   *  toward the green */
  pipes?: { ax: number; az: number; bx: number; bz: number; r: number }[];
  /** the wind turns round every stroke (the Bad Batch): odd strokes play it the other way */
  flip?: boolean;
  /** a second fairway (split fairway, lay-up area): polyline + half width */
  alt?: { pts: number[][]; hw: number } | null;
  /** shaped ground on top of the base terrain: mounds/ridges (h > 0) and hollows/valleys (h < 0), rotated ellipses */
  land?: { x: number; z: number; rx: number; rz: number; ang: number; h: number }[];
  /** what the hole is asking (shown at the tee), and where the generator meant drives to land */
  plan?: { kind: string; tip: string; lz: number[]; lines?: { safe: number[]; bold: number[]; score: number } | null };
  center: number[][];
  bunkers: { x: number; z: number; r: number }[];
  bounds: { x0: number; x1: number; z0: number; z1: number };
  obDist: number;
  obZ: [number, number];
  fw: {
    start: number;
    base: number;
    amp: number;
    freq: number;
    phase: number;
    taper0: number;
    taper1: number;
    tw0: number;
    tw1: number;
    /** purposeful widths: [along, half width] pairs (smoothly joined); replaces the base+sine wobble */ widths?: number[][];
  };
  path: { side: number; off: number; a0: number; a1: number; start: number[][] };
  hardpan: { x: number; z: number; r: number }[];
  terrain: { p1: number; p2: number; p3: number; amp: number; tilt: number; tiltX: number; tiltZ0?: number };
  /** height the terrain fades to at its edges (and where the endless ground plane sits); derived if omitted */
  floor?: number;
  /** gap: how far the trees stand back from the fairway's edge, metres (9 unless set) */
  trees: { seed: number; count: number; density: number; gap?: number; clusters?: { x: number; z: number; r: number; n: number }[] };
}
export const HOLE1: HoleDef = {
  name: 'The Dogleg',
  number: 1,
  par: 4,
  tee: { x: 0, z: 0 },
  pin: { x: 39, z: 339 },
  green: { x: 35, z: 335, rx: 15, rz: 12, sx: -0.012, sz: 0.014, mound: { x: 29, z: 340, h: 0.3 } },
  pond: { x: 52, z: 195, rx: 16, rz: 30 },
  center: [
    [0, -5],
    [0, 110],
    [8, 210],
    [26, 290],
    [35, 335],
  ],
  bunkers: [
    { x: -4, z: 228, r: 7 },
    { x: 3, z: 246, r: 5 }, // fairway bunkers, left side of the landing zone
    { x: 13, z: 330, r: 6 },
    { x: 52, z: 347, r: 5.5 },
    { x: 44, z: 318, r: 4.5 }, // greenside
  ],
  bounds: { x0: -160, x1: 200, z0: -80, z1: 460 },
  obDist: 75,
  obZ: [-25, 380],
  fw: { start: 40, base: 14, amp: 2.5, freq: 0.045, phase: 0, taper0: 300, taper1: 325, tw0: 13, tw1: 9 },
  path: {
    side: 1,
    off: 28,
    a0: 30,
    a1: 312,
    start: [
      [-5.5, 3],
      [-14, 18],
    ],
  },
  hardpan: [
    { x: -20, z: 150, r: 3.6 },
    { x: 40, z: 242, r: 4 },
    { x: 54, z: 326, r: 3 },
    { x: -24, z: 268, r: 3.2 },
  ],
  terrain: { p1: 0, p2: 0, p3: 0, amp: 1, tilt: 0, tiltX: 0 },
  floor: -2.6,
  trees: { seed: 1337, count: 760, density: 1 },
};

export let COURSE: HoleDef = HOLE1;
export let CENTER_PTS: any[] = [],
  PATH: number[][] = [],
  HARDPAN: HoleDef['hardpan'] = [];
export let TEE_H = 0,
  GREEN_H = 0,
  WATER_Y = -99;
/** Edge/horizon ground level for the current hole (Hole 1: −2.6). */
export let FLOOR = -2.6;
export let TREES: any[] = [],
  TREE_GRID = new Map<string, any[]>();
/** Total centreline length (tee → green). */
export let HOLE_LEN = 0;
export const PATH_HW = 1.25;

// ---------------- queries (all read the current hole) ----------------
export function pathDist(x, z) {
  let best = 1e9;
  for (let i = 0; i < PATH.length - 1; i++) {
    const ax = PATH[i][0],
      az = PATH[i][1],
      dx = PATH[i + 1][0] - ax,
      dz = PATH[i + 1][1] - az,
      L2 = dx * dx + dz * dz;
    let t = ((x - ax) * dx + (z - az) * dz) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) best = d;
  }
  return best;
}
export function centerInfo(x, z) {
  let best = 1e9,
    along = 0,
    acc = 0;
  const c = COURSE.center;
  for (let i = 0; i < c.length - 1; i++) {
    const ax = c[i][0],
      az = c[i][1],
      dx = c[i + 1][0] - ax,
      dz = c[i + 1][1] - az;
    const L2 = dx * dx + dz * dz,
      L = Math.sqrt(L2);
    let t = ((x - ax) * dx + (z - az) * dz) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) {
      best = d;
      along = acc + t * L;
    }
    acc += L;
  }
  return { d: best, along };
}
export function fairwayHW(along) {
  const f = COURSE.fw;
  if (along > f.taper0) return lerp(f.tw0, f.tw1, smoothstep(f.taper0, f.taper1, along));
  const W = f.widths;
  if (W && W.length) {
    if (along <= W[0][0]) return W[0][1];
    for (let i = 0; i < W.length - 1; i++) if (along <= W[i + 1][0]) return lerp(W[i][1], W[i + 1][1], smoothstep(W[i][0], W[i + 1][0], along));
    return W[W.length - 1][1];
  }
  return f.base + f.amp * Math.sin(along * f.freq + f.phase);
}
function ell(x, z, e) {
  let dx = x - e.x,
    dz = z - e.z;
  if (e.ang) {
    const c = Math.cos(e.ang),
      s = Math.sin(e.ang);
    const u = dx * c - dz * s;
    dz = dx * s + dz * c;
    dx = u;
  }
  const a = dx / e.rx,
    b = dz / e.rz;
  return a * a + b * b;
}
/** point on the green's ellipse at angle a, k of the way out (k = 1: the edge) */
export function greenPt(a, k) {
  const g = COURSE.green,
    u = Math.sin(a) * g.rx * k,
    v = Math.cos(a) * g.rz * k,
    c = Math.cos(g.ang || 0),
    s = Math.sin(g.ang || 0);
  return { x: g.x + u * c + v * s, z: g.z - u * s + v * c };
}
export function greenEd(x, z) {
  return ell(x, z, COURSE.green);
}
export function pondPd(x, z) {
  const p = COURSE.pond;
  return p ? ell(x, z, p) : 99;
}
/** distance to the second fairway's centre line (1e9 if none) */
export function altDist(x, z) {
  const A = COURSE.alt;
  if (!A) return 1e9;
  let best = 1e9;
  const P = A.pts;
  for (let i = 0; i < P.length - 1; i++) {
    const ax = P[i][0],
      az = P[i][1],
      dx = P[i + 1][0] - ax,
      dz = P[i + 1][1] - az,
      L2 = dx * dx + dz * dz;
    let t = ((x - ax) * dx + (z - az) * dz) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}
/** shaped ground (sum of the hole's mounds and hollows) */
export function landH(x, z) {
  const L = COURSE.land;
  if (!L) return 0;
  let h = 0;
  for (const f of L) {
    const e = ell(x, z, f);
    if (e < 9) h += f.h * Math.exp(-e);
  }
  return h;
}

export function baseH(x, z) {
  const T = COURSE.terrain;
  return (
    T.amp *
      (1.2 * Math.sin(x * 0.035 + 0.5 + T.p1) * Math.cos(z * 0.021 + T.p2) +
        0.8 * Math.sin(z * 0.012 + x * 0.01 + T.p3) +
        0.35 * Math.sin(x * 0.09 + T.p2) * Math.sin(z * 0.07 + T.p1)) +
    T.tilt * (z - (T.tiltZ0 ?? 0)) +
    T.tiltX * x +
    landH(x, z)
  );
}

export function heightAt(x, z) {
  let h = baseH(x, z);
  // raised, flat tee box
  const tdx = Math.max(Math.abs(x) - 4, 0),
    tdz = Math.max(Math.abs(z + 1) - 5.5, 0);
  h = lerp(h, TEE_H, 1 - smoothstep(0, 5, Math.hypot(tdx, tdz)));
  // green: tilted (back-to-front / side) with a small mound
  const ge = greenEd(x, z);
  if (ge < 2.4) {
    const g = COURSE.green,
      m = g.mound;
    let gH = GREEN_H + (x - g.x) * g.sx + (z - g.z) * g.sz + m.h * Math.exp(-((x - m.x) ** 2 + (z - m.z) ** 2) / 40);
    if (g.tier) {
      const t = g.tier,
        a = (x - g.x) * t.dx + (z - g.z) * t.dz - t.off;
      gH += t.h * smoothstep(-2.2, 2.2, a);
    }
    if (g.ff) {
      const f = g.ff,
        a = ((x - g.x) * f.dx + (z - g.z) * f.dz) / Math.min(g.rx, g.rz);
      gH -= f.h * smoothstep(0.5, 1.15, a);
    }
    h = lerp(h, gH, 1 - smoothstep(1.0, 2.4, ge));
  }
  // rock outcrops stand a little proud of the ground
  if (COURSE.rocks)
    for (const r of COURSE.rocks) {
      const d = Math.hypot(x - r.x, z - r.z);
      if (d < r.r * 1.15) h += 0.38 * smoothstep(r.r * 1.15, r.r * 0.45, d);
    }
  // bunkers
  for (const b of COURSE.bunkers) {
    const d = Math.hypot(x - b.x, z - b.z);
    if (d < b.r * 1.1) h -= 0.55 * smoothstep(b.r * 1.05, b.r * 0.55, d);
  }
  // craters: a bowl, and a rim thrown up round it (the rim is what kicks a running ball back in)
  if (COURSE.craters)
    for (const c of COURSE.craters) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d > c.r * 2.2) continue;
      const u = d / c.r;
      if (u < 1) h -= c.dep * (1 - u * u);
      h += c.rim * Math.exp(-(((u - 1) / 0.32) ** 2));
    }
  // the moat: a ditch of water round the green, except under the drawbridge
  const mo = COURSE.moat;
  if (mo) {
    const d = Math.hypot(x - mo.x, z - mo.z);
    if (d > mo.r0 - 0.5 && d < mo.r1 + 0.5 && !onBridge(x, z)) {
      const w = smoothstep(mo.r0 - 0.5, mo.r0 + 0.7, d) * (1 - smoothstep(mo.r1 - 0.7, mo.r1 + 0.5, d));
      h = lerp(h, mo.level - 1.1, w);
    }
  }
  // pond basin
  const pd = pondPd(x, z);
  if (pd < 1.3) h = lerp(h, WATER_Y - 1.1, smoothstep(1.25, 0.9, pd));
  // fade terrain edges down to the horizon plane
  const B = COURSE.bounds;
  const e = Math.min(x - B.x0, B.x1 - x, z - B.z0, B.z1 - z);
  if (e < 40) h = lerp(FLOOR, h, smoothstep(0, 40, e));
  return h;
}

export const _EPS = 0.08;
export function gradAt(x, z) {
  return [(heightAt(x + _EPS, z) - heightAt(x - _EPS, z)) / (2 * _EPS), (heightAt(x, z + _EPS) - heightAt(x, z - _EPS)) / (2 * _EPS)];
}
export function normalAt(x, z) {
  const [gx, gz] = gradAt(x, z);
  const l = Math.hypot(gx, 1, gz);
  return [-gx / l, 1 / l, -gz / l];
}

// Surface classification. Returns {s, d, along}
/** on the moat's drawbridge (the bridge plays as fringe: you can putt across it) */
export function onBridge(x, z) {
  const mo = COURSE.moat;
  if (!mo) return false;
  const dx = x - mo.x,
    dz = z - mo.z,
    ux = Math.sin(mo.ang),
    uz = Math.cos(mo.ang),
    along = dx * ux + dz * uz,
    side = Math.abs(dx * uz - dz * ux);
  return along > mo.r0 - 2 && along < mo.r1 + 2 && side < mo.bw / 2;
}
export function inMoat(x, z) {
  const mo = COURSE.moat;
  if (!mo) return false;
  const d = Math.hypot(x - mo.x, z - mo.z);
  return d > mo.r0 && d < mo.r1 && !onBridge(x, z);
}
export function classify(x, z) {
  const ge = greenEd(x, z);
  if (ge < 1) return { s: 'green', d: 0, along: HOLE_LEN };
  if (COURSE.moat) {
    if (inMoat(x, z)) return { s: 'water', d: 0, along: HOLE_LEN - 10 };
    if (onBridge(x, z)) return { s: 'fringe', d: 0, along: HOLE_LEN - 10 };
  }
  for (const b of COURSE.bunkers) if (Math.hypot(x - b.x, z - b.z) < b.r) return { s: 'bunker', d: 0, along: 0 };
  if (ge < 1.3) return { s: 'fringe', d: 0, along: HOLE_LEN - 10 };
  if (pondPd(x, z) < 1) return { s: 'water', d: 0, along: 0 };
  if (COURSE.rocks) for (const r of COURSE.rocks) if (Math.hypot(x - r.x, z - r.z) < r.r) return { s: 'rock', d: 0, along: 0 };
  if (Math.abs(x) < 4 && z > -6.5 && z < 4.5) return { s: 'tee', d: 0, along: 0 };
  const ci = centerInfo(x, z);
  if (ci.d > COURSE.obDist || z < COURSE.obZ[0] || z > COURSE.obZ[1]) return { s: 'ob', d: ci.d, along: ci.along };
  const hw = fairwayHW(ci.along);
  if (ci.along > COURSE.fw.start && ci.d < hw) return { s: 'fairway', d: ci.d, along: ci.along };
  const ad = COURSE.alt ? altDist(x, z) : 1e9;
  if (ad < COURSE.alt?.hw) return { s: 'fairway', d: Math.min(ci.d, ad), along: ci.along };
  if (pathDist(x, z) < PATH_HW) return { s: 'path', d: ci.d, along: ci.along };
  for (const h of HARDPAN) if (Math.hypot(x - h.x, z - h.z) < h.r) return { s: 'hardpan', d: ci.d, along: ci.along };
  if (ci.d > hw + 11 && ge > 2.6 && ad > (COURSE.alt?.hw ?? 0) + 11) return { s: 'heavy', d: ci.d, along: ci.along };
  return { s: 'rough', d: ci.d, along: ci.along };
}
export function surfaceAt(x, z) {
  return classify(x, z).s;
}

export const TREE_CELL = 8;
export function treesNear(x, z) {
  const cx = Math.floor(x / TREE_CELL),
    cz = Math.floor(z / TREE_CELL);
  const out: any[] = [];
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++) {
      const l = TREE_GRID.get(cx + i + ',' + (cz + j));
      if (l) for (const t of l) out.push(t);
    }
  return out;
}

// ---------------- building a hole ----------------
/** Reserved parking behind every tee: each player's own cart appears here at the start of a hole (one slot per player,
 *  in group order). Kept clear of trees so carts never spawn inside one. Heading +Z (down the hole). */
export const CART_SLOTS = [
  [-4.8, -10],
  [-1.6, -10],
  [1.6, -10],
  [4.8, -10],
  [-8, -10],
  [8, -10],
] as const;
export const inCartSlots = (x: number, z: number) => Math.abs(x) < 11 && z > -14 && z < -6;
function buildTrees() {
  const T = COURSE.trees,
    rng = mulberry32(T.seed);
  const trees: any[] = [],
    gap = T.gap ?? 9;
  let tries = 0;
  const B = COURSE.bounds;
  while (trees.length < T.count && tries < 40000 * (T.count / 760)) {
    tries++;
    const x = B.x0 + 20 + rng() * (B.x1 - B.x0 - 40),
      z = B.z0 + 20 + rng() * (B.z1 - B.z0 - 40);
    const ci = centerInfo(x, z);
    const hw = fairwayHW(ci.along);
    if (ci.d < hw + gap || altDist(x, z) < (COURSE.alt?.hw ?? 0) + gap) continue;
    if (COURSE.rocks?.some(r => Math.hypot(x - r.x, z - r.z) < r.r + 1.5)) continue;
    if (greenEd(x, z) < 3.4) continue;
    if (pondPd(x, z) < 1.8) continue;
    if (Math.abs(x) < 16 && z > -22 && z < 16) continue;
    let ok = true;
    for (const b of COURSE.bunkers)
      if (Math.hypot(x - b.x, z - b.z) < b.r + 5) {
        ok = false;
        break;
      }
    if (!ok) continue;
    if (pathDist(x, z) < 3.5) continue;
    for (const h of HARDPAN)
      if (Math.hypot(x - h.x, z - h.z) < h.r + 1) {
        ok = false;
        break;
      }
    if (!ok) continue;
    const p = (0.07 + 0.9 * smoothstep(hw + gap, hw + gap + 36, ci.d)) * T.density;
    if (rng() > p) continue;
    for (const t of trees)
      if ((t.x - x) ** 2 + (t.z - z) ** 2 < 20) {
        ok = false;
        break;
      }
    if (!ok) continue;
    const s = 0.8 + rng() * 0.7,
      pine = rng() < 0.4;
    trees.push({
      id: trees.length,
      x,
      z,
      y: heightAt(x, z),
      s,
      pine,
      trunkR: 0.24 * s,
      trunkH: (pine ? 2.0 : 3.0) * s,
      cy: (pine ? 4.0 : 4.6) * s,
      cr: (pine ? 2.0 : 2.7) * s,
      tint: rng(),
    });
  }
  // deliberate stands of trees (dogleg corners, an avenue, a lone oak in play)
  for (const C of T.clusters || [])
    for (let k = 0, tries2 = 0; k < C.n && tries2 < C.n * 30; tries2++) {
      const a = rng() * 6.283,
        d = Math.sqrt(rng()) * C.r,
        x = C.x + Math.sin(a) * d,
        z = C.z + Math.cos(a) * d;
      const ci = centerInfo(x, z);
      if (ci.d < fairwayHW(ci.along) + 1.5 || altDist(x, z) < (COURSE.alt?.hw ?? 0) + 1.5) continue;
      if (greenEd(x, z) < 3.4 || pondPd(x, z) < 1.5 || pathDist(x, z) < 3 || COURSE.bunkers.some(b => Math.hypot(x - b.x, z - b.z) < b.r + 3))
        continue;
      if (trees.some(t => (t.x - x) ** 2 + (t.z - z) ** 2 < 16)) continue;
      const s = 0.9 + rng() * 0.6,
        pine = rng() < 0.35;
      trees.push({
        id: trees.length,
        x,
        z,
        y: heightAt(x, z),
        s,
        pine,
        trunkR: 0.24 * s,
        trunkH: (pine ? 2.0 : 3.0) * s,
        cy: (pine ? 4.0 : 4.6) * s,
        cr: (pine ? 2.0 : 2.7) * s,
        tint: rng(),
      });
      k++;
    }
  return trees;
}
/** Make `def` the current hole: recompute every derived table (centreline samples, cart path, heights, trees). */
export function setHole(def: HoleDef) {
  COURSE = def;
  HARDPAN = def.hardpan;
  // pre-sampled centreline (1 m spacing) for aiming helpers
  const pts: any[] = [];
  const c = def.center;
  let acc = 0;
  for (let i = 0; i < c.length - 1; i++) {
    const [ax, az] = c[i],
      [bx, bz] = c[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    for (let s = 0; s < L; s += 1) pts.push({ x: ax + ((bx - ax) * s) / L, z: az + ((bz - az) * s) / L, along: acc + s });
    acc += L;
  }
  const last = c[c.length - 1];
  pts.push({ x: last[0], z: last[1], along: acc });
  CENTER_PTS = pts;
  HOLE_LEN = acc;
  // cart path: offset from the centreline on one side
  const P = def.path,
    pp = def.path.start.map(p => [p[0] * P.side, p[1]]);
  for (let a = P.a0; a <= P.a1; a += 6) {
    const i = Math.min(CENTER_PTS.length - 2, Math.round(a));
    const p = CENTER_PTS[i],
      q = CENTER_PTS[i + 1];
    const dx = q.x - p.x,
      dz = q.z - p.z,
      L = Math.hypot(dx, dz) || 1;
    pp.push([p.x + (-dz / L) * P.off * P.side, p.z + (dx / L) * P.off * P.side]);
  }
  PATH = pp;
  // the terrain fades to FLOOR at its edges and an endless plane sits just under it: keep it below every playable height
  if (def.floor != null) FLOOR = def.floor;
  else {
    let lo = 1e9;
    const B = def.bounds;
    for (let z = B.z0; z <= B.z1; z += 8) for (let x = B.x0; x <= B.x1; x += 8) lo = Math.min(lo, baseH(x, z));
    FLOOR = Math.min(-2.6, lo - 1.6);
  }
  WATER_Y = -99;
  TEE_H = baseH(0, 0) + 0.35;
  GREEN_H = baseH(def.green.x, def.green.z) + 0.45;
  WATER_Y = def.pond ? (def.pond.level ?? baseH(def.pond.x, def.pond.z) - 0.45) : -99;
  TREES = buildTrees().filter(t => !inCartSlots(t.x, t.z)); // keep the carts' parking row behind the tee clear
  const m = new Map<string, any[]>();
  for (const t of TREES) {
    const k = Math.floor(t.x / TREE_CELL) + ',' + Math.floor(t.z / TREE_CELL);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(t);
  }
  TREE_GRID = m;
}
setHole(HOLE1);

/** Where moon buggy `b` is at time `t` (seconds on the shared clock): it drives to one end of its line and back. */
export function buggyAt(b: NonNullable<HoleDef['buggies']>[number], t: number) {
  const span = b.half * 2,
    k = (((t * b.v + b.ph) % (span * 2)) + span * 2) % (span * 2),
    back = k > span,
    u = (back ? span * 2 - k : k) - b.half,
    dir = back ? -1 : 1;
  return { x: b.x + b.tx * u, z: b.z + b.tz * u, vx: b.tx * b.v * dir, vz: b.tz * b.v * dir, yaw: Math.atan2(b.tx * dir, b.tz * dir) };
}
