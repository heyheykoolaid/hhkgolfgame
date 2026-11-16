// Two townsfolk out for an evening walk (world-feel.md §3): they circle the sidewalk round the plaza in opposite
// directions, for ever. Where each one is comes straight from the wall clock, so every player sees them in (nearly)
// the same place without anything being sent. They're scenery: you walk through them, and they don't react.
import * as THREE from 'three';
import { Golfer, stepLength } from '../characters/golfer';
import { ambience } from '../audio/ambience';

const HALF = 10.6, // the sidewalk ring between the plaza and the streets
  R = 1.6, // corner radius
  STRAIGHT = 2 * (HALF - R),
  ARC = (Math.PI / 2) * R,
  LAP = 4 * (STRAIGHT + ARC);
/** Point and heading at distance d along the ring (anticlockwise seen from above, starting mid-way along the south side). */
function ring(d: number, out: { x: number; z: number; yaw: number }) {
  d = ((d % LAP) + LAP) % LAP;
  const side = Math.floor(d / (STRAIGHT + ARC)),
    u = d - side * (STRAIGHT + ARC);
  let x: number, z: number, yaw: number; // side 0: along +x at z = +HALF
  if (u < STRAIGHT) {
    x = -(HALF - R) + u;
    z = HALF;
    yaw = Math.PI / 2;
  } else {
    const a = (u - STRAIGHT) / R; // 0 … π/2 round the corner
    x = HALF - R + Math.sin(a) * R;
    z = HALF - R + Math.cos(a) * R;
    yaw = Math.PI / 2 + a;
  }
  // rotate by a quarter turn per side
  const c = Math.cos((-side * Math.PI) / 2),
    s = Math.sin((-side * Math.PI) / 2);
  out.x = x * c - z * s;
  out.z = x * s + z * c;
  out.yaw = yaw + (side * Math.PI) / 2;
  return out;
}
const LOOKS = [
  // a retiree in a loud shirt and a bucket-brimmed cap; a neighbour in a tracksuit top
  {
    skin: '#c98d62',
    hair: '#d9d6cf',
    shirt: '#e9a23a',
    print: '#2f7a6b',
    pants: '#d9cdb2',
    shoes: '#f1ede4',
    sole: '#cfc7b6',
    cap: '#f1ede4',
    capStyle: 'front',
    stubble: true,
  },
  {
    skin: '#7a4a2e',
    hair: '#1b1310',
    shirt: '#7a2f8a',
    print: '#f1ede4',
    pants: '#2c2f38',
    shoes: '#c8452f',
    sole: '#f1ede4',
    cap: '#1d1d1f',
    capStyle: 'none',
    stubble: false,
  },
];

export function createStrollers(scene: THREE.Scene, groundY: (x: number, z: number) => number, surfaceOf: (x: number, z: number) => any) {
  const P = { x: 0, z: 0, yaw: 0 },
    pos = new THREE.Vector3();
  const who = LOOKS.map((look, i) => {
    const g = new Golfer(look as any);
    scene.add(g.root);
    return { g, dir: i ? -1 : 1, speed: i ? 1.5 : 1.15, offset: i * 31, x: 0, z: 0, lastStep: 0 };
  });
  function update(clock: number, cam: THREE.Camera) {
    const now = Date.now() / 1000;
    for (const w of who) {
      const d = (now * w.speed + w.offset) * w.dir;
      ring(d, P);
      const yaw = w.dir > 0 ? P.yaw : P.yaw + Math.PI,
        phase = (Math.abs(d) / stepLength(w.speed)) * Math.PI;
      w.x = P.x;
      w.z = P.z;
      w.g.root.position.set(P.x, groundY(P.x, P.z), P.z);
      w.g.root.rotation.set(0, yaw, 0);
      w.g.update({ mode: 'walk', speed: w.speed, phase, time: clock, s: 0, club: 'iron', showClub: false });
      const stepN = Math.floor(phase / Math.PI);
      if (stepN !== w.lastStep) {
        w.lastStep = stepN;
        ambience.step(surfaceOf(P.x, P.z), 0.25, { pos: pos.set(P.x, 0.1, P.z), cam });
      }
    }
  }
  return { update, who };
}
