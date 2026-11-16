// Impact "juice": synthesized swing/strike sounds, turf/sand bursts, a clubhead motion ribbon and a ball tracer.
import * as THREE from 'three';
import { wakeAudio, whiteNoise, sfxOut } from './audio/ctx';

// ---------------------------------------------------------------- sound (WebAudio, no files)
export class Sfx {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  /** Call from a user gesture (key/click) so the browser allows audio. */
  ensure() {
    this.ctx = wakeAudio(); // the game's one shared context (audio/ctx.ts)
    if (this.ctx && !this.noise) this.noise = whiteNoise(this.ctx);
  }
  private burst(t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, peak: number, attack = 0.004) {
    const c = this.ctx!,
      src = c.createBufferSource(),
      flt = c.createBiquadFilter(),
      g = c.createGain();
    src.buffer = this.noise;
    src.loop = true;
    flt.type = type;
    flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(sfxOut(c));
    src.start(t);
    src.stop(t + dur + 0.05);
  }
  private tone(t: number, dur: number, type: OscillatorType, f0: number, f1: number, peak: number) {
    const c = this.ctx!,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(sfxOut(c));
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  /** Air whoosh that builds through the downswing and peaks at impact. */
  swoosh(delay: number, dur: number, power: number) {
    if (!this.ctx || !this.noise) return;
    const c = this.ctx,
      t = c.currentTime + delay;
    const src = c.createBufferSource(),
      flt = c.createBiquadFilter(),
      g = c.createGain();
    src.buffer = this.noise;
    src.loop = true;
    flt.type = 'bandpass';
    flt.Q.value = 1.4;
    flt.frequency.setValueAtTime(300, t);
    flt.frequency.exponentialRampToValueAtTime(900 + 1900 * power, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.02 + 0.16 * power * power, t + dur * 0.96);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.16);
    src.connect(flt).connect(g).connect(sfxOut(c));
    src.start(t);
    src.stop(t + dur + 0.25);
  }
  /** The strike. quality 0 = pure … 1 = bad miss (duller, thuddier). */
  impact(kind: string, power: number, quality: number, vol = 1) {
    if (!this.ctx || !this.noise) return;
    const t = this.ctx.currentTime,
      p = (0.35 + 0.65 * power) * vol,
      pure = 1 - Math.min(1, quality);
    if (kind === 'putter') {
      this.tone(t, 0.07, 'sine', 950, 700, 0.18 * vol * (0.4 + power));
      this.burst(t, 0.03, 'bandpass', 1800, 900, 2, 0.08 * vol);
      return;
    }
    if (kind === 'driver' || kind === 'wood') {
      // hollow metal crack + ping
      this.burst(t, 0.07, 'highpass', 2600, 1200, 0.7, 0.55 * p);
      this.tone(t, 0.16, 'triangle', 2100 + 500 * pure, 1700, 0.3 * p * (0.3 + 0.7 * pure));
      this.tone(t, 0.1, 'sine', 3400, 3000, 0.12 * p * pure);
      this.tone(t, 0.09, 'sine', 190, 70, 0.5 * p);
    } else {
      // iron/wedge: sharp click + turf thump
      this.burst(t, 0.05, 'bandpass', 3200 * (0.6 + 0.4 * pure), 1500, 1.2, 0.6 * p);
      this.tone(t, 0.11, 'sine', 170, 60, 0.6 * p);
      this.burst(t + 0.008, 0.14, 'lowpass', 700, 200, 0.6, 0.3 * p * (0.5 + quality));
    }
  }
  /** Soft sneaker step on concrete/dirt; louder and sharper when running. */
  step(v = 0.5) {
    if (!this.ctx || !this.noise) return;
    const t = this.ctx.currentTime;
    this.burst(t, 0.05 + 0.03 * v, 'bandpass', 900 + 900 * v + Math.random() * 300, 400, 1.1, 0.025 + 0.05 * v);
    this.tone(t, 0.04, 'sine', 140, 80, 0.03 + 0.04 * v);
  }
  /** Cartoon head bonk: hollow knock + a little wobble tone. */
  bonk(vol = 1) {
    if (!this.ctx || !this.noise) return;
    const t = this.ctx.currentTime;
    this.tone(t, 0.12, 'square', 520, 300, 0.12 * vol);
    this.tone(t, 0.18, 'sine', 900, 420, 0.22 * vol);
    this.burst(t, 0.04, 'bandpass', 2400, 1200, 2, 0.25 * vol);
    this.tone(t + 0.12, 0.35, 'triangle', 1400, 1100, 0.05 * vol);
  }
  /** Body hitting the ground. */
  thud(vol = 0.5) {
    if (!this.ctx || !this.noise) return;
    const t = this.ctx.currentTime;
    this.tone(t, 0.12, 'sine', 95, 45, 0.4 * vol);
    this.burst(t, 0.1, 'lowpass', 420, 120, 0.7, 0.2 * vol);
  }
  splash(vol = 0.6) {
    if (!this.ctx || !this.noise) return;
    const t = this.ctx.currentTime;
    this.burst(t, 0.5, 'bandpass', 1800, 500, 0.6, 0.35 * vol, 0.01);
    this.burst(t + 0.05, 0.7, 'highpass', 4000, 2000, 0.4, 0.12 * vol, 0.03);
  }
  /** The ball in the cup: a plastic knock on the wall (soft) or the hollow rattle on the bottom (hard). */
  cup(hard: boolean, vol = 0.6) {
    if (!this.ctx || !this.noise) return;
    const t = this.ctx.currentTime;
    this.tone(t, hard ? 0.11 : 0.05, 'triangle', hard ? 520 : 900, hard ? 260 : 700, (hard ? 0.3 : 0.16) * vol);
    this.burst(t, hard ? 0.07 : 0.03, 'bandpass', hard ? 1400 : 2600, hard ? 700 : 1800, 2.5, (hard ? 0.14 : 0.07) * vol);
  }
  land(vol = 0.5) {
    if (!this.ctx || !this.noise) return;
    const t = this.ctx.currentTime;
    this.tone(t, 0.09, 'sine', 120, 55, 0.25 * vol);
    this.burst(t, 0.08, 'lowpass', 500, 150, 0.6, 0.12 * vol);
  }
}

// ---------------------------------------------------------------- particles (turf, sand, tee chips)
export class Bursts {
  private N = 160;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private next = 0;
  private pts: THREE.Points;
  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(this.N * 3).fill(-999);
    this.col = new Float32Array(this.N * 3);
    this.vel = new Float32Array(this.N * 3);
    this.life = new Float32Array(this.N);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.055, vertexColors: true, sizeAttenuation: true }));
    this.pts.frustumCulled = false;
    scene.add(this.pts);
  }
  emit(at: THREE.Vector3, dir: THREE.Vector3, colors: string[], n: number, speed: number, up: number, spread: number) {
    const c = new THREE.Color();
    for (let k = 0; k < n; k++) {
      const i = (this.next = (this.next + 1) % this.N),
        sp = speed * (0.35 + Math.random() * 0.65);
      this.pos.set([at.x + (Math.random() - 0.5) * 0.06, at.y + 0.01, at.z + (Math.random() - 0.5) * 0.06], i * 3);
      this.vel.set(
        [dir.x * sp + (Math.random() - 0.5) * spread, up * (0.4 + Math.random() * 0.6), dir.z * sp + (Math.random() - 0.5) * spread],
        i * 3,
      );
      c.set(colors[k % colors.length]).multiplyScalar(0.8 + Math.random() * 0.4);
      this.col.set([c.r, c.g, c.b], i * 3);
      this.life[i] = 0.5 + Math.random() * 0.6;
    }
  }
  update(dt: number, groundY: (x: number, z: number) => number) {
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) continue;
      const j = i * 3;
      this.life[i] -= dt;
      this.vel[j + 1] -= 9.8 * dt;
      this.vel[j] *= 1 - 1.5 * dt;
      this.vel[j + 2] *= 1 - 1.5 * dt;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      const gy = groundY(this.pos[j], this.pos[j + 2]);
      if (this.pos[j + 1] < gy) {
        this.pos[j + 1] = gy + 0.01;
        this.vel[j] = this.vel[j + 1] = this.vel[j + 2] = 0;
      }
      if (this.life[i] <= 0) this.pos[j + 1] = -999;
    }
    this.pts.geometry.attributes.position.needsUpdate = true;
    this.pts.geometry.attributes.color.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- clubhead motion ribbon
export class Ribbon {
  private N = 14;
  private pts: THREE.Vector3[][] = [];
  private mesh: THREE.Mesh;
  private pos: Float32Array;
  private col: Float32Array;
  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(this.N * 2 * 3);
    this.col = new Float32Array(this.N * 2 * 4);
    const g = new THREE.BufferGeometry(),
      idx: number[] = [];
    for (let i = 0; i < this.N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false }),
    );
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  /** Feed the clubhead and a point up the shaft each frame while the club is moving fast; pass null to let it fade. */
  push(head: THREE.Vector3 | null, shaft: THREE.Vector3 | null, strength = 1) {
    if (head && shaft) {
      this.pts.unshift([head.clone(), shaft.clone(), new THREE.Vector3(strength, 0, 0)]);
      if (this.pts.length > this.N) this.pts.pop();
    } else if (this.pts.length) this.pts.pop();
    for (let i = 0; i < this.N; i++) {
      const p = this.pts[Math.min(i, this.pts.length - 1)],
        live = i < this.pts.length && this.pts.length > 1,
        a = live ? (1 - i / this.pts.length) ** 1.6 * 0.42 * p[2].x : 0;
      const h = p ? p[0] : ZERO,
        s = p ? p[1] : ZERO;
      this.pos.set([h.x, h.y, h.z, s.x, s.y, s.z], i * 6);
      this.col.set([1, 1, 1, a, 1, 1, 1, 0], i * 8);
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
    this.mesh.visible = this.pts.length > 1;
  }
}
const ZERO = new THREE.Vector3();

// ---------------------------------------------------------------- ball tracer
export class Tracer {
  private N = 600;
  private n = 0;
  private pos: Float32Array;
  private line: THREE.Line;
  private mat: THREE.LineBasicMaterial;
  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(this.N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setDrawRange(0, 0);
    this.mat = new THREE.LineBasicMaterial({ color: '#fff', transparent: true, opacity: 0.75, fog: false });
    this.line = new THREE.Line(g, this.mat);
    this.line.frustumCulled = false;
    scene.add(this.line);
  }
  reset() {
    this.n = 0;
    this.line.geometry.setDrawRange(0, 0);
    this.mat.opacity = 0.75;
  }
  add(p: THREE.Vector3) {
    if (this.n >= this.N) return;
    if (this.n) {
      // The ball only ever moves a little between frames. A big jump is the ball being put back (after water or out
      // of bounds), not flight: joining it up drew a long straight beam across the sky, so the trace ends there.
      const o = (this.n - 1) * 3;
      if (Math.hypot(p.x - this.pos[o], p.y - this.pos[o + 1], p.z - this.pos[o + 2]) > 12) {
        this.n = this.N;
        return;
      }
    }
    this.pos.set([p.x, p.y, p.z], this.n * 3);
    this.n++;
    this.line.geometry.setDrawRange(0, this.n);
    this.line.geometry.attributes.position.needsUpdate = true;
  }
  fade(dt: number) {
    this.mat.opacity = Math.max(0, this.mat.opacity - dt * 0.5);
  }
}
