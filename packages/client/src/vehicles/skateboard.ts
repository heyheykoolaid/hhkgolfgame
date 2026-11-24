// The skateboard: written for Golden Hills from scratch (no code from any skating game). One controller for the town
// and the course: push, carve and coast; ollie (hold Space to crouch, let go to pop); in the air, kickflip (W),
// heelflip (S) and spin (A/D); manual (hold Shift); grind any edge the place has marked as a rail; ride up a quarter
// pipe and back down. Land a flip unfinished or a spin off-line and you bail. Tricks chain into a combo whose score
// pops up when you've rolled a moment without one.
// The world it rides in is given: ground height, what blocks, where the rails are.
import * as THREE from 'three';
import type { Golfer } from '../characters/golfer';

export interface SkateWorld {
  ground(x: number, z: number): number;
  /** something solid at (x, z) within r (walls, trees, cars) */
  blocked(x: number, z: number, r: number): boolean;
  /** grindable edges: from a to b, with their top at height h */
  rails: { ax: number; az: number; bx: number; bz: number; h: number }[];
}
export interface SkateInput {
  push: boolean;
  brake: boolean;
  steer: number; // −1 … 1 (left +)
  crouch: boolean; // Space held
  manual: boolean; // Shift held
}
export type SkateEvent =
  { kind: 'trick'; name: string } | { kind: 'combo'; text: string; pts: number } | { kind: 'bail'; v: number } | { kind: 'push' };

/** Deck colours you can pick (the deck's top grip is always black; this is the underside and the edge). */
export const DECKS: { id: string; name: string; c: string; c2: string }[] = [
  { id: 'natural', name: 'Natural maple', c: '#d8b27a', c2: '#c8452f' },
  { id: 'sunset', name: 'Sunset', c: '#f39a2b', c2: '#e2574c' },
  { id: 'teal', name: 'Golden Hills teal', c: '#2eaa8a', c2: '#e9b23a' },
  { id: 'night', name: 'Midnight', c: '#27405e', c2: '#9fe0ff' },
  { id: 'flame', name: 'Hot rod', c: '#1d1d1f', c2: '#ff5a2a' },
  { id: 'bubble', name: 'Bubblegum', c: '#ff8ac8', c2: '#7ad0ff' },
];
export const BOARD_PRICE = 250;

/** A board, built in code: a kicked-up maple deck with grip tape, two trucks and four urethane wheels. Origin at
 *  the bottom of the wheels, nose toward +z. */
export function boardModel(deck = 'natural') {
  const d = DECKS.find(x => x.id === deck) || DECKS[0],
    g = new THREE.Group(),
    under = new THREE.MeshStandardMaterial({ color: d.c, roughness: 0.6 }),
    stripe = new THREE.MeshStandardMaterial({ color: d.c2, roughness: 0.5 }),
    grip = new THREE.MeshStandardMaterial({ color: '#1a1a1c', roughness: 0.95 }),
    metal = new THREE.MeshStandardMaterial({ color: '#b8bcc2', metalness: 0.8, roughness: 0.3 }),
    wheel = new THREE.MeshStandardMaterial({ color: '#f1eee6', roughness: 0.5 });
  const deckG = new THREE.Group();
  deckG.position.y = 0.09;
  g.add(deckG);
  const mid = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.014, 0.56), under);
  deckG.add(mid);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.198, 0.003, 0.56), grip);
  top.position.y = 0.0085;
  deckG.add(top);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.202, 0.006, 0.12), stripe);
  band.position.set(0, -0.004, 0);
  deckG.add(band);
  for (const sz of [-1, 1]) {
    // the kicks: tail and nose turned up
    const kick = new THREE.Group();
    kick.position.set(0, 0, sz * 0.28);
    kick.rotation.x = -sz * 0.35;
    const k = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.014, 0.14), under);
    k.position.z = sz * 0.07;
    kick.add(k);
    const kg = new THREE.Mesh(new THREE.BoxGeometry(0.198, 0.003, 0.14), grip);
    kg.position.set(0, 0.0085, sz * 0.07);
    kick.add(kg);
    deckG.add(kick);
    // truck and wheels
    const truck = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.05), metal);
    truck.position.set(0, 0.055, sz * 0.2);
    g.add(truck);
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.032, 12).rotateZ(Math.PI / 2), wheel);
      w.position.set(sx * 0.1, 0.027, sz * 0.2);
      w.userData.wheel = true;
      g.add(w);
    }
  }
  g.userData.deck = deckG;
  g.traverse(o => ((o as THREE.Mesh).castShadow = true));
  return g;
}

const G = 9.81,
  PUSH_MAX = 7.2, // pushing won't take you past this (hills will)
  TOP = 13,
  POINTS: Record<string, number> = { Ollie: 50, Kickflip: 120, Heelflip: 120, 'Double kickflip': 260, 'Double heelflip': 260 };

/** The rider's controller. Keeps its own position; the host reads x, z, y and yaw from it and poses the golfer. */
export class Skateboard {
  readonly board: THREE.Group;
  x = 0;
  z = 0;
  y = 0;
  /** heading of travel (radians: forward = sin, cos), and the speed along it (m/s) */
  yaw = 0;
  v = 0;
  vy = 0;
  air = false;
  /** the rider's stance flips when landing a 180 (fakie): the body faces the other way along the board */
  fakie = false;
  crouch = 0;
  manual = 0;
  /** in the air: how far the board has spun about its length (flip) and the body round (spin) */
  flip = 0;
  flipDir = 0;
  /** how far round the flips you've asked for go (a whole turn per tap of W or S) */
  private flipGoal = 0;
  spin = 0;
  vert = false;
  grind: { rail: SkateWorld['rails'][number]; t: number; dir: number; len: number } | null = null;
  pushT = 0;
  private pushCD = 0;
  private wasCrouch = false;
  private combo: string[] = [];
  private comboPts = 0;
  private settle = 0;
  private grindT = 0;
  private manualT = 0;
  private roll = 0;
  private prevPush = false;
  private prevBrake = false;
  private airT = 0;
  /** distance rolled (turns the wheels) */
  dist = 0;
  constructor(deck = 'natural') {
    this.board = boardModel(deck);
  }
  /** Step on at (x, z), facing yaw, already moving at v (a running start). */
  mount(x: number, z: number, yaw: number, v: number, w: SkateWorld) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.v = Math.min(PUSH_MAX, Math.max(0, v));
    this.y = w.ground(x, z);
    this.vy = 0;
    this.air = this.vert = this.fakie = false;
    this.flip = this.spin = this.flipDir = 0;
    this.grind = null;
    this.combo = [];
    this.comboPts = 0;
  }
  private add(name: string, pts: number, out: SkateEvent[]) {
    this.combo.push(name);
    this.comboPts += pts;
    out.push({ kind: 'trick', name });
  }
  private endCombo(out: SkateEvent[]) {
    if (!this.combo.length) return;
    const mult = this.combo.length,
      pts = Math.round(this.comboPts * mult);
    // collapse repeats: "Ollie ×3"
    const parts: string[] = [];
    for (const n of this.combo) {
      const last = parts[parts.length - 1];
      const m = last && /^(.*?)(?: ×(\d+))?$/.exec(last);
      if (m && m[1] === n) parts[parts.length - 1] = `${n} ×${+(m[2] || 1) + 1}`;
      else parts.push(n);
    }
    out.push({ kind: 'combo', text: parts.join(' + ') + (mult > 1 ? `  ×${mult}` : ''), pts });
    this.combo = [];
    this.comboPts = 0;
  }
  private bail(out: SkateEvent[]) {
    out.push({ kind: 'bail', v: Math.hypot(this.v, this.vy) });
    this.combo = [];
    this.comboPts = 0;
    this.v = 0;
    this.vy = 0;
    this.air = false;
    this.grind = null;
    this.vert = false;
    this.flip = this.spin = this.flipDir = 0;
  }
  /** One frame. Returns what happened (tricks, a combo landed, a bail). */
  update(dt: number, inp: SkateInput, w: SkateWorld): SkateEvent[] {
    // small steps, so a slow frame doesn't carry the board through a ramp's curve or a rail
    dt = Math.min(dt, 0.1);
    const n = Math.ceil(dt / (1 / 120)),
      h = dt / n,
      out: SkateEvent[] = [];
    for (let i = 0; i < n; i++) {
      const was = this.air;
      out.push(...this.step(h, inp, w));
      if (this.air && !was) {
        this.airT = 0;
        this.prevPush = inp.push; // (W held while rolling isn't a kickflip)
        this.prevBrake = inp.brake;
      }
      this.dist += Math.abs(this.v) * h;
      if (out.some(e => e.kind === 'bail')) break;
    }
    return out;
  }
  private step(dt: number, inp: SkateInput, w: SkateWorld): SkateEvent[] {
    const out: SkateEvent[] = [];
    this.pushCD -= dt;
    this.pushT = Math.max(0, this.pushT - dt);
    // the crouch builds while Space is held; letting go pops an ollie (on the ground, or off a rail)
    this.crouch += ((inp.crouch ? 1 : 0) - this.crouch) * Math.min(1, dt * (inp.crouch ? 7 : 12));
    const pop = this.wasCrouch && !inp.crouch;
    this.wasCrouch = inp.crouch;

    if (this.grind) {
      // grinding: along the rail at speed, slowly losing it; off the end, or pop off with an ollie
      const g = this.grind,
        r = g.rail;
      this.v = Math.max(1.5, this.v - 0.6 * dt);
      g.t += (g.dir * this.v * dt) / g.len;
      this.grindT += dt;
      this.comboPts += 90 * dt;
      this.x = r.ax + (r.bx - r.ax) * g.t;
      this.z = r.az + (r.bz - r.az) * g.t;
      this.y = r.h;
      this.yaw = Math.atan2((r.bx - r.ax) * g.dir, (r.bz - r.az) * g.dir);
      if (pop || g.t < 0 || g.t > 1) {
        this.grind = null;
        this.air = true;
        this.vy = pop ? 3.2 + 1.2 * this.crouch : 0.5;
        if (pop) this.add('Ollie', POINTS.Ollie, out);
      }
      return out;
    }

    if (!this.air) {
      // ---- rolling
      const sx = Math.sin(this.yaw),
        sz = Math.cos(this.yaw),
        g0 = w.ground(this.x, this.z);
      if (inp.push && this.pushCD <= 0 && this.v < PUSH_MAX && !inp.manual) {
        this.v = Math.min(PUSH_MAX, this.v + (this.v < 1 ? 2.2 : 1.5));
        this.pushCD = 0.6;
        this.pushT = 0.5;
        out.push({ kind: 'push' });
      }
      if (inp.brake) this.v = Math.max(0, this.v - 5 * dt);
      // carving: tighter when slow
      this.yaw += inp.steer * dt * (2.6 / (1 + this.v * 0.14)) * (this.v > 0.3 ? 1 : 0.6);
      this.roll += (inp.steer * Math.min(1, this.v / 4) * 0.25 - this.roll) * Math.min(1, dt * 6);
      // the slope under the board, along it
      const ahead = w.ground(this.x + sx * 0.3, this.z + sz * 0.3),
        behind = w.ground(this.x - sx * 0.3, this.z - sz * 0.3),
        slope = (ahead - behind) / 0.6;
      // a slope steep enough is a quarter pipe's wall: go straight up it into the air (and come back down facing back)
      if (slope > 1.5 && this.v > 2) {
        this.air = true;
        this.vert = true;
        this.vy = this.v * 0.9;
        this.v = 0.15;
        this.spin = 0;
        this.y = Math.max(this.y, g0);
        return out;
      }
      this.v -= ((G * slope) / Math.sqrt(1 + slope * slope)) * dt;
      this.v -= Math.sign(this.v) * (0.18 + 0.01 * this.v * this.v) * dt * (this.manual > 0 ? 1.6 : 1);
      if (this.v < -0.4) {
        // rolling back down a ramp: you're riding it backwards now (fakie)
        this.v = -this.v;
        this.yaw += Math.PI;
        this.fakie = !this.fakie;
        return out;
      }
      this.v = Math.min(this.v, TOP);
      // manual: hold Shift with some speed on
      if (inp.manual && this.v > 1.8) {
        this.manual = Math.min(1, this.manual + dt * 5);
        this.manualT += dt;
        this.comboPts += 40 * dt;
        if (this.manualT > 0.25 && !this.combo.includes('Manual')) this.add('Manual', 50, out);
      } else {
        this.manual = Math.max(0, this.manual - dt * 6);
        this.manualT = 0;
      }
      // move, unless something's in the way
      const nx = this.x + sx * this.v * dt,
        nz = this.z + sz * this.v * dt,
        gn = w.ground(nx, nz);
      if (w.blocked(nx, nz, 0.3) || gn - this.y > 0.22) {
        if (Math.abs(this.v) > 5.5) this.bail(out);
        else this.v = -this.v * 0.25;
        return out;
      }
      this.x = nx;
      this.z = nz;
      if (this.y - gn > 0.12) {
        // rolled off an edge: into the air
        this.air = true;
        this.vy = 0;
      } else this.y = gn;
      if (pop) {
        this.air = true;
        this.vy = 3.0 + 1.6 * this.crouch_at_pop();
        this.spin = this.flip = this.flipDir = 0;
        this.add('Ollie', POINTS.Ollie, out);
      }
      // the combo ends once you've rolled a moment without a trick
      if (!this.manual) {
        this.settle += dt;
        if (this.settle > 0.9) this.endCombo(out);
      } else this.settle = 0;
      return out;
    }

    // ---- in the air
    this.settle = 0;
    this.airT += dt;
    this.vy -= G * dt;
    if (!this.vert) {
      this.x += Math.sin(this.yaw) * this.v * dt;
      this.z += Math.cos(this.yaw) * this.v * dt;
      if (w.blocked(this.x, this.z, 0.25) && this.y < w.ground(this.x, this.z) + 1.2) {
        this.bail(out);
        return out;
      }
    }
    this.y += this.vy * dt;
    // spins (A/D) and flips (W kickflip, S heelflip): a flip takes about 0.4 s
    // (a carve held into the jump doesn't count for the first moment, so it doesn't turn every ollie into a spin)
    if (this.airT > 0.12) this.spin += inp.steer * dt * 10;
    const tapW = inp.push && !this.prevPush,
      tapS = inp.brake && !this.prevBrake;
    if (tapW || tapS) {
      const d = tapW ? 1 : -1;
      // a tap starts a flip; another tap, once it's most of the way round, asks for one more turn the same way
      if (!this.flipDir) {
        this.flipDir = d;
        this.flipGoal = d * Math.PI * 2;
      } else if (d === this.flipDir && Math.abs(this.flipGoal - this.flip) < 2.2 && Math.abs(this.flipGoal) < Math.PI * 4.5)
        this.flipGoal += d * Math.PI * 2;
    }
    this.prevPush = inp.push;
    this.prevBrake = inp.brake;
    if (this.flipDir) {
      const st = dt * Math.PI * 2 * 2.6;
      this.flip = this.flipDir > 0 ? Math.min(this.flipGoal, this.flip + st) : Math.max(this.flipGoal, this.flip - st);
    }
    // a rail under the board while coming down: lock on and grind
    if (this.vy < 0 && !this.vert)
      for (const r of w.rails) {
        const dx = r.bx - r.ax,
          dz = r.bz - r.az,
          L2 = dx * dx + dz * dz,
          t = ((this.x - r.ax) * dx + (this.z - r.az) * dz) / L2;
        if (t < 0 || t > 1) continue;
        const px = r.ax + dx * t,
          pz = r.az + dz * t,
          d = Math.hypot(this.x - px, this.z - pz);
        if (d > 0.45 || this.y > r.h + 0.35 || this.y < r.h - 0.25) continue;
        const L = Math.sqrt(L2),
          al = (Math.sin(this.yaw) * dx + Math.cos(this.yaw) * dz) / L;
        if (Math.abs(al) < 0.35) continue; // coming in square across it: no
        if (this.flipDir && Math.abs(this.flipGoal - this.flip) > 0.6) continue; // (still flipping)
        this.scoreAir(out);
        this.grind = { rail: r, t, dir: al > 0 ? 1 : -1, len: L };
        this.grindT = 0;
        this.add(Math.abs(al) > 0.85 ? '50-50 grind' : 'Boardslide', 100, out);
        return out;
      }
    const gy = w.ground(this.x, this.z);
    if (this.y <= gy && this.vy < 0) {
      // landing: the flip must be done, and the board lined up with the way you're going (or turned right round)
      this.y = gy;
      const flipOk = !this.flipDir || Math.abs(this.flipGoal - this.flip) < 0.7,
        sp = this.vert ? this.spin + Math.PI : this.spin,
        half = Math.round(sp / Math.PI),
        spinOk = Math.abs(sp - half * Math.PI) < 0.95;
      if (!flipOk || !spinOk) {
        this.bail(out);
        return out;
      }
      this.scoreAir(out);
      if (this.vert) {
        this.v = Math.min(TOP, -this.vy * 0.85 + 0.5);
        this.yaw += Math.PI; // back down the wall, now facing away from it
      }
      if (half % 2) this.fakie = !this.fakie;
      this.air = this.vert = false;
      this.vy = 0;
      this.flip = this.spin = this.flipDir = 0;
    }
    return out;
  }
  private crouch_at_pop() {
    return Math.max(0.3, this.crouch);
  }
  /** Name what was done in the air (called on landing or locking onto a rail). */
  private scoreAir(out: SkateEvent[]) {
    const flips = this.flipDir ? Math.round(Math.abs(this.flipGoal) / (Math.PI * 2)) : 0,
      spinDeg = Math.round(Math.abs(this.spin) / Math.PI) * 180;
    if (flips) {
      const base = this.flipDir > 0 ? 'kickflip' : 'heelflip',
        name = (flips > 1 ? 'Double ' : '') + (flips > 1 ? base : base[0].toUpperCase() + base.slice(1));
      this.add((spinDeg ? spinDeg + ' ' : '') + name, (POINTS[name] || 120) + spinDeg * 0.8, out);
    } else if (spinDeg) this.add((this.vert ? 'Air ' : 'Frontside ') + spinDeg, (this.vert ? 150 : 0) + spinDeg * 0.8, out);
    else if (this.vert) this.add('Air', 150, out);
  }
  /** Place the board mesh and pose the rider for this frame. */
  pose(rider: Golfer, time: number) {
    const b = this.board,
      deck = b.userData.deck as THREE.Group;
    b.position.set(this.x, this.y, this.z);
    // in the air the board spins with the rider and flips about its length; on a rail it sits across
    b.rotation.set(0, this.yaw + (this.air ? this.spin : 0), 0, 'YXZ');
    b.rotateZ(this.flip + this.roll);
    b.rotateX(-this.manual * 0.22 * (this.fakie ? -1 : 1));
    if (this.grind) b.rotateY(this.combo[this.combo.length - 1] === 'Boardslide' ? Math.PI / 2 : 0);
    for (const o of b.children) if (o.userData.wheel) o.rotation.x = this.dist / 0.027;
    void deck;
    // the rider stands side-on on top: facing across the board, their own +x along it
    const r = rider.root,
      byaw = this.yaw + (this.air ? this.spin : 0) + (this.fakie ? Math.PI : 0);
    r.position.set(this.x, this.y + 0.1 + (this.manual > 0 ? 0.03 : 0), this.z);
    r.rotation.set(0, byaw - Math.PI / 2, 0);
    // feet over the trucks (the back foot down on the ground while pushing)
    const fwd = new THREE.Vector3(Math.sin(byaw), 0, Math.cos(byaw)),
      lift = this.air ? 0.06 + Math.sin(Math.min(1, Math.abs(this.flip) / (Math.PI * 2)) * Math.PI) * 0.18 : 0,
      front = new THREE.Vector3(this.x, this.y + 0.1 + lift, this.z).addScaledVector(fwd, 0.2),
      back = new THREE.Vector3(this.x, this.y + 0.1 + lift, this.z).addScaledVector(fwd, -0.2);
    if (this.pushT > 0) {
      const k = Math.sin((1 - this.pushT / 0.5) * Math.PI),
        side = new THREE.Vector3(Math.cos(byaw), 0, -Math.sin(byaw));
      back.addScaledVector(fwd, -0.25 * k).addScaledVector(side, 0.12 * k);
      back.y = this.y + 0.1 - 0.12 * k;
    }
    rider.update({
      mode: 'skate',
      s: this.air ? 0.85 : Math.max(this.crouch, this.grind ? 0.45 : 0.15 + Math.min(0.2, this.v * 0.02)),
      turn: this.roll * 3,
      power: this.air || this.grind || this.manual ? 1 : 0.4,
      time,
      club: 'iron',
      showClub: false,
      ik: { feet: [front, back] },
    } as any);
  }
  /** What other players need to draw this: [y, yaw, flip, spin, crouch, manual, fakie] */
  pres(): number[] {
    return [
      +this.y.toFixed(2),
      +(this.yaw + (this.air ? this.spin : 0)).toFixed(2),
      +this.flip.toFixed(2),
      +this.crouch.toFixed(2),
      +this.manual.toFixed(2),
      this.fakie ? 1 : 0,
      this.air ? 1 : 0,
    ];
  }
}

/** Draw someone else's board and rider from what they published (see Skateboard.pres). */
export function poseRemote(board: THREE.Group, rider: Golfer, x: number, z: number, p: number[], time: number) {
  const [y, yaw, flip, crouch, manual, fakie, air] = p.map(v => (Number.isFinite(+v) ? +v : 0));
  board.position.set(x, y, z);
  board.rotation.set(0, yaw, 0, 'YXZ');
  board.rotateZ(flip);
  board.rotateX(-manual * 0.22);
  const byaw = yaw + (fakie ? Math.PI : 0),
    fwd = new THREE.Vector3(Math.sin(byaw), 0, Math.cos(byaw)),
    lift = air ? 0.1 : 0;
  rider.root.position.set(x, y + 0.1, z);
  rider.root.rotation.set(0, byaw - Math.PI / 2, 0);
  rider.update({
    mode: 'skate',
    s: air ? 0.85 : Math.max(0.2, crouch),
    turn: 0,
    power: 0.6,
    time,
    club: 'iron',
    showClub: false,
    ik: {
      feet: [new THREE.Vector3(x, y + 0.1 + lift, z).addScaledVector(fwd, 0.2), new THREE.Vector3(x, y + 0.1 + lift, z).addScaledVector(fwd, -0.2)],
    },
  } as any);
}
