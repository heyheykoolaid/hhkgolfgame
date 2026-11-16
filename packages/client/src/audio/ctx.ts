// One AudioContext for the whole game (browsers cap how many a page may open). Created on the first user gesture.
let ctx: AudioContext | null = null;
let white: AudioBuffer | null = null;

/** The shared context, or null before the first key press / click (or if the browser has no Web Audio). */
export function audioCtx(): AudioContext | null {
  return ctx;
}
/** Call from a user gesture so the browser allows sound. Safe to call often. */
export function wakeAudio(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx!.state === 'suspended') ctx!.resume().catch(() => {});
  } catch {
    ctx = null;
  }
  return ctx;
}
/** Two seconds of white noise, shared by everything that filters noise into a sound. */
export function whiteNoise(c: AudioContext): AudioBuffer {
  if (white && white.sampleRate === c.sampleRate) return white;
  const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate),
    d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return (white = b);
}

// ---------------- volume: everything plays through these, so the options menu (ui/options.ts) can turn it down
import { opts, onOptions } from '../ui/options';
const buses = new Map<AudioContext, { master: GainNode; sfx: GainNode }>();
function bus(c: AudioContext) {
  let b = buses.get(c);
  if (!b) {
    const master = c.createGain(),
      sfx = c.createGain();
    master.gain.value = opts.master;
    sfx.gain.value = opts.effects;
    sfx.connect(master).connect(c.destination);
    buses.set(c, (b = { master, sfx }));
  }
  return b;
}
/** Where game sounds (swings, footsteps, cards, the rolling game) connect instead of `c.destination`. */
export const sfxOut = (c: AudioContext): AudioNode => bus(c).sfx;
/** Where the ambience connects: under the master volume, but with its own level. */
export const masterOut = (c: AudioContext): AudioNode => bus(c).master;
onOptions(() => {
  for (const [c, b] of buses) {
    b.master.gain.setTargetAtTime(opts.master, c.currentTime, 0.05);
    b.sfx.gain.setTargetAtTime(opts.effects, c.currentTime, 0.05);
  }
});
