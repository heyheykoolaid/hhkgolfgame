// Ambience (world-feel.md §2 and §5): the sound of the place, all synthesized (no clear-licence recordings exist
// that Claude can fetch; see asset-audit.md). One instance for the whole game; the lobby and the course each call
// `ambience.update(...)` from their frame loop with their zone, and footsteps go through `ambience.step(surface, v)`.
//
//   the city      a low city hum, and far off: a siren, car horns, a bus's air brakes, a dog barking
//   base layer    wind that gusts, a far highway hum, evening crickets (kept sparse: the first mix was too busy)
//   mid layer     cars passing on the highway (they sweep across the stereo field), the plaza fountain, your cart
//   sparse layer  doves and small birds, a flock calling as it passes (world/skylife.ts), the jet, a far train horn
//
// Nothing here is synced between players: it's decoration. `ambience.gust` (0–1) is there for visuals to follow.
import * as THREE from 'three';
import { wakeAudio, whiteNoise, masterOut, sfxOut } from './ctx';
import { opts } from '../ui/options';
import { SKY_NOW } from '../world/skylife';
import { WIND } from '../world/wind';

export type Zone = 'town' | 'course' | 'moon';
export type Surface = 'concrete' | 'asphalt' | 'gravel' | 'grass' | 'green' | 'sand';
export type AmbientInput = {
  zone: Zone;
  cam: THREE.Camera;
  /** distance to the fountain (town), if there is one */
  fountain?: THREE.Vector3;
  /** my cart while I'm driving: speed in m/s and the throttle (−1…1) */
  cart?: { speed: number; throttle: number; drift?: number; kart?: boolean; engine?: { rpm: number; load: number; tone: number } | null } | null;
  /** 0–1: duck the bed (first-person blackjack, panels) */
  duck?: number;
  /** other players' carts that are moving: the nearest one is heard */
  carts?: { pos: THREE.Vector3; speed: number }[];
};

const MIX: Record<Zone, { wind: number; road: number; crickets: number; birds: number; cars: number }> = {
  town: { wind: 0.4, road: 1, crickets: 0.8, birds: 0.8, cars: 1 },
  course: { wind: 1.25, road: 0.4, crickets: 0.55, birds: 1.2, cars: 0.35 },
  moon: { wind: 0.12, road: 0, crickets: 0, birds: 0, cars: 0.2 }, // no air to carry much: a faint hiss in the helmet
};

/** The engine's partials (multiples of the firing note) and how loud each is in the low, middle and high rev bands:
 *  a lumpy idle, a growl through the middle, a scream at the top. */
const ENG_MULT = [0.5, 1, 2, 3, 4],
  ENG_HARM = [
    [0.35, 0.8, 0.25, 0.1, 0],
    [0, 0.45, 0.65, 0.4, 0.2],
    [0, 0, 0.35, 0.55, 0.6],
  ],
  ENG_CENTER = [1400, 4000, 7000];
function engBands(rpm: number): [number, number, number] {
  if (rpm <= ENG_CENTER[0]) return [1, 0, 0];
  if (rpm < ENG_CENTER[1]) {
    const t = (rpm - ENG_CENTER[0]) / (ENG_CENTER[1] - ENG_CENTER[0]);
    return [1 - t, t, 0];
  }
  if (rpm < ENG_CENTER[2]) {
    const t = (rpm - ENG_CENTER[1]) / (ENG_CENTER[2] - ENG_CENTER[1]);
    return [0, 1 - t, t];
  }
  return [0, 0, 1];
}
class Ambience {
  /** current gust strength, 0 (still) … 1 (a proper gust) */
  gust = 0;
  private c: AudioContext | null = null;
  private master!: GainNode;
  private n: Record<string, GainNode> = {};
  private windF!: BiquadFilterNode;
  private jetF!: BiquadFilterNode;
  private fountainP!: StereoPannerNode;
  private jetP!: StereoPannerNode;
  private whine!: OscillatorNode;
  private whine2!: OscillatorNode;
  private engOsc: OscillatorNode[] = [];
  private engGain: GainNode[] = [];
  private engF!: BiquadFilterNode;
  private oWhine!: OscillatorNode;
  private oPan!: StereoPannerNode;
  /** the ambience level from the options menu; 0 turns the bed and its one-shots off */
  private get on() {
    return opts.ambience > 0.01;
  }
  private lastUpdate = 0;
  private gustTo = 0.2;
  private gustT = 0;
  private t = {
    siren: 50 + Math.random() * 80,
    honk: 14 + Math.random() * 20,
    bark: 60 + Math.random() * 80,
    brake: 35 + Math.random() * 50,
    car: 15,
    bird: 10,
    dove: 40,
    horn: 150 + Math.random() * 200,
    flock: 3,
  };
  private fwd = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  constructor() {
    const wake = () => this.ensure();
    addEventListener('pointerdown', wake);
    addEventListener('keydown', wake);
    // if neither mode has updated for a moment (loading, a mode change), fade the bed out
    setInterval(() => {
      if (this.c && performance.now() - this.lastUpdate > 700) this.master.gain.setTargetAtTime(0, this.c.currentTime, 0.3);
    }, 500);
  }

  private ensure() {
    if (this.c) return;
    const c = wakeAudio();
    if (!c) return;
    this.c = c;
    this.build(c);
  }

  // ---------------------------------------------------------------- buffers written sample by sample
  private brown(c: AudioContext) {
    const N = c.sampleRate * 4,
      b = c.createBuffer(1, N, c.sampleRate),
      d = b.getChannelData(0);
    let v = 0;
    for (let i = 0; i < N; i++) {
      v = (v + (Math.random() * 2 - 1) * 0.02) * 0.998;
      d[i] = v * 3.2;
    }
    const X = Math.floor(c.sampleRate * 0.25); // crossfade the end into the start so the loop has no click
    for (let i = 0; i < X; i++) {
      const k = i / X;
      d[N - X + i] = d[N - X + i] * (1 - k) + d[i] * k;
    }
    return b;
  }
  /** A field cricket: chirps of `pulses` short tone bursts. The loop is a whole number of chirps. */
  private cricket(c: AudioContext, f: number, pulses: number, period: number, chirps: number) {
    const sr = c.sampleRate,
      N = Math.floor(sr * period * chirps),
      b = c.createBuffer(1, N, sr),
      d = b.getChannelData(0);
    const pl = 0.017,
      gap = 0.013;
    for (let k = 0; k < chirps; k++)
      for (let p = 0; p < pulses; p++) {
        const s0 = Math.floor((k * period + p * (pl + gap)) * sr),
          L = Math.floor(pl * sr),
          amp = 0.6 + 0.4 * (p / Math.max(1, pulses - 1));
        for (let i = 0; i < L && s0 + i < N; i++) {
          const e = Math.sin((Math.PI * i) / L);
          d[s0 + i] += Math.sin((2 * Math.PI * f * i) / sr) * e * e * amp;
        }
      }
    return b;
  }
  /** Tree crickets: a steady high trill, far off. */
  private trill(c: AudioContext) {
    const sr = c.sampleRate,
      N = sr * 2,
      b = c.createBuffer(1, N, sr),
      d = b.getChannelData(0);
    for (let i = 0; i < N; i++) {
      const t = i / sr,
        am = 0.5 + 0.5 * Math.sin(2 * Math.PI * 43 * t);
      d[i] = (Math.sin(2 * Math.PI * 3150 * t) * 0.6 + Math.sin(2 * Math.PI * 3320 * t) * 0.4) * am * am;
    }
    return b;
  }

  // ---------------------------------------------------------------- the graph
  private build(c: AudioContext) {
    const g = (v: number, to: AudioNode) => {
      const n = c.createGain();
      n.gain.value = v;
      n.connect(to);
      return n;
    };
    const loop = (buf: AudioBuffer, rate = 1) => {
      const s = c.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.playbackRate.value = rate;
      s.start(0, Math.random() * buf.duration);
      return s;
    };
    const filt = (type: BiquadFilterType, f: number, q = 0.7) => {
      const n = c.createBiquadFilter();
      n.type = type;
      n.frequency.value = f;
      n.Q.value = q;
      return n;
    };
    this.master = g(0, masterOut(c));
    const white = loop(whiteNoise(c)),
      brown = loop(this.brown(c));
    // wind: band of noise whose pitch and level follow the gusts, plus a leafy hiss on top in a gust
    this.windF = filt('bandpass', 420, 0.5);
    this.n.wind = g(0, this.master);
    white.connect(this.windF).connect(this.n.wind);
    this.n.leaves = g(0, this.master);
    white.connect(filt('highpass', 3800, 0.4)).connect(this.n.leaves);
    // the highway: a steady low rumble a long way off
    this.n.road = g(0, this.master);
    brown.connect(filt('lowpass', 150, 0.6)).connect(this.n.road);
    // the city's own hum: a soft mid rumble under everything, with a slow swell
    this.n.city = g(0, this.master);
    brown.connect(filt('bandpass', 240, 0.5)).connect(this.n.city);
    // crickets: three near voices, panned apart and slightly detuned, and a far trill
    this.n.crickets = g(0, this.master);
    const voices: [number, number, number, number, number][] = [
      [4350, 3, 0.52, -0.6, 0.05],
      [4720, 4, 0.61, 0.5, 0.04],
    ];
    for (const [f, pulses, period, pan, vol] of voices) {
      const p = c.createStereoPanner();
      p.pan.value = pan;
      loop(this.cricket(c, f, pulses, period, 6)).connect(g(vol, p));
      p.connect(this.n.crickets);
    }
    loop(this.trill(c))
      .connect(filt('lowpass', 4200, 0.5))
      .connect(g(0.012, this.n.crickets));
    // the fountain: bright splashing, placed by direction
    this.fountainP = c.createStereoPanner();
    this.n.fountain = g(0, this.master);
    white
      .connect(filt('bandpass', 2600, 0.35))
      .connect(this.fountainP)
      .connect(this.n.fountain);
    const bub = g(0, this.fountainP);
    brown.connect(filt('bandpass', 700, 1.2)).connect(bub);
    bub.gain.value = 1.4;
    // the jet: a soft roar that sweeps with distance
    this.jetF = filt('lowpass', 300, 0.4);
    this.jetP = c.createStereoPanner();
    this.n.jet = g(0, this.master);
    brown.connect(this.jetF).connect(this.jetP).connect(this.n.jet);
    // my cart: an electric motor whine and tyres on the ground
    this.whine = c.createOscillator();
    this.whine.type = 'sawtooth';
    this.whine2 = c.createOscillator();
    this.whine2.type = 'sine';
    this.n.whine = g(0, this.master);
    this.whine.connect(filt('lowpass', 900, 0.8)).connect(this.n.whine);
    this.whine2.connect(g(0.5, this.n.whine));
    this.whine.start();
    this.whine2.start();
    // a car's engine: five partials of the firing note (half, 1, 2, 3, 4 times), mixed by how hard it is revving, through
    // a filter that opens with revs and load. (The recipe of low, middle and high bands and the gearbox that drives the
    // revs are adapted from OpenUG2's synthesized engine, MIT; see vehicles/vehicles.ts.)
    this.engF = filt('lowpass', 600, 0.9);
    this.n.engine = g(0, this.master);
    this.engF.connect(this.n.engine);
    ENG_MULT.forEach((_, k) => {
      const o = c.createOscillator(),
        og = g(0, this.engF);
      o.type = k === 0 ? 'square' : k < 3 ? 'sawtooth' : 'triangle';
      o.connect(og);
      o.start();
      this.engOsc.push(o);
      this.engGain.push(og);
    });
    this.n.tyres = g(0, this.master);
    white.connect(filt('bandpass', 650, 0.6)).connect(this.n.tyres);
    // somebody else's cart, placed by direction
    this.oWhine = c.createOscillator();
    this.oWhine.type = 'sawtooth';
    this.oPan = c.createStereoPanner();
    this.oPan.connect(sfxOut(c));
    this.n.oWhine = g(0, this.oPan);
    this.oWhine.connect(filt('lowpass', 800, 0.8)).connect(this.n.oWhine);
    this.n.oTyres = g(0, this.oPan);
    white.connect(filt('bandpass', 650, 0.6)).connect(this.n.oTyres);
    this.oWhine.start();
    this.n.shots = g(1, this.master); // one-shots (birds, cars, the horn)
    this.n.steps = g(1, sfxOut(c)); // footsteps are game sounds, not ambience
  }

  // ---------------------------------------------------------------- one-shots
  private noiseShot(to: AudioNode, t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, peak: number, attack = 0.004) {
    const c = this.c!,
      s = c.createBufferSource(),
      f = c.createBiquadFilter(),
      g = c.createGain();
    s.buffer = whiteNoise(c);
    s.loop = true;
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(to);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }
  private chirp(to: AudioNode, t: number, dur: number, f0: number, f1: number, peak: number, type: OscillatorType = 'sine', vib = 0) {
    const c = this.c!,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    if (vib) {
      const l = c.createOscillator(),
        lg = c.createGain();
      l.frequency.value = 28;
      lg.gain.value = vib;
      l.connect(lg).connect(o.frequency);
      l.start(t);
      l.stop(t + dur + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.min(0.02, dur * 0.3));
    g.gain.setValueAtTime(Math.max(0.0002, peak), t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(to);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  private panned(pan: number, vol = 1) {
    const c = this.c!,
      p = c.createStereoPanner(),
      g = c.createGain();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.gain.value = vol;
    p.connect(g).connect(this.n.shots);
    return p;
  }
  /** A mourning dove: coo-OOO, oo, oo, oo. Soft, hollow, a little sad. */
  private dove(pan: number, vol: number) {
    const t = this.c!.currentTime + 0.05,
      to = this.panned(pan, vol),
      base = 440 + Math.random() * 40;
    this.chirp(to, t, 0.28, base * 0.93, base * 1.0, 0.035);
    this.chirp(to, t + 0.3, 0.55, base * 1.22, base * 1.08, 0.052);
    for (let i = 0; i < 3; i++) this.chirp(to, t + 1.15 + i * 0.62, 0.42, base * 1.02, base * 0.97, 0.042 - i * 0.006);
  }
  /** A small bird: a quick run of thin chirps (a sparrow or a swift, depending on the pitch). */
  private smallBird(pan: number, vol: number) {
    const to = this.panned(pan, vol),
      swift = Math.random() < 0.4,
      n = 2 + Math.floor(Math.random() * (swift ? 5 : 4));
    let t = this.c!.currentTime + 0.05;
    for (let i = 0; i < n; i++) {
      const f = swift ? 5600 + Math.random() * 1400 : 3000 + Math.random() * 1200,
        d = swift ? 0.07 : 0.05 + Math.random() * 0.05;
      this.chirp(to, t, d, f, f * (swift ? 0.72 : Math.random() < 0.5 ? 1.3 : 0.75), 0.03 + Math.random() * 0.02, 'sine', swift ? 0 : 90);
      t += d + (swift ? 0.03 : 0.04 + Math.random() * 0.09);
    }
  }
  /** One of the flock overhead: a short rough call, like a far crow or gull. */
  private call(pan: number, vol: number) {
    const to = this.panned(pan, vol),
      t = this.c!.currentTime + 0.05,
      f = 760 + Math.random() * 260,
      n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      this.chirp(to, t + i * 0.26, 0.17, f * 1.08, f * 0.86, 0.045, 'sawtooth', 60);
      this.noiseShot(to, t + i * 0.26, 0.15, 'bandpass', 1700, 1300, 3, 0.05, 0.02);
    }
  }
  /** A car going by on the highway: an engine note and tyre roar that rise, sweep across and fall away, dropping in
   *  pitch as it passes. (The first version was filtered noise alone, which sounded like a wave breaking.) */
  private carPass(vol: number) {
    const c = this.c!,
      t = c.currentTime + 0.1,
      dur = 4 + Math.random() * 3,
      dir = Math.random() < 0.5 ? -1 : 1,
      truck = Math.random() < 0.25,
      p = c.createStereoPanner(),
      out = c.createGain();
    p.pan.setValueAtTime(-0.75 * dir, t);
    p.pan.linearRampToValueAtTime(0.75 * dir, t + dur);
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(vol, t + dur * 0.48);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(p).connect(this.n.shots);
    const doppler = (param: AudioParam, f: number) => {
      param.setValueAtTime(f * 1.07, t);
      param.linearRampToValueAtTime(f * 1.05, t + dur * 0.42);
      param.linearRampToValueAtTime(f * 0.93, t + dur * 0.58);
      param.linearRampToValueAtTime(f * 0.9, t + dur);
    };
    // the engine: two close saw notes through a low-pass, so it growls instead of hissing
    const lp = c.createBiquadFilter(),
      eg = c.createGain();
    lp.type = 'lowpass';
    lp.frequency.value = truck ? 320 : 520;
    eg.gain.value = truck ? 0.085 : 0.05;
    lp.connect(eg).connect(out);
    for (const m of [1, 1.503]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      doppler(o.frequency, (truck ? 58 : 92 + Math.random() * 30) * m);
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
    // the tyres: a narrow band of road noise, much quieter than before
    const s2 = c.createBufferSource(),
      f = c.createBiquadFilter(),
      g = c.createGain();
    s2.buffer = whiteNoise(c);
    s2.loop = true;
    f.type = 'bandpass';
    f.Q.value = 1.6;
    doppler(f.frequency, truck ? 330 : 620);
    g.gain.value = truck ? 0.07 : 0.05;
    s2.connect(f).connect(g).connect(out);
    s2.start(t, Math.random());
    s2.stop(t + dur + 0.1);
  }
  /** A siren somewhere across town: a slow wail that drifts and fades. */
  private siren(vol: number) {
    const c = this.c!,
      t = c.currentTime + 0.1,
      dur = 7 + Math.random() * 5,
      o = c.createOscillator(),
      lfo = c.createOscillator(),
      lg = c.createGain(),
      lp = c.createBiquadFilter(),
      g = c.createGain(),
      p = c.createStereoPanner();
    o.type = 'triangle';
    o.frequency.value = 900;
    lfo.frequency.value = 0.28 + Math.random() * 0.1;
    lg.gain.value = 300;
    lfo.connect(lg).connect(o.frequency);
    lp.type = 'lowpass';
    lp.frequency.value = 1500;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.022 * vol, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const a = Math.random() * 1.4 - 0.7;
    p.pan.setValueAtTime(a, t);
    p.pan.linearRampToValueAtTime(a + (Math.random() - 0.5) * 0.8, t + dur);
    o.connect(lp).connect(g).connect(p).connect(this.n.shots);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.1);
    lfo.stop(t + dur + 0.1);
  }
  /** Someone leaning on a car horn, blocks away: one honk or two. */
  private honk(vol: number) {
    const c = this.c!,
      to = this.panned(Math.random() * 1.6 - 0.8, vol),
      lp = c.createBiquadFilter(),
      base = 380 + Math.random() * 90;
    lp.type = 'lowpass';
    lp.frequency.value = 1300;
    lp.connect(to);
    let t = c.currentTime + 0.1;
    for (let k = 0, n = Math.random() < 0.4 ? 2 : 1; k < n; k++) {
      const d = 0.18 + Math.random() * 0.4;
      for (const f of [base, base * 1.26]) {
        const o = c.createOscillator(),
          g = c.createGain();
        o.type = 'square';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.011, t + 0.02);
        g.gain.setValueAtTime(0.011, t + d);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.12);
        o.connect(g).connect(lp);
        o.start(t);
        o.stop(t + d + 0.2);
      }
      t += d + 0.16;
    }
  }
  /** A dog a few streets over: two or three barks. */
  private bark(vol: number) {
    const c = this.c!,
      to = this.panned(Math.random() * 1.6 - 0.8, vol),
      n = 2 + Math.floor(Math.random() * 3);
    let t = c.currentTime + 0.1;
    for (let k = 0; k < n; k++) {
      const o = c.createOscillator(),
        bp = c.createBiquadFilter(),
        g = c.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(520, t);
      o.frequency.exponentialRampToValueAtTime(300, t + 0.13);
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 1.4;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.045, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(bp).connect(g).connect(to);
      o.start(t);
      o.stop(t + 0.2);
      this.noiseShot(to, t, 0.1, 'bandpass', 1300, 800, 1.2, 0.012, 0.01);
      t += 0.24 + Math.random() * 0.25;
    }
  }
  /** A bus or truck letting off its air brakes. */
  private airBrake(vol: number) {
    const to = this.panned(Math.random() * 1.6 - 0.8, vol),
      t = this.c!.currentTime + 0.1;
    this.noiseShot(to, t, 0.5, 'highpass', 2600, 1800, 0.5, 0.02, 0.02);
    this.noiseShot(to, t + 0.5, 0.25, 'highpass', 3000, 2200, 0.5, 0.012, 0.02);
  }
  /** A freight train's horn, miles away: long, long, short, long. */
  private horn() {
    const c = this.c!,
      t0 = c.currentTime + 0.1,
      lp = c.createBiquadFilter(),
      out = this.panned(Math.random() * 1.2 - 0.6, 1);
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.connect(out);
    let t = t0;
    for (const d of [1.6, 1.6, 0.5, 2.4]) {
      for (const f of [311, 370, 466]) {
        const o = c.createOscillator(),
          g = c.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * 0.985, t);
        o.frequency.linearRampToValueAtTime(f, t + 0.25);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.016, t + 0.18);
        g.gain.setValueAtTime(0.016, t + d - 0.25);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.5);
        o.connect(g).connect(lp);
        o.start(t);
        o.stop(t + d + 0.6);
      }
      t += d + 0.45;
    }
  }

  // ---------------------------------------------------------------- per frame
  /** Where a world point sits in the stereo field for this camera: −1 left … +1 right. */
  private panOf(cam: THREE.Camera, p: THREE.Vector3) {
    cam.getWorldDirection(this.fwd);
    const dx = p.x - cam.position.x,
      dz = p.z - cam.position.z,
      l = Math.hypot(dx, dz) || 1;
    return ((dx / l) * -this.fwd.z + (dz / l) * this.fwd.x) / (Math.hypot(this.fwd.x, this.fwd.z) || 1);
  }

  update(dt: number, inp: AmbientInput) {
    this.lastUpdate = performance.now();
    // gusts run even before sound is allowed, so visuals can follow them
    if ((this.gustT -= dt) <= 0) {
      this.gustT = 6 + Math.random() * 12;
      this.gustTo = Math.random() < 0.15 ? 0.6 + Math.random() * 0.3 : Math.random() * 0.3;
    }
    this.gust += (this.gustTo - this.gust) * (1 - Math.exp(-dt * 0.5));
    WIND.uGust.value = this.gust; // what you hear is what moves (world/wind.ts)
    WIND.uWT.value += dt;
    const c = this.c;
    if (!c) return;
    const now = c.currentTime,
      mix = MIX[inp.zone],
      set = (n: GainNode, v: number, tc = 0.4) => n.gain.setTargetAtTime(v, now, tc),
      duck = 1 - 0.6 * (inp.duck || 0);
    set(this.master, 2.1 * opts.ambience * duck, 0.25);
    // base layer
    set(this.n.wind, (0.04 + 0.16 * this.gust) * mix.wind);
    this.windF.frequency.setTargetAtTime(330 + 420 * this.gust, now, 0.6);
    set(this.n.leaves, 0.03 * this.gust * this.gust * mix.wind);
    set(this.n.road, (0.02 + 0.005 * Math.sin(now * 0.13) + 0.004 * Math.sin(now * 0.31)) * mix.road);
    set(this.n.city, (0.05 + 0.012 * Math.sin(now * 0.07)) * mix.cars, 1);
    set(this.n.crickets, 0.65 * mix.crickets, 1);
    // fountain
    if (inp.fountain) {
      const d = this.tmp.copy(inp.fountain).sub(inp.cam.position).length();
      set(this.n.fountain, 0.09 / (1 + (d * d) / 60), 0.15);
      this.fountainP.pan.setTargetAtTime(this.panOf(inp.cam, inp.fountain) * Math.min(1, d / 6) * 0.8, now, 0.1);
    } else set(this.n.fountain, 0);
    // the jet
    const jp = SKY_NOW.plane;
    if (jp) {
      const d = this.tmp.copy(jp).sub(inp.cam.position).length(),
        k = Math.max(0, 1 - d / 2600);
      set(this.n.jet, 0.5 * k * k, 0.8);
      this.jetF.frequency.setTargetAtTime(160 + 500 * k * k, now, 0.8);
      this.jetP.pan.setTargetAtTime(this.panOf(inp.cam, jp) * 0.7, now, 0.5);
    } else set(this.n.jet, 0, 1.5);
    // my cart
    const cart = inp.cart;
    if (cart) {
      const sp = Math.abs(cart.speed),
        load = Math.min(1, Math.abs(cart.throttle) * 0.7 + sp / 14);
      // the golf cart is electric (a rising whine); the go-kart has a little petrol engine: lower, rougher, and it
      // idles with a putter instead of falling silent
      const f = cart.kart ? 46 + sp * 15 + Math.abs(cart.throttle) * 14 + 5 * Math.sin(now * 31) : 70 + sp * 34;
      this.whine.frequency.setTargetAtTime(f, now, cart.kart ? 0.05 : 0.08);
      this.whine2.frequency.setTargetAtTime(f * (cart.kart ? 1.5 : 3.02), now, 0.08);
      const eng = cart.engine;
      if (eng) {
        // firing note of a four-cylinder (two bangs a turn), shifted for the car; idle lopes a little
        const f0 = (eng.rpm / 30) * eng.tone * (1 + (eng.rpm < 1600 ? 0.035 * Math.sin(now * 23) : 0)),
          w = engBands(eng.rpm);
        ENG_MULT.forEach((m, k) => {
          this.engOsc[k].frequency.setTargetAtTime(f0 * m, now, 0.03);
          this.engGain[k].gain.setTargetAtTime(w[0] * ENG_HARM[0][k] + w[1] * ENG_HARM[1][k] + w[2] * ENG_HARM[2][k], now, 0.05);
        });
        this.engF.frequency.setTargetAtTime(380 + eng.rpm * 0.42 * (0.55 + 0.45 * eng.load), now, 0.06);
        set(this.n.engine, 0.016 + 0.03 * eng.load + 0.012 * (eng.rpm / 8000), 0.06);
      } else set(this.n.engine, 0, 0.12);
      set(this.n.whine, eng ? 0 : cart.kart ? 0.02 + 0.04 * load : sp > 0.3 || Math.abs(cart.throttle) > 0.1 ? 0.006 + 0.016 * load : 0, 0.1);
      set(this.n.tyres, Math.min(0.05, sp * 0.005) * (cart.drift ? 3.2 : 1), 0.06); // a slide is loud
    } else {
      set(this.n.whine, 0, 0.15);
      set(this.n.engine, 0, 0.15);
      set(this.n.tyres, 0, 0.15);
    }
    // the nearest of the other carts
    let oc: { pos: THREE.Vector3; speed: number } | null = null,
      od = 45;
    for (const o of inp.carts || []) {
      const d = this.tmp.copy(o.pos).sub(inp.cam.position).length();
      if (Math.abs(o.speed) > 0.4 && d < od) {
        od = d;
        oc = o;
      }
    }
    if (oc) {
      const sp = Math.abs(oc.speed),
        k = 1 / (1 + (od * od) / 50);
      this.oWhine.frequency.setTargetAtTime(70 + sp * 34, now, 0.1);
      this.oPan.pan.setTargetAtTime(this.panOf(inp.cam, oc.pos) * 0.85, now, 0.1);
      set(this.n.oTyres, Math.min(0.05, sp * 0.005) * k * 1.5, 0.1);
      set(this.n.oWhine, 0.03 * k * Math.min(1, sp / 4), 0.1);
    } else {
      set(this.n.oTyres, 0, 0.2);
      set(this.n.oWhine, 0, 0.2);
    }
    if (!this.on) return;
    // sparse layer
    const T = this.t;
    if ((T.car -= dt) <= 0) {
      T.car = 22 + Math.random() * 45;
      this.carPass(mix.cars);
    }
    // the city, far off (sparser and fainter out on the course)
    if ((T.siren -= dt) <= 0) {
      T.siren = (110 + Math.random() * 170) / mix.cars;
      this.siren(mix.cars);
    }
    if ((T.honk -= dt) <= 0) {
      T.honk = (28 + Math.random() * 55) / mix.cars;
      this.honk(0.5 + Math.random() * 0.5);
    }
    if ((T.bark -= dt) <= 0) {
      T.bark = 90 + Math.random() * 150;
      this.bark((0.5 + Math.random() * 0.5) * mix.cars);
    }
    if ((T.brake -= dt) <= 0) {
      T.brake = (70 + Math.random() * 110) / mix.cars;
      this.airBrake(0.6 * mix.cars);
    }
    if ((T.bird -= dt) <= 0) {
      T.bird = (18 + Math.random() * 35) / mix.birds;
      this.smallBird(Math.random() * 1.8 - 0.9, 0.5 + Math.random() * 0.5);
    }
    if ((T.dove -= dt) <= 0) {
      T.dove = 70 + Math.random() * 110;
      this.dove(Math.random() * 1.6 - 0.8, 0.6 + Math.random() * 0.4);
    }
    if ((T.horn -= dt) <= 0) {
      T.horn = 240 + Math.random() * 260;
      this.horn();
    }
    if ((T.flock -= dt) <= 0) {
      T.flock = 4 + Math.random() * 6;
      for (const f of SKY_NOW.flocks) {
        const d = this.tmp.copy(f.pos).sub(inp.cam.position).length();
        if (d < 200 && Math.random() < 0.35) this.call(this.panOf(inp.cam, f.pos), Math.max(0.15, 1 - d / 230));
      }
    }
  }

  /** Where a one-shot at a world point should play: a node panned and faded by distance, or null if out of earshot. */
  private at(pos: THREE.Vector3, cam: THREE.Camera, reach: number, vol = 1): AudioNode | null {
    const c = this.c;
    if (!c) return null;
    const d = this.tmp.copy(pos).sub(cam.position).length();
    if (d > reach) return null;
    const p = c.createStereoPanner(),
      g = c.createGain();
    p.pan.value = Math.max(-1, Math.min(1, this.panOf(cam, pos) * Math.min(1, d / 4)));
    g.gain.value = (vol * (1 - d / reach)) / (1 + (d * d) / 60);
    p.connect(g).connect(this.n.steps);
    return p;
  }
  /** Wings: a flock taking off in a hurry. */
  flutter(pos: THREE.Vector3, cam: THREE.Camera, n: number) {
    const to = this.at(pos, cam, 45, 1.6);
    if (!to) return;
    const t = this.c!.currentTime;
    for (let b = 0; b < Math.min(n, 6); b++) {
      const t0 = t + Math.random() * 0.25,
        rate = 0.05 + Math.random() * 0.015;
      for (let k = 0; k < 14; k++)
        this.noiseShot(to, t0 + k * rate, 0.035, 'bandpass', 1300 + Math.random() * 900, 700, 0.9, 0.05 * (1 - k / 16), 0.006);
    }
    for (let k = 0; k < 3; k++) this.chirp(to, t + 0.1 + k * 0.13 + Math.random() * 0.05, 0.06, 3600 + Math.random() * 900, 2700, 0.03, 'sine', 120); // alarm cheeps
  }
  /** The cat: a short meow, or a sharper one when it's been startled. */
  meow(pos: THREE.Vector3, cam: THREE.Camera, startled: boolean) {
    const to = this.at(pos, cam, 30, 1.4);
    const c = this.c;
    if (!to || !c) return;
    const t = c.currentTime + 0.02,
      dur = startled ? 0.32 : 0.55,
      f = 620 + Math.random() * 120,
      o = c.createOscillator(),
      bp = c.createBiquadFilter(),
      g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 0.8, t);
    o.frequency.linearRampToValueAtTime(f * (startled ? 1.45 : 1.2), t + dur * 0.3);
    o.frequency.linearRampToValueAtTime(f * 0.72, t + dur);
    bp.type = 'bandpass'; // the mouth opening and closing: "m-e-ow"
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.linearRampToValueAtTime(2300, t + dur * 0.35);
    bp.frequency.linearRampToValueAtTime(900, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(startled ? 0.16 : 0.1, t + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(bp).connect(g).connect(to);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  /** A footstep on a surface. v: 0 (slow walk) … 1 (sprint). `from` places somebody else's step in the world. */
  step(surface: Surface, v = 0.5, from?: { pos: THREE.Vector3; cam: THREE.Camera }) {
    const c = this.c;
    if (!c) return;
    const there = from ? this.at(from.pos, from.cam, 28, 0.9) : null;
    if (from && !there) return;
    const t = c.currentTime,
      to = there || this.n.steps,
      r = Math.random;
    switch (surface) {
      case 'concrete':
        this.noiseShot(to, t, 0.05 + 0.03 * v, 'bandpass', 900 + 900 * v + r() * 300, 400, 1.1, 0.025 + 0.05 * v);
        this.chirp(to, t, 0.04, 140, 80, 0.03 + 0.04 * v);
        break;
      case 'asphalt':
        this.noiseShot(to, t, 0.06 + 0.03 * v, 'bandpass', 650 + 500 * v + r() * 200, 300, 0.9, 0.03 + 0.045 * v);
        this.noiseShot(to, t + 0.012, 0.03, 'highpass', 3500, 2500, 0.5, 0.006 + 0.01 * v); // grit under the sole
        this.chirp(to, t, 0.045, 120, 70, 0.03 + 0.04 * v);
        break;
      case 'gravel':
        for (let i = 0; i < 4; i++)
          this.noiseShot(
            to,
            t + i * 0.022 + r() * 0.012,
            0.035 + r() * 0.03,
            'bandpass',
            2200 + r() * 2600,
            1400,
            1.6,
            (0.07 + 0.11 * v) * (1 - i * 0.17),
          );
        this.noiseShot(to, t, 0.09, 'lowpass', 500, 200, 0.6, 0.02 + 0.03 * v);
        break;
      case 'grass':
        this.noiseShot(to, t, 0.11 + 0.04 * v, 'bandpass', 1500 + r() * 700, 700, 0.7, 0.012 + 0.022 * v, 0.02);
        this.chirp(to, t, 0.05, 95, 60, 0.012 + 0.02 * v);
        break;
      case 'green':
        this.noiseShot(to, t, 0.09, 'bandpass', 1100 + r() * 400, 600, 0.7, 0.007 + 0.012 * v, 0.02);
        this.chirp(to, t, 0.05, 90, 60, 0.015 + 0.02 * v);
        break;
      case 'sand':
        this.noiseShot(to, t, 0.16 + 0.05 * v, 'bandpass', 2600 + r() * 900, 900, 0.5, 0.035 + 0.05 * v, 0.03);
        this.noiseShot(to, t, 0.08, 'lowpass', 300, 120, 0.6, 0.02 + 0.02 * v);
        break;
    }
  }
}

export const ambience = new Ambience();
(window as any).__amb = ambience;
