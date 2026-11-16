// Town life: people out walking the whole town's sidewalks and a few cars doing the rounds of its streets.
// They steer for themselves, in the manner of Craig Reynolds' steering behaviours (the ideas behind OpenSteer): follow
// a path, keep apart from each other, give way to whatever is in front. Walkers choose a new street at every corner,
// keep to their own side of the pavement, step round you, and wait at the kerb while a car goes by. Cars follow their
// lane, slow for corners, and brake for anyone or anything ahead of them.
// They are each player's own scenery (like the birds): nothing is sent, so two players see different passers-by.
import * as THREE from 'three';
import { Golfer, stepLength } from '../characters/golfer';
import { sanitizeLook } from '../avatar/outfit';
import { loadBody } from '../characters/mhGolfer';
import { SIDEWALKS, BOUND, groundY } from './world';
import { vehicleKind, loadCarKit, type Vehicle } from '../vehicles/vehicles';
import type { PhysWorld } from '../physics/ragdoll';

// ------------------------------------------------------------------ walkers
/** A stretch of pavement: along z at x = off (v) or along x at z = off, from a to b. */
type Seg = [boolean, number, number, number];
const WALKS: Seg[] = [
  ...SIDEWALKS,
  [false, 9.3, -146, -BOUND - 4], // the West Side's street, both sides
  [false, 18.7, -146, -BOUND - 4],
  [false, -10.2, BOUND + 4, 100], // the lane into Fun Land
  [true, -4.7, -63.5, -BOUND - 2], // up from the gate to Shady Lane, and both sides of the lane
  [true, 4.7, -63.5, -BOUND - 2],
  [false, -63.8, -30, 46],
  [false, -73.2, -30, 46],
];
const end = (s: Seg, far: boolean): [number, number] => (s[0] ? [s[1], far ? s[3] : s[2]] : [far ? s[3] : s[2], s[1]]);
/** For each end of each stretch: the ends of other stretches you can step across to. */
const LINKS: [number, boolean][][] = [];
WALKS.forEach((s, i) => {
  for (const far of [false, true]) {
    const [x, z] = end(s, far),
      out: [number, boolean][] = [];
    WALKS.forEach((t, j) => {
      if (j === i) return;
      for (const f2 of [false, true]) {
        const [x2, z2] = end(t, f2);
        if (Math.hypot(x2 - x, z2 - z) < 7.6) out.push([j, f2]);
      }
    });
    LINKS[i * 2 + (far ? 1 : 0)] = out;
  }
});
const SKIN = ['#f1c9a5', '#e0ac7e', '#c98d62', '#a86f47', '#7a4a2e', '#5a3622'],
  HAIR = ['#1b1310', '#3a2a1c', '#7a4e2a', '#b08a4e', '#d9d6cf', '#8a2f28'],
  CLOTH = ['#e9a23a', '#7a2f8a', '#2f6a8a', '#c8452f', '#3f8a4a', '#f1ede4', '#2c2f38', '#d98aa6', '#5a4a30', '#2b4a52'],
  PANTS = ['#d9cdb2', '#2c2f38', '#3a4a6a', '#6a4632', '#4a4a50', '#8a7a55'];
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
interface Walker {
  g: Golfer | null;
  seg: number;
  far: boolean; // heading for the far end of its stretch
  u: number; // metres along the stretch from its near end
  lane: number; // which side of the pavement it likes (−1 … 1)
  side: number; // where across the pavement it is now
  speed: number;
  v: number;
  wait: number;
  /** giving way: the side it has chosen to pass on and for how long it keeps to it; how long it has been stuck */
  pass: number;
  passT: number;
  stuck: number;
  cross: { x0: number; z0: number; x1: number; z1: number; t: number; len: number } | null;
  x: number;
  z: number;
  yaw: number;
  phase: number;
}
/** Anything a walker or a car should give way to. */
export interface Mover {
  x: number;
  z: number;
  /** how fast it is going (m/s); things over walking pace are treated as traffic */
  spd?: number;
}

// ------------------------------------------------------------------ cars
/** A closed lap: lane-centre points every half metre, each with the heading there. */
interface Lap {
  x: Float32Array;
  z: Float32Array;
  yaw: Float32Array;
  slow: Uint8Array; // in a corner
  n: number;
}
/** Build a lap from the corners of a route along road centres: keep right by `lane`, round each corner. A corner
 *  given twice in a row is a U-turn there. */
function lap(corners: [number, number][], lane = 1.5, R = 4): Lap {
  const pts: [number, number, number][] = [],
    n = corners.length;
  for (let i = 0; i < n; i++) {
    const a = corners[i],
      b = corners[(i + 1) % n],
      c = corners[(i + 2) % n],
      L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 0.01) continue; // (the second of a doubled corner: the U-turn was drawn with the leg before it)
    const d1 = Math.atan2(b[0] - a[0], b[1] - a[1]),
      fx = Math.sin(d1),
      fz = Math.cos(d1),
      // this leg's lane: the right-hand side of the way it is going
      rx = -fz * lane,
      rz = fx * lane,
      uturn = Math.hypot(c[0] - b[0], c[1] - b[1]) < 0.01;
    for (let s = R; s <= (uturn ? L : L - R); s += 0.5) pts.push([a[0] + fx * s + rx, a[1] + fz * s + rz, 0]);
    if (uturn) {
      // half a turn about the end of the road, swinging out ahead, into the lane coming back
      for (let k = 1; k < 20; k++) {
        const t = (Math.PI * k) / 20;
        pts.push([b[0] + rx * Math.cos(t) + fx * lane * 1.5 * Math.sin(t), b[1] + rz * Math.cos(t) + fz * lane * 1.5 * Math.sin(t), 1]);
      }
      continue;
    }
    // an ordinary corner: a curve from this lane into the next, through the point where the two lanes meet
    const d2 = Math.atan2(c[0] - b[0], c[1] - b[1]),
      r2x = -Math.cos(d2) * lane,
      r2z = Math.sin(d2) * lane,
      p0 = [b[0] - fx * R + rx, b[1] - fz * R + rz],
      p1 = [b[0] + rx + r2x, b[1] + rz + r2z],
      p2 = [b[0] + Math.sin(d2) * R + r2x, b[1] + Math.cos(d2) * R + r2z];
    for (let k = 1; k < 14; k++) {
      const t = k / 14;
      pts.push([
        (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
        (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
        1,
      ]);
    }
  }
  // resample to an even half metre and take headings from the points themselves
  const even: [number, number, number][] = [];
  let carry = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length],
      L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let s = carry; s < L; s += 0.5) even.push([a[0] + ((b[0] - a[0]) * s) / L, a[1] + ((b[1] - a[1]) * s) / L, a[2] || b[2]]);
    carry = (carry - L) % 0.5;
    if (carry < 0) carry += 0.5;
  }
  const m = even.length,
    out: Lap = { x: new Float32Array(m), z: new Float32Array(m), yaw: new Float32Array(m), slow: new Uint8Array(m), n: m };
  for (let i = 0; i < m; i++) {
    const p = even[i],
      q = even[(i + 2) % m];
    out.x[i] = p[0];
    out.z[i] = p[1];
    out.yaw[i] = Math.atan2(q[0] - p[0], q[1] - p[1]);
    out.slow[i] = p[2];
  }
  return out;
}
const B = 14; // the town's streets run at x = ±14 and z = ±14
/** [the car, its paint, the lap it drives, where on the lap it starts (0–1)] */
const ROUNDS: [string, string, [number, number][], number][] = [
  // round the middle block, one each way
  [
    'town',
    '',
    [
      [-B, -B],
      [B, -B],
      [B, B],
      [-B, B],
    ],
    0.1,
  ],
  [
    'classic',
    '',
    [
      [-B, B],
      [B, B],
      [B, -B],
      [-B, -B],
    ],
    0.6,
  ],
  // the long way: out along the south street, up the rise to the West Side, round at the far end and back through town
  [
    'sedan',
    '',
    [
      [B, B],
      [-126, B],
      [-126, B],
      [-B, B],
      [-B, -B],
      [B, -B],
    ],
    0.35,
  ],
];
interface Car {
  v: Vehicle | null;
  driver: Golfer | null;
  kind: string;
  lap: Lap;
  s: number; // metres round the lap
  spd: number;
  x: number;
  z: number;
  yaw: number;
}

export function createTownLife(scene: THREE.Scene, pw: () => PhysWorld | null) {
  const r = rng(4711),
    pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  // ---- walkers
  const walkers: Walker[] = [];
  for (let i = 0; i < 2; i++) {
    const female = i % 2 === 1,
      look = sanitizeLook({
        ball: 'white',
        body: female ? 'female' : 'male',
        skin: pick(SKIN),
        hair: pick(HAIR),
        shirt: pick(CLOTH),
        print: pick(CLOTH),
        pants: pick(PANTS),
        shoes: pick(['#f1ede4', '#2c2f38', '#c8a050', '#c8452f']),
        sole: '#e8e2d4',
        cap: pick(CLOTH),
        capStyle: pick(['none', 'none', 'front', 'back', 'fedora']),
        top: pick(['tee', 'tee', 'long', 'button']),
        pantsStyle: pick(['jeans', 'slacks', 'shorts']),
        shoeStyle: pick(['sneakers', 'trainers', 'loafers']),
        hairStyle: pick(['short', 'afro', 'bald', 'long', 'bob', 'pony']),
        glasses: r() < 0.25 ? 'round' : 'none',
        stubble: !female && r() < 0.4,
      } as any),
      seg = Math.floor(r() * WALKS.length),
      s = WALKS[seg],
      w: Walker = {
        g: null,
        seg,
        far: r() < 0.5,
        u: r() * (s[3] - s[2]),
        lane: r() < 0.5 ? -0.55 : 0.55,
        side: 0,
        speed: 1.05 + r() * 0.55,
        v: 0,
        wait: 0,
        pass: 0,
        passT: 0,
        stuck: 0,
        cross: null,
        x: 0,
        z: 0,
        yaw: 0,
        phase: r() * 6,
      };
    w.side = w.lane;
    walkers.push(w);
    const make = () => {
      w.g = new Golfer(look);
      scene.add(w.g.root);
    };
    if (female) loadBody('female').then(make, make);
    else make();
  }
  // ---- cars (made once the physics world is there, so the player's car can bump into them)
  const person = (female: boolean) =>
    sanitizeLook({
      ball: 'white',
      body: female ? 'female' : 'male',
      skin: pick(SKIN),
      hair: pick(HAIR),
      shirt: pick(CLOTH),
      print: pick(CLOTH),
      pants: pick(PANTS),
      shoes: '#2c2f38',
      sole: '#e8e2d4',
      cap: pick(CLOTH),
      capStyle: pick(['none', 'none', 'front']),
      top: pick(['tee', 'long', 'button']),
      hairStyle: pick(['short', 'afro', 'bald', 'bob', 'pony']),
      glasses: r() < 0.4 ? 'aviators' : 'none',
      stubble: !female && r() < 0.4,
    } as any);
  const cars: Car[] = ROUNDS.map(([id, paint, corners, at]) => {
    const L = lap(corners);
    return { v: null, driver: null, kind: `car:${id}:${paint}:`, lap: L, s: at * L.n * 0.5, spd: 0, x: 0, z: 0, yaw: 0 };
  });
  void loadCarKit();
  // somebody at the wheel of each
  cars.forEach((c, i) => {
    const female = i === 1,
      look = person(female),
      make = () => {
        c.driver = new Golfer(look);
        scene.add(c.driver.root);
      };
    if (female) loadBody('female').then(make, make);
    else make();
  });
  const _q1 = new THREE.Quaternion(),
    _q2 = new THREE.Quaternion(),
    UP = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion(),
    e = new THREE.Euler();
  /** How far ahead (along its heading) and aside something is from a mover at (x, z, yaw). */
  const rel = (x: number, z: number, yaw: number, o: Mover) => {
    const dx = o.x - x,
      dz = o.z - z,
      fx = Math.sin(yaw),
      fz = Math.cos(yaw);
    return [dx * fx + dz * fz, dx * fz - dz * fx];
  };

  function update(dt: number, clock: number, cam: THREE.Camera, others: Mover[]) {
    dt = Math.min(dt, 0.1);
    const cx = cam.position.x,
      cz = cam.position.z;
    // ---------------- cars
    const world = pw();
    for (const c of cars) {
      if (!c.v && world) {
        c.v = vehicleKind(c.kind).make(world, scene, '#c8452f', false);
        c.v.root.userData.noBatch = true;
      }
      const i = Math.floor(c.s / 0.5) % c.lap.n,
        j = (i + 1) % c.lap.n,
        f = (c.s / 0.5) % 1;
      c.x = c.lap.x[i] + (c.lap.x[j] - c.lap.x[i]) * f;
      c.z = c.lap.z[i] + (c.lap.z[j] - c.lap.z[i]) * f;
      let dy = c.lap.yaw[j] - c.lap.yaw[i];
      if (dy > Math.PI) dy -= 2 * Math.PI;
      if (dy < -Math.PI) dy += 2 * Math.PI;
      c.yaw = c.lap.yaw[i] + dy * f;
      // amble at about 22 km/h, ease off for a corner coming up, brake for anything in the lane ahead
      let want = 6.2;
      for (let k = 0; k < 12; k++) if (c.lap.slow[(i + k) % c.lap.n]) want = 3.4;
      const give = (o: Mover, reach: number, half: number) => {
        const [ahead, side] = rel(c.x, c.z, c.yaw, o);
        if (ahead > 0.5 && ahead < reach && Math.abs(side) < half) want = Math.min(want, Math.max(0, (ahead - 4.2) * 1.1));
      };
      for (const o of others) give(o, 11, 2.1);
      for (const w of walkers) give(w, 9, w.cross ? 2.6 : 1.3);
      for (const o of cars) if (o !== c) give(o, 12, 2.2);
      c.spd += Math.max(-10 * dt, Math.min(2.4 * dt, want - c.spd));
      c.s = (c.s + c.spd * dt) % (c.lap.n * 0.5);
      if (c.v) {
        // the car's forward is +X; tilt it to the slope of the street (the rise up to the West Side)
        const y = groundY(c.x, c.z),
          y2 = groundY(c.x + Math.sin(c.yaw) * 1.6, c.z + Math.cos(c.yaw) * 1.6);
        q.setFromEuler(e.set(0, c.yaw - Math.PI / 2, Math.atan2(y2 - y, 1.6), 'YXZ'));
        let st = c.lap.yaw[(i + 6) % c.lap.n] - c.yaw;
        if (st > Math.PI) st -= 2 * Math.PI;
        if (st < -Math.PI) st += 2 * Math.PI;
        c.v.follow({ k: c.kind, p: [c.x, y + 0.02, c.z], q: [q.x, q.y, q.z, q.w], s: c.spd, st: Math.max(-0.5, Math.min(0.5, st * 1.5)) }, dt);
        if (c.driver) {
          // the driver: seated at the wheel, hands turning it (the same seating a player gets)
          const near = (c.x - cx) ** 2 + (c.z - cz) ** 2 < 80 * 80,
            g = c.driver,
            v = c.v;
          g.root.visible = near;
          if (near) {
            v.root.updateMatrixWorld(true);
            v.seatParent.updateMatrixWorld(true);
            g.root.position.copy(v.seat).applyMatrix4(v.seatParent.matrixWorld);
            g.root.quaternion.copy(v.seatParent.getWorldQuaternion(_q1)).multiply(_q2.setFromAxisAngle(UP, v.riderYaw));
            const gr = v.grips?.(),
              w = (p: THREE.Vector3) => v.seatParent.localToWorld(p.clone());
            g.update({
              mode: 'sit',
              s: 0,
              club: 'iron',
              time: clock,
              turn: -v.steering(),
              ik: gr ? { hands: [w(gr.hands[0]), w(gr.hands[1])], feet: [w(gr.feet[0]), w(gr.feet[1])] } : undefined,
            } as any);
          }
        }
      }
    }
    // ---------------- walkers
    const traffic: Mover[] = [...cars.map(c => ({ x: c.x, z: c.z, spd: c.spd })), ...others.filter(o => (o.spd || 0) > 3)];
    for (const w of walkers) {
      const s = WALKS[w.seg],
        len = s[3] - s[2];
      let want = w.speed;
      if (w.wait > 0) {
        w.wait -= dt;
        want = 0;
      }
      if (w.cross) {
        // stepping across to the next stretch of pavement: not while a car is coming
        const c = w.cross;
        if (c.t === 0) for (const t of traffic) if (Math.hypot(t.x - (c.x0 + c.x1) / 2, t.z - (c.z0 + c.z1) / 2) < 9 && (t.spd || 0) > 0.8) want = 0;
        w.v += (want - w.v) * Math.min(1, dt * 5);
        c.t = Math.min(1, c.t + (w.v * dt) / c.len);
        w.x = c.x0 + (c.x1 - c.x0) * c.t;
        w.z = c.z0 + (c.z1 - c.z0) * c.t;
        w.yaw = Math.atan2(c.x1 - c.x0, c.z1 - c.z0);
        if (c.t >= 1) w.cross = null;
      } else {
        let dir = w.far ? 1 : -1;
        const yaw = s[0] ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        // keep apart: when someone is just ahead, choose a side to pass on and keep to it for a moment (choosing afresh
        // every frame made them flutter on the spot); if the way stays shut, wait, then turn round and go elsewhere
        let lane = w.lane,
          shut = false;
        const dodge = (o: Mover, solid: boolean) => {
          const [ahead, side] = rel(w.x, w.z, yaw, o);
          if (ahead < -0.3 || ahead > 2.8 || Math.abs(side) > 1.2) return;
          if (w.passT <= 0) {
            // pass on whichever side of the pavement has more room, given where they are standing
            const their = w.side + side * dir * (s[0] ? -1 : 1);
            w.pass = their > 0 ? -1.15 : 1.15;
            w.passT = 1.8;
          }
          if (solid && ahead < 1.0 && Math.abs(side) < 0.55) shut = true;
        };
        for (const o of walkers) if (o !== w) dodge(o, false);
        for (const o of others) if ((o.spd || 0) <= 3) dodge(o, true);
        if (w.passT > 0) {
          w.passT -= dt;
          lane = w.pass;
        }
        if (shut) {
          want = 0;
          w.stuck += dt;
          if (w.stuck > 2.5) {
            w.far = !w.far; // no way past: go back the other way
            w.stuck = 0;
            w.passT = 0;
          }
        } else w.stuck = Math.max(0, w.stuck - dt * 2);
        w.side += (lane - w.side) * Math.min(1, dt * 2.2);
        dir = w.far ? 1 : -1;
        w.v += (want - w.v) * Math.min(1, dt * 4);
        w.u += w.v * dt * dir;
        const along = s[2] + Math.max(0, Math.min(len, w.u));
        w.x = s[0] ? s[1] + w.side : along;
        w.z = s[0] ? along : s[1] + w.side;
        w.yaw += (((yaw - w.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 6);
        if (w.u <= 0 || w.u >= len) {
          // the end of this stretch: now and then stop a while; then pick a way on (not straight back, if there's a choice)
          const links = LINKS[w.seg * 2 + (w.far ? 1 : 0)];
          if (!links.length) {
            w.far = !w.far;
            w.u = Math.max(0, Math.min(len, w.u));
            w.wait = 2 + r() * 5;
          } else {
            const [j, f2] = links[Math.floor(r() * links.length)],
              [x1, z1] = end(WALKS[j], f2),
              t = WALKS[j];
            w.cross = { x0: w.x, z0: w.z, x1: t[0] ? x1 + w.side : x1, z1: t[0] ? z1 : z1 + w.side, t: 0, len: 1 };
            w.cross.len = Math.max(0.5, Math.hypot(w.cross.x1 - w.cross.x0, w.cross.z1 - w.cross.z0));
            w.seg = j;
            w.far = !f2;
            w.u = f2 ? t[3] - t[2] : 0;
            if (r() < 0.3) w.wait = 1.5 + r() * 6;
          }
        }
      }
      if (!w.g) continue;
      // far from the camera they are neither drawn nor posed
      const near = (w.x - cx) ** 2 + (w.z - cz) ** 2 < 85 * 85;
      w.g.root.visible = near;
      if (!near) continue;
      w.phase += ((w.v * dt) / stepLength(Math.max(0.6, w.v))) * Math.PI;
      w.g.root.position.set(w.x, groundY(w.x, w.z), w.z);
      w.g.root.rotation.set(0, w.yaw, 0);
      w.g.update({ mode: 'walk', speed: w.v, phase: w.phase, time: clock, s: 0, club: 'iron', showClub: false });
    }
  }
  return {
    update,
    /** The cars, for bumping into and being run over by. */
    cars: () => cars.filter(c => c.v).map(c => c.v!),
    /** Everyone and everything out and about, for the van, the birds and each other. */
    movers: (): Mover[] => [...walkers.map(w => ({ x: w.x, z: w.z, spd: w.v })), ...cars.map(c => ({ x: c.x, z: c.z, spd: c.spd }))],
  };
}
