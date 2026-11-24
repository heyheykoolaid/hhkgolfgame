// Swing → shot pipeline: lie modifiers, timing windows, impact grading and the full authoritative shot simulation.
// The client only sends *inputs* (club, power, timing offset, aim, spin); the server runs simulateShot().
import { COURSE, YD_PER_M, FT_PER_M, surfaceAt, heightAt, gradAt, clamp, mulberry32 } from './course';
import { CLUBS, SURF, G, DT, newBall, launchBall, stepBall, speedForCarry, setRng, setBallKind, type Ball, type BallKind } from './physics';

export interface Golfer {
  power: number;
  control: number;
  spin: number;
}
export const DEFAULT_GOLFER: Golfer = { power: 1, control: 1, spin: 1 };
export const PUTT_FT = [10, 25, 50, 100];
export const MAX_POWER = 1.15;

export interface LieMod {
  min: number;
  max: number;
  spin: number;
  ctl: number;
  jit: number;
  launch: number;
}
export const LIE: Record<string, LieMod> = {
  tee: { min: 1, max: 1, spin: 1, ctl: 1.1, jit: 0, launch: 0 },
  fairway: { min: 1, max: 1, spin: 1, ctl: 1, jit: 0, launch: 0 },
  fringe: { min: 0.98, max: 1, spin: 0.95, ctl: 1, jit: 0, launch: 0 },
  green: { min: 1, max: 1, spin: 1, ctl: 1, jit: 0, launch: 0 },
  rough: { min: 0.82, max: 0.92, spin: 0.5, ctl: 0.85, jit: 0.035, launch: -1 },
  heavy: { min: 0.55, max: 0.75, spin: 0.3, ctl: 0.65, jit: 0.08, launch: 2 },
  bunker: { min: 0.5, max: 0.65, spin: 0.4, ctl: 0.7, jit: 0.05, launch: 4 },
  sandWedge: { min: 0.82, max: 0.92, spin: 0.75, ctl: 0.85, jit: 0.03, launch: 4 },
  hardpan: { min: 0.97, max: 1.02, spin: 0.6, ctl: 0.7, jit: 0.02, launch: -2 },
  rock: { min: 0.9, max: 1.0, spin: 0.45, ctl: 0.6, jit: 0.05, launch: -2 },
  path: { min: 0.97, max: 1.03, spin: 0.5, ctl: 0.6, jit: 0.02, launch: -2 },
};
export function lieMods(lie: string, club: any): LieMod {
  let m = LIE[lie] || LIE.fairway;
  if (lie === 'bunker' && (club.short === 'SW' || club.short === 'LW')) m = LIE.sandWedge;
  m = { ...m };
  if (club.short === '1W' && lie !== 'tee') {
    m.min *= 0.9;
    m.max *= 0.92;
    m.ctl *= 0.8;
  }
  return m;
}
/** How the ground tilts under a ball for a shot aimed along yaw: up > 0 = uphill lie, side < 0 = ball above the feet
 *  (the golfer stands on the left of the line, looking down the hole, so ground rising to the right lifts the ball).
 *  Measured over about a metre so tiny bumps don't count. */
export function lieSlope(x: number, z: number, yaw: number) {
  const fx = Math.sin(yaw),
    fz = Math.cos(yaw),
    lx = fz,
    lz = -fx,
    h = (a: number, b: number) => heightAt(x + a, z + b);
  const up = (h(fx * 0.6, fz * 0.6) - h(-fx * 0.6, -fz * 0.6)) / 1.2,
    side = (h(lx * 0.6, lz * 0.6) - h(-lx * 0.6, -lz * 0.6)) / 1.2;
  void gradAt;
  return { up: clamp(up, -0.35, 0.35), side: clamp(side, -0.35, 0.35) };
}
export interface SlopeFx {
  launch: number;
  dist: number;
  curve: number;
  ctl: number;
  label: string;
}
/** What the slope does: uphill adds loft and costs distance, downhill de-lofts and runs; ball above the feet draws
 *  left, below the feet fades right; any slope makes clean contact harder. Small slopes (< 2%) don't count. */
export function slopeFx(sl: { up: number; side: number }, putt: boolean): SlopeFx {
  const z = (v: number) => Math.sign(v) * Math.max(0, Math.abs(v) - 0.02);
  const up = z(sl.up),
    side = z(sl.side);
  if (putt || (!up && !side)) return { launch: 0, dist: 1, curve: 0, ctl: 1, label: '' };
  const parts: string[] = [];
  if (Math.abs(sl.up) > 0.04) parts.push(sl.up > 0 ? 'Uphill' : 'Downhill');
  if (Math.abs(sl.side) > 0.04) parts.push(sl.side < 0 ? 'Ball above feet' : 'Ball below feet');
  return {
    launch: Math.atan(up) * 57.3 * 0.8,
    dist: clamp(1 - up * (up > 0 ? 0.9 : 0.35), 0.82, 1.06),
    curve: -side * 3.4,
    ctl: clamp(1 - (Math.abs(up) + Math.abs(side)) * 1.6, 0.6, 1),
    label: parts.join(' · '),
  };
}
export function shotSetup(club: any, lie: string, golfer: Golfer = DEFAULT_GOLFER, traj = 0, shape = 0) {
  const m = lieMods(lie, club);
  return {
    m,
    carryMean: (club.carry * (club.putter ? 1 : (COURSE.air ?? 1)) * golfer.power * (m.min + m.max)) / 2,
    sb: clamp(club.spin * m.spin * golfer.spin + traj * 0.12, 0.03, 1.4),
    launch: club.launch + traj * 3.5 + m.launch,
    ssShape: -shape * 0.22,
  };
}
/** p/g = perfect/good half-widths before impact; pl/gl = the (wider, more forgiving) late side, after impact. */
export interface Window {
  p: number;
  g: number;
  pl?: number;
  gl?: number;
}
export const LATE_P = 1.3,
  LATE_G = 1.4;
/** Timing windows in "u" units (u = seconds from the impact instant × tempo.rate). */
export function windows(power: number, club: any, lie: string, golfer: Golfer = DEFAULT_GOLFER, fx?: SlopeFx): Window {
  const c = golfer.control;
  if (club.putter) return { p: 0.245 * c, g: 0.56 * c, pl: 0.245 * c * LATE_P, gl: 0.56 * c * LATE_G };
  const m = lieMods(lie, club),
    ovr = power > 1 ? 1 + (power - 1) * 7 : 1;
  const wp = (0.168 * c * m.ctl * (fx?.ctl ?? 1)) / ovr; // the perfect (green) window: 0.12 at first, 0.135 with the one-way meter, 0.168 when the meter was sped up 18% (so the green lasts a touch longer in seconds than before)
  return { p: wp, g: wp * 3.1, pl: wp * LATE_P, gl: wp * 3.1 * LATE_G };
}
export function swingTempo(meterSpeed = 1, putt = false) {
  const k = meterSpeed * 1.18, // Nov 16: the whole swing runs 18% quicker ("a little slow")
    pm = 1; // (putts ran 30% slower than full swings until Nov 16: "still too easy")
  return { up: (1.05 / k) * pm, down: (0.58 / k) * pm, hang: 0.07, rate: 2.4 * k, ex: 1.6 };
}
export interface Impact {
  grade: 'perfect' | 'good' | 'miss';
  q: number;
  dev: number;
  dist: number;
  launchAdd: number;
  spinMul: number;
  label: string;
}
export function evaluateImpact(u: number, win: Window, putt: boolean): Impact {
  const a = Math.abs(u),
    late = u > 0,
    wp = late ? (win.pl ?? win.p) : win.p,
    wg = late ? (win.gl ?? win.g) : win.g;
  let grade: Impact['grade'], q: number;
  if (a <= wp) {
    grade = 'perfect';
    q = 0;
  } else if (a <= wg) {
    grade = 'good';
    q = ((a - wp) / (wg - wp)) * 0.35;
  } else {
    grade = 'miss';
    q = clamp(0.35 + ((a - wg) / (1.2 - wg)) * 0.65, 0.35, 1);
  }
  const dev = late ? q : -q;
  if (putt)
    return {
      grade,
      q,
      dev,
      dist: 1 - 0.12 * q,
      launchAdd: 0,
      spinMul: 1,
      label: grade === 'perfect' ? 'Pure roll' : grade === 'good' ? (late ? 'Slight push' : 'Slight pull') : late ? 'Pushed it' : 'Pulled it',
    };
  let dist = grade === 'perfect' ? 1 : 1 - 0.3 * Math.pow(q, 1.2),
    launchAdd = 0,
    spinMul = 1,
    label: string;
  if (grade === 'perfect') label = 'PERFECT';
  else if (late) {
    launchAdd = -5 * q;
    spinMul = 1 - 0.6 * q;
    label = grade === 'good' ? 'Slight push' : q > 0.7 ? 'Thinned — push slice' : 'Pushed, caught thin';
  } else {
    launchAdd = 2.5 * q;
    spinMul = 1 + 0.25 * q;
    dist *= 1 - 0.12 * q;
    label = grade === 'good' ? 'Slight pull' : q > 0.7 ? 'Chunked — fat pull hook' : 'Pulled, a touch fat';
  }
  if (u >= 1.2) {
    dist = 0.35;
    launchAdd = -9;
    spinMul = 0.2;
    label = 'Topped it!';
  }
  return { grade, q, dev, dist, launchAdd, spinMul, label };
}

// ---------------- authoritative shot ----------------
export interface Spin {
  top: number;
  back: number;
  side: number;
}
export interface ShotInput {
  club: number;
  power: number;
  u: number;
  aimYaw: number;
  spin?: Spin;
  puttRange?: number;
  /** a novelty ball for this one shot (physics.ts BallKind) */
  ball?: BallKind;
}
export interface BallLie {
  x: number;
  z: number;
  teed: boolean;
}
export interface ShotState {
  ball: BallLie;
  wind: { x: number; z: number };
  golfer?: Golfer;
  /** when the ball is struck, in shared-clock seconds: places the moon buggies (no clock = no buggies) */
  t0?: number;
}
export type ShotEvent = { t: number; type: 'land' | 'tree' | 'lip' | 'water' | 'ob' | 'holed' | 'rest' | 'buggy' | 'post' | 'warp' | 'pad' };
export interface ShotResult {
  /** the strike time the moon buggies were placed by (from ShotState.t0) */
  t0?: number;
  input: ShotInput;
  club: string;
  lie: string;
  impact: Impact;
  frames: number[][]; // [t, x, y, z] at 30 Hz, for playback
  events: ShotEvent[];
  outcome: 'rest' | 'holed' | 'water' | 'ob';
  end: BallLie; // where the next shot is played from (drop / re-tee applied)
  penalty: number; // strokes added on top of the stroke itself
  carry: number;
  total: number;
  restSurface: string;
}

/** Clamp and sanitise untrusted client input. */
export function sanitize(input: ShotInput): ShotInput {
  const n = (v: any, d: number) => (typeof v === 'number' && isFinite(v) ? v : d);
  const s = input.spin || { top: 0, back: 0, side: 0 };
  return {
    club: clamp(Math.round(n(input.club, 0)), 0, CLUBS.length - 1),
    power: clamp(n(input.power, 0), 0.03, MAX_POWER),
    u: clamp(n(input.u, 1.2), -1.4, 1.2),
    aimYaw: n(input.aimYaw, 0) % (Math.PI * 2),
    spin: { top: n(s.top, 0) ? 1 : 0, back: n(s.back, 0) ? 1 : 0, side: clamp(Math.round(n(s.side, 0)), -1, 1) },
    puttRange: clamp(Math.round(n(input.puttRange, 1)), 0, PUTT_FT.length - 1),
    ...(input.ball === 'lead' || input.ball === 'bouncy' || input.ball === 'smoke' ? { ball: input.ball } : {}),
  };
}

export function simulateShot(state: ShotState, rawInput: ShotInput, seed: number): ShotResult {
  const input = sanitize(rawInput),
    golfer = state.golfer || DEFAULT_GOLFER;
  const rng = mulberry32(seed >>> 0);
  setRng(rng);
  setBallKind(CLUBS[input.club].putter ? '' : (input.ball ?? ''));
  const club = CLUBS[input.club],
    b: Ball = newBall(state.ball.x, state.ball.z, state.ball.teed);
  const lie = state.ball.teed ? 'tee' : surfaceAt(b.x, b.z);
  const sfx = lie === 'tee' || lie === 'green' ? slopeFx({ up: 0, side: 0 }, true) : slopeFx(lieSlope(b.x, b.z, input.aimYaw), !!club.putter);
  const win = windows(input.power, club, lie, golfer, sfx),
    imp = evaluateImpact(input.u, win, !!club.putter);
  const start = { x: b.x, z: b.z };
  if (club.putter) {
    const range = PUTT_FT[input.puttRange!] / FT_PER_M;
    const d = input.power * range * imp.dist,
      v = Math.sqrt(2 * SURF.green.mu * G * d),
      yaw = input.aimYaw - imp.dev * 0.035;
    b.vx = Math.sin(yaw) * v;
    b.vz = Math.cos(yaw) * v;
    b.vy = 0;
    b.sb = 0;
    b.ss = 0;
    b.state = 'roll';
    b.teed = false;
    b.landed = true;
    b.lipped = false;
  } else {
    const st = shotSetup(club, lie, golfer),
      m = st.m,
      sp = input.spin!;
    const lieF = m.min + rng() * (m.max - m.min),
      dev = imp.dev + (rng() - 0.5) * 2 * m.jit;
    // thin mountain air: every full shot carries farther (the putter doesn't care)
    const target = input.power * club.carry * (club.putter ? 1 : (COURSE.air ?? 1)) * golfer.power * lieF * imp.dist * sfx.dist;
    const sb = clamp(st.sb * imp.spinMul + sp.back * 0.35 - sp.top * 0.3, 0.02, 1.6);
    const launch = Math.max(2, st.launch + imp.launchAdd + sp.back * 1.5 - sp.top * 2.5 + sfx.launch);
    const speed = speedForCarry(target, launch, sb);
    launchBall(b, {
      yaw: input.aimYaw - dev * 0.05 * club.sens,
      speed,
      launchDeg: launch,
      sb,
      ss: st.ssShape + sp.side * 0.45 - dev * 2.4 * club.sens + sfx.curve * club.sens,
    });
  }
  const frames: number[][] = [[0, +b.x.toFixed(3), +b.y.toFixed(3), +b.z.toFixed(3)]],
    events: ShotEvent[] = [];
  let t = 0,
    outcome: ShotResult['outcome'] = 'rest',
    carry = 0;
  for (let i = 1; i < 45 / DT; i++) {
    t = i * DT;
    const ev: string | null = stepBall(b, DT, { wind: state.wind, trees: true, t: state.t0 == null ? null : state.t0 + t });
    if (i % 8 === 0) frames.push([+t.toFixed(3), +b.x.toFixed(3), +b.y.toFixed(3), +b.z.toFixed(3)]);
    if (!ev) continue;
    events.push({ t: +t.toFixed(3), type: ev as any });
    if (ev === 'land') carry = Math.hypot(b.x - start.x, b.z - start.z);
    if (ev === 'rest' || ev === 'holed' || ev === 'water' || ev === 'ob') {
      outcome = ev as ShotResult['outcome'];
      break;
    }
  }
  frames.push([+t.toFixed(3), +b.x.toFixed(3), +b.y.toFixed(3), +b.z.toFixed(3)]);
  setBallKind('');
  let end: BallLie = { x: b.x, z: b.z, teed: false },
    penalty = 0;
  if (outcome === 'water') {
    penalty = 1;
    end = waterDrop(b, start);
  } else if (outcome === 'ob') {
    penalty = 1;
    end = { ...state.ball };
  } else if (outcome === 'holed') end = { x: COURSE.pin.x, z: COURSE.pin.z, teed: false };
  return {
    t0: state.t0,
    input,
    club: club.name,
    lie,
    impact: imp,
    frames,
    events,
    outcome,
    end,
    penalty,
    carry,
    total: Math.hypot(b.x - start.x, b.z - start.z),
    restSurface: surfaceAt(end.x, end.z),
  };
}
function waterDrop(b: Ball, st: { x: number; z: number }): BallLie {
  let x = b.x,
    z = b.z;
  const dx = st.x - x,
    dz = st.z - z,
    L = Math.hypot(dx, dz) || 1;
  for (let s = 0; s < L; s += 0.5) {
    const cx = x + (dx / L) * s,
      cz = z + (dz / L) * s,
      sf = surfaceAt(cx, cz);
    if (sf !== 'water' && sf !== 'bunker' && sf !== 'ob') {
      x = cx + (dx / L) * 2;
      z = cz + (dz / L) * 2;
      break;
    }
  }
  return { x, z, teed: false };
}
export const yd = (m: number) => Math.round(m * YD_PER_M);
export { heightAt };
