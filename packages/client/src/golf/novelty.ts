// Pay-to-play extras on the course (money sinks): novelty balls (sold at the Pro Shop in threes, one shot each)
// and the mulligan's price. The balls' physics is shared/src/physics.ts BallKind.
import type { BallKind } from '@gh/shared';

export interface Novelty {
  k: Exclude<BallKind, ''>;
  /** what it's counted as in progress().items */
  item: string;
  name: string;
  /** for three */
  price: number;
  desc: string;
  icon: string;
}
export const NOVELTY: Novelty[] = [
  {
    k: 'lead',
    item: 'blead',
    name: 'Lead ball',
    price: 450,
    icon: '⚫',
    desc: "Heavy as sin. The wind can't touch it, and it stops dead where it lands.",
  },
  {
    k: 'bouncy',
    item: 'bbouncy',
    name: 'Rubber ball',
    price: 360,
    icon: '🔴',
    desc: 'Bounces like a dog toy. Try it on the granite at Boulder Peak.',
  },
  {
    k: 'smoke',
    item: 'bsmoke',
    name: 'Smoke tracer',
    price: 300,
    icon: '💨',
    desc: 'Flies like a normal ball and leaves a thick coloured cloud across the fairway.',
  },
];
export const noveltyOf = (k: string) => NOVELTY.find(n => n.k === k);
/** A mulligan costs 4% of the cash you're carrying, never under $200: rich players still feel it. */
export const mulliganPrice = (cash: number) => Math.max(200, Math.round((cash * 0.04) / 10) * 10);

import { audioCtx, sfxOut } from '../audio/ctx';
/** A gold or diamond club rings on a PERFECT strike: a struck-bell ping (diamond pitched higher). */
export function clubPing(set: string) {
  const c = audioCtx();
  if (!c || !set) return;
  const base = set === 'diamond' ? 2350 : 1660,
    t = c.currentTime + 0.01,
    out = sfxOut(c);
  for (const [m, v, d] of [
    [1, 0.22, 1.6],
    [2.76, 0.09, 0.9],
    [5.4, 0.04, 0.5],
  ]) {
    const o = c.createOscillator(),
      g = c.createGain();
    o.frequency.value = base * m;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0005, t + d);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + d + 0.05);
  }
}
