// Fun Land: the little roadside theme park through the town's east gates (lobby-design.md §6).
// Birdie Burger (the Street Dealer works out the back, by the washrooms), a mini putt course, a driving range and a
// go-kart track with a lap timer. The ground, buildings and track are built here; the mini putt tiles, the track-side
// props and the giant food are Kenney's CC0 kits, bundled in public/funland/kit.json (tools/funland/pack.py).
import * as THREE from 'three';
import { playSample } from '../audio/samples';
import { kartModel } from '../vehicles/vehicles';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M, box, cyl, textTex, photoM, tile, FUN, BOUND, type Collider } from './world';

// ---------------------------------------------------------------- the plan (world metres; +x is east, away from town)
// world.ts imports this file (for funSurface), so nothing at the top level here may read a value from world.ts.
const PLAZA = { x0: 45, x1: 73, z0: -22, z1: 22 }, // paved forecourt inside the gates
  LANE = { x0: 73, x1: 104.4, z0: -17, z1: -10.5 }, // the service road from the north gate to the kart pits
  JOINT = { x0: 54, x1: 64, z0: -4, z1: 4 }, // Birdie Burger; its front faces town (west), the yard is behind (east)
  PUTT = { x0: 73.5, x1: 104, z0: -47.6, z1: -17.4, s: 2.4 }, // mini putt: s = metres per kit tile
  RANGE = { x: 78, z0: 13, z1: 45, bays: 6 }, // hitting bays face east
  TRACK_W = 7;
/** The kart track, laid out like a small outdoor rental circuit: a long main straight past the pits and the stand, a
 *  fast right-hander at its end, then hairpins linked by short straights back to the start. It is drawn as straights
 *  joined by true arcs (the radius is each corner's third number), so the road can never fold over itself. */
const TRACK_CORNERS: [number, number, number][] = [
  // x, z, radius on the centre line — driven in this order (clockwise from above); the start line is on the first straight
  [109, -8, 7.5],
  [166, -8, 8],
  [166, -25, 7.5],
  [150, -25, 7.5],
  [150, -43, 7.5],
  [134, -43, 7.5],
  [134, -25, 5.8],
  [122, -25, 5.8],
  [122, -43, 6.2],
  [109, -43, 6.2],
];
const KART_BOOTH: [number, number] = [100.6, -8.6]; // beside the end of the lane, window facing it
const START_X = 151; // the start / finish line crosses the main straight here
interface Samp {
  x: number;
  z: number;
  tx: number;
  tz: number;
  bend: number; // 0 on a straight; ±1/radius in a corner (+ = turning right)
  mid?: boolean; // the middle of a corner
}
const SAMP: Samp[] = (() => {
  const C = TRACK_CORNERS,
    n = C.length,
    out: Samp[] = [];
  const dir = (a: number[], b: number[]) => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  // each corner's arc: where it leaves the straight coming in (A) and joins the one going out (B)
  const arcs = C.map((c, i) => {
    const d0 = dir(C[(i + n - 1) % n], c),
      d1 = dir(c, C[(i + 1) % n]),
      ang = Math.acos(Math.max(-1, Math.min(1, d0[0] * d1[0] + d0[1] * d1[1]))),
      t = c[2] * Math.tan(ang / 2);
    return {
      A: [c[0] - d0[0] * t, c[1] - d0[1] * t],
      B: [c[0] + d1[0] * t, c[1] + d1[1] * t],
      d0,
      d1,
      r: c[2],
      ang,
      sg: Math.sign(d0[0] * d1[1] - d0[1] * d1[0]),
    };
  });
  for (let i = 0; i < n; i++) {
    const a = arcs[i],
      b = arcs[(i + 1) % n],
      cx = a.A[0] - a.d0[1] * a.sg * a.r, // the arc's centre is a radius to the inside of where it starts
      cz = a.A[1] + a.d0[0] * a.sg * a.r,
      k = Math.max(2, Math.round(a.r * a.ang));
    for (let j = 0; j < k; j++) {
      const th = ((a.ang * j) / k) * a.sg,
        c = Math.cos(th),
        s = Math.sin(th),
        rx = a.A[0] - cx,
        rz = a.A[1] - cz;
      out.push({
        x: cx + rx * c - rz * s,
        z: cz + rx * s + rz * c,
        tx: a.d0[0] * c - a.d0[1] * s,
        tz: a.d0[0] * s + a.d0[1] * c,
        bend: a.sg / a.r,
        mid: j === k >> 1,
      });
    }
    const len = Math.hypot(b.A[0] - a.B[0], b.A[1] - a.B[1]),
      m = Math.max(1, Math.round(len));
    for (let j = 0; j < m; j++)
      out.push({ x: a.B[0] + (a.d1[0] * len * j) / m, z: a.B[1] + (a.d1[1] * len * j) / m, tx: a.d1[0], tz: a.d1[1], bend: 0 });
  }
  let s0 = 0; // start the list at the start line
  out.forEach((p, i) => {
    if (p.bend === 0 && Math.abs(p.z + 8) < 0.1 && Math.abs(p.x - START_X) < Math.abs(out[s0].x - START_X) + (out[s0].bend ? 99 : 0)) s0 = i;
  });
  return out.slice(s0).concat(out.slice(0, s0));
})();
const NS = SAMP.length;
/** Distance from the track's centre line, and which sample is nearest. */
function trackAt(x: number, z: number) {
  let bi = 0,
    bd = 1e9;
  for (let i = 0; i < NS; i++) {
    const d = (SAMP[i].x - x) ** 2 + (SAMP[i].z - z) ** 2;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  return { i: bi, d: Math.sqrt(bd) };
}
const inBox = (b: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1;
/** What the ground is at a spot in the park (null outside it): used for footsteps and for where grass grows. */
export function funSurface(x: number, z: number): 'paved' | 'track' | 'green' | 'grass' | null {
  if (x <= BOUND || x > FUN.x1 || Math.abs(z) > FUN.z) return null;
  if (inBox(PLAZA, x, z) || x < BOUND + 1.5) return 'paved';
  if (inBox(LANE, x, z)) return 'track';
  if (inBox(PUTT, x, z)) return 'green';
  if (x > RANGE.x - 4 && x < RANGE.x + 3 && z > RANGE.z0 - 1 && z < RANGE.z1 + 1) return 'paved';
  if (x > 103 && z < -2 && trackAt(x, z).d < TRACK_W / 2 + 0.9) return 'track';
  return 'grass';
}

// ---------------------------------------------------------------- the kit (Kenney models), loaded once
type Kit = Map<string, THREE.Object3D>;
let kitP: Promise<Kit> | null = null;
function loadKit(): Promise<Kit> {
  return (kitP ??= fetch(new URL('funland/kit.json', document.baseURI).href)
    .then(r => r.json())
    .then(async (j: Record<string, string>) => {
      const kit: Kit = new Map(),
        L = new GLTFLoader();
      await Promise.all(
        Object.entries(j).map(async ([name, b64]) => {
          const raw = atob(b64),
            u8 = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
          kit.set(name, (await L.parseAsync(u8.buffer, '')).scene);
        }),
      );
      return kit;
    })
    .catch(e => {
      console.warn('Fun Land kit not loaded', e);
      return new Map();
    }));
}
/** Many placed kit models flattened into one mesh per colour (a few draw calls instead of hundreds). */
class Baker {
  /** skin: a material for a kit colour (given uvs laid flat on each face, in metres), instead of the plain colour. */
  constructor(private skin?: (hex: string) => THREE.MeshStandardMaterial | null) {}
  private by = new Map<string, { g: THREE.BufferGeometry[]; m: THREE.MeshStandardMaterial }>();
  /** centre: put the model's footprint centre at (x, z) and its base on y (the racing kit's origins are off to one side). */
  add(src: THREE.Object3D | undefined, x: number, y: number, z: number, rot = 0, scale = 1, centre = false, skip?: (o: THREE.Object3D) => boolean) {
    if (!src) return;
    const root = new THREE.Group();
    root.add(src.clone(true));
    if (centre) {
      const b = new THREE.Box3().setFromObject(root);
      root.children[0].position.sub(new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2));
    }
    root.position.set(x, y, z);
    root.rotation.y = rot;
    root.scale.setScalar(scale);
    root.updateMatrixWorld(true);
    root.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || skip?.(o)) return;
      const mt = m.material as THREE.MeshStandardMaterial,
        key = '#' + mt.color.getHexString(),
        g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a);
      g.applyMatrix4(m.matrixWorld);
      {
        // uvs from where each face lies: floors by x and z, walls by their run and height
        const P = g.attributes.position,
          N = g.attributes.normal,
          uv = new Float32Array(P.count * 2);
        for (let i = 0; i < P.count; i++) {
          const ny = Math.abs(N.getY(i)),
            nx = Math.abs(N.getX(i)),
            nz = Math.abs(N.getZ(i));
          uv[i * 2] = ny > 0.6 || nz > nx ? P.getX(i) : P.getZ(i);
          uv[i * 2 + 1] = ny > 0.6 ? P.getZ(i) : P.getY(i);
        }
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      }
      let e = this.by.get(key);
      if (!e) this.by.set(key, (e = { g: [], m: this.skin?.(key) || new THREE.MeshStandardMaterial({ color: mt.color.clone(), roughness: 0.82 }) }));
      e.g.push(g);
    });
  }
  flush(into: THREE.Object3D) {
    const made: THREE.Mesh[] = [];
    for (const { g, m } of this.by.values()) {
      const mesh = new THREE.Mesh(mergeGeometries(g), m);
      mesh.castShadow = mesh.receiveShadow = true;
      into.add(mesh);
      made.push(mesh);
      for (const x of g) x.dispose();
    }
    this.by.clear();
    return made;
  }
}

// ---------------------------------------------------------------- mini putt: nine holes laid out from kit tiles
type Dir = 'N' | 'S' | 'E' | 'W';
const DV: Record<Dir, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
/** Each hole: the steps from the tee, and the kit piece on each straight cell ('' = the tile is chosen by the turn). */
const HOLES: { steps: Dir[]; tiles: string[]; hole?: string }[] = [
  { steps: ['S', 'S', 'S'], tiles: ['straight', 'bumpWalls'] },
  { steps: ['S', 'S', 'S', 'S'], tiles: ['narrowRound', 'straight', 'hillRound'], hole: 'holeRound' },
  { steps: ['S', 'S', 'S'], tiles: ['windmill', 'straight'] },
  { steps: ['S', 'E', 'S', 'S'], tiles: ['', '', 'straight'] },
  { steps: ['S', 'S', 'S', 'S'], tiles: ['tunnelDouble', 'straight', 'obstacleBlock'], hole: 'holeRound' },
  { steps: ['S', 'S', 'S'], tiles: ['castle', 'hillSquare'] },
  { steps: ['S', 'S', 'E', 'N', 'N'], tiles: ['straight', '', '', 'narrowSquare'] },
  { steps: ['S', 'S', 'S', 'S'], tiles: ['split', 'straight', 'tunnelNarrow'] },
  { steps: ['S', 'S', 'E', 'S', 'S'], tiles: ['narrowBlock', '', '', 'windmill'], hole: 'holeRound' },
];
/** Rotation that turns a piece open toward +z so it opens toward d. */
const faceRot = (d: [number, number]) => Math.atan2(d[0], d[1]);
/** Where each hole's tee and cup are, for the signs, the flags and (later) the game itself. */
export const PUTT_HOLES: { tee: [number, number]; cup: [number, number]; cells: { x: number; z: number; name: string; rot: number }[] }[] = HOLES.map(
  (h, n) => {
    const s = PUTT.s,
      ox = PUTT.x0 + 2.3 + (n % 5) * 6.05,
      oz = n < 5 ? PUTT.z0 + 1.7 : PUTT.z0 + 17.2;
    let cx = 0,
      cz = 0;
    const cells: { x: number; z: number; name: string; rot: number }[] = [];
    const at = () => ({ x: ox + cx * s, z: oz + cz * s });
    cells.push({ ...at(), name: 'end', rot: faceRot(DV[h.steps[0]]) });
    h.steps.forEach((d, i) => {
      cx += DV[d][0];
      cz += DV[d][1];
      const next = h.steps[i + 1];
      if (!next)
        cells.push({ ...at(), name: 'end', rot: faceRot([-DV[d][0], -DV[d][1]]) }); // a closed end: the real-size cup is added by putt.ts
      else if (next === d)
        cells.push({ ...at(), name: h.tiles[i] || 'straight', rot: d === 'E' || d === 'W' ? Math.PI / 2 : d === 'N' ? Math.PI : 0 });
      else {
        // a corner piece is open toward +z and +x; turn it until it opens back the way we came and on toward the next step
        const want = [[-DV[d][0], -DV[d][1]], DV[next]];
        let rot = 0;
        for (let k = 0; k < 4; k++) {
          const t = (k * Math.PI) / 2,
            open = [
              [Math.round(Math.sin(t)), Math.round(Math.cos(t))],
              [Math.round(Math.cos(t)), Math.round(-Math.sin(t))],
            ];
          if (want.every(w => open.some(o => o[0] === w[0] && o[1] === w[1]))) rot = t;
        }
        cells.push({ ...at(), name: 'corner', rot });
      }
    });
    const a = cells[0],
      b = cells[cells.length - 1];
    return { tee: [a.x, a.z], cup: [b.x, b.z], cells };
  },
);

/** Height of the felt where a mini putt tile is (0 elsewhere), so people stand on the course rather than in it. */
export function puttFloor(x: number, z: number) {
  if (x < PUTT.x0 || x > PUTT.x1 || z < PUTT.z0 || z > PUTT.z1) return 0;
  const h = PUTT.s / 2;
  for (const hole of PUTT_HOLES) for (const c of hole.cells) if (Math.abs(x - c.x) < h && Math.abs(z - c.z) < h) return PUTT_FLOOR;
  return 0;
}
const PUTT_FLOOR = 0.15;

// ---------------------------------------------------------------- small builders
const sign = (lines: Parameters<typeof textTex>[0], w: number, h: number, bg: string, tw = 512, th = 256) => {
  const t = textTex(lines, tw, th, bg);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, side: THREE.DoubleSide }));
};
function flat(w: number, d: number, m: THREE.Material, x: number, z: number, y: number) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), m);
  p.position.set(x, y, z);
  p.receiveShadow = true;
  return p;
}

export function buildFunLand(scene: THREE.Scene, colliders: Collider[]) {
  const G = new THREE.Group();
  G.name = 'funland';
  scene.add(G);
  const col = (x0: number, x1: number, z0: number, z1: number, tag = 'fun') => colliders.push({ x0, x1, z0, z1, tag });
  const cream = M('#efe6d2', 0.85),
    red = M('#c8452f', 0.7),
    dark = M('#2a2420', 0.8),
    wood = M('#8a6a45', 0.9),
    steel = M('#8d9296', 0.5, 0.4),
    white = M('#f1eee6', 0.8),
    bulbM = new THREE.MeshStandardMaterial({ color: '#fff1c0', emissive: '#ffcf70', emissiveIntensity: 1.6 });

  let fence: THREE.Mesh | null = null;
  // ---------------- ground: a kept lawn, the paved forecourt, the lane to the karts
  const lawnM = new THREE.MeshStandardMaterial({ map: photoM('meadow', '#8a8a46').map, color: '#b9d88a', roughness: 1 });
  G.add(tile(flat(FUN.x1 - BOUND + 70, FUN.z * 2, lawnM, (FUN.x1 + BOUND) / 2 + 35, 0, 0.012), 26));
  G.add(tile(flat(PLAZA.x1 - PLAZA.x0, PLAZA.z1 - PLAZA.z0, photoM('pavers', '#b9ad98'), (PLAZA.x0 + PLAZA.x1) / 2, 0, 0.03), 2.4));
  G.add(tile(flat(LANE.x1 - LANE.x0, LANE.z1 - LANE.z0, photoM('asphalt', '#55524c'), (LANE.x0 + LANE.x1) / 2, (LANE.z0 + LANE.z1) / 2, 0.035), 1.7));
  // the north-east street runs on through the gate to the forecourt
  for (const s of [-1]) G.add(tile(flat(8, 5.6, photoM('asphalt', '#55524c'), BOUND + 5, s * FUN.gateZ, 0.04), 1.7));

  // ---------------- the gate: one arch with bulbs, over the north-east street
  for (const s of [-1]) {
    const a = new THREE.Group(),
      face = sign(
        [
          { t: 'FUN LAND', s: 150, c: '#ffe9a8', b: true, y: 118 },
          { t: 'BURGERS  ·  MINI PUTT  ·  KARTS  ·  RANGE', s: 40, c: '#f1eee6', y: 212 },
        ],
        9.4,
        2.35,
        '#8a2f28',
        1024,
        256,
      );
    face.rotation.y = -Math.PI / 2;
    face.position.set(-0.24, 6.1, 0);
    const back = face.clone();
    back.rotation.y = Math.PI / 2;
    back.position.x = 0.24;
    a.add(
      box(0.5, 7.4, 0.5, red, 0, 3.7, -4.9),
      box(0.5, 7.4, 0.5, red, 0, 3.7, 4.9),
      box(0.44, 2.6, 10.3, M('#6a2420', 0.8), 0, 6.1, 0),
      face,
      back,
    );
    const bulbs: THREE.BufferGeometry[] = [];
    for (let i = 0; i <= 20; i++)
      for (const y of [4.7, 7.5]) for (const x of [-0.3, 0.3]) bulbs.push(new THREE.SphereGeometry(0.09, 6, 5).translate(x, y, -4.8 + i * 0.48));
    a.add(new THREE.Mesh(mergeGeometries(bulbs), bulbM));
    a.position.set(BOUND + 1.2, 0, s * FUN.gateZ);
    G.add(a);
    col(BOUND + 0.9, BOUND + 1.5, s * FUN.gateZ - 5.2, s * FUN.gateZ - 4.6);
    col(BOUND + 0.9, BOUND + 1.5, s * FUN.gateZ + 4.6, s * FUN.gateZ + 5.2);
  }
  // the park fence: posts and two rails round the outside, and along the town side between the gates
  {
    const posts: THREE.BufferGeometry[] = [],
      run = (x0: number, z0: number, x1: number, z1: number) => {
        const L = Math.hypot(x1 - x0, z1 - z0),
          n = Math.max(1, Math.round(L / 4)),
          a = Math.atan2(x1 - x0, z1 - z0);
        for (let i = 0; i <= n; i++)
          posts.push(new THREE.BoxGeometry(0.16, 1.5, 0.16).translate(x0 + ((x1 - x0) * i) / n, 0.75, z0 + ((z1 - z0) * i) / n));
        for (const y of [0.55, 1.2]) posts.push(new THREE.BoxGeometry(0.07, 0.14, L).rotateY(a).translate((x0 + x1) / 2, y, (z0 + z1) / 2));
      },
      w = BOUND + 0.7,
      e = FUN.x1 + 0.3,
      g = FUN.gateZ,
      h = 5.2;
    run(w, -FUN.z, e, -FUN.z);
    run(e, -FUN.z, e, FUN.z);
    run(e, FUN.z, w, FUN.z);
    run(w, -FUN.z, w, -g - h);
    run(w, -g + h, w, FUN.z);
    fence = new THREE.Mesh(mergeGeometries(posts), new THREE.MeshStandardMaterial({ color: '#f1eee6', roughness: 0.8, transparent: true }));
    fence.castShadow = true;
    G.add(fence);
  }

  // ---------------- Birdie Burger
  {
    const cx = (JOINT.x0 + JOINT.x1) / 2,
      w = JOINT.x1 - JOINT.x0,
      d = JOINT.z1 - JOINT.z0,
      B = new THREE.Group(),
      glass = new THREE.MeshStandardMaterial({ color: '#27323a', roughness: 0.15, metalness: 0.5 });
    B.position.set(cx, 0, 0);
    B.add(
      box(w, 3.4, d, cream, 0, 1.7, 0),
      box(w + 0.5, 0.7, d + 0.5, red, 0, 3.75, 0),
      box(w + 0.2, 0.12, d + 0.2, dark, 0, 4.16, 0),
      box(w + 0.04, 0.5, d + 0.04, red, 0, 0.25, 0),
    );
    // the front (west): big windows either side of the door, a striped awning, the sign on the roof
    for (const z of [-2.5, 2.5]) B.add(box(0.06, 1.7, 2.3, glass, -w / 2 - 0.02, 1.9, z));
    B.add(
      box(0.06, 2.3, 1.3, glass, -w / 2 - 0.02, 1.2, 0),
      box(0.1, 2.5, 0.1, steel, -w / 2 - 0.04, 1.25, -0.72),
      box(0.1, 2.5, 0.1, steel, -w / 2 - 0.04, 1.25, 0.72),
    );
    for (let i = 0; i < 16; i++) {
      const s = box(1.5, 0.06, 0.5, i % 2 ? white : red, -w / 2 - 0.7, 3.05, -3.75 + i * 0.5);
      s.rotation.z = 0.32;
      B.add(s);
    }
    const sg = sign(
      [
        { t: 'BIRDIE BURGER', s: 122, c: '#ffe9a8', b: true, y: 112 },
        { t: 'flame-grilled since 1962', s: 44, c: '#f1eee6', y: 208 },
      ],
      7.4,
      1.85,
      '#8a2f28',
      1024,
      256,
    );
    sg.rotation.y = -Math.PI / 2;
    sg.position.set(-w / 2 + 0.6, 5.3, 0);
    B.add(
      sg,
      box(0.16, 2.1, 7.7, M('#6a2420', 0.8), -w / 2 + 0.72, 5.3, 0),
      box(0.14, 1.2, 0.14, steel, -w / 2 + 0.8, 4.6, -3),
      box(0.14, 1.2, 0.14, steel, -w / 2 + 0.8, 4.6, 3),
    );
    const menu = sign(
      [
        { t: 'TODAY', s: 54, c: '#ffe9a8', b: true, y: 52 },
        { t: 'Double Bogey Burger', s: 34, c: '#f1eee6', y: 108 },
        { t: 'Sand Trap Fries', s: 34, c: '#f1eee6', y: 150 },
        { t: 'Mulligan Shake', s: 34, c: '#f1eee6', y: 192 },
        { t: 'CLOSED · back soon', s: 28, c: '#e9b23a', y: 236 },
      ],
      1.5,
      0.75 * 1.5,
      '#1d1a17',
    );
    menu.rotation.y = -Math.PI / 2;
    menu.position.set(-w / 2 - 2.2, 1.55, 3.3);
    B.add(menu, box(0.1, 1.1, 0.1, dark, -w / 2 - 2.2, 0.55, 3.3));
    // the back (east): washroom doors, the staff door, a lamp, pipes
    const door = (z: number, label: string, c: string) => {
      const p = sign([{ t: label, s: 78, c: '#f1eee6', b: true, y: 150 }], 0.8, 0.26, c, 512, 256);
      p.rotation.y = Math.PI / 2;
      p.position.set(w / 2 + 0.05, 2.32, z);
      B.add(box(0.07, 2.1, 0.95, M('#5a2c22', 0.7), w / 2 + 0.02, 1.05, z), p, box(0.05, 0.1, 0.05, steel, w / 2 + 0.08, 1.05, z + 0.34));
    };
    door(-2.6, 'RESTROOM', '#2b4a52');
    door(-1.2, 'RESTROOM', '#2b4a52');
    door(2.5, 'STAFF ONLY', '#5a1d18');
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), bulbM);
    lamp.position.set(w / 2 + 0.3, 2.9, 0.9);
    B.add(lamp, box(0.3, 0.06, 0.06, dark, w / 2 + 0.15, 2.95, 0.9), cyl(0.06, 0.06, 3.3, 6, steel, w / 2 + 0.1, 1.65, 3.7));
    G.add(B);
    col(JOINT.x0, JOINT.x1, JOINT.z0, JOINT.z1, 'wall');
    // the yard out the back: dumpster, crates, a chain-link fence on the north and east sides (open to the south)
    const yard = new THREE.Group(),
      link = new THREE.MeshStandardMaterial({
        color: '#9aa0a4',
        roughness: 0.6,
        metalness: 0.3,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
      });
    yard.add(flat(7, 10, photoM('asphalt', '#55524c'), JOINT.x1 + 3.5, 0, 0.045));
    yard.add(box(2.1, 1.25, 1.2, M('#3b5a3a', 0.7), JOINT.x1 + 3.6, 0.72, -3.6), box(2.2, 0.1, 1.3, M('#2c452c', 0.7), JOINT.x1 + 3.6, 1.4, -3.6));
    yard.add(
      box(0.7, 0.5, 0.7, wood, JOINT.x1 + 5.6, 0.25, -1.4),
      box(0.7, 0.5, 0.7, wood, JOINT.x1 + 5.5, 0.75, -1.5),
      box(0.7, 0.5, 0.7, wood, JOINT.x1 + 5.8, 0.25, -0.5),
    );
    yard.add(
      cyl(0.3, 0.3, 0.9, 12, M('#4a5560', 0.6, 0.3), JOINT.x1 + 1, 0.45, 3.6),
      cyl(0.3, 0.3, 0.9, 12, M('#4a5560', 0.6, 0.3), JOINT.x1 + 1.7, 0.45, 3.7),
    );
    const fz = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 2), link),
      fx = new THREE.Mesh(new THREE.PlaneGeometry(10, 2), link);
    fz.position.set(JOINT.x1 + 3.3, 1, -5);
    fx.rotation.y = Math.PI / 2;
    fx.position.set(JOINT.x1 + 6.6, 1, 0);
    yard.add(fz, fx);
    for (const [x, z] of [
      [0, -5],
      [3.3, -5],
      [6.6, -5],
      [6.6, -1.7],
      [6.6, 1.7],
      [6.6, 5],
    ])
      yard.add(cyl(0.05, 0.05, 2.1, 6, steel, JOINT.x1 + x, 1.05, z));
    G.add(yard);
    col(JOINT.x1, JOINT.x1 + 6.7, -5.15, -4.85);
    col(JOINT.x1 + 6.45, JOINT.x1 + 6.75, -5, 5);
    col(JOINT.x1 + 2.5, JOINT.x1 + 4.7, -4.3, -2.9);
    col(JOINT.x1 + 5.1, JOINT.x1 + 6.2, -1.9, -0.1);
    // the forecourt: three tables under striped umbrellas
    for (const [x, z] of [
      [49.5, -6],
      [49.5, 6],
      [50.5, 0],
    ]) {
      const t = new THREE.Group();
      t.position.set(x, 0.03, z);
      t.add(cyl(0.75, 0.75, 0.06, 16, white, 0, 0.76, 0), cyl(0.05, 0.05, 2.5, 6, steel, 0, 1.25, 0));
      const um = new THREE.Mesh(
        new THREE.ConeGeometry(1.5, 0.55, 12, 1, true),
        new THREE.MeshStandardMaterial({ color: '#c8452f', roughness: 0.8, side: THREE.DoubleSide, flatShading: true }),
      );
      um.position.y = 2.5;
      um.castShadow = true;
      t.add(um);
      for (let k = 0; k < 4; k++)
        t.add(cyl(0.2, 0.2, 0.46, 10, red, Math.cos((k * Math.PI) / 2 + 0.6) * 1.1, 0.23, Math.sin((k * Math.PI) / 2 + 0.6) * 1.1));
      G.add(t);
      colliders.push({ x0: x - 0.8, x1: x + 0.8, z0: z - 0.8, z1: z + 0.8, tag: 'fun', r: 0.8 });
    }
  }

  // A ticket booth with an open serving window (an attendant stands inside): low front wall and counter, a header
  // over the window, a flat roof with a striped awning and a sign on top. yaw 0 faces +z.
  function booth(x: number, z: number, yaw: number, paint: string, signBg: string, title: string, sub: string) {
    const b = new THREE.Group(),
      wall = M(paint, 0.8),
      inside = M('#4a4038', 0.9);
    b.position.set(x, 0, z);
    b.rotation.y = yaw;
    b.add(
      box(3.2, 0.08, 2.6, dark, 0, 0.04, 0),
      box(3.2, 2.5, 0.12, wall, 0, 1.25, -1.24),
      box(3.0, 2.4, 0.04, inside, 0, 1.25, -1.16),
      box(0.12, 2.5, 2.6, wall, -1.54, 1.25, 0),
      box(0.12, 2.5, 2.6, wall, 1.54, 1.25, 0),
      box(3.2, 1.05, 0.12, wall, 0, 0.525, 1.24),
      box(3.2, 0.4, 0.12, wall, 0, 2.3, 1.24),
      box(0.5, 1.05, 0.12, wall, -1.35, 1.575, 1.24),
      box(0.5, 1.05, 0.12, wall, 1.35, 1.575, 1.24),
      box(2.5, 0.07, 0.62, wood, 0, 1.08, 1.4),
      box(3.8, 0.16, 3.2, white, 0, 2.58, 0),
      box(0.5, 0.3, 0.34, dark, 0.75, 1.27, 1.4),
      box(0.3, 0.22, 0.22, M('#ffd27a', 0.5), -0.8, 1.23, 1.45),
    );
    for (let i = 0; i < 7; i++) {
      const s = box(3.6 / 7, 0.05, 1.0, i % 2 ? white : wall, -1.8 + (i + 0.5) * (3.6 / 7), 2.32, 1.95);
      s.rotation.x = 0.32;
      b.add(s);
    }
    const sg = sign(
      [
        { t: title, s: 120, c: '#ffe9a8', b: true, y: 120 },
        { t: sub, s: 44, c: '#f1eee6', y: 212 },
      ],
      3.6,
      0.9,
      signBg,
      1024,
      256,
    );
    sg.position.set(0, 3.2, 1.2);
    b.add(sg, box(0.1, 0.3, 0.1, steel, -1.5, 2.75, 1.2), box(0.1, 0.3, 0.1, steel, 1.5, 2.75, 1.2));
    G.add(b);
    col(x - 1.6, x + 1.6, z - 1.3, z + 1.3, 'wall');
  }

  // ---------------- mini putt: fence, hut and hole signs now; the tiles when the kit arrives
  {
    booth(PUTT.x0 + 27.4, PUTT.z0 + 20.5, 0, '#3f8f6a', '#2b6a4c', 'MINI PUTT', '9 holes · ask at the window');
    PUTT_HOLES.forEach((h, n) => {
      const p = sign([{ t: String(n + 1), s: 190, c: '#f1eee6', b: true, y: 190 }], 0.42, 0.42, '#c8452f', 256, 256);
      p.position.set(h.tee[0] - 1.6, 0.95, h.tee[1] - 0.4);
      p.rotation.y = Math.PI * 0.15;
      G.add(p, box(0.06, 0.8, 0.06, wood, h.tee[0] - 1.6, 0.4, h.tee[1] - 0.4));
    });
    G.add(tile(flat(PUTT.x1 - PUTT.x0, PUTT.z1 - PUTT.z0, photoM('gravel', '#a39a86'), (PUTT.x0 + PUTT.x1) / 2, (PUTT.z0 + PUTT.z1) / 2, 0.02), 3));
  }

  // ---------------- driving range: a roofed row of bays, distance boards and target rings down the field
  {
    const n = RANGE.bays,
      bw = (RANGE.z1 - RANGE.z0) / n,
      R = new THREE.Group(),
      mat = M('#2f7a4b', 0.95);
    R.add(tile(flat(7, RANGE.z1 - RANGE.z0 + 2, photoM('pavers', '#b9ad98'), RANGE.x - 0.5, (RANGE.z0 + RANGE.z1) / 2, 0.03), 2.4));
    R.add(box(4.6, 0.14, RANGE.z1 - RANGE.z0 + 1, M('#3a5a6a', 0.7), RANGE.x - 0.4, 3.05, (RANGE.z0 + RANGE.z1) / 2));
    for (let i = 0; i <= n; i++) {
      const z = RANGE.z0 + i * bw;
      R.add(
        box(0.14, 3, 0.14, white, RANGE.x - 2.4, 1.5, z),
        box(0.14, 3, 0.14, white, RANGE.x + 1.6, 1.5, z),
        box(3.2, 1.0, 0.08, M('#d8cfb8', 0.8), RANGE.x - 0.6, 0.5, z),
      );
      col(RANGE.x - 2.3, RANGE.x + 1.1, z - 0.08, z + 0.08);
      if (i < n) {
        const zc = z + bw / 2;
        R.add(box(1.6, 0.05, 1.6, mat, RANGE.x, 0.055, zc), cyl(0.2, 0.16, 0.3, 10, M('#c8452f', 0.6), RANGE.x - 1.4, 0.18, zc + 1.3));
        const balls: THREE.BufferGeometry[] = [];
        for (let k = 0; k < 9; k++)
          balls.push(
            new THREE.SphereGeometry(0.045, 6, 5).translate(
              RANGE.x - 1.4 + Math.cos(k * 2.4) * 0.09,
              0.34 + (k % 3) * 0.02,
              zc + 1.3 + Math.sin(k * 2.4) * 0.09,
            ),
          );
        R.add(new THREE.Mesh(mergeGeometries(balls), white));
      }
    }
    const rs = sign(
      [
        { t: 'DRIVING RANGE', s: 112, c: '#ffe9a8', b: true, y: 116 },
        { t: 'opening soon', s: 46, c: '#f1eee6', y: 210 },
      ],
      6,
      1.5,
      '#2b4a52',
      1024,
      256,
    );
    rs.rotation.y = -Math.PI / 2;
    rs.position.set(RANGE.x - 2.75, 3.95, (RANGE.z0 + RANGE.z1) / 2);
    R.add(rs);
    for (const dist of [50, 100, 150, 200]) {
      const b = sign([{ t: String(dist), s: 170, c: '#1d1d1f', b: true, y: 185 }], 3.2 + dist * 0.012, 1.6 + dist * 0.006, '#f1eee6', 512, 256);
      b.rotation.y = -Math.PI / 2;
      b.position.set(RANGE.x + dist * 0.9144, 1.6 + dist * 0.004, RANGE.z1 - 2); // the boards are in yards
      R.add(b);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(2.4 + dist * 0.02, 3 + dist * 0.025, 28).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: dist % 100 ? '#f1eee6' : '#e9b23a' }),
      );
      ring.position.set(RANGE.x + dist * 0.9144, 0.03, (RANGE.z0 + RANGE.z1) / 2 + (dist % 100 ? -6 : 5));
      R.add(ring);
    }
    G.add(R);
  }

  // ---------------- the kart track: asphalt, kerbs in the corners, a start line and grid, a gantry
  {
    const pos: number[] = [],
      colr: number[] = [],
      nor: number[] = [],
      idx: number[] = [],
      road = new THREE.Color('#57534e'),
      edge = new THREE.Color('#d9d3c4'),
      kr = new THREE.Color('#c8452f'),
      kw = new THREE.Color('#f1eee6');
    // across the track: kerb | road | kerb (6 vertices per sample so the colours don't blend)
    for (let i = 0; i <= NS; i++) {
      const p = SAMP[i % NS],
        k = p.bend ? (Math.floor(i / 2) % 2 ? kr : kw) : edge,
        kwid = p.bend ? 0.7 : 0.18,
        offs = [-TRACK_W / 2 - kwid, -TRACK_W / 2, -TRACK_W / 2, TRACK_W / 2, TRACK_W / 2, TRACK_W / 2 + kwid],
        cs = [k, k, road, road, k, k];
      offs.forEach((o, j) => {
        pos.push(p.x - p.tz * o, 0.05, p.z + p.tx * o); // (−tz, tx) is the right-hand side
        colr.push(cs[j].r, cs[j].g, cs[j].b);
        nor.push(0, 1, 0);
      });
      if (i < NS)
        for (const j of [0, 2, 4]) {
          const a = i * 6 + j;
          idx.push(a, a + 1, a + 6, a + 1, a + 7, a + 6); // wound so the top faces up
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }));
    m.receiveShadow = true;
    G.add(m);
    // start / finish line, and six grid boxes behind it
    const cv = document.createElement('canvas');
    cv.width = 16;
    cv.height = 128;
    const x = cv.getContext('2d')!;
    for (let i = 0; i < 16; i++)
      for (let j = 0; j < 2; j++) {
        x.fillStyle = (i + j) % 2 ? '#111' : '#f4f1ea';
        x.fillRect(j * 8, i * 8, 8, 8);
      }
    const ct = new THREE.CanvasTexture(cv);
    ct.magFilter = THREE.NearestFilter;
    G.add(flat(1, TRACK_W, new THREE.MeshBasicMaterial({ map: ct }), START_X, -8, 0.062));
    const lineM = new THREE.MeshBasicMaterial({ color: '#f1eee6' });
    for (let k = 0; k < 6; k++) {
      const gx = START_X - 3.5 - k * 2.6,
        gz = -8 + (k % 2 ? 1.7 : -1.7);
      G.add(
        flat(0.14, 2.2, lineM, gx, gz, 0.06),
        flat(1.1, 0.14, lineM, gx - 0.55, gz - 1.1, 0.06),
        flat(1.1, 0.14, lineM, gx - 0.55, gz + 1.1, 0.06),
      );
    }
    // the gantry over the line: two posts clear of the kerbs, a truss, the sign, a row of lamps
    const gz0 = -8 - TRACK_W / 2 - 1.3,
      gz1 = -8 + TRACK_W / 2 + 1.3,
      gan = new THREE.Group();
    gan.add(
      box(0.3, 5.6, 0.3, steel, START_X, 2.8, gz0),
      box(0.3, 5.6, 0.3, steel, START_X, 2.8, gz1),
      box(0.3, 0.2, gz1 - gz0, steel, START_X, 5.5, -8),
      box(0.3, 0.2, gz1 - gz0, steel, START_X, 4.5, -8),
    );
    for (const f of [-1, 1]) {
      const sg = sign([{ t: 'START  ·  FINISH', s: 150, c: '#f1eee6', b: true, y: 172 }], gz1 - gz0 - 0.6, 0.85, '#1d1d1f', 1024, 256);
      sg.rotation.y = (f * Math.PI) / 2;
      sg.position.set(START_X + f * 0.17, 5, -8);
      gan.add(sg);
    }
    const lamps: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) lamps.push(new THREE.SphereGeometry(0.16, 8, 6).translate(START_X - 0.2, 4.25, -8 + (i - 2) * 0.9));
    gan.add(
      new THREE.Mesh(mergeGeometries(lamps), new THREE.MeshStandardMaterial({ color: '#7a1a14', emissive: '#c8301c', emissiveIntensity: 0.9 })),
    );
    G.add(gan);
    col(START_X - 0.2, START_X + 0.2, gz0 - 0.2, gz0 + 0.2);
    col(START_X - 0.2, START_X + 0.2, gz1 - 0.2, gz1 + 0.2);
    // the kart booth, on the north side of the lane where it meets the track
    booth(KART_BOOTH[0], KART_BOOTH[1], Math.PI, '#c8452f', '#1d1d1f', 'GO-KARTS', 'ask at the window · beat your best lap');
  }

  // what stands round the track is solid, for people and for karts: the barriers on the outside of every corner, the
  // grandstands, the pits and the marshals' tent (their models arrive later with the kit; their places are known now)
  {
    const right = (p: Samp, o: number) => ({ x: p.x - p.tz * o, z: p.z + p.tx * o });
    SAMP.forEach((p, i) => {
      if (!p.bend || i % 2) return;
      const b = right(p, -Math.sign(p.bend) * (TRACK_W / 2 + 2.3));
      if (trackAt(b.x, b.z).d > TRACK_W / 2 + 1.6) col(b.x - 0.75, b.x + 0.75, b.z - 0.75, b.z + 0.75);
    });
    for (const [x, z, hx, hz] of [
      [131, 1.6, 5.2, 2.2],
      [143, 1.6, 5.2, 2.2],
      [138, -16.2, 3.4, 2.4],
      [146, -16.2, 3.4, 2.4],
      [158, -16.5, 2.6, 2.6],
    ])
      col(x - hx, x + hx, z - hz, z + hz);
  }

  // ---------------- the kit models, once they have loaded
  const spin: THREE.Object3D[] = [];
  let puttMeshes: THREE.Mesh[] | null = null;
  loadKit().then(kit => {
    if (!kit.size) return;
    // mini putt: felt on the greens, painted timber on the borders
    const felt = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d')!,
        id = x.createImageData(128, 128);
      let sd = 5;
      for (let i = 0; i < 128 * 128; i++) {
        sd = (sd * 16807) % 2147483647;
        const n = 0.86 + (sd / 2147483647) * 0.28;
        id.data.set([38 * n, 150 * n, 96 * n, 255], i * 4);
      }
      x.putImageData(id, 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(1.6, 1.6);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const timber = photoM('timber', '#8a6a45').map!.clone();
    timber.wrapS = timber.wrapT = THREE.RepeatWrapping;
    timber.repeat.set(0.7, 0.7);
    timber.needsUpdate = true;
    const pb = new Baker(hex => {
        const c = new THREE.Color(hex),
          hsl = { h: 0, s: 0, l: 0 };
        c.getHSL(hsl);
        if (hsl.h > 0.3 && hsl.h < 0.5) return new THREE.MeshStandardMaterial({ map: felt, roughness: 1 });
        if (hsl.l < 0.3) return null; // the cup
        return new THREE.MeshStandardMaterial({ map: timber, color: hsl.h < 0.04 || hsl.h > 0.9 ? '#e0563c' : '#d9a066', roughness: 0.8 });
      }),
      bk = new Baker(),
      s = PUTT.s,
      inBlades = (o: THREE.Object3D) => {
        for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.name === 'blades') return true;
        return false;
      };
    for (const h of PUTT_HOLES) {
      for (const c of h.cells) {
        pb.add(kit.get(c.name), c.x, 0, c.z, c.rot, s, false, inBlades);
        if (c.name === 'windmill') {
          // the blades turn: they're kept out of the merged mesh and spun each frame
          const src = kit.get('windmill')?.getObjectByName('blades');
          if (src) {
            const holder = new THREE.Group(),
              b = src.clone(true);
            holder.position.set(c.x, 0, c.z);
            holder.rotation.y = c.rot;
            holder.scale.setScalar(s);
            holder.add(b);
            b.traverse(o => {
              const m = o as THREE.Mesh;
              if (m.isMesh) {
                m.castShadow = true;
                m.material = new THREE.MeshStandardMaterial({ map: timber, color: '#e0563c', roughness: 0.8 });
                const g = (m.geometry = m.geometry.clone()),
                  P = g.attributes.position,
                  uv = new Float32Array(P.count * 2);
                for (let i = 0; i < P.count; i++) uv.set([P.getX(i) * 2, P.getY(i) * 2], i * 2);
                g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
              }
            });
            G.add(holder);
            spin.push(b);
          }
        }
      }
    }
    puttMeshes = pb.flush(G);
    // ---- track furniture, placed the way a real circuit has it
    const right = (p: Samp, o: number) => ({ x: p.x - p.tz * o, z: p.z + p.tx * o });
    SAMP.forEach((p, i) => {
      if (!p.bend) return;
      const out = -Math.sign(p.bend); // which side is the outside of this corner (+ = right)
      // a tyre-wall of barriers round the outside of every corner, set back behind a strip of run-off
      const b = right(p, out * (TRACK_W / 2 + 2.3));
      if (trackAt(b.x, b.z).d > TRACK_W / 2 + 1.6)
        bk.add(kit.get(Math.floor(i / 2) % 2 ? 'barrierRed' : 'barrierWhite'), b.x, 0, b.z, Math.atan2(-p.tz, p.tx), 5.2, true);
      if (p.mid) {
        // one cone on the apex, and a light post behind the barriers
        const c = right(p, -out * (TRACK_W / 2 + 1.25)),
          l = right(p, out * (TRACK_W / 2 + 4));
        bk.add(kit.get('pylon'), c.x, 0, c.z, 0, 4, true);
        if (trackAt(l.x, l.z).d > TRACK_W / 2 + 3.5 && l.x < FUN.x1 - 1 && l.z > -FUN.z + 1)
          bk.add(kit.get('lightPostLarge'), l.x, 0, l.z, 0, 6, true);
      }
    });
    // spectators on the outside of the main straight, facing it; the pits and a marshals' tent on the infield
    bk.add(kit.get('grandStandCovered'), 131, 0, 0.6, Math.PI, 6, true);
    bk.add(kit.get('grandStandCovered'), 143, 0, 0.6, Math.PI, 6, true);
    bk.add(kit.get('pitsGarage'), 138, 0, -16.2, 0, 5.2, true);
    bk.add(kit.get('pitsOffice'), 146, 0, -16.2, 0, 5.2, true);
    bk.add(kit.get('tentRoof'), 158, 0, -16.5, 0, 5, true);
    for (const z of [-8 - TRACK_W / 2 - 1.3, -8 + TRACK_W / 2 + 1.3]) bk.add(kit.get('flagCheckers'), START_X + 0.8, 0, z, 0, 4.5, true);
    // the food on Birdie Burger's roof and tables
    const jx = (JOINT.x0 + JOINT.x1) / 2;
    bk.add(kit.get('burgerCheeseDouble'), jx + 1, 4.2, 0, 0.4, 9.5);
    bk.add(kit.get('fries'), jx + 2, 4.2, -2.9, 0.5, 5);
    bk.add(kit.get('soda'), jx + 2, 4.2, 2.9, 0, 4.6);
    bk.add(kit.get('hotDog'), 49.5, 0.82, -6, 0.5, 1.2);
    bk.add(kit.get('donutSprinkles'), 50.5, 0.82, 0, 0, 1.2);
    bk.flush(G);
  });

  // ---------------- lap timer
  const hud = document.createElement('div');
  hud.id = 'flap';
  hud.style.cssText =
    'position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:12;display:none;padding:8px 16px;border-radius:14px;background:rgba(22,16,10,.82);border:1px solid rgba(255,232,190,.2);color:#f6ecd8;font:800 20px "Barlow Condensed",Inter,sans-serif;letter-spacing:.04em;text-align:center;pointer-events:none';
  document.body.appendChild(hud);
  let best = 0;
  try {
    best = +(localStorage.getItem('gh.kartBest') || 0) || 0;
  } catch {}
  const lap = { on: false, t: 0, last: -1, prog: 0, laps: 0, lastLap: 0, flash: 0 };
  // the ghost: your best lap, sampled ten times a second as [x*20, z*20, yaw*100, …], kept in this browser
  const GHOST_DT = 0.1,
    rec: number[] = [];
  let ghostRun: number[] = [],
    rivals: { name: string; t: number }[] = [];
  try {
    const g = JSON.parse(localStorage.getItem('gh.kartGhost') || '[]');
    if (Array.isArray(g) && g.length < 9000 && g.every(v => typeof v === 'number')) ghostRun = g;
  } catch {}
  const ghost = kartModel('#f1eee6').root,
    ghostM = new THREE.MeshBasicMaterial({ color: '#dfeaf2', transparent: true, opacity: 0.3, depthWrite: false });
  ghost.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.material = ghostM;
    m.castShadow = m.receiveShadow = false;
  });
  ghost.userData.noBatch = true;
  ghost.visible = false;
  scene.add(ghost);
  const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

  return {
    group: G,
    /** The mini putt course's merged tile meshes (null until the kit has loaded): the putt game collides with them. */
    puttCourse: () => puttMeshes,
    /** The driving range for lobby/range.ts: the bays, and the target rings with what they score. */
    range: {
      ...RANGE,
      targets: [50, 100, 150, 200].map(d => ({
        x: RANGE.x + d * 0.9144,
        z: (RANGE.z0 + RANGE.z1) / 2 + (d % 100 ? -6 : 5),
        r: 3 + d * 0.025,
        pts: d * 2,
      })),
    },
    /** Fade the park fence (0..1): it stands between the camera and the ball on some mini putt holes. */
    fenceOpacity(o: number) {
      if (!fence) return;
      const m = fence.material as THREE.MeshStandardMaterial;
      m.opacity = o;
      m.depthWrite = o > 0.9;
      fence.castShadow = o > 0.9;
    },
    /** Things to press E at. `say` is the toast for the ones that aren't open yet. */
    spots: [
      { id: 'karts', x: KART_BOOTH[0], z: KART_BOOTH[1] - 2.6, r: 2.4, label: 'Ask Gus for a go-kart' },
      { id: 'putt', x: PUTT.x0 + 27.4, z: PUTT.z0 + 22.9, r: 2.4, label: 'Ask Dot for a round of mini putt' },
      ...Array.from({ length: RANGE.bays }, (_, i) => ({
        id: 'range',
        x: RANGE.x - 0.9,
        z: RANGE.z0 + ((i + 0.5) * (RANGE.z1 - RANGE.z0)) / RANGE.bays,
        r: 2.2,
        label: 'Hit a bucket of balls',
      })),
      { id: 'fun:burger', x: JOINT.x0 - 1.2, z: 0, r: 2.2, label: 'Birdie Burger', say: 'Birdie Burger is closed. Back soon.' },
    ] as { id: string; x: number; z: number; r: number; label: string; say?: string }[],
    /** The people in the booth windows: where they stand, which way they face, and what they wear. */
    attendants: [
      {
        x: PUTT.x0 + 27.4,
        z: PUTT.z0 + 20.8,
        yaw: 0,
        look: {
          skin: '#c98f6b',
          hair: '#3a2418',
          hairStyle: 'bob',
          body: 'female',
          shirt: '#3f8f6a',
          print: '#ffe9a8',
          top: 'button',
          pants: '#f1eee6',
          capStyle: 'none',
        },
      },
      {
        x: KART_BOOTH[0],
        z: KART_BOOTH[1] - 0.3,
        yaw: Math.PI,
        look: {
          skin: '#e2b08a',
          hair: '#8a8a8a',
          stubble: true,
          shirt: '#c8452f',
          print: '#1d1d1f',
          top: 'tee',
          pants: '#26282c',
          cap: '#1d1d1f',
          capStyle: 'front',
        },
      },
    ] as { x: number; z: number; yaw: number; look: Record<string, unknown> }[],
    /** Where a kart appears, facing the track: x, z, yaw. */
    kartSpawn: [START_X - 10.6, -8 + 1.7, Math.PI / 2] as [number, number, number],
    /** Per frame. car: the player's cart while they're driving it (else null). */
    /** Best laps of the other players in the park, for the board under the lap timer. */
    setRivals(list: { name: string; t: number }[]) {
      rivals = list
        .filter(r => r.t > 5 && r.t < 600)
        .sort((a, b) => a.t - b.t)
        .slice(0, 4);
    },
    bestLap: () => best,
    update(dt: number, clock: number, car: { x: number; z: number } | null, carYaw = 0) {
      for (const b of spin) b.rotation.z = clock * 0.9;
      // your best lap drives round again as a ghost while you're on a lap; this lap is recorded in case it's better
      if (car && lap.on) {
        if (lap.t >= rec.length * GHOST_DT) rec.push(Math.round(car.x * 20), Math.round(car.z * 20), Math.round(carYaw * 100));
        const k = lap.t / GHOST_DT,
          i = Math.floor(k) * 3;
        if (ghostRun.length >= 6 && i + 5 < ghostRun.length) {
          const f = k - Math.floor(k);
          let dy = (ghostRun[i + 5] - ghostRun[i + 2]) / 100;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          ghost.position.set(
            (ghostRun[i] + (ghostRun[i + 3] - ghostRun[i]) * f) / 20,
            0.02,
            (ghostRun[i + 1] + (ghostRun[i + 4] - ghostRun[i + 1]) * f) / 20,
          );
          ghost.rotation.y = ghostRun[i + 2] / 100 + dy * f;
          ghost.visible = true;
        } else ghost.visible = false;
      } else ghost.visible = false;
      const near = car ? trackAt(car.x, car.z) : null,
        on = !!near && near.d < TRACK_W / 2 + 2.5;
      if (!car || !near || near.d > 30) {
        if (lap.on || hud.style.display !== 'none') {
          lap.on = false;
          lap.last = -1;
          hud.style.display = 'none';
        }
        return;
      }
      hud.style.display = 'block';
      if (on) {
        if (lap.last >= 0) {
          let step = near.i - lap.last;
          if (step > NS / 2) step -= NS;
          if (step < -NS / 2) step += NS;
          lap.prog += step;
          // across the line going the right way, with most of a lap behind us: that's a lap
          if (lap.last > NS * 0.75 && near.i < NS * 0.25) {
            if (lap.on && lap.prog > NS * 0.85) {
              lap.lastLap = lap.t;
              lap.laps++;
              lap.flash = 3;
              playSample(!best || lap.t < best ? 'best' : 'lap', 0.5);
              if (!best || lap.t < best) {
                ghostRun = rec.slice();
                try {
                  localStorage.setItem('gh.kartGhost', JSON.stringify(ghostRun));
                } catch {}
                best = lap.t;
                try {
                  localStorage.setItem('gh.kartBest', String(best));
                } catch {}
              }
            }
            lap.on = true;
            lap.t = 0;
            lap.prog = 0;
            rec.length = 0;
          }
        }
        lap.last = near.i;
      }
      if (lap.on) lap.t += dt;
      lap.flash = Math.max(0, lap.flash - dt);
      hud.innerHTML = lap.on
        ? `${lap.flash > 0 ? `<span style="color:#8fd36a">LAP ${fmt(lap.lastLap)}</span>` : `LAP ${fmt(lap.t)}`}<span style="opacity:.65;font-size:15px"> &nbsp;BEST ${best ? fmt(best) : '–'}</span>`
        : `<span style="font-size:16px">Cross the line to start a lap</span><span style="opacity:.65;font-size:15px"> &nbsp;BEST ${best ? fmt(best) : '–'}</span>`;
      if (rivals.length)
        hud.innerHTML += `<div style="font:600 13px Inter,sans-serif;letter-spacing:0;opacity:.85;margin-top:3px">${rivals.map(r => `${r.name.replace(/[<>&]/g, '')} ${fmt(r.t)}`).join(' &nbsp;·&nbsp; ')}</div>`;
    },
  };
}
