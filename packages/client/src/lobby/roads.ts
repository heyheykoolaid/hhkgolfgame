// The town's streets, in one place. Every flat street is described once here (a centre line, a width, a pavement
// width) and everything else is worked out from that list: the asphalt and the pavements (one mesh each, with no
// overlaps), the centre lines and stop lines, what is underfoot at any point, the kerbs for the physics, the
// stretches of pavement people walk and the map.
//
// The network is a set of loops, so nothing ends at a wall:
//   · the four streets round the plaza (x = ±14, z = ±14);
//   · Fairway Loop, a ring just inside the town's edge (x = ±40, z = ±40) that every one of those runs into;
//   · Shady Lane north of town (z = -68.5), joined to the ring by its west and east sides carried on north, and by
//     the gate road up the middle; the road to the first tee leaves the lane opposite the gate road;
//   · the south street carries on west through the gate and up the rise to the West Side (lobby/westside.ts), and
//     the north street east through the gate into Fun Land (lobby/funland.ts): those two build their own ground.
//
// world.ts imports this file, so nothing here may import from world.ts.
import * as THREE from 'three';

export interface Street {
  name: string;
  /** true: runs north–south at x = c; false: east–west at z = c */
  v: boolean;
  c: number;
  /** from a to b along its length (the asphalt's ends) */
  a: number;
  b: number;
  /** half the asphalt's width, and the width of the pavement either side */
  hw: number;
  wk: number;
}
/** [x0, z0, x1, z1] */
export type Rect = [number, number, number, number];

/** Fairway Loop's centre line: a square this far from the middle of town. */
export const RING = 40;
/** Shady Lane's centre line. */
export const LANE_Z = -68.5;
const HW = 2.8,
  OUT = RING + HW, // the ring's outer kerb
  INN = RING - HW, // and its inner one
  st = (name: string, v: boolean, c: number, a: number, b: number, hw = HW, wk = 1.2): Street => ({ name, v, c, a, b, hw, wk });
export const STREETS: Street[] = [
  st('Palm St', true, -14, -INN, INN),
  st('Gold St', true, 14, -INN, INN),
  st('North St', false, -14, -INN, 48), // on east through the gate into Fun Land
  st('South St', false, 14, -48, INN), // on west through the gate and up the rise to the West Side
  st('Fairway Loop', true, -RING, LANE_Z - 3.5, OUT),
  st('Fairway Loop', true, RING, LANE_Z - 3.5, OUT),
  st('Fairway Loop', false, -RING, -OUT, OUT),
  st('Fairway Loop', false, RING, -OUT, OUT),
  st('Gate Rd', true, 0, LANE_Z + 3.5, -OUT, 3.5, 2.4),
  st('Shady Lane', false, LANE_Z, -OUT, OUT, 3.5, 2.4),
  st('Gate Rd', true, 0, -114.4, LANE_Z - 3.5, 3.5, 2.4), // on to the first tee
];

const asphaltOf = (s: Street): Rect => (s.v ? [s.c - s.hw, s.a, s.c + s.hw, s.b] : [s.a, s.c - s.hw, s.b, s.c + s.hw]);
const ASPHALT: Rect[] = STREETS.map(asphaltOf);
const inRect = (r: Rect, x: number, z: number) => x > r[0] && x < r[2] && z > r[1] && z < r[3];
const onAsphalt = (x: number, z: number) => {
  for (const r of ASPHALT) if (inRect(r, x, z)) return true;
  return false;
};
/** Pavement as first drawn: a strip down each side of each street, carried a pavement's width past each end so
 *  corners close. Where it lies on a street's asphalt it is not pavement (see the grid below). */
const RAW_PAVE: Rect[] = [];
for (const s of STREETS)
  for (const e of [-1, 1]) {
    const o = s.c + e * (s.hw + s.wk / 2),
      h = s.wk / 2;
    RAW_PAVE.push(s.v ? [o - h, s.a - s.wk, o + h, s.b + s.wk] : [s.a - s.wk, o - h, s.b + s.wk, o + h]);
  }

/** How high a pavement stands: a proper kerb in town, nearly flush on Shady Lane (its shops' floors are that low). */
const kerb = (z: number) => (z < -44 ? 0.06 : 0.12);

// ---- the plan as a grid: every rectangle's edges cut the ground into cells; each cell is asphalt, pavement or neither
const uniq = (v: number[]) => [...new Set(v.map(n => Math.round(n * 1000) / 1000))].sort((p, q) => p - q);
const XS = uniq([...ASPHALT, ...RAW_PAVE].flatMap(r => [r[0], r[2]])),
  ZS = uniq([...ASPHALT, ...RAW_PAVE].flatMap(r => [r[1], r[3]]).concat([-44])),
  NX = XS.length - 1,
  NZ = ZS.length - 1,
  CELL = new Uint8Array(NX * NZ); // 1 asphalt, 2 pavement
for (let j = 0; j < NZ; j++)
  for (let i = 0; i < NX; i++) {
    const x = (XS[i] + XS[i + 1]) / 2,
      z = (ZS[j] + ZS[j + 1]) / 2;
    if (onAsphalt(x, z)) CELL[j * NX + i] = 1;
    else for (const r of RAW_PAVE) if (inRect(r, x, z)) CELL[j * NX + i] = 2;
  }
const runs = (kind: number): Rect[] => {
  const out: Rect[] = [];
  for (let j = 0; j < NZ; j++)
    for (let i = 0; i < NX; i++) {
      if (CELL[j * NX + i] !== kind) continue;
      const i0 = i;
      while (i + 1 < NX && CELL[j * NX + i + 1] === kind) i++;
      out.push([XS[i0], ZS[j], XS[i + 1], ZS[j + 1]]);
    }
  // rows that line up exactly join into one taller rectangle
  out.sort((p, q) => p[0] - q[0] || p[2] - q[2] || p[1] - q[1]);
  const merged: Rect[] = [];
  for (const r of out) {
    const m = merged[merged.length - 1];
    if (m && m[0] === r[0] && m[2] === r[2] && Math.abs(m[3] - r[1]) < 1e-6 && kerb((m[1] + m[3]) / 2) === kerb((r[1] + r[3]) / 2)) m[3] = r[3];
    else merged.push([...r] as Rect);
  }
  return merged;
};
/** The pavements as rectangles that neither overlap each other nor any asphalt (the kerbs, for the physics). */
export const PAVES: Rect[] = runs(2);
const ROADS: Rect[] = runs(1);

const find = (v: number[], u: number) => {
  let lo = 0,
    hi = v.length - 1;
  if (u <= v[0] || u >= v[hi]) return -1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (v[m] <= u) lo = m;
    else hi = m;
  }
  return lo;
};
/** What a street puts underfoot here: 'asphalt', 'paved' (its pavement) or '' (not a street). */
export function streetAt(x: number, z: number): '' | 'asphalt' | 'paved' {
  const i = find(XS, x),
    j = find(ZS, z);
  if (i < 0 || j < 0) return '';
  const k = CELL[j * NX + i];
  return k === 1 ? 'asphalt' : k === 2 ? 'paved' : '';
}
/** The height of the pavement here; 0 where there is none. */
export function paveY(x: number, z: number) {
  return streetAt(x, z) === 'paved' ? kerb(z) : 0;
}

/** Stretches of pavement to walk along: [runs north–south, its x (or z), from, to], each broken where a street crosses. */
export const SIDEWALKS: [boolean, number, number, number][] = (() => {
  const out: [boolean, number, number, number][] = [];
  for (const s of STREETS)
    for (const e of [-1, 1]) {
      const o = s.c + e * (s.hw + s.wk / 2);
      let from: number | null = null;
      for (let u = s.a - s.wk + 0.3; u <= s.b + s.wk; u += 0.2) {
        const on = (s.v ? u : o) > -92 && streetAt(s.v ? o : u, s.v ? u : o) === 'paved'; // (not on out of the district toward the course)
        if (on && from === null) from = u;
        if ((!on || u + 0.2 > s.b + s.wk) && from !== null) {
          if (u - from > 3) out.push([s.v, o, from, u - 0.2]);
          from = null;
        }
      }
    }
  return out;
})();

/** Build the streets: asphalt, pavements with their kerbs, centre lines and stop lines. */
export function buildStreets(asphalt: THREE.Material, pavers: THREE.Material) {
  const G = new THREE.Group();
  G.name = 'streets';
  const quads = (rects: Rect[], y: (z: number) => number, size: number, sides: boolean) => {
    const pos: number[] = [],
      uv: number[] = [],
      nor: number[] = [],
      quad = (p: number[][], n: number[], t: number[][]) => {
        for (const k of [0, 1, 2, 0, 2, 3]) {
          pos.push(...p[k]);
          uv.push(...t[k]);
          nor.push(...n);
        }
      };
    for (const [x0, z0, x1, z1] of rects) {
      const h = y((z0 + z1) / 2);
      quad(
        [
          [x0, h, z0],
          [x0, h, z1],
          [x1, h, z1],
          [x1, h, z0],
        ],
        [0, 1, 0],
        [
          [x0 / size, z0 / size],
          [x0 / size, z1 / size],
          [x1 / size, z1 / size],
          [x1 / size, z0 / size],
        ],
      );
      if (!sides) continue;
      // a kerb face wherever the pavement's edge is not against more pavement
      const edge = (ax: number, az: number, bx: number, bz: number, nx: number, nz: number) => {
        const L = Math.hypot(bx - ax, bz - az);
        for (let s = 0; s < L - 1e-6; s += 0.6) {
          const e = Math.min(L, s + 0.6),
            px = ax + ((bx - ax) * (s + e)) / 2 / L,
            pz = az + ((bz - az) * (s + e)) / 2 / L;
          if (streetAt(px + nx * 0.05, pz + nz * 0.05) === 'paved') continue;
          const p0 = [ax + ((bx - ax) * s) / L, az + ((bz - az) * s) / L],
            p1 = [ax + ((bx - ax) * e) / L, az + ((bz - az) * e) / L];
          quad(
            [
              [p0[0], h, p0[1]],
              [p0[0], 0, p0[1]],
              [p1[0], 0, p1[1]],
              [p1[0], h, p1[1]],
            ],
            [nx, 0, nz],
            [
              [s / size, 0],
              [s / size, h / size],
              [e / size, h / size],
              [e / size, 0],
            ],
          );
        }
      };
      edge(x1, z0, x0, z0, 0, -1);
      edge(x0, z1, x1, z1, 0, 1);
      edge(x0, z0, x0, z1, -1, 0);
      edge(x1, z1, x1, z0, 1, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  };
  const road = new THREE.Mesh(
    quads(ROADS, () => 0.02, 1.7, false),
    asphalt,
  );
  road.receiveShadow = true;
  const walk = new THREE.Mesh(quads(PAVES, kerb, 2.4, true), pavers);
  walk.receiveShadow = true;
  G.add(road, walk);

  // paint: a broken centre line down every street (not through junctions), and a stop line where one ends at another
  const paint: number[] = [],
    bar = (x: number, z: number, w: number, d: number) => {
      const x0 = x - w / 2,
        x1 = x + w / 2,
        z0 = z - d / 2,
        z1 = z + d / 2;
      paint.push(x0, 0.032, z0, x0, 0.032, z1, x1, 0.032, z1, x0, 0.032, z0, x1, 0.032, z1, x1, 0.032, z0);
    };
  STREETS.forEach((s, i) => {
    const others = STREETS.filter((_, j) => j !== i).map(asphaltOf),
      crossed = (u: number, pad: number) => {
        const x = s.v ? s.c : u,
          z = s.v ? u : s.c;
        return others.some(r => x > r[0] - pad && x < r[2] + pad && z > r[1] - pad && z < r[3] + pad);
      };
    for (let u = Math.ceil(s.a / 4) * 4 + 2; u < s.b - 1; u += 4)
      if (!crossed(u, 1.6)) bar(s.v ? s.c : u, s.v ? u : s.c, s.v ? 0.14 : 1.6, s.v ? 1.6 : 0.14);
    // a stop line across the arriving lane (drive on the right) at each end that meets another street
    for (const [end, dir] of [
      [s.a, 1],
      [s.b, -1],
    ]) {
      if (!crossed(end - dir * 0.4, 0)) continue; // this end is open road (a gate), not a junction
      let u = end;
      while (crossed(u, 0) && Math.abs(u - end) < 12) u += dir * 0.2; // step back out of the junction
      u += dir * 0.6;
      const side = -dir * (s.v ? -1 : 1) * (s.hw / 2); // the lane arriving at this end
      bar(s.v ? s.c + side : u, s.v ? u : s.c + side, s.v ? s.hw - 0.3 : 0.4, s.v ? 0.4 : s.hw - 0.3);
    }
  });
  // street-name blades on a post at the corners where streets meet: [x, z, the street along x, the street along z]
  const INS = INN - 0.6,
    post = new THREE.MeshStandardMaterial({ color: '#3a3835', roughness: 0.6, metalness: 0.5 }),
    blades = new Map<string, THREE.Material>(),
    blade = (name: string) => {
      let m = blades.get(name);
      if (!m) {
        const c = document.createElement('canvas');
        c.width = 512;
        c.height = 96;
        const x = c.getContext('2d')!;
        x.fillStyle = '#1f5a3a';
        x.fillRect(0, 0, 512, 96);
        x.strokeStyle = '#f4f1ea';
        x.lineWidth = 5;
        x.strokeRect(5, 5, 502, 86);
        x.fillStyle = '#f4f1ea';
        x.font = '900 60px "Barlow Condensed", Impact, sans-serif';
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText(name.toUpperCase(), 256, 51, 470);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        blades.set(name, (m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 })));
      }
      return m;
    };
  for (const [x, z, alongX, alongZ] of [
    [5.2, -INS, 'Fairway Loop', 'Gate Rd'],
    [-17.4, -INS, 'Fairway Loop', 'Palm St'],
    [17.4, INS, 'Fairway Loop', 'Gold St'],
    [-INS, 17.4, 'South St', 'Fairway Loop'],
    [INS, -17.4, 'North St', 'Fairway Loop'],
    [-INS, LANE_Z + 4.7, 'Shady Lane', 'Fairway Loop'],
    [INS, LANE_Z + 4.7, 'Shady Lane', 'Fairway Loop'],
    [17.4, -10.6, 'North St', 'Gold St'],
    [-17.4, 10.6, 'South St', 'Palm St'],
  ] as [number, number, string, string][]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.3, 8), post);
    p.position.set(x, 1.65, z);
    p.castShadow = true;
    G.add(p);
    [alongX, alongZ].forEach((name, k) => {
      for (const flip of [0, Math.PI]) {
        const b = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.3), blade(name));
        b.position.set(x, 3.1 - k * 0.34, z);
        b.rotation.y = (k ? Math.PI / 2 : 0) + flip;
        b.translateZ(0.012);
        G.add(b);
      }
    });
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(paint, 3));
  G.add(new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: '#e8d9a8' })));
  return G;
}
