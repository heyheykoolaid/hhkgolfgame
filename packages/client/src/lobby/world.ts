// Golden Hills — the neighbourhood next to the course: eight lots around a plaza (tee-time board, pro shop with the
// wardrobe, fountain, a blackjack table for later), streets, palms and power lines, in the course's golden-hour light.
import { buildFiller } from './filler';
import { buildLitter } from './litter';
import { buildMountains } from '../world/mountains';
import * as THREE from 'three';
import { buildFountain } from './fountain';
import { blackjackTable } from './blackjack';
import { buildLighting, SUN_AZ } from '../world/course';
import { buildCity } from '../world/city';
import { palmModel, buildTrees, groundPhoto } from '../world/nature';
import { createGachaMachine } from './gachaMachine';
import { buildRV } from './rv';
import { buildProShop, buildTeeBoard, buildBench } from './plaza';
import { funSurface, puttFloor } from './funland';
import { westSurface, westY } from './westside';

export const CELL = 28,
  PLOT = 14,
  HALF = PLOT / 2,
  BOUND = 44,
  ROAD_HW = 2.8,
  SW = 3.4;
const LS = PLOT / 20; // lot detail scale (lots were 20 m)
/** Lot centres: one per outer cell, pulled 1.5 m toward the plaza street so the open side faces the sidewalk. */
export const LOTS = (() => {
  const out: { cx: number; cz: number; yaw: number }[] = [];
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 3; i++) {
      if (i === 1 && j === 1) continue;
      let cx = (i - 1) * CELL,
        cz = (j - 1) * CELL;
      const dir = Math.abs(cz) >= Math.abs(cx) ? [0, -Math.sign(cz)] : [-Math.sign(cx), 0];
      cx += dir[0] * 1.5;
      cz += dir[1] * 1.5;
      out.push({ cx, cz, yaw: Math.atan2(dir[0], dir[1]) });
    }
  return out;
})();
/** Sidewalk runs along each road, broken where they would cross the other road. [axisIsX(=vertical road), offset, from, to] */
export const SIDEWALKS = (() => {
  const L = BOUND + 4,
    out: [boolean, number, number, number][] = [];
  for (const c of [-CELL / 2, CELL / 2])
    for (const e of [-1, 1])
      for (const v of [true, false]) {
        const cuts = [-L, -CELL / 2 - ROAD_HW, -CELL / 2 + ROAD_HW, CELL / 2 - ROAD_HW, CELL / 2 + ROAD_HW, L];
        for (let k = 0; k < cuts.length; k += 2) out.push([v, c + e * SW, cuts[k], cuts[k + 1]]);
      }
  return out;
})();
/** Fun Land, the little theme park through the east gates (lobby/funland.ts): x from the town's edge to x1, |z| < z. */
export const FUN = { x1: 172, z: 48, gateZ: 14, gateHW: 4.4 };
/** The West Side (lobby/westside.ts): through a gate in the town's west edge at z = gateZ; x from x0 to the edge. */
/** Where the blackjack table stands: in the middle of the Lucky Lie Lounge. */
export const BJ_AT: [number, number] = [-79, 5.2];
/** The West Side stands on a rise west of town: everything in lobby/westside.ts is laid out in its own frame and then
 *  moved this far (x) and lifted this high (y). The street climbs to it over the 24 m between the town's edge and x1. */
export const WEST_OFF = { x: -24, y: 2.6 };
export const WEST = { x0: -150, x1: -68, z0: -9, z1: 37, gateZ: 14, gateHW: 4.4, rampHW: 5.7 };
/** Inside the walkable world: the town square, or Fun Land (reached through the one gate in the town's east edge, at z = -gateZ). */
export function inWorld(x: number, z: number) {
  if (Math.abs(x) <= BOUND && Math.abs(z) <= BOUND) return true;
  if (x < -BOUND) {
    if (x > WEST.x1) return Math.abs(z - WEST.gateZ) < (x > -BOUND - 1.4 ? WEST.gateHW : WEST.rampHW); // the street up the rise
    return x > WEST.x0 && z > WEST.z0 && z < WEST.z1;
  }
  if (x < BOUND || x > FUN.x1 || Math.abs(z) > FUN.z) return false;
  return x > BOUND + 1.4 || Math.abs(z + FUN.gateZ) < FUN.gateHW;
}
export interface Plot {
  id: number;
  lot: number;
  cx: number;
  cz: number;
  yaw: number;
  group: THREE.Group;
  rv: THREE.Group | null;
  sign: THREE.Mesh;
  stripe: THREE.Material[];
  owner: string | null;
  ownerName: string;
  color: string;
  mailFlag?: THREE.Object3D;
}
export interface Collider {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  tag: string;
  r?: number;
} // r: round collider of radius r centred in the box

const mats = new Map<string, THREE.MeshStandardMaterial>();
export function M(color: string, rough = 0.85, metal = 0) {
  const k = color + rough + metal;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  return mats.get(k)!;
}
export function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  return o;
}
export function cyl(rt: number, rb: number, h: number, s: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  return o;
}
export function textTex(lines: { t: string; s: number; c?: string; b?: boolean; y?: number }[], w = 512, h = 256, bg = '#2a2016') {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  lines.forEach((l, i) => {
    x.fillStyle = l.c || '#f4ead8';
    x.font = `${l.b ? 900 : 700} ${l.s}px "Barlow Condensed", Impact, sans-serif`;
    x.fillText(l.t, w / 2, l.y ?? (h / (lines.length + 1)) * (i + 1));
  });
  // sun-faded edge wear
  for (let i = 0; i < 260; i++) {
    x.fillStyle = `rgba(255,240,210,${Math.random() * 0.08})`;
    x.fillRect(Math.random() * w, Math.random() * h, 3, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
let _aoTex: THREE.Texture | null = null;
/** Soft dark "contact shadow" quad laid under a prop, so it sits on the ground instead of floating on a shadow-map edge. */
export function contactShadow(w: number, d: number, x = 0, z = 0, y = 0.07, k = 0.55) {
  if (!_aoTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x2 = c.getContext('2d')!,
      img = x2.createImageData(64, 64);
    for (let j = 0; j < 64; j++)
      for (let i = 0; i < 64; i++) {
        const u = Math.abs(i / 31.5 - 1),
          v = Math.abs(j / 31.5 - 1),
          e = Math.max(u, v),
          a = Math.max(0, Math.min(1, (1 - e) / 0.45));
        img.data[(j * 64 + i) * 4 + 3] = 255 * a * a * (3 - 2 * a);
      }
    x2.putImageData(img, 0, 0);
    _aoTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: '#1a120a',
      alphaMap: _aoTex,
      transparent: true,
      opacity: k,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  m.position.set(x, y, z);
  m.renderOrder = 1;
  return m;
}
/** Photo ground (CC0, public/ground) as a material; the flat colour shows until the photo loads. */
const _photoM = new Map<string, THREE.MeshStandardMaterial>();
export function photoM(name: string, fallback: string) {
  let m = _photoM.get(name);
  if (!m) _photoM.set(name, (m = new THREE.MeshStandardMaterial({ map: groundPhoto(name, fallback), roughness: 1 })));
  return m;
}
/** Lay a mesh's texture out in metres (one tile = `size` m) from its own x/z, so long strips don't stretch. */
export function tile<T extends THREE.Mesh>(m: T, size: number): T {
  const g = m.geometry,
    pos = g.attributes.position,
    uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + m.position.x) / size, (pos.getZ(i) + m.position.z) / size);
  uv.needsUpdate = true;
  return m;
}
export function buildLobby(scene: THREE.Scene) {
  const light = buildLighting(scene);
  scene.fog = new THREE.Fog('#f0c99a', 40, 210);
  const colliders: Collider[] = [];
  const addCol = (x0: number, x1: number, z0: number, z1: number, tag: string) => {
    colliders.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), tag });
  };

  // ground, streets, sidewalks
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), photoM('meadow', '#8a8a46'));
  tile(ground, 26);
  ground.receiveShadow = true;
  scene.add(ground);
  const asphalt = photoM('asphalt', '#55524c'),
    walk = photoM('pavers', '#b9ad98'),
    paint = new THREE.MeshBasicMaterial({ color: '#e8d9a8' });
  for (const k of [-1, 1])
    for (const vertical of [true, false]) {
      const c = (k * CELL) / 2,
        L = BOUND * 2 + 8;
      const road = new THREE.Mesh(new THREE.PlaneGeometry(vertical ? 5.6 : L, vertical ? L : 5.6).rotateX(-Math.PI / 2), asphalt);
      road.position.set(vertical ? c : 0, 0.02, vertical ? 0 : c);
      tile(road, 1.7);
      road.receiveShadow = true;
      scene.add(road);
      for (let s = -L / 2; s < L / 2; s += 4) {
        if (Math.abs(Math.abs(s) - CELL / 2) < ROAD_HW + 0.8) continue;
        const d = new THREE.Mesh(new THREE.PlaneGeometry(vertical ? 0.14 : 1.6, vertical ? 1.6 : 0.14).rotateX(-Math.PI / 2), paint);
        d.position.set(vertical ? c : s, 0.03, vertical ? s : c);
        scene.add(d);
      }
    }
  for (const [v, off, a, b] of SIDEWALKS) {
    const len = b - a,
      mid = (a + b) / 2,
      sw = new THREE.Mesh(new THREE.BoxGeometry(v ? 1.2 : len, 0.12, v ? len : 1.2), walk);
    sw.position.set(v ? off : mid, 0.06, v ? mid : off);
    tile(sw, 2.4);
    sw.receiveShadow = true;
    scene.add(sw);
  }
  {
    // zebra crossings on every arm of the four intersections
    const zebra = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.45, 3.2).rotateX(-Math.PI / 2), paint, 4 * 4 * 7),
      m4 = new THREE.Matrix4(),
      q = new THREE.Quaternion();
    let n = 0;
    for (const ix of [-CELL / 2, CELL / 2])
      for (const iz of [-CELL / 2, CELL / 2])
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ])
          for (let k = 0; k < 7; k++) {
            const across = (k - 3) * 0.75,
              cx = ix + dx * (ROAD_HW + 2) + (dx ? 0 : across),
              cz = iz + dz * (ROAD_HW + 2) + (dz ? 0 : across);
            q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx ? Math.PI / 2 : 0);
            m4.compose(new THREE.Vector3(cx, 0.031, cz), q, new THREE.Vector3(1, 1, 1));
            zebra.setMatrixAt(n++, m4);
          }
    scene.add(zebra);
  }
  // plaza
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(19, 0.1, 19), photoM('pavers', '#c9bca4'));
  plaza.position.y = 0.05;
  tile(plaza, 3);
  plaza.receiveShadow = true;
  scene.add(plaza);
  for (let i = -9; i <= 9; i += 3)
    for (const v of [true, false]) {
      const ln = new THREE.Mesh(new THREE.PlaneGeometry(v ? 0.05 : 19, v ? 19 : 0.05).rotateX(-Math.PI / 2), M('#a89c86'));
      ln.position.set(v ? i : 0, 0.105, v ? 0 : i);
      scene.add(ln);
    }
  const fountain = buildFountain(scene);
  scene.add(contactShadow(8.2, 8.2, 0, 0, 0.105, 0.4));
  addCol(-3.2, 3.2, -3.2, 3.2, 'fountain');
  colliders[colliders.length - 1].r = 3.22;

  // tee-time board (north side), golf bag and a sign pointing to the first tee
  const board = new THREE.Group();
  const bt = textTex([
    { t: 'TEE TIMES', s: 70, b: true, c: '#ffd27a', y: 56 },
    { t: 'HOLE 1 · OR A RANDOM HOLE', s: 38, y: 128 },
    { t: 'PRESS E TO PLAY', s: 46, b: true, c: '#9fe07a', y: 196 },
  ]);
  board.add(buildTeeBoard(bt)); // lobby/plaza.ts
  board.add(contactShadow(4.0, 1.0, 0, 0, 0.105, 0.45));
  board.position.set(0, 0, -7.6);
  scene.add(board);
  addCol(-1.8, 1.8, -7.9, -7.3, 'board');

  // pro shop kiosk with a mirror (west): the wardrobe
  const shop = new THREE.Group();
  const st = textTex(
    [
      { t: 'PRO SHOP', s: 76, b: true, c: '#2a1c12' },
      { t: 'WARDROBE · CAPS · TEES', s: 34, c: '#5a3a22' },
    ],
    512,
    200,
    '#e9b23a',
  );
  shop.add(buildProShop(st)); // lobby/plaza.ts
  shop.add(contactShadow(4.0, 2.3, 0, 0, 0.105, 0.6));
  shop.position.set(-7.2, 0, 0);
  shop.rotation.y = Math.PI / 2;
  scene.add(shop);
  addCol(-7.9, -6.5, -1.8, 1.8, 'shop');

  // the blackjack table stands in the Lucky Lie Lounge on the West Side (lobby/westside.ts builds the room round it);
  // the game itself is lobby/blackjack.ts. The dealer has his back to the room's back wall; players face him.
  const bj = blackjackTable(false);
  bj.add(contactShadow(3.2, 3.2, 0, 0.2, 0.005, 0.3));
  bj.position.set(BJ_AT[0] + WEST_OFF.x, WEST_OFF.y + 0.12, BJ_AT[1]);
  scene.add(bj);
  addCol(BJ_AT[0] + WEST_OFF.x - 1.45, BJ_AT[0] + WEST_OFF.x + 1.45, BJ_AT[1] - 0.9, BJ_AT[1] + 0.55, 'bj');

  // a fingerpost by the fountain: where everything is
  {
    const post = new THREE.Group(),
      arm = (text: string, yaw: number, y: number, bg: string) => {
        const t = textTex([{ t: text, s: 92, c: '#fff7e0', b: true, y: 96 }], 512, 128, bg),
          m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }),
          a = new THREE.Group(),
          f = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.42), m),
          bk = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.42), m);
        f.position.set(0.95, 0, 0.03);
        bk.position.set(0.95, 0, -0.03);
        bk.rotation.y = Math.PI;
        a.add(f, bk, box(1.7, 0.42, 0.05, M('#3a2a1a', 0.85), 0.95, 0, 0));
        a.position.y = y;
        a.rotation.y = yaw; // the arm reaches out along +x before it is turned
        return a;
      };
    post.add(
      cyl(0.07, 0.09, 3.3, 8, M('#3a2a1a', 0.85), 0, 1.65, 0),
      arm('THE COURSE', Math.PI / 2, 2.95, '#2b6a4c'), // north (-z)
      arm('FUN LAND', 0, 2.45, '#8a2f28'), // east (+x)
      arm('WEST SIDE', Math.PI, 1.95, '#3a4f6a'), // west (-x)
    );
    post.position.set(4.6, 0.1, -4.6);
    scene.add(post);
    addCol(4.45, 4.75, -4.75, -4.45, 'sign');
  }

  // benches + plaza palms
  for (const [x, z, r] of [
    [-3.6, -6.4, 0],
    [3.6, 6.3, Math.PI],
    [-3.6, 6.3, Math.PI],
  ]) {
    const b = buildBench();
    b.position.set(x, 0.1, z);
    b.rotation.y = r;
    scene.add(b);
    addCol(x - 0.95, x + 0.95, z - 0.35, z + 0.35, 'bench');
  }
  const palm = (x: number, z: number, h: number) => {
    const p = palmModel(h);
    p.position.set(x, 0, z);
    p.rotation.y = x * 1.7 + z;
    p.userData.palm = true;
    scene.add(p);
    addCol(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 'palm');
  };
  for (const [x, z] of [
    [-8.8, -8.8],
    [8.8, -8.8],
    [-8.8, 8.8],
    [8.8, 8.8],
  ])
    palm(x, z, 8 + (Math.abs(x + z) % 2));
  const clearOfX = (u: number) => Math.abs(Math.abs(u) - CELL / 2) > ROAD_HW + SW + 1.2; // not in a crossing street or its sidewalks
  for (const s of [-1, 1])
    for (let v = -40; v <= 40; v += 13) {
      if (clearOfX(v + 3)) palm(s * (CELL / 2 + 4.6), v + 3, 9 + (Math.abs(v) % 3));
      if (clearOfX(v - 3)) palm(v - 3, s * (CELL / 2 + 4.6), 8.5 + (Math.abs(v) % 2));
    }

  // power line down the outer street
  const wood = M('#5a4430'),
    wire = new THREE.LineBasicMaterial({ color: '#1e1a16' }),
    pts: THREE.Vector3[] = [];
  for (let x = -44; x <= 44; x += 16) {
    const pole = new THREE.Group();
    pole.add(cyl(0.12, 0.16, 9, 6, wood, 0, 4.5, 0), box(2.2, 0.14, 0.14, wood, 0, 8.4, 0));
    pole.position.set(x, 0, BOUND + 1);
    scene.add(pole);
    pts.push(new THREE.Vector3(x, 8.45, BOUND + 1));
  }
  for (let i = 0; i < pts.length - 1; i++)
    for (const o of [-1, 1]) {
      const a = pts[i].clone().setX(pts[i].x + o),
        b = pts[i + 1].clone().setX(pts[i + 1].x + o),
        l: THREE.Vector3[] = [];
      for (let s = 0; s <= 10; s++)
        l.push(new THREE.Vector3().lerpVectors(a, b, s / 10).add(new THREE.Vector3(0, -Math.sin((Math.PI * s) / 10) * 0.8, 0)));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(l), wire));
    }

  // the way to the course: a gate at the north end of the main street
  const gate = new THREE.Group(),
    gt = textTex(
      [
        { t: 'GOLDEN HILLS GOLF', s: 72, b: true, c: '#ffd27a' },
        { t: 'FIRST TEE ↑', s: 40 },
      ],
      768,
      200,
    );
  gate.add(box(0.4, 5, 0.4, M('#8a6a45'), -4, 2.5, 0), box(0.4, 5, 0.4, M('#8a6a45'), 4, 2.5, 0), box(8.8, 1.3, 0.3, M('#3a2a1a'), 0, 5.2, 0));
  const gf = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 1.15), new THREE.MeshStandardMaterial({ map: gt }));
  gf.position.set(0, 5.2, 0.16);
  gate.add(gf);
  gate.position.set(0, 0, -BOUND - 1);
  scene.add(gate);

  /* horizon: the city — brick blocks just outside town, an art-deco downtown toward the sunset, far towers all round */
  buildCity(scene, { center: [0, 0], keepOut: BOUND, sunAz: SUN_AZ, rings: [240, 300], tall: 0.6 }); // (every tower stands well inside the mountains' ridge, whose foot is at 400 m)
  buildFiller(scene); // shops along the road to the course, apartment blocks south of town
  buildLitter(scene); // cans and cups along the kerbs, bags in the alley (lobby/litter.ts)
  scene.add(buildMountains([0, 0], SUN_AZ, 'coast')); // a coastal range all round, behind the skyline
  /* open ground between town and the city: oak and palm groves on dry grass, a clear lane out of the gate */
  {
    let sd = 77;
    const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647,
      trees: { x: number; y: number; z: number; s: number; tint: number; id: number }[] = [];
    for (let i = 0; i < 900 && trees.length < 260; i++) {
      const a = r() * Math.PI * 2,
        d = BOUND + 8 + Math.pow(r(), 0.8) * 110,
        x = Math.sin(a) * d,
        z = Math.cos(a) * d;
      if (z < 0 && Math.abs(x) < 9) continue; // the lane out of the gate
      if (x > BOUND - 2 && x < FUN.x1 + 60 && Math.abs(z) < FUN.z + 6) continue; // Fun Land and its driving range
      if (x < -BOUND + 2 && x > WEST.x0 - 20 && z > WEST.z0 - 10 && z < WEST.z1 + 26) continue; // the West Side and the shopfronts behind its car park
      const grove = Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.05 - 0.7);
      if (grove < 0.05 && r() < 0.75) continue; // trees bunch into groves, with open meadow between
      trees.push({ x, y: 0, z, s: 0.8 + r() * 0.6, tint: r(), id: Math.floor(r() * 1000) });
    }
    const tg = new THREE.Group();
    tg.name = 'lobbyTrees';
    buildTrees(tg, trees);
    // These groves are merged into a few big meshes far outside town: as shadow casters they were all drawn into the
    // shadow map every frame (about 150,000 triangles) for shadows that fall where nobody walks.
    tg.traverse(o => (o.castShadow = false));
    scene.add(tg);
  }

  // ---------------- the eight lots ----------------
  const plots: Plot[] = [];
  for (const { cx, cz, yaw } of LOTS) {
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    g.rotation.y = yaw;
    scene.add(g);
    const p: Plot = {
      id: plots.length,
      lot: plots.length + 1,
      cx,
      cz,
      yaw,
      group: g,
      rv: null,
      sign: null as any,
      stripe: [],
      owner: null,
      ownerName: '',
      color: '#8a8f86',
    };
    buildPlot(p, addCol);
    plots.push(p);
  }
  scene.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m.material as any).isMeshBasicMaterial) {
      m.castShadow = m.castShadow || false;
      m.receiveShadow = true;
    }
  });
  // the Birdie Ball machine (spin it with Birdie Dollars; see gachaMachine.ts)
  const gacha = createGachaMachine();
  gacha.group.add(contactShadow(0.9, 0.9, 0, 0, 0.005, 0.55));
  gacha.group.position.set(-85.0 + WEST_OFF.x, WEST_OFF.y + 0.085, 6.9); // in the Lucky Lie Lounge, by the door on the west wall
  scene.add(gacha.group);
  addCol(-85.35 + WEST_OFF.x, -84.65 + WEST_OFF.x, 6.55, 7.25, 'gacha');
  return { light, colliders, plots, gacha, fountain };
}

/** Height of the walkable surface (plaza slab, sidewalks, lot pads sit a few cm above the dirt). */
export function groundY(x: number, z: number) {
  if (x > BOUND) return puttFloor(x, z);
  if (x < -BOUND) return westY(x, z) + (westSurface(x, z) === 'paved' ? 0.06 : 0);
  if (Math.abs(x) < 9.5 && Math.abs(z) < 9.5) return 0.1;
  for (const [v, off, a, b] of SIDEWALKS) {
    const u = v ? x : z,
      w = v ? z : x;
    if (Math.abs(u - off) < 0.6 && w > a && w < b) return 0.12;
  }
  for (const l of LOTS) if (Math.abs(x - l.cx) < HALF && Math.abs(z - l.cz) < HALF) return 0.06;
  return 0;
}
/** What's underfoot, for footstep sounds (audio/ambience.ts). */
export function surfaceOf(x: number, z: number): 'concrete' | 'asphalt' | 'gravel' | 'grass' {
  const ws = westSurface(x, z);
  if (ws) return ws === 'paved' ? 'concrete' : ws;
  const f = funSurface(x, z);
  if (f) return f === 'paved' ? 'concrete' : f === 'track' ? 'asphalt' : 'grass';
  const y = groundY(x, z);
  if (y >= 0.1) return 'concrete'; // the plaza and the sidewalks
  if (y > 0) return 'gravel'; // a lot's pad
  const onRoad = (u: number, w: number) => Math.abs(Math.abs(u) - CELL / 2) < ROAD_HW && Math.abs(w) < BOUND + 4;
  return onRoad(x, z) || onRoad(z, x) ? 'asphalt' : 'grass';
}
/** Lot-local spots for plant care v2: the spigot (fill the can) and the fertilizer bin. */
export const SPIGOT: [number, number] = [3.4, -5.9],
  FERT_BIN: [number, number] = [5.7, -5.95];
let fertTex: THREE.Texture | null = null;
function fertLabel() {
  if (fertTex) return fertTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 100;
  const x = c.getContext('2d')!;
  x.fillStyle = '#e8dcc0';
  x.fillRect(0, 0, 256, 100);
  x.fillStyle = '#3f6b2a';
  x.font = '900 46px Impact, sans-serif';
  x.textAlign = 'center';
  x.fillText('GRO-MAX', 128, 52);
  x.font = '700 20px sans-serif';
  x.fillStyle = '#5a3a1a';
  x.fillText('FERTILIZER · 3 DOSES $25', 128, 84);
  fertTex = new THREE.CanvasTexture(c);
  fertTex.colorSpace = THREE.SRGBColorSpace;
  return fertTex;
}
export function toWorld(p: { cx: number; cz: number; yaw: number }, lx: number, lz: number): [number, number] {
  const c = Math.cos(p.yaw),
    s = Math.sin(p.yaw);
  return [p.cx + lx * c + lz * s, p.cz - lx * s + lz * c];
}

/** One lot: gravel pad, chain-link fence on three sides (open toward the plaza), an RV, mailbox, sign, a chair. */
function buildPlot(p: Plot, addCol: (x0: number, x1: number, z0: number, z1: number, tag: string) => void) {
  const g = p.group,
    colL = (x0: number, x1: number, z0: number, z1: number, tag: string) => {
      const a = toWorld(p, x0, z0),
        b = toWorld(p, x1, z1);
      addCol(a[0], b[0], a[1], b[1], tag);
    };
  const pad = new THREE.Mesh(new THREE.BoxGeometry(PLOT, 0.06, PLOT), photoM('gravel', '#a8946c'));
  pad.position.y = 0.03;
  tile(pad, 2.2);
  pad.receiveShadow = true;
  g.add(pad);
  for (let k = 0; k < 9; k++) {
    const patch = new THREE.Mesh(new THREE.CircleGeometry((1 + ((k * 37) % 10) / 6) * LS, 10).rotateX(-Math.PI / 2), photoM('meadow', '#7f8a45'));
    patch.position.set((((k * 53) % 17) - 8.5) * LS, 0.065, (((k * 29) % 15) - 6) * LS);
    tile(patch, 9);
    g.add(patch);
  }
  // chain-link fence: back and both sides
  const post = M('#9a9a94', 0.5, 0.6),
    meshTex = chainLink(),
    fenceM = new THREE.MeshStandardMaterial({
      map: meshTex,
      transparent: true,
      alphaTest: 0.3,
      side: THREE.DoubleSide,
      metalness: 0.5,
      roughness: 0.6,
    });
  const run = (x0: number, z0: number, x1: number, z1: number) => {
    const L = Math.hypot(x1 - x0, z1 - z0),
      n = Math.max(1, Math.round(L / 3));
    for (let i = 0; i <= n; i++) g.add(cyl(0.04, 0.04, 1.6, 5, post, x0 + ((x1 - x0) * i) / n, 0.8, z0 + ((z1 - z0) * i) / n));
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(L, 1.5), fenceM);
    panel.position.set((x0 + x1) / 2, 0.8, (z0 + z1) / 2);
    panel.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    g.add(panel);
  };
  run(-HALF, -HALF, HALF, -HALF);
  run(-HALF, -HALF, -HALF, HALF - 3);
  run(HALF, -HALF, HALF, HALF - 3);
  colL(-HALF, HALF, -HALF - 0.1, -HALF + 0.1, 'fence');
  colL(-HALF - 0.1, -HALF + 0.1, -HALF, HALF - 3, 'fence');
  colL(HALF - 0.1, HALF + 0.1, -HALF, HALF - 3, 'fence');
  // RV against the back fence
  const stripeM = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.6 }),
    rv = buildRV(stripeM); // lobby/rv.ts
  const RVZ = -HALF + 2.0;
  rv.position.set(-1.5, 0, RVZ);
  g.add(rv, contactShadow(8.4, 3.3, -1.5, RVZ));
  p.rv = rv;
  p.stripe = [stripeM];
  colL(-5.4, 2.4, RVZ - 1.3, RVZ + 1.3, 'rv');
  // (the lawn chair and cooler under the awning are now ordinary Build Mode items: see STARTER in build.ts)
  // spigot + fertilizer bin beside the RV (care v2: fill the watering can here, grab fertilizer)
  {
    const sg = new THREE.Group(),
      pipe = M('#8a8f94', 0.4, 0.7);
    sg.add(
      cyl(0.035, 0.035, 0.75, 8, pipe, 0, 0.375, 0),
      cyl(0.03, 0.03, 0.2, 8, pipe, 0, 0.7, 0.09),
      box(0.08, 0.04, 0.04, M('#b8322a', 0.5), 0, 0.82, 0),
      cyl(0.02, 0.026, 0.07, 8, pipe, 0, 0.62, 0.19),
    );
    sg.add(cyl(0.14, 0.12, 0.22, 12, M('#5f7f8f', 0.5, 0.4), 0.05, 0.11, 0.22)); // bucket under the tap
    sg.position.set(SPIGOT[0], 0.06, SPIGOT[1]);
    g.add(sg); // on the lot's gravel pad
    const bin = new THREE.Group();
    bin.add(box(0.62, 0.5, 0.45, M('#6a4a2e', 0.85), 0, 0.25, 0), box(0.64, 0.04, 0.47, M('#4a3420', 0.85), 0, 0.51, 0));
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.18), new THREE.MeshStandardMaterial({ map: fertLabel(), roughness: 0.8 }));
    lab.position.set(0, 0.3, 0.228);
    bin.add(lab);
    bin.position.set(FERT_BIN[0], 0.06, FERT_BIN[1]);
    g.add(bin);
    colL(FERT_BIN[0] - 0.33, FERT_BIN[0] + 0.33, FERT_BIN[1] - 0.25, FERT_BIN[1] + 0.25, 'bin');
  }
  // mailbox + sign at the entrance
  const mb = new THREE.Group();
  mb.add(cyl(0.05, 0.05, 1.1, 6, M('#5a4430'), 0, 0.55, 0), box(0.28, 0.25, 0.5, M('#4a4a4a', 0.5, 0.4), 0, 1.2, 0));
  mb.position.set(3, 0, HALF - 0.4);
  g.add(mb);
  const flag = new THREE.Group();
  flag.add(box(0.03, 0.3, 0.03, M('#c0392b', 0.5), 0, 0.15, 0), box(0.03, 0.1, 0.14, M('#c0392b', 0.5), 0, 0.26, 0.07)); // raised when there's mail
  flag.position.set(0.16, 1.15, -0.1);
  flag.rotation.x = Math.PI / 2;
  mb.add(flag);
  p.mailFlag = flag;
  const sp = cyl(0.06, 0.06, 1.9, 6, M('#5a4430'), -3.4, 0.95, HALF);
  g.add(sp);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.85), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
  sign.position.set(-3.4, 1.6, HALF + 0.07);
  g.add(sign, box(1.9, 0.95, 0.06, M('#3a2a1a'), -3.4, 1.6, HALF + 0.02));
  p.sign = sign;
  colL(-3.55, -3.25, HALF - 0.15, HALF + 0.15, 'sign');
  setPlotOwner(p, null, '', '#8a8f86', false);
}
function chainLink() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.strokeStyle = 'rgba(190,190,182,.95)';
  x.lineWidth = 2;
  for (let i = -64; i < 128; i += 12) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i + 64, 64);
    x.stroke();
    x.beginPath();
    x.moveTo(i + 64, 0);
    x.lineTo(i, 64);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 2);
  return t;
}
/** Paint the lot sign and the owner colour onto the RV. */
export function setPlotOwner(p: Plot, owner: string | null, name: string, color: string, mine: boolean) {
  p.owner = owner;
  p.ownerName = name;
  p.color = color;
  for (const m of p.stripe) (m as THREE.MeshStandardMaterial).color.set(owner ? color : '#8a8f86');
  const lines = owner
    ? [
        { t: `LOT ${p.lot}`, s: 44, c: '#ffd27a', y: 52 },
        { t: mine ? 'YOUR PLACE' : name.toUpperCase().slice(0, 18), s: mine ? 70 : 60, b: true, y: 134, c: mine ? '#9fe07a' : '#f4ead8' },
      ]
    : [
        { t: `LOT ${p.lot}`, s: 44, c: '#ffd27a', y: 52 },
        { t: 'FOR RENT', s: 70, b: true, y: 134 },
        { t: 'ask at the plaza', s: 30, y: 200, c: '#c9b9a0' },
      ];
  const mat = p.sign.material as THREE.MeshStandardMaterial;
  mat.map?.dispose();
  mat.map = textTex(lines, 512, 240);
  mat.needsUpdate = true;
}
