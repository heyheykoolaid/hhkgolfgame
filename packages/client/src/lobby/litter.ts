// Litter: the town looks lived in. Cans, cups, bottles, paper, pizza boxes, bin bags and flattened cardboard lie along
// the kerbs, in the alley and the car park and round the fairground. All of it is one mesh built in code (coloured per
// vertex), scattered from a fixed seed so every player sees the same mess. Nothing here blocks walking.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SIDEWALKS, WEST_OFF, SHADY_OFF, groundY } from './world';

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
const tint = (g: THREE.BufferGeometry, c: string) => {
  const k = new THREE.Color(c),
    n = g.attributes.position.count,
    a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([k.r, k.g, k.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const CANS = ['#c8322c', '#2f6fb0', '#3f8a4a', '#c9ccd0', '#e0a526', '#1d1d1f'],
  PAPER = ['#e9e4d6', '#d8d2c2', '#cfc7b0', '#bfc4c8'];
type Kind = 'can' | 'cup' | 'bottle' | 'paper' | 'ball' | 'pizza' | 'bag' | 'card' | 'box';
/** One piece of rubbish, lying on y = 0 at its own origin. */
function piece(kind: Kind, r: () => number): THREE.BufferGeometry[] {
  const pick = (a: string[]) => a[Math.floor(r() * a.length)];
  switch (kind) {
    case 'can': {
      const crushed = r() < 0.4,
        g = new THREE.CylinderGeometry(0.033, 0.033, crushed ? 0.07 : 0.12, 7);
      if (r() < 0.75)
        g.rotateZ(Math.PI / 2).translate(0, 0.033, 0); // most have fallen over
      else g.translate(0, crushed ? 0.035 : 0.06, 0);
      return [tint(g, pick(CANS))];
    }
    case 'cup': {
      const g = new THREE.CylinderGeometry(0.045, 0.032, 0.12, 8),
        lid = new THREE.CylinderGeometry(0.048, 0.048, 0.012, 8).translate(0, 0.066, 0);
      const down = r() < 0.6;
      for (const x of [g, lid]) down ? x.rotateZ(Math.PI / 2 - 0.1).translate(0, 0.045, 0) : x.translate(0, 0.06, 0);
      return [tint(g, r() < 0.5 ? '#efe9dc' : '#c8322c'), tint(lid, '#f4f1ea')];
    }
    case 'bottle': {
      const body = new THREE.CylinderGeometry(0.032, 0.032, 0.16, 7),
        neck = new THREE.CylinderGeometry(0.012, 0.028, 0.08, 7).translate(0, 0.12, 0),
        c = pick(['#3f6a3a', '#6a4a22', '#4a6a7a']);
      for (const x of [body, neck]) x.rotateZ(Math.PI / 2).translate(0, 0.032, 0);
      return [tint(body, c), tint(neck, c)];
    }
    case 'paper': {
      const g = new THREE.BoxGeometry(0.21 + r() * 0.2, 0.004, 0.3 + r() * 0.12);
      g.rotateZ((r() - 0.5) * 0.12).translate(0, 0.012, 0);
      return [tint(g, pick(PAPER))];
    }
    case 'ball':
      return [tint(new THREE.IcosahedronGeometry(0.05 + r() * 0.03, 0).translate(0, 0.05, 0), pick(PAPER))];
    case 'pizza': {
      const open = r() < 0.4,
        base = new THREE.BoxGeometry(0.34, 0.035, 0.34).translate(0, 0.02, 0),
        out = [tint(base, '#c9ad84')];
      if (open) out.push(tint(new THREE.BoxGeometry(0.34, 0.012, 0.34).rotateX(-1.9).translate(0, 0.19, -0.2), '#b8996e'));
      return out;
    }
    case 'bag': {
      const s = 0.2 + r() * 0.12,
        g = new THREE.SphereGeometry(s, 7, 5).scale(1, 0.78, 1 + r() * 0.3).translate(0, s * 0.7, 0),
        knot = new THREE.ConeGeometry(s * 0.28, s * 0.4, 5).translate(0, s * 1.55, 0);
      const c = r() < 0.75 ? '#1b1b1e' : '#e6e3da';
      return [tint(g, c), tint(knot, c)];
    }
    case 'card':
      return [tint(new THREE.BoxGeometry(0.6 + r() * 0.4, 0.015, 0.45 + r() * 0.3).translate(0, 0.012, 0), '#a98458')];
    case 'box': {
      const w = 0.35 + r() * 0.25,
        h = 0.25 + r() * 0.2;
      return [tint(new THREE.BoxGeometry(w, h, w * 0.85).translate(0, h / 2, 0), r() < 0.5 ? '#a98458' : '#b89468')];
    }
  }
}
const SMALL: Kind[] = ['can', 'can', 'can', 'cup', 'cup', 'bottle', 'paper', 'paper', 'ball', 'ball', 'pizza'],
  BIG: Kind[] = ['bag', 'bag', 'card', 'box', 'box'];

export function buildLitter(scene: THREE.Scene) {
  const r = rng(90210),
    all: THREE.BufferGeometry[] = [],
    m4 = new THREE.Matrix4(),
    S = new THREE.Vector3(1.3, 1.3, 1.3), // (a touch over life size, or it vanishes at this camera's distance)
    put = (kind: Kind, x: number, z: number) => {
      const y = groundY(x, z) + 0.012,
        yaw = r() * Math.PI * 2;
      for (const g of piece(kind, r)) all.push((g.index ? g.toNonIndexed() : g).applyMatrix4(m4.makeRotationY(yaw).scale(S).setPosition(x, y, z))); // (one kind of geometry, or they won't merge)
    },
    /** n pieces in a rectangle; big: bin bags and boxes as well */
    patch = (x0: number, z0: number, x1: number, z1: number, n: number, big = 0) => {
      for (let i = 0; i < n; i++)
        put(r() < big ? BIG[Math.floor(r() * BIG.length)] : SMALL[Math.floor(r() * SMALL.length)], x0 + r() * (x1 - x0), z0 + r() * (z1 - z0));
    },
    W = WEST_OFF.x;
  // the town's kerbs: a little all the way along, gathered where the wind leaves it
  for (const [v, off, a, b] of SIDEWALKS) {
    const n = Math.round((b - a) / 5);
    for (let i = 0; i < n; i++) {
      const u = a + r() * (b - a),
        w = off + (r() - 0.5) * 0.9;
      put(SMALL[Math.floor(r() * SMALL.length)], v ? w : u, v ? u : w);
    }
  }
  patch(-12, 8.5, 12, 11.5, 6); // round the plaza
  patch(-12, -11.5, 12, -8.5, 5);
  // the West Side: both kerbs of the street, the lounge's doorstep, the alley (where the bags pile up), the car park
  patch(-150 + W, 9.7, -50 + W, 10.7, 30);
  patch(-150 + W, 17.3, -50 + W, 18.3, 30);
  // Shady Lane: the lounge's doorstep, the alley (where the bags pile up), both kerbs of the lane
  const SX = SHADY_OFF.x,
    SZ = SHADY_OFF.z;
  patch(-86 + SX, 8.3 + SZ, -72 + SX, 9.6 + SZ, 5);
  patch(-89.8 + SX, -5 + SZ, -88.9 + SX, 7 + SZ, 9, 0.75);
  patch(-87.2 + SX, -5 + SZ, -86.3 + SX, 5 + SZ, 6, 0.6);
  patch(-30, -72.6, 46, -72, 14);
  patch(-30, -65, 46, -64.4, 14);
  patch(-100 + W, 20.5, -54 + W, 34.5, 26, 0.08);
  patch(-118 + W, 35.2, -62 + W, 37.6, 9);
  patch(-125 + W, -12.5, -80 + W, -10.5, 8, 0.3); // the back street
  // Fun Land: cups and paper wherever people queue
  patch(84, -6, 128, 12, 45);
  patch(150, -2, 168, 12, 8);
  // up the road from the gate
  patch(-5.8, -64, -3.8, -46, 4);
  patch(3.8, -64, 5.8, -46, 4);
  const g = mergeGeometries(all, false);
  if (!g) return;
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
  mesh.name = 'litter';
  mesh.receiveShadow = true;
  scene.add(mesh);
}
