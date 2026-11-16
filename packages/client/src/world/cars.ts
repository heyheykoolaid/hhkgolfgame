// Town cars, built in code in the game's own look: late-80s and 90s shapes with real proportions, sun-faded paint,
// dark glass and steel wheels. (Kenney's Car Kit was tried first and read as toys next to everything else.)
// Each is drawn from a side profile pushed out to the car's width, so the silhouette is right from every side.
import * as THREE from 'three';

export type CarKind = 'sedan' | 'wagon' | 'pickup' | 'van';
type Pts = [number, number][];
const SPEC: Record<CarKind, { w: number; wb: [number, number]; r: number; body: Pts; side: Pts; front: Pts; rear: Pts | null }> = {
  // body: the outline seen from the side, as [z along the car (+ = front), height]; side/front/rear: the glass
  sedan: {
    w: 1.74,
    wb: [1.42, -1.3],
    r: 0.31,
    body: [
      [-2.25, 0.3],
      [-2.27, 0.74],
      [-2.12, 0.88],
      [-1.3, 0.92],
      [-0.9, 1.38],
      [0.3, 1.41],
      [0.98, 0.95],
      [2.05, 0.86],
      [2.26, 0.7],
      [2.25, 0.3],
    ],
    side: [
      [-1.14, 0.97],
      [-0.82, 1.31],
      [0.26, 1.33],
      [0.82, 0.97],
    ],
    front: [
      [1.0, 0.965],
      [0.32, 1.425],
      [0.27, 1.4],
      [0.95, 0.94],
    ],
    rear: [
      [-1.32, 0.935],
      [-0.92, 1.395],
      [-0.87, 1.37],
      [-1.27, 0.91],
    ],
  },
  wagon: {
    w: 1.76,
    wb: [1.42, -1.32],
    r: 0.31,
    body: [
      [-2.3, 0.3],
      [-2.33, 0.86],
      [-2.18, 1.37],
      [0.3, 1.42],
      [0.98, 0.95],
      [2.05, 0.86],
      [2.26, 0.7],
      [2.25, 0.3],
    ],
    side: [
      [-2.06, 0.97],
      [-2.0, 1.31],
      [0.26, 1.34],
      [0.82, 0.97],
    ],
    front: [
      [1.0, 0.965],
      [0.32, 1.435],
      [0.27, 1.41],
      [0.95, 0.94],
    ],
    rear: [
      [-2.35, 0.92],
      [-2.2, 1.36],
      [-2.15, 1.34],
      [-2.3, 0.9],
    ],
  },
  pickup: {
    w: 1.86,
    wb: [1.55, -1.5],
    r: 0.36,
    body: [
      [-2.55, 0.4],
      [-2.56, 1.0],
      [-0.62, 1.0],
      [-0.56, 1.55],
      [0.5, 1.57],
      [1.08, 1.05],
      [2.25, 0.98],
      [2.5, 0.8],
      [2.5, 0.4],
    ],
    side: [
      [-0.44, 1.08],
      [-0.4, 1.47],
      [0.46, 1.49],
      [0.9, 1.08],
    ],
    front: [
      [1.1, 1.065],
      [0.52, 1.585],
      [0.47, 1.56],
      [1.05, 1.04],
    ],
    rear: [
      [-0.63, 1.1],
      [-0.585, 1.5],
      [-0.535, 1.5],
      [-0.58, 1.1],
    ],
  },
  van: {
    w: 1.92,
    wb: [1.6, -1.55],
    r: 0.36,
    body: [
      [-2.6, 0.4],
      [-2.62, 2.02],
      [1.25, 2.08],
      [1.92, 1.28],
      [2.45, 1.12],
      [2.6, 0.9],
      [2.6, 0.4],
    ],
    side: [
      [0.72, 1.34],
      [0.72, 1.94],
      [1.22, 1.96],
      [1.72, 1.34],
    ],
    front: [
      [1.94, 1.295],
      [1.27, 2.095],
      [1.22, 2.07],
      [1.89, 1.27],
    ],
    rear: null,
  },
};
/** A side outline pushed out to a width, centred on the car's middle. */
function slab(pts: Pts, width: number, bevel = 0) {
  const s = new THREE.Shape();
  pts.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: width - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    steps: 1,
  });
  g.rotateY(-Math.PI / 2); // the outline's z runs along the car, the push runs across it
  g.translate(width / 2 - bevel, 0, 0);
  return g;
}
const mats = new Map<string, THREE.MeshStandardMaterial>();
const mat = (c: string, r: number, m = 0) => {
  const k = c + r + m;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m }));
  return mats.get(k)!;
};
/** Paint that suits the town: nothing straight from the tube. */
export const CAR_PAINT = ['#8a4a40', '#6f7f6a', '#c9bfa6', '#56687a', '#a8683e', '#d9d4c8', '#4a4f55', '#7a6a48', '#3f5a4a'];

/** A parked or driving car, front toward +z, wheels on y = 0. `wheels` are the four wheel groups (spin their x). */
export function buildCar(kind: CarKind, color: string) {
  const S = SPEC[kind],
    g = new THREE.Group(),
    paint = mat(color, 0.55, 0.1),
    glass = mat('#1f262c', 0.25, 0.2),
    black = mat('#17181a', 0.8),
    steel = mat('#9a9c9e', 0.45, 0.5),
    add = (geo: THREE.BufferGeometry, m: THREE.Material, shadow = true) => {
      const o = new THREE.Mesh(geo, m);
      o.castShadow = shadow;
      o.receiveShadow = true;
      g.add(o);
      return o;
    },
    bx = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) =>
      add(new THREE.BoxGeometry(w, h, d).translate(x, y, z), m, false),
    z1 = Math.max(...S.body.map(p => p[0])),
    z0 = Math.min(...S.body.map(p => p[0]));
  add(slab(S.body, S.w, 0.05), paint);
  add(slab(S.side, S.w + 0.012), glass, false);
  add(slab(S.front, S.w - 0.24), glass, false);
  if (S.rear) add(slab(S.rear, S.w - 0.24), glass, false);
  // bumpers, lights, plates, a dark sill along the bottom
  const fy = S.body[S.body.length - 1][1] + 0.16;
  bx(S.w + 0.04, 0.2, 0.14, black, 0, fy, z1 + 0.02);
  bx(S.w + 0.04, 0.2, 0.14, black, 0, fy, z0 - 0.02);
  bx(S.w + 0.01, 0.1, z1 - z0 - 0.3, black, 0, S.body[0][1] + 0.03, (z0 + z1) / 2);
  for (const s of [-1, 1]) {
    bx(0.34, 0.13, 0.05, mat('#f1e9c8', 0.3), s * (S.w / 2 - 0.26), fy + 0.24, z1 + 0.01);
    bx(0.3, 0.13, 0.05, mat('#8a2420', 0.4), s * (S.w / 2 - 0.24), fy + 0.26, z0 - 0.01);
  }
  bx(0.5, 0.13, 0.03, mat('#e8e2d0', 0.6), 0, fy + 0.02, z0 - 0.1);
  if (kind === 'pickup') {
    // the bed: hollow it with a dark floor, and give it a tailgate line
    bx(S.w - 0.22, 0.04, 1.8, black, 0, 1.005, -1.6);
  }
  if (kind === 'van') bx(S.w + 0.014, 0.16, 3.4, mat('#b5651d', 0.6), 0, 1.15, -0.85); // a stripe down the side
  // wheels: a tyre, a steel rim and a hub
  const wheels: THREE.Group[] = [];
  for (const z of S.wb)
    for (const s of [-1, 1]) {
      const w = new THREE.Group(),
        tyre = new THREE.Mesh(new THREE.CylinderGeometry(S.r, S.r, 0.2, 16).rotateZ(Math.PI / 2), black),
        rim = new THREE.Mesh(new THREE.CylinderGeometry(S.r * 0.62, S.r * 0.62, 0.21, 12).rotateZ(Math.PI / 2), steel),
        hub = new THREE.Mesh(new THREE.CylinderGeometry(S.r * 0.2, S.r * 0.2, 0.23, 8).rotateZ(Math.PI / 2), black);
      tyre.castShadow = true;
      w.add(tyre, rim, hub);
      w.position.set(s * (S.w / 2 - 0.1), S.r, z);
      g.add(w);
      wheels.push(w);
    }
  return { root: g, wheels, length: z1 - z0, width: S.w };
}
