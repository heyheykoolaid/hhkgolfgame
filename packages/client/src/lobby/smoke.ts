// Grind, Roll & Smoke (design/grind-roll-smoke.md).
// J opens your stash: roll a joint from harvested product (a 6-step, ~20 s Cooking Mama-style minigame graded
// Clean / Decent / Messy), light one, or put it away. Hold R to take a puff (the hand comes up to the lips, the ember
// glows, you exhale a cloud a beat later). H passes it to whoever is closest. Effects build with each puff and fade
// over a minute or two: a warm vignette, a colour shift, drifting motes and a gentle sway. Everyone sees the joint,
// the ember wisps and the exhales. And if what's closest is a garden gnome… well.
import { sfxOut } from '../audio/ctx';
import * as THREE from 'three';
import { createRollGame } from './rollGame';
import { STRAIN, QUALITY, QUALITY_MULT } from '@gh/shared';
import type { Golfer } from '../characters/golfer';
import {
  progress,
  loadProgress,
  rollJoint,
  setJointLeft,
  addJoint,
  spareGear,
  placedCount,
  INV_SLOTS,
  type Joint,
  type TrophyRec,
} from '../avatar/progress';
import { placedOf } from './build';
import { invIcon } from './invIcons';
import { CELL } from './world';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const GRADE = ['Messy', 'Decent', 'Clean'] as const;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
/** Seconds of puffing a joint lasts: bigger and cleaner rolls burn longer. */
const burnSecs = (j: Joint) => (5 + 2.5 * j.g) * (0.6 + 0.4 * j.n);
/** How hard each second of puffing hits. */
const strength = (j: Joint) => (0.75 + 0.2 * j.g) * QUALITY_MULT[j.q] * 0.1;

export interface SmokePres {
  j?: { s: string; g: number; left: number; l?: 1; p?: 1; x?: number; h?: number }; // holding: lit, puffing, last exhale (ms), high 0..9
  pass?: { to: string; t: number; j: Joint };
  gn?: { lot: number; idx: number; t: number };
}
export interface SmokeHost {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  me(): string;
  myGolfer(): Golfer;
  myYaw(): number;
  canAct(): boolean;
  free(): boolean;
  toast(html: string, ms?: number): void;
  nameOf(uid: string): string;
  onClose(): void;
  /** A small picture of a trophy, and the write-up shown when its slot is picked. */
  trophyThumb?(t: TrophyRec): string;
  trophyDetail?(t: TrophyRec): string;
  /** Clothes: what the golfer has on (closet keys), and put a piece on or take it off. */
  wearing?(): Set<string>;
  wear?(key: string): void;
  /** Make sure what the golfer already wears is in the closet (once). */
  seedCloset?(): Promise<void>;
  nearestPeer(x: number, z: number, maxD: number): { uid: string; d: number } | null;
  putAwayOthers(): void;
  /** A rainbow joint was passed to a gnome: the Bad Batch begins (lobby.ts starts the round). */
  badBatch?(): void;
}

/** A peer's published smoke state, made safe (never trust shapes or numbers from the network). */
export function cleanSmoke(v: any): SmokePres | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const n = (x: any, lo: number, hi: number, d = lo) => {
      const y = +x;
      return isFinite(y) ? Math.min(hi, Math.max(lo, y)) : d;
    },
    sid = (x: any) => (typeof x === 'string' && STRAIN.has(x) ? x : 'gc');
  const out: SmokePres = {};
  if (v.j && typeof v.j === 'object')
    out.j = {
      s: sid(v.j.s),
      g: Math.round(n(v.j.g, 0, 2, 1)),
      left: n(v.j.left, 0, 1, 0.5),
      l: v.j.l ? 1 : undefined,
      p: v.j.p ? 1 : undefined,
      x: n(v.j.x, 0, 1e14, 0) || undefined,
      h: Math.round(n(v.j.h, 0, 9)) || undefined,
    };
  if (v.pass && typeof v.pass === 'object' && typeof v.pass.to === 'string' && v.pass.j && typeof v.pass.j === 'object') {
    const j = v.pass.j;
    out.pass = {
      to: v.pass.to.slice(0, 80),
      t: n(v.pass.t, 0, 1e14),
      j: {
        s: sid(j.s),
        q: Math.round(n(j.q, 0, 4)),
        g: Math.round(n(j.g, 0, 2, 1)) as 0 | 1 | 2,
        n: Math.round(n(j.n, 1, 3, 1)),
        left: n(j.left, 0.05, 1, 0.5),
      },
    };
  }
  if (v.gn && typeof v.gn === 'object') out.gn = { lot: Math.round(n(v.gn.lot, 0, 99)), idx: Math.round(n(v.gn.idx, 0, 999)), t: n(v.gn.t, 0, 1e14) };
  return out;
}

// ------------------------------------------------------------------ audio (synthesized) ----------------------------
let actx: AudioContext | null = null;
const ac = () => {
  try {
    actx ??= new AudioContext();
    if (actx.state === 'suspended') actx.resume();
  } catch {}
  return actx;
};
function noiseBuf(c: AudioContext, secs: number) {
  const b = c.createBuffer(1, Math.floor(c.sampleRate * secs), c.sampleRate),
    d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function blip(f: number, dur = 0.12, type: OscillatorType = 'sine', vol = 0.15, f2?: number) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator(),
    g = c.createGain(),
    t = c.currentTime;
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfxOut(c));
  o.start(t);
  o.stop(t + dur + 0.05);
}
function hiss(dur: number, f: number, vol: number, q = 0.8, f2?: number, delay = 0) {
  const c = ac();
  if (!c) return;
  const s = c.createBufferSource(),
    bp = c.createBiquadFilter(),
    g = c.createGain(),
    t = c.currentTime + delay;
  s.buffer = noiseBuf(c, dur + 0.1);
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(f, t);
  if (f2) bp.frequency.exponentialRampToValueAtTime(f2, t + dur);
  bp.Q.value = q;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + Math.min(0.06, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(bp).connect(g).connect(sfxOut(c));
  s.start(t);
  s.stop(t + dur + 0.1);
}
const sfx = {
  ok: () => {
    blip(880, 0.12, 'triangle', 0.12);
    blip(1320, 0.18, 'triangle', 0.1);
  },
  meh: () => blip(440, 0.18, 'triangle', 0.1, 330),
  rustle: () => hiss(0.12, 3500, 0.05, 1.2),
  lighter: () => {
    blip(2400, 0.03, 'square', 0.05);
    hiss(0.5, 900, 0.08, 0.7, 500, 0.05);
  },
  puff: (d: number) => hiss(Math.max(0.3, d), 700, 0.05, 0.6, 1100),
  exhale: (d: number) => hiss(0.6 + d * 0.6, 900, 0.07, 0.5, 300),
  cough: () => {
    for (let i = 0; i < 3; i++) {
      hiss(0.14, 600, 0.12, 1.4, 300, i * 0.22);
      blip(160, 0.1, 'sawtooth', 0.04, 90);
    }
  },
  /** An evil gnome laugh: a gravelly little "MWA-ha-ha-ha-ha-haaa" (formant-filtered sawtooth). vol by distance. */
  laugh(vol: number) {
    const c = ac();
    if (!c || vol < 0.02) return;
    const t0 = c.currentTime + 0.05,
      out = c.createGain();
    out.gain.value = vol;
    out.connect(sfxOut(c));
    const syl = [
      [0, 0.32, 210, 150],
      [0.4, 0.15, 330, 290],
      [0.6, 0.15, 315, 280],
      [0.8, 0.15, 300, 265],
      [1.0, 0.15, 285, 250],
      [1.2, 0.15, 270, 235],
      [1.42, 0.6, 260, 120],
    ];
    for (const [at, dur, f0, f1] of syl) {
      const o = c.createOscillator(),
        g = c.createGain(),
        t = t0 + at;
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const vib = c.createOscillator(),
        vg = c.createGain();
      vib.frequency.value = 28;
      vg.gain.value = 9;
      vib.connect(vg).connect(o.frequency);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.025);
      g.gain.setValueAtTime(0.5, t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      for (const [f, q, k] of [
        [750, 6, 1],
        [1150, 8, 0.6],
        [2600, 10, 0.25],
      ]) {
        const bp = c.createBiquadFilter(),
          bg = c.createGain();
        bp.type = 'bandpass';
        bp.frequency.value = f;
        bp.Q.value = q;
        bg.gain.value = k;
        o.connect(bp).connect(bg).connect(g);
      }
      g.connect(out);
      o.start(t);
      o.stop(t + dur + 0.05);
      vib.start(t);
      vib.stop(t + dur + 0.05);
      const h = c.createBufferSource(),
        hb = c.createBiquadFilter(),
        hg = c.createGain();
      h.buffer = noiseBuf(c, 0.1);
      hb.type = 'highpass';
      hb.frequency.value = 1500;
      hg.gain.setValueAtTime(0.25, t);
      hg.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      h.connect(hb).connect(hg).connect(out);
      h.start(t); // the breathy "h" of each "ha"
    }
  },
  poof: (vol: number) => {
    hiss(0.5, 2200, 0.5 * vol, 0.6, 180);
    blip(220, 0.25, 'sine', 0.3 * vol, 60);
  },
  whoosh: (vol: number) => hiss(0.9, 300, 0.35 * vol, 0.7, 2400),
};

// ------------------------------------------------------------------ smoke particles --------------------------------
function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!,
    g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}
class Puffs {
  N = 2000;
  i = 0;
  pos = new Float32Array(this.N * 3);
  vel = new Float32Array(this.N * 3);
  age = new Float32Array(this.N).fill(1e9);
  life = new Float32Array(this.N).fill(1);
  s0 = new Float32Array(this.N);
  grow = new Float32Array(this.N);
  a0 = new Float32Array(this.N);
  rise = new Float32Array(this.N);
  size = new Float32Array(this.N);
  alpha = new Float32Array(this.N);
  col = new Float32Array(this.N * 3);
  geo = new THREE.BufferGeometry();
  mat: THREE.ShaderMaterial;
  pts: THREE.Points;
  constructor(scene: THREE.Scene) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: softDot() }, uScale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aCol; varying float vA; varying vec3 vC; uniform float uScale;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / max(.1, -mv.z); vA = aAlpha; vC = aCol; }`,
      fragmentShader: `uniform sampler2D tex; varying float vA; varying vec3 vC; void main() { float a = texture2D(tex, gl_PointCoord).a * vA; if (a < .004) discard; gl_FragColor = vec4(vC, a); }`,
    });
    this.pts = new THREE.Points(this.geo, this.mat);
    this.pts.frustumCulled = false;
    this.pts.renderOrder = 5;
    scene.add(this.pts);
  }
  emit(p: THREE.Vector3, v: THREE.Vector3, size: number, life: number, alpha: number, col = 0.92, grow = 1.6, rise = 0.25) {
    const i = (this.i = (this.i + 1) % this.N);
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.age[i] = 0;
    this.life[i] = life;
    this.s0[i] = size;
    this.grow[i] = grow;
    this.a0[i] = alpha;
    this.rise[i] = rise;
    this.col.set([col, col * 0.98, col * 0.95], i * 3);
  }
  update(dt: number, cam: THREE.PerspectiveCamera) {
    this.mat.uniforms.uScale.value = innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    const drag = Math.exp(-dt * 1.6);
    for (let i = 0; i < this.N; i++) {
      const a = (this.age[i] += dt),
        L = this.life[i];
      if (a >= L) {
        this.alpha[i] = 0;
        continue;
      }
      const k = a / L,
        j = i * 3;
      this.vel[j] *= drag;
      this.vel[j + 1] = this.vel[j + 1] * drag + this.rise[i] * dt;
      this.vel[j + 2] *= drag;
      this.vel[j] += Math.sin(a * 1.3 + i) * 0.04 * dt;
      this.vel[j + 2] += Math.cos(a * 1.1 + i * 0.7) * 0.04 * dt; // a lazy curl
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      this.size[i] = this.s0[i] * (1 + this.grow[i] * Math.sqrt(k));
      this.alpha[i] = this.a0[i] * Math.min(1, a * 8) * (1 - k) * (1 - k);
    }
    for (const n of ['position', 'aSize', 'aAlpha', 'aCol']) (this.geo.attributes[n] as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ------------------------------------------------------------------ the joint ---------------------------------------
function jointModel(grade: number) {
  const g = new THREE.Group(),
    paper = new THREE.MeshStandardMaterial({ color: '#f1ece0', roughness: 0.85 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0062, 0.0042, 0.085, 10, 4).rotateX(Math.PI / 2), paper); // fat end toward +z (the lit end)
  if (grade === 0) {
    const p = body.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      p.setX(i, p.getX(i) * (1 + 0.35 * Math.sin(z * 90)));
      p.setY(i, p.getY(i) + Math.sin(z * 40) * 0.0015);
    }
    body.geometry.computeVertexNormals();
  }
  const crutch = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0043, 0.0043, 0.014, 8).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#d9c49a', roughness: 0.9 }),
  );
  crutch.position.z = -0.042;
  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.0064, 10, 8), new THREE.MeshBasicMaterial({ color: '#3a2a22' }));
  ember.scale.z = 0.5;
  const ash = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0061, 0.0062, 0.004, 10).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#8a8580', roughness: 1 }),
  );
  const tip = new THREE.Object3D();
  g.add(body, crutch, ember, ash, tip);
  const light = new THREE.PointLight('#ff7a2a', 0, 0.6, 2);
  ember.add(light);
  function set(left: number, lit: boolean, glow: number) {
    const L = 0.085 * (0.3 + 0.7 * left);
    body.scale.z = L / 0.085;
    body.position.z = -0.042 + 0.007 + L / 2 - 0.007;
    const end = body.position.z + L / 2;
    ash.position.z = end + 0.002;
    ember.position.z = end + 0.004;
    tip.position.z = end + 0.008;
    (ember.material as THREE.MeshBasicMaterial).color.set(
      lit ? new THREE.Color('#ff5a14').lerp(new THREE.Color('#ffd27a'), glow) : new THREE.Color('#3a2a22'),
    );
    light.intensity = lit ? 0.04 + glow * 0.25 : 0;
  }
  return { g, set, tip };
}
/** Where a golfer's joint sits: between the fingers of the right hand, lit end out; at the lips while puffing. */
const _f = new THREE.Vector3(),
  _u = new THREE.Vector3(0, 1, 0),
  _r = new THREE.Vector3(),
  _h = new THREE.Vector3();
const _a = new THREE.Vector3(),
  _b = new THREE.Vector3(),
  _c = new THREE.Vector3();
function poseJoint(m: THREE.Object3D, g: Golfer, yaw: number, raise: number) {
  const by = (g as any).by as Record<string, THREE.Bone> | undefined,
    hand = by?.RightHand,
    i1 = by?.RightHandIndex1,
    i2 = by?.RightHandIndex2,
    m2 = by?.RightHandMiddle2;
  _f.set(Math.sin(yaw), 0, Math.cos(yaw));
  _r.set(-_f.z, 0, _f.x);
  // straight out from the lips when raised
  const out = _f.clone().addScaledVector(_u, 0.06).normalize();
  if (hand && i1 && i2 && m2) {
    // pinched between the index and middle fingers, at their middle knuckles, sticking out through the back of them
    i1.getWorldPosition(_a);
    i2.getWorldPosition(_b);
    m2.getWorldPosition(_c);
    const along = _b.clone().sub(_a).normalize(),
      across = _b.clone().sub(_c).normalize(),
      n = along.clone().cross(across).normalize();
    hand.getWorldPosition(_h);
    // of the two ways through the fingers, the lit end goes the way that points away from the body
    if (n.dot(_h.clone().sub(g.root.position).setY(0)) < 0) n.negate();
    const dir = n.addScaledVector(along, 0.35).normalize().lerp(out, raise).normalize();
    m.position.copy(_b).add(_c).multiplyScalar(0.5).addScaledVector(dir, 0.022);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    return;
  }
  _h.copy(g.root.position)
    .addScaledVector(_r, -0.25)
    .setY(g.root.position.y + 1.0);
  m.position.copy(_h);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), out);
}
/** The arm for a joint: it hangs at the side as usual, and comes up to the lips while puffing (k = 0..1). */
function armFor(g: Golfer, yaw: number, k: number) {
  if (k < 0.01) return;
  _f.set(Math.sin(yaw), 0, Math.cos(yaw));
  _r.set(-_f.z, 0, _f.x);
  const mouth = g.mouth(),
    e = k * k * (3 - 2 * k);
  // (the hand bone is the wrist: it stops short of the lips so the fingers, and the joint in them, arrive there)
  g.reachRight(mouth.clone().addScaledVector(_f, 0.13).addScaledVector(_r, -0.05).addScaledVector(_u, -0.075), e);
}
/** Breathing in on a puff: the chest lifts and swells, the shoulders come up; out again on the exhale (c = 0..1). */
function chestFor(g: Golfer, c: number) {
  const by = (g as any).by as Record<string, THREE.Bone> | undefined;
  if (!by?.Spine2) return;
  const k = 1 + 0.075 * c;
  by.Spine2.scale.set(1 + 0.03 * c, 1, k);
  for (const n of ['Neck', 'LeftShoulder', 'RightShoulder']) by[n]?.scale.set(1 / (1 + 0.03 * c), 1, 1 / k);
  if (c > 0.001) {
    by.Spine1?.rotateX(-0.05 * c);
    by.Spine2.rotateX(-0.045 * c);
    by.LeftShoulder?.rotateZ(-0.07 * c);
    by.RightShoulder?.rotateZ(0.07 * c);
  }
}

// ------------------------------------------------------------------ the gnome (shh) --------------------------------
const LAP_H = CELL / 2,
  CORNER = 4.5,
  GNOME_SPEED = 24,
  LAPS = 3,
  WAKE = 1.9;
function lapPath(start: THREE.Vector3) {
  // a rounded square along the streets round the plaza (roads at ±CELL/2), clockwise from the point nearest the gnome
  const pts: THREE.Vector3[] = [],
    H = LAP_H,
    R = CORNER;
  const sq = [new THREE.Vector3(H, 0, H), new THREE.Vector3(H, 0, -H), new THREE.Vector3(-H, 0, -H), new THREE.Vector3(-H, 0, H)];
  for (let i = 0; i < 4; i++) {
    const c = sq[i],
      p = sq[(i + 3) % 4],
      n = sq[(i + 1) % 4],
      a = c.clone().add(p.clone().sub(c).normalize().multiplyScalar(R)),
      b = c.clone().add(n.clone().sub(c).normalize().multiplyScalar(R));
    for (let k = 0; k <= 8; k++) {
      const t = k / 8,
        q = a
          .clone()
          .multiplyScalar((1 - t) * (1 - t))
          .add(c.clone().multiplyScalar(2 * t * (1 - t)))
          .add(b.clone().multiplyScalar(t * t));
      pts.push(q);
    }
  }
  let best = 0,
    bd = 1e9;
  pts.forEach((p, i) => {
    const d = p.distanceToSquared(start);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  const ring = [...pts.slice(best), ...pts.slice(0, best)],
    route = [start.clone().setY(0)];
  for (let l = 0; l < LAPS; l++) route.push(...ring.map(p => p.clone()));
  route.push(ring[0].clone());
  const acc = [0];
  for (let i = 1; i < route.length; i++) acc.push(acc[i - 1] + route[i].distanceTo(route[i - 1]));
  return { route, acc, len: acc[acc.length - 1] };
}
function flameTex() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 104, 2, 32, 90, 60);
  g.addColorStop(0, 'rgba(255,250,210,1)');
  g.addColorStop(0.25, 'rgba(255,200,80,.95)');
  g.addColorStop(0.55, 'rgba(255,110,20,.7)');
  g.addColorStop(1, 'rgba(160,30,0,0)');
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(32, 2);
  x.bezierCurveTo(58, 50, 62, 96, 32, 126);
  x.bezierCurveTo(2, 96, 6, 50, 32, 2);
  x.fill();
  return new THREE.CanvasTexture(c);
}
class FireTrail {
  N = 900;
  i = 0;
  t = new Float64Array(this.N).fill(-1e9);
  /* epoch seconds: Float32 can't hold them */ p = new Float32Array(this.N * 3);
  seed = new Float32Array(this.N);
  mesh: THREE.InstancedMesh;
  m = new THREE.Matrix4();
  q = new THREE.Quaternion();
  c = new THREE.Color();
  constructor(scene: THREE.Scene) {
    const a = new THREE.PlaneGeometry(0.55, 1.1).translate(0, 0.5, 0),
      b = a.clone().rotateY(Math.PI / 2);
    const geo = new THREE.BufferGeometry();
    const pa = [...(a.attributes.position.array as any), ...(b.attributes.position.array as any)],
      ua = [...(a.attributes.uv.array as any), ...(b.attributes.uv.array as any)];
    const ia = [...(a.index!.array as any), ...[...(b.index!.array as any)].map((v: number) => v + 4)];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pa, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(ua, 2));
    geo.setIndex(ia);
    this.mesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshBasicMaterial({
        map: flameTex(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
      this.N,
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    for (let i = 0; i < this.N; i++) {
      this.mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
      this.mesh.setColorAt(i, new THREE.Color(0, 0, 0));
    }
    scene.add(this.mesh);
  }
  add(x: number, y: number, z: number, now: number) {
    const i = (this.i = (this.i + 1) % this.N);
    this.t[i] = now;
    this.p.set([x, y, z], i * 3);
    this.seed[i] = Math.random() * 10;
  }
  update(now: number, smoke: Puffs) {
    let any = false;
    for (let i = 0; i < this.N; i++) {
      const a = now - this.t[i];
      if (a < 0 || a > 4.5) {
        if (a < 6) {
          this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
          any = true;
        }
        continue;
      }
      any = true;
      const k = a / 4.5,
        fl = 0.75 + 0.25 * Math.sin(now * 23 + this.seed[i] * 7) * Math.sin(now * 13 + this.seed[i]),
        h = (a < 0.15 ? (a / 0.15) * 1.4 : 1.4 - 0.9 * k) * fl;
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.seed[i]);
      this.m.compose(
        new THREE.Vector3(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]),
        this.q,
        new THREE.Vector3(0.8 + 0.3 * (1 - k), Math.max(0.01, h), 0.8),
      );
      this.mesh.setMatrixAt(i, this.m);
      const b = (1 - k) * (1 - k);
      this.mesh.setColorAt(i, this.c.setRGB(1.6 * b, (0.55 + 0.4 * (1 - k)) * b, 0.18 * b));
      if (Math.random() < 0.025 * (1 - k))
        smoke.emit(
          new THREE.Vector3(this.p[i * 3], this.p[i * 3 + 1] + 0.5, this.p[i * 3 + 2]),
          new THREE.Vector3(0, 0.6, 0),
          0.5,
          2.5,
          0.22,
          0.25,
          2,
          0.4,
        );
    }
    if (any) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor!.needsUpdate = true;
    }
  }
}
interface GnomeRun {
  key: string;
  lot: number;
  idx: number;
  t0: number;
  clone: THREE.Object3D | null;
  start: THREE.Vector3;
  yaw0: number;
  path: ReturnType<typeof lapPath>;
  lastDrop: number;
  laughed: boolean;
  whooshed: boolean;
  poofed: boolean;
  back: boolean;
}

// ------------------------------------------------------------------ the module ------------------------------------
export function createSmoke(host: SmokeHost) {
  const puffs = new Puffs(host.scene),
    fire = new FireTrail(host.scene);
  let clock = 0;
  // holding: index into progress().joints (or -1); lit; puffing; how high you are (0..1)
  let held = -1,
    lit = false,
    lightT = 0,
    puffing = false,
    puffT = 0,
    raise = 0,
    chest = 0,
    high = 0,
    lastPuffAt = -99,
    exhaleAt = -1,
    exhaleAmt = 0,
    saveT = 0,
    lastExhaleMs = 0,
    burnAcc = 0;
  let myModel: ReturnType<typeof jointModel> | null = null,
    myModelG = -1;
  const myJoint = () => (held >= 0 ? progress().joints[held] : undefined);
  let passOut: SmokePres['pass'] | undefined, gnOut: SmokePres['gn'] | undefined;

  // ---- screen effects: a vignette tinted by strain, a colour shift on the canvas, drifting motes
  const vig = document.createElement('div');
  vig.id = 'lhigh';
  document.body.appendChild(vig);
  const motes = document.createElement('canvas');
  motes.id = 'lmotes';
  document.body.appendChild(motes);
  const mx = motes.getContext('2d')!;
  const dots = Array.from({ length: 46 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 2 + Math.random() * 6,
    s: 0.2 + Math.random(),
    p: Math.random() * 6,
  }));
  let tint = '#7fb04a';
  function screen(dt: number) {
    const h = high,
      cv = host.renderer.domElement;
    if (h < 0.01) {
      if (cv.style.filter) cv.style.filter = '';
      vig.style.opacity = '0';
      motes.style.opacity = '0';
      return;
    }
    const hue = Math.sin(clock * 0.21) * 14 * h + Math.sin(clock * 0.53) * 4 * h;
    cv.style.filter = `saturate(${(1 + 0.3 * h).toFixed(3)}) hue-rotate(${hue.toFixed(1)}deg) contrast(${(1 + 0.07 * h).toFixed(3)}) brightness(${(1 + 0.06 * h).toFixed(3)})`;
    vig.style.background = `radial-gradient(ellipse at center, transparent ${(62 - 22 * h).toFixed(0)}%, ${tint}55 ${(88 - 10 * h).toFixed(0)}%, #2a103888 115%)`;
    vig.style.opacity = Math.min(1, h * 1.2).toFixed(3);
    const mo = clamp((h - 0.3) / 0.5, 0, 1);
    motes.style.opacity = mo.toFixed(3);
    if (mo > 0.01) {
      if (motes.width !== innerWidth) {
        motes.width = innerWidth;
        motes.height = innerHeight;
      }
      mx.clearRect(0, 0, motes.width, motes.height);
      for (const d of dots) {
        d.y -= dt * 0.012 * d.s;
        d.x += Math.sin(clock * 0.4 + d.p) * dt * 0.006;
        if (d.y < -0.05) {
          d.y = 1.05;
          d.x = Math.random();
        }
        const x = d.x * motes.width,
          y = d.y * motes.height,
          a = 0.25 + 0.25 * Math.sin(clock * 1.7 + d.p * 3),
          g = mx.createRadialGradient(x, y, 0, x, y, d.r * 3);
        g.addColorStop(0, `rgba(255,236,190,${a})`);
        g.addColorStop(1, 'rgba(255,236,190,0)');
        mx.fillStyle = g;
        mx.beginPath();
        mx.arc(x, y, d.r * 3, 0, 7);
        mx.fill();
      }
    }
  }
  /** Camera sway while high: a slow roll and drift, applied after the lobby camera is placed. */
  function sway(camera: THREE.Camera) {
    if (high < 0.01) return;
    camera.rotateZ(Math.sin(clock * 0.37) * 0.018 * high);
    camera.rotateX(Math.sin(clock * 0.29 + 1) * 0.008 * high);
    camera.rotateY(Math.sin(clock * 0.23 + 2) * 0.01 * high);
  }

  // ---- the stash panel
  const ui = document.createElement('div');
  ui.id = 'lstash';
  ui.className = 'hidden';
  (document.getElementById('lobbyui') || document.body).appendChild(ui);
  let panelOpen = false;
  let selKey = '',
    invTab: 'items' | 'clothes' = 'items';
  /** The clothes and accessories in the closet, as [key, what it's called]. Hair and tattoos aren't things you carry. */
  const CLOTHES: Record<string, string> = {
    top: 'top',
    jacket: 'jacket',
    pantsStyle: 'legs',
    shoeStyle: 'shoes',
    capStyle: 'hat',
    glasses: 'glasses',
    chain: 'gold chain',
    watch: 'watch',
    earring: 'earring',
  };
  const clothName = (key: string) => {
    const [k, v] = key.split(':');
    return v === 'true' ? CLOTHES[k][0].toUpperCase() + CLOTHES[k].slice(1) : v[0].toUpperCase() + v.slice(1).replace(/([a-z])([A-Z0-9])/g, '$1 $2');
  };
  /** The inventory: a 4 × 8 grid of everything you're carrying. Click a slot for what you can do with it. */
  function renderStash() {
    const pr = progress(),
      prod = pr.product.slice().sort((a, b) => a.s.localeCompare(b.s) || b.q - a.q),
      strain = (id: string) => esc(STRAIN.get(id)?.name || id);
    interface Slot {
      key: string;
      icon: string;
      n?: string | number;
      tint?: string;
      name: string;
      sub: string;
      acts?: string;
      on?: boolean;
    }
    const slots: Slot[] = [];
    prod.forEach((x, i) =>
      slots.push({
        key: `p${x.s}${x.q}`,
        icon: invIcon('bud', STRAIN.get(x.s)?.color),
        n: x.n,
        tint: STRAIN.get(x.s)?.color,
        name: `${strain(x.s)} <span class="q q${x.q}">${QUALITY[x.q]}</span>`,
        sub: `${x.n} unit${x.n === 1 ? '' : 's'} of bud. Sell it to the Street Dealer, or roll it (one paper each).`,
        acts: [1, 2, 3]
          .map(
            n =>
              `<button data-roll="${i}:${n}" ${x.n < n || !pr.papers ? 'disabled' : ''}>Roll a ${['Skinny', 'Regular', 'Fatty'][n - 1]} <i>${n}</i></button>`,
          )
          .join(''),
      }),
    );
    pr.joints.forEach((j, i) =>
      slots.push({
        key: `j${i}`,
        icon: invIcon('joint', STRAIN.get(j.s)?.color),
        n: Math.round(j.left * 100) + '%',
        tint: STRAIN.get(j.s)?.color,
        on: i === held,
        name: `${GRADE[j.g]} ${strain(j.s)} joint`,
        sub: `${['Skinny', 'Regular', 'Fatty'][j.n - 1]} · ${QUALITY[j.q]} bud · ${Math.round(j.left * 100)}% left. Hold <kbd>R</kbd> to puff, <kbd>H</kbd> to pass.`,
        acts:
          i === held
            ? `<button data-away>${lit ? 'Put it out and pocket it' : 'Pocket it'}</button>`
            : `<button data-light="${i}" ${host.canAct() ? '' : 'disabled'}>Light it</button>`,
      }),
    );
    if (pr.papers)
      slots.push({ key: 'papers', icon: invIcon('papers'), n: pr.papers, name: 'Rolling papers', sub: 'One per joint. Grow Supply sells them.' });
    if (pr.items.hobo)
      slots.push({
        key: 'hobo',
        icon: invIcon('seeds'),
        n: pr.items.hobo,
        name: 'Hobo seeds',
        sub: 'From the hobo. Plant one in a grow pot or bed: it grows a rainbow plant. The Street Dealer pays a fortune for the bud… or you could share it with a gnome.',
      });
    if (pr.grinder)
      slots.push({ key: 'grinder', icon: invIcon('grinder'), name: 'Grinder', sub: 'Makes the grinding step of a roll quicker and cleaner.' });
    if (pr.fert)
      slots.push({
        key: 'fert',
        icon: invIcon('fert'),
        n: pr.fert,
        name: 'Fertilizer',
        sub: 'Doses. Take it out at the bin by your spigot, then hold E by a plant.',
      });
    for (const [id, icon, name] of [
      ['growpot', invIcon('growpot'), 'Grow pot'],
      ['growbed', invIcon('growbed'), 'Raised grow bed'],
      ['sprinkler', invIcon('sprinkler'), 'Sprinkler'],
    ] as const) {
      const n = spareGear(pr, id);
      if (n) slots.push({ key: 'g' + id, icon, n, name, sub: 'Place it in Build Mode on your own lot (the Grow tab).' });
    }
    for (const t of [...pr.trophies].sort((a, b) => b.at - a.at)) {
      if (placedCount('trophy:' + t.id)) continue;
      slots.push({
        key: 't' + t.id,
        icon: host.trophyThumb ? `<img src="${host.trophyThumb(t)}" alt="">` : '🏆',
        name: esc(t.title),
        sub: host.trophyDetail?.(t) || '',
      });
    }
    const sel = slots.find(x => x.key === selKey) || slots[0],
      cells = Array.from({ length: Math.max(INV_SLOTS, Math.ceil(slots.length / 8) * 8) }, (_, i) => {
        const x = slots[i];
        if (!x) return `<div class="slot${i >= INV_SLOTS ? ' over' : ''}"></div>`;
        return `<button class="slot full${x === sel ? ' sel' : ''}${x.on ? ' lit' : ''}${i >= INV_SLOTS ? ' over' : ''}" data-slot="${x.key}" ${x.tint ? `style="--tint:${x.tint}"` : ''}><span class="ic">${x.icon}</span>${x.n !== undefined ? `<em>${x.n}</em>` : ''}</button>`;
      }).join('');
    const tabs = `<div class="invtabs"><button class="${invTab === 'items' ? 'on' : ''}" data-it="items">Items</button><button class="${invTab === 'clothes' ? 'on' : ''}" data-it="clothes">Clothes</button></div>`;
    if (invTab === 'clothes') {
      const on = host.wearing?.() || new Set<string>(),
        own = pr.closet.filter(k => CLOTHES[k.split(':')[0]]).sort();
      ui.innerHTML = `<div class="card inv"><button class="x" data-close>✕</button><h2>Inventory</h2>
        <div class="sub">${own.length} piece${own.length === 1 ? '' : 's'} in your closet · click one to put it on or take it off</div>${tabs}
        <div class="invgrid clothes">${own.map(k => `<button class="slot full${on.has(k) ? ' sel' : ''}" data-wear="${k}"><span class="cn">${clothName(k)}</span><em>${CLOTHES[k.split(':')[0]]}</em></button>`).join('') || '<p class="muted" style="grid-column:1/-1">Nothing yet. Threads, on the West Side, sells clothes.</p>'}</div>
        <div class="invsel"><p>Worn pieces are outlined in gold. With everything off you're in shorts and bare feet. Colours are changed at Threads.</p></div></div>`;
    } else
      ui.innerHTML = `<div class="card inv"><button class="x" data-close>✕</button><h2>Inventory</h2>
      <div class="sub">${Math.min(slots.length, 999)} of ${INV_SLOTS} slots${slots.length > INV_SLOTS ? ' · <span class="warn">over the limit: nothing new fits until you clear some</span>' : ''} · Cash <b>$${Math.round(pr.cash).toLocaleString('en-US')}</b></div>${tabs}
      <div class="invgrid">${cells}</div>
      <div class="invsel">${sel ? `<div><b>${sel.name}</b><p>${sel.sub}</p></div><div class="acts">${sel.acts || ''}</div>` : '<p>Nothing here yet. Buds you harvest, joints, shop goods and trophies all end up in these slots.</p>'}</div></div>`;
    ui.querySelectorAll<HTMLButtonElement>('[data-it]').forEach(
      b =>
        (b.onclick = () => {
          invTab = b.dataset.it as 'items' | 'clothes';
          renderStash();
        }),
    );
    ui.querySelectorAll<HTMLButtonElement>('[data-wear]').forEach(
      b =>
        (b.onclick = () => {
          host.wear?.(b.dataset.wear!);
          renderStash();
        }),
    );
    ui.querySelector('[data-close]')?.addEventListener('click', () => closeStash());
    ui.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach(
      b =>
        (b.onclick = () => {
          selKey = b.dataset.slot!;
          renderStash();
        }),
    );
    ui.querySelector('[data-away]')?.addEventListener('click', () => {
      pocket();
      renderStash();
    });
    ui.querySelectorAll<HTMLButtonElement>('[data-light]').forEach(
      b =>
        (b.onclick = () => {
          closeStash();
          takeOut(+b.dataset.light!);
        }),
    );
    ui.querySelectorAll<HTMLButtonElement>('[data-roll]').forEach(
      b =>
        (b.onclick = () => {
          const [i, n] = b.dataset.roll!.split(':').map(Number),
            st = prod[i];
          if (st) {
            closeStash(true);
            startRoll(st.s, st.q, n);
          }
        }),
    );
  }
  async function openStash(pick = '') {
    if (pick === 'trophy') selKey = 't' + ([...progress().trophies].sort((a, b) => b.at - a.at).find(t => !placedCount('trophy:' + t.id))?.id || '');
    panelOpen = true;
    ui.classList.remove('hidden');
    await host.seedCloset?.();
    await loadProgress();
    renderStash();
  }
  function closeStash(silent = false) {
    panelOpen = false;
    ui.classList.add('hidden');
    if (!silent) host.onClose();
  }
  function takeOut(i: number) {
    if (held >= 0) pocket();
    const j = progress().joints[i];
    if (!j) return;
    host.putAwayOthers();
    held = i;
    lit = false;
    lightT = 0.7;
    sfx.lighter();
    tint = STRAIN.get(j.s)?.color || '#7fb04a';
    host.toast(
      `🔥 Lit a ${GRADE[j.g].toLowerCase()} ${esc(STRAIN.get(j.s)?.name || j.s)}. Hold <kbd>R</kbd> to puff · <kbd>H</kbd> to pass · <kbd>J</kbd> stash.`,
      3200,
    );
  }
  function pocket() {
    const j = myJoint();
    if (j) setJointLeft(held, j.left);
    held = -1;
    lit = false;
    puffing = false;
  }

  // ---- the rolling minigame (lobby/rollGame.ts plays it; this makes the joint it earns)
  let rolling: { s: string; q: number; n: number } | null = null;
  const game = createRollGame({
    hasGrinder: () => !!progress().grinder,
    sfx: { ok: sfx.ok, meh: sfx.meh, rustle: sfx.rustle, cough: sfx.cough, blip },
    onResult: g => {
      if (!rolling) return;
      const { s, q, n } = rolling;
      rollJoint(s, q, n, g).then(ok => {
        if (!ok) host.toast("Couldn't roll that (out of papers or product?).");
      });
    },
    onEnd: g => {
      rolling = null;
      host.onClose();
      if (g < 0) host.toast('Rolling abandoned. Nothing lost.', 1600);
      else host.toast(`Rolled a <b>${GRADE[g]}</b> joint. <kbd>J</kbd> to light it.`, 2600);
    },
  });
  function startRoll(s: string, q: number, n: number) {
    if (!progress().papers) {
      host.toast('You need rolling papers: Grow Supply sells them.');
      return;
    }
    rolling = { s, q, n };
    game.start(s, STRAIN.get(s)?.color || '#6fae3c', n);
    host.toast('', 1);
  }
  const rollKey = (e: KeyboardEvent, down: boolean) => game.key(e, down);
  const tickRoll = (dt: number) => game.tick(dt);

  // ---- input from the lobby
  function key(e: KeyboardEvent, down: boolean) {
    if (game.active()) {
      rollKey(e, down);
      return true;
    }
    if (panelOpen) {
      if (down && (e.code === 'Escape' || e.code === 'KeyJ' || e.code === 'KeyI' || e.code === 'Tab')) closeStash();
      return true;
    }
    return false;
  }
  /** Walking-mode keys: J stash, R puff (hold), H pass. Returns true if handled. */
  function walkKey(e: KeyboardEvent, down: boolean) {
    if (e.code === 'KeyR') {
      if (down && !e.repeat && held >= 0) {
        if (!lit) {
          lightT = 0.6;
          sfx.lighter();
        } else {
          puffing = true;
          puffT = 0;
          sfx.puff(0.6);
        }
        return true;
      }
      if (!down && puffing) {
        endPuff();
        return true;
      }
      return false;
    }
    if (!down || e.repeat) return false;
    if (e.code === 'KeyJ' || e.code === 'KeyI' || e.code === 'KeyT') {
      openStash(e.code === 'KeyT' ? 'trophy' : '');
      return 'open';
    }
    if (e.code === 'KeyH' && held >= 0) {
      pass();
      return true;
    }
    return false;
  }
  function endPuff() {
    puffing = false;
    const d = puffT;
    if (d < 0.15) return;
    const j = myJoint();
    if (!j) return;
    if (j.g === 0 && Math.random() < 0.35) {
      setTimeout(sfx.cough, 500);
      host.toast('*cough cough*', 1200);
      exhaleAmt = d * 0.6;
    } else exhaleAmt = d;
    exhaleAt = clock + 0.75;
    lastExhaleMs = Date.now() + 750;
    const before = high;
    high = clamp(high + d * strength(j) * (j.g === 0 ? 0.8 : 1), 0, 1);
    lastPuffAt = clock;
    if (before < 0.35 && high >= 0.35) setTimeout(() => host.toast('You feel <i>nice</i>.', 1600), 1500);
    if (before < 0.75 && high >= 0.75) setTimeout(() => host.toast('Woah. Everything is <i>so</i> golden.', 2000), 1500);
  }
  function pass() {
    const j = myJoint();
    if (!j || !lit) {
      host.toast('Light it first (<kbd>R</kbd>).', 1400);
      return;
    }
    const me = host.myGolfer().root.position,
      peer = host.nearestPeer(me.x, me.z, 2.4);
    let gnome: { lot: number; idx: number; d: number } | null = null;
    for (const p of placedOf('gnome')) {
      const w = p.obj.getWorldPosition(new THREE.Vector3()),
        d = Math.hypot(w.x - me.x, w.z - me.z);
      if (d < 2.2 && (!gnome || d < gnome.d) && p.obj.visible) gnome = { lot: p.lot, idx: p.idx, d };
    }
    if (gnome && (!peer || gnome.d < peer.d)) {
      // 🔥🧙
      const rainbow = j.s === 'rb',
        i = held;
      held = -1;
      lit = false;
      setJointLeft(i, 0);
      gnOut = { lot: gnome.lot, idx: gnome.idx, t: Date.now() };
      startGnome(gnOut, true);
      setTimeout(() => {
        gnOut = undefined;
      }, 30000);
      if (rainbow) {
        // the hobo's rainbow: the gnome takes a long pull… and the world melts
        setTimeout(() => host.toast('The gnome takes a long, long pull. The colours start to <i>melt</i>…', 3200), 1500);
        setTimeout(() => host.badBatch?.(), 6000);
      }
      return;
    }
    if (!peer) {
      host.toast('Nobody close enough to pass to.', 1400);
      return;
    }
    const copy = { ...j };
    const i = held;
    held = -1;
    lit = false;
    setJointLeft(i, 0);
    passOut = { to: peer.uid, t: Date.now(), j: copy };
    setTimeout(() => {
      passOut = undefined;
    }, 20000);
    host.toast(`Passed it to <b>${esc(host.nameOf(peer.uid))}</b>.`, 1600);
  }
  const seenPass = new Set<string>(),
    seenGn = new Set<string>();
  /** Everyone's smoke state (for passes to me and gnome runs). */
  function peers(list: { uid: string; sm?: SmokePres }[]) {
    for (const p of list) {
      const sm = cleanSmoke(p.sm),
        ps = sm?.pass; /* a pass is taken once, when first seen: the passer's clock doesn't matter */
      if (ps && ps.to === host.me() && !seenPass.has(p.uid + ps.t)) {
        seenPass.add(p.uid + ps.t);
        addJoint({ ...ps.j }).then(() => host.toast(`<b>${esc(host.nameOf(p.uid))}</b> passed you a joint. <kbd>J</kbd> to light it.`, 3000));
      }
      const g = sm?.gn;
      if (g) startGnome(g);
    }
  }

  // ---- gnome runs
  const runs: GnomeRun[] = [];
  let gnomeFreeze: number | null = null; // (tests: pin the gnome clock to look at one moment)
  function startGnome(g: { lot: number; idx: number; t: number }, mine = false) {
    const key = `${g.lot}:${g.idx}:${g.t}`;
    if (seenGn.has(key)) return;
    seenGn.add(key);
    const t0 = mine ? g.t : Date.now(),
      el = 0; /* someone else's gnome starts when we first see it (their clock may differ from ours) */
    const src = placedOf('gnome').find(p => p.lot === g.lot && p.idx === g.idx);
    if (!src) return;
    const start = src.obj.getWorldPosition(new THREE.Vector3()),
      q = src.obj.getWorldQuaternion(new THREE.Quaternion()),
      yaw0 = new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
    const clone = src.obj.clone(true);
    clone.position.copy(start);
    clone.rotation.set(0, yaw0, 0);
    clone.traverse(o => (o.visible = true)); // (the batcher makes a folded-in mesh read as hidden, and clone() copies that)
    host.scene.add(clone);
    // glowing red eyes
    const box = new THREE.Box3().setFromObject(src.obj),
      h = Math.max(0.3, box.max.y - box.min.y),
      eye = new THREE.MeshBasicMaterial({ color: '#ff2a10', toneMapped: false });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry((0.014 * h) / 0.5, 8, 6), eye);
      e.position.set((s * 0.032 * h) / 0.5, h * 0.66, (0.085 * h) / 0.5);
      e.name = 'eye';
      clone.add(e);
    }
    runs.push({
      key,
      lot: g.lot,
      idx: g.idx,
      t0,
      clone,
      start,
      yaw0,
      path: lapPath(start),
      lastDrop: 0,
      laughed: el > 1,
      whooshed: el > WAKE + 0.3,
      poofed: false,
      back: false,
    });
  }
  const volAt = (p: THREE.Vector3, cam: THREE.Camera) => 1 / (1 + p.distanceTo(cam.position) / 14);
  function tickGnomes(cam: THREE.Camera) {
    const nowS = gnomeFreeze ?? Date.now() / 1000;
    for (let i = runs.length - 1; i >= 0; i--) {
      const r = runs[i],
        t = nowS - r.t0 / 1000,
        runT = t - WAKE,
        dist = runT * GNOME_SPEED,
        end = r.path.len / GNOME_SPEED + WAKE;
      // keep the real gnome hidden while it's out, and for a while after (it comes back with a little puff)
      const src = placedOf('gnome').find(p => p.lot === r.lot && p.idx === r.idx);
      const away = t < end + 25;
      if (src) src.obj.visible = !away;
      if (!away && !r.back) {
        r.back = true;
        if (src)
          for (let k = 0; k < 14; k++)
            puffs.emit(
              src.obj.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, 0)),
              new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.2, (Math.random() - 0.5) * 1.5),
              0.35,
              1.4,
              0.4,
            );
      }
      if (r.back) {
        runs.splice(i, 1);
        continue;
      }
      const c = r.clone;
      if (!c) continue;
      if (t < WAKE) {
        // wakes up: a shiver, a hop and a spin, then the laugh
        if (!r.laughed && t > 0.15) {
          r.laughed = true;
          sfx.laugh(volAt(r.start, cam));
        }
        const k = clamp(t / WAKE, 0, 1);
        c.position.copy(r.start).add(new THREE.Vector3(Math.sin(t * 60) * 0.015 * (1 - k), Math.abs(Math.sin(t * 7)) * 0.25 * k, 0));
        c.rotation.set(0, r.yaw0 + (k > 0.5 ? (k - 0.5) * 2 * Math.PI * 2 : 0), Math.sin(t * 40) * 0.08 * (1 - k));
        c.scale.setScalar(1 + 0.9 * k * k);
        continue;
      }
      if (!r.whooshed) {
        r.whooshed = true;
        sfx.whoosh(volAt(r.start, cam));
      }
      if (dist >= r.path.len) {
        // POOF
        if (!r.poofed) {
          r.poofed = true;
          const p = c.position.clone().add(new THREE.Vector3(0, 0.3, 0));
          sfx.poof(volAt(p, cam));
          for (let k = 0; k < 90; k++)
            puffs.emit(
              p,
              new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 3, (Math.random() - 0.5) * 5),
              0.5 + Math.random() * 0.5,
              2 + Math.random() * 1.5,
              0.7,
              0.85 + Math.random() * 0.1,
              2.5,
              0.3,
            );
          host.scene.remove(c);
          r.clone = null;
        }
        continue;
      }
      // where on the route, and which way
      const { route, acc } = r.path;
      let j = 1;
      while (j < acc.length - 1 && acc[j] < dist) j++;
      const a = route[j - 1],
        b = route[j],
        f = (dist - acc[j - 1]) / Math.max(0.001, acc[j] - acc[j - 1]),
        pos = a.clone().lerp(b, f),
        dir = b.clone().sub(a).normalize();
      const yaw = Math.atan2(dir.x, dir.z),
        y = Math.abs(Math.sin(t * 34)) * 0.07;
      c.position.set(pos.x, y + 0.1, pos.z);
      c.rotation.set(0.35, yaw, Math.sin(t * 34) * 0.22, 'YXZ');
      c.scale.setScalar(1.9);
      // twin trails of fire, BTTF style
      while (r.lastDrop < dist - 0.35) {
        r.lastDrop += 0.35;
        let m = 1;
        while (m < acc.length - 1 && acc[m] < r.lastDrop) m++;
        const k = (r.lastDrop - acc[m - 1]) / Math.max(0.001, acc[m] - acc[m - 1]),
          q = route[m - 1].clone().lerp(route[m], clamp(k, 0, 1)),
          sd = route[m]
            .clone()
            .sub(route[m - 1])
            .normalize(),
          side = new THREE.Vector3(-sd.z, 0, sd.x);
        const at = r.t0 / 1000 + WAKE + r.lastDrop / GNOME_SPEED;
        for (const s of [-1, 1]) fire.add(q.x + side.x * 0.2 * s, 0.12, q.z + side.z * 0.2 * s, at);
      }
      if (Math.random() < 0.5)
        puffs.emit(
          c.position.clone().add(new THREE.Vector3(0, 0.25, 0)),
          dir
            .clone()
            .multiplyScalar(-2)
            .add(new THREE.Vector3(0, 0.6, 0)),
          0.25,
          1.2,
          0.3,
          0.4,
        );
    }
    fire.update(nowS, puffs);
  }

  // ---- remotes: their joints
  const remoteJ = new Map<string, { m: ReturnType<typeof jointModel>; g: number; lastX: number; wisp: number }>();
  function remotes(list: { id: string; golfer: Golfer; yaw: number; sm?: SmokePres; visible: boolean }[]) {
    const seen = new Set<string>();
    for (const r of list) {
      const j = cleanSmoke(r.sm)?.j;
      if (!j || !r.visible) continue;
      seen.add(r.id);
      let e = remoteJ.get(r.id);
      if (!e || e.g !== j.g) {
        if (e) host.scene.remove(e.m.g);
        e = { m: jointModel(j.g), g: j.g, lastX: j.x || 0, wisp: 0 };
        host.scene.add(e.m.g);
        remoteJ.set(r.id, e);
      }
      const up = j.p ? 1 : 0,
        rs = ((e as any).raise = ((e as any).raise ?? 0) + (up - ((e as any).raise ?? 0)) * Math.min(1, 0.016 * 9));
      const rc = ((e as any).chest = ((e as any).chest ?? 0) + (up - ((e as any).chest ?? 0)) * Math.min(1, 0.016 * (up ? 1.6 : 1.1)));
      chestFor(r.golfer, rc);
      armFor(r.golfer, r.yaw, rs);
      poseJoint(e.m.g, r.golfer, r.yaw, rs);
      e.m.set(j.left, !!j.l, j.p ? 0.8 + 0.2 * Math.sin(clock * 20) : 0.2);
      if (j.l) {
        e.wisp += 0.016;
        if (e.wisp > 0.09) {
          e.wisp = 0;
          puffs.emit(e.m.tip.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(0, 0.08, 0), 0.025, 2.6, 0.22, 0.9, 3, 0.12);
        }
      }
      if (j.x && j.x !== e.lastX) {
        e.lastX = j.x;
        const gr = j.g;
        setTimeout(() => {
          if (remoteJ.has(r.id)) exhale(r.golfer, r.yaw, 1, gr);
        }, 700);
      } /* a new exhale time = they just let go of a puff */
    }
    for (const [id, e] of remoteJ)
      if (!seen.has(id)) {
        host.scene.remove(e.m.g);
        remoteJ.delete(id);
      }
  }
  function exhale(g: Golfer, _yaw: number, amt: number, grade: number) {
    const n = Math.round(14 + amt * 26) * (grade === 0 ? 0.7 : grade === 2 ? 1.2 : 1);
    sfx.exhale(amt);
    for (let k = 0; k < n; k++) {
      const delay = (k / n) * (0.5 + amt * 0.4);
      // each puff leaves from where the mouth is *now*, facing the way they face now: the cloud follows a walker
      setTimeout(() => {
        g.root.updateMatrixWorld(true);
        const yaw = g.root.rotation.y,
          f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        puffs.emit(
          g.mouth().addScaledVector(f, 0.05),
          f
            .multiplyScalar(0.7 + Math.random() * 0.6)
            .add(new THREE.Vector3((Math.random() - 0.5) * 0.35, 0.15 + Math.random() * 0.2, (Math.random() - 0.5) * 0.35)),
          0.05 + Math.random() * 0.04 * (grade === 0 ? 1.8 : 1),
          3 + Math.random() * 2,
          0.16 * (grade === 0 ? 0.8 + Math.random() * 0.6 : 1),
          0.93,
          2.4,
          0.16,
        );
      }, delay * 1000);
    }
  }

  // ---- per frame
  let wisp = 0,
    rollLast = 0;
  function update(dt: number, camera: THREE.PerspectiveCamera) {
    {
      const n = performance.now();
      dt = Math.min(1, (n - (rollLast || n)) / 1000);
      rollLast = n;
    } /* wall-clock time: timings hold even when frames are slow */
    clock += dt;
    tickRoll(dt);
    const j = myJoint();
    if (held >= 0 && !j) {
      held = -1;
      lit = false;
    }
    if (lightT > 0) {
      lightT -= dt;
      if (lightT <= 0 && held >= 0) lit = true;
    }
    const g = host.myGolfer(),
      yaw = host.myYaw(),
      canPose = host.canAct();
    if (j) {
      if (!myModel || myModelG !== j.g) {
        if (myModel) host.scene.remove(myModel.g);
        myModel = jointModel(j.g);
        myModelG = j.g;
        host.scene.add(myModel.g);
      }
      if (puffing && !lit) puffing = false;
      raise += ((puffing ? 1 : 0) - raise) * Math.min(1, dt * 9);
      chest += ((puffing && raise > 0.7 ? 1 : 0) - chest) * Math.min(1, dt * (puffing ? 1.6 : 1.1));
      if (canPose) {
        chestFor(g, chest);
        armFor(g, yaw, raise);
      }
      poseJoint(myModel.g, g, yaw, raise);
      myModel.g.visible = g.root.visible;
      if (lit) {
        const T = burnSecs(j);
        if (puffing) {
          puffT += dt;
          burnAcc += dt / T;
        } else burnAcc += dt / (T * 25);
        if (burnAcc > 0.004) {
          j.left = Math.max(0, j.left - burnAcc);
          burnAcc = 0;
        }
        saveT += dt;
        if (saveT > 6) {
          saveT = 0;
          setJointLeft(held, j.left);
        }
        wisp += dt;
        if (wisp > (puffing ? 0.03 : 0.08)) {
          wisp = 0;
          puffs.emit(
            myModel.tip.getWorldPosition(new THREE.Vector3()),
            new THREE.Vector3(0, 0.08, 0),
            puffing ? 0.02 : 0.025,
            2.6,
            puffing ? 0.12 : 0.22,
            0.9,
            3,
            0.12,
          );
        }
        if (j.left <= 0.02) {
          if (puffing) endPuff();
          host.toast('Finished. 🍃', 1400);
          setJointLeft(held, 0);
          held = -1;
          lit = false;
          puffing = false;
        }
      }
      myModel.set(j.left, lit, puffing ? 0.75 + 0.25 * Math.sin(clock * 22) : 0.15 + 0.1 * Math.sin(clock * 3));
      if (lightT > 0 && myModel) {
        if (Math.random() < 0.6)
          puffs.emit(myModel.tip.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(0, 0.2, 0), 0.02, 0.5, 0.25, 0.5, 1, 0.3);
      }
    } else if (myModel) {
      host.scene.remove(myModel.g);
      myModel = null;
      raise = chest = 0;
      chestFor(g, 0);
    }
    if (exhaleAt > 0 && clock >= exhaleAt) {
      exhaleAt = -1;
      exhale(g, yaw, exhaleAmt, j?.g ?? 1);
    }
    // the high: holds a little after the last puff, then fades over a minute or two
    if (clock - lastPuffAt > 8) high = Math.max(0, high - dt / 110);
    if (high > 0.05 && canPose && host.free()) {
      const hd = (g as any).by?.Head as THREE.Bone | undefined;
      if (hd) {
        hd.rotation.z += Math.sin(clock * 0.8) * 0.06 * high;
        hd.rotation.x += 0.05 * high;
        g.root.updateMatrixWorld(true);
      }
    }
    screen(dt);
    puffs.update(Math.min(dt, 0.1), camera);
    tickGnomes(camera);
  }
  function pres(): SmokePres | undefined {
    const j = myJoint(),
      out: SmokePres = {};
    if (j)
      out.j = {
        s: j.s,
        g: j.g,
        left: +j.left.toFixed(2),
        l: lit ? 1 : undefined,
        p: puffing ? 1 : undefined,
        x: lastExhaleMs || undefined,
        h: Math.round(high * 9) || undefined,
      };
    if (passOut) out.pass = passOut;
    if (gnOut) out.gn = gnOut;
    return out.j || out.pass || out.gn ? out : undefined;
  }
  /** Leaving the lobby (a round of golf): pocket the joint, the buzz wears off. */
  function reset() {
    if (held >= 0) pocket();
    high = 0;
    screen(0);
  }
  return {
    gnomeAt: (secsAfterStart: number | null) => {
      const r = runs[runs.length - 1];
      gnomeFreeze = r && secsAfterStart !== null ? r.t0 / 1000 + secsAfterStart : null;
    },
    pass,
    key,
    walkKey,
    update,
    sway,
    pres,
    peers,
    remotes,
    openStash,
    isRolling: () => game.active(),
    isOpen: () => panelOpen || game.active(),
    rollControls: () => game.controls(),
    game,
    holding: () => held >= 0,
    reset,
    debug: () => ({
      fire: {
        alive: Array.from(fire.t).filter(t => (gnomeFreeze ?? Date.now() / 1000) - t < 4.5).length,
        vis: fire.mesh.visible,
        parent: !!fire.mesh.parent,
      },
      held,
      lit,
      high,
      runs,
      puffing,
      puffT,
      lightT,
      raise,
      gnomes: placedOf('gnome').map(p => ({
        lot: p.lot,
        idx: p.idx,
        w: p.obj
          .getWorldPosition(new THREE.Vector3())
          .toArray()
          .map(v => +v.toFixed(2)),
        vis: p.obj.visible,
      })),
    }),
    startRoll,
    takeOut,
    setHigh: (h: number) => {
      high = h;
      lastPuffAt = clock;
    },
    gnomeTest: (lot: number, idx: number) => {
      gnOut = { lot, idx, t: Date.now() };
      startGnome(gnOut, true);
    },
  };
}
