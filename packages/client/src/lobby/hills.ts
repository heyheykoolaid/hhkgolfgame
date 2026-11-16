// The hills south of town: rolling golden ground with a road that climbs from the west street, loops over a lookout
// and comes back down to the east street. The town itself stays flat. hillY() is the ground height for walking, the
// camera and the cart's physics mesh alike. Nothing here reads world.ts while loading (world.ts imports this file).
import * as THREE from 'three';

export const HILLS = { x: 72, z0: 44, z1: 152 }; // |x| < x, z0 < z < z1
const ROAD_W = 6.5,
  PTS: [number, number][] = [
    [-14, 44],
    [-14, 60],
    [-24, 78],
    [-34, 98],
    [-26, 118],
    [0, 130],
    [26, 118],
    [34, 98],
    [24, 78],
    [14, 60],
    [14, 44],
  ];
/** The raw hills, before the road is cut in: flat at the town's edge, rising to the south. */
function raw(x: number, z: number) {
  const m = Math.min(1, Math.max(0, (z - 50) / 34)),
    e = Math.min(1, Math.max(0, (HILLS.x - Math.abs(x)) / 14)) * Math.min(1, Math.max(0, (HILLS.z1 - z) / 14)), // back down to the meadow at the outer edges
    s = m * m * (3 - 2 * m);
  return Math.max(0, s * e * (7 + 6 * Math.sin(x * 0.034 + 0.6) * Math.cos(z * 0.037) + 3.5 * Math.sin(x * 0.075 + z * 0.052) + (z - 50) * 0.06));
}
const curve = new THREE.CatmullRomCurve3(
    PTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'centripetal',
  ),
  RS = curve.getSpacedPoints(Math.round(curve.getLength())),
  RH = (() => {
    // the road's own height: the hills under its centre line, smoothed so the grades are gentle
    const h = RS.map(p => raw(p.x, p.z)),
      out = h.slice();
    for (let pass = 0; pass < 4; pass++)
      for (let i = 0; i < h.length; i++) {
        let a = 0,
          n = 0;
        for (let k = -26; k <= 26; k++) {
          const j = Math.min(h.length - 1, Math.max(0, i + k));
          a += out[j];
          n++;
        }
        h[i] = a / n;
      }
    // no grade steeper than about 1 in 8: walk the road both ways, holding each step to that
    const MAX = 0.125;
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < h.length; i++) h[i] = Math.min(h[i], h[i - 1] + MAX);
      for (let i = h.length - 2; i >= 0; i--) h[i] = Math.min(h[i], h[i + 1] + MAX);
    }
    h[0] = h[h.length - 1] = 0;
    for (let i = 1; i < 12; i++) {
      h[i] = Math.min(h[i], h[i - 1] + 0.06);
      h[h.length - 1 - i] = Math.min(h[h.length - 1 - i], h[h.length - i] + 0.06);
    }
    return h;
  })();
function nearRoad(x: number, z: number) {
  let bi = 0,
    bd = 1e9;
  for (let i = 0; i < RS.length; i++) {
    const d = (RS[i].x - x) ** 2 + (RS[i].z - z) ** 2;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  return { i: bi, d: Math.sqrt(bd) };
}
export const inHills = (x: number, z: number) => z > HILLS.z0 && z <= HILLS.z1 && Math.abs(x) <= HILLS.x;
/** Ground height in the hills (0 outside them). The ground is levelled across the road and blends back into the slope. */
export function hillY(x: number, z: number) {
  if (!inHills(x, z)) return 0;
  const r = nearRoad(x, z),
    t = Math.min(1, Math.max(0, (r.d - ROAD_W / 2 - 3.6) / 11)), // level out to well past the shoulder, then ease back into the slope
    w = t * t * (3 - 2 * t);
  return RH[r.i] * (1 - w) + raw(x, z) * w;
}
export const onHillRoad = (x: number, z: number) => inHills(x, z) && nearRoad(x, z).d < ROAD_W / 2;

/** Build the hills: the ground, the road, a lookout. Returns the ground's triangles for the cart's physics. */
export function buildHills(scene: THREE.Scene, groundM: THREE.Material, roadM: THREE.Material) {
  const G = new THREE.Group();
  G.name = 'hills';
  const STEP = 2,
    nx = Math.round((HILLS.x * 2) / STEP),
    nz = Math.round((HILLS.z1 - HILLS.z0) / STEP),
    pos = new Float32Array((nx + 1) * (nz + 1) * 3),
    uv = new Float32Array((nx + 1) * (nz + 1) * 2),
    idx: number[] = [];
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const x = -HILLS.x + i * STEP,
        z = HILLS.z0 + j * STEP,
        o = j * (nx + 1) + i;
      // under the road the drawn ground is dropped a little, so the road ribbon always sits clear on top of it
      const under = j > 0 && nearRoad(x, z).d < ROAD_W / 2 + 3.3 ? 0.4 : 0;
      pos.set([x, hillY(x, z) + (j === 0 ? 0 : 0.015) - under, z], o * 3);
      uv.set([x / 26, z / 26], o * 2);
      if (i < nx && j < nz) idx.push(o, o + nx + 1, o + 1, o + 1, o + nx + 1, o + nx + 2);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const ground = new THREE.Mesh(g, groundM);
  ground.receiveShadow = true;
  G.add(ground);
  // the road: a ribbon along the smoothed centre line, with a pale edge line each side
  const rp: number[] = [],
    rc: number[] = [],
    ri: number[] = [],
    ruv: number[] = [],
    road = new THREE.Color('#ffffff'),
    edge = new THREE.Color('#f4ecd0');
  for (let i = 0; i < RS.length; i++) {
    const p = RS[i],
      a = RS[Math.max(0, i - 1)],
      b = RS[Math.min(RS.length - 1, i + 1)],
      l = Math.hypot(b.x - a.x, b.z - a.z) || 1,
      tx = (b.x - a.x) / l,
      tz = (b.z - a.z) / l,
      offs = [-ROAD_W / 2, -ROAD_W / 2 + 0.16, -ROAD_W / 2 + 0.16, ROAD_W / 2 - 0.16, ROAD_W / 2 - 0.16, ROAD_W / 2],
      cs = [road, edge, road, road, edge, road];
    offs.forEach((o, k) => {
      // wider than the painted road by a shoulder each side, so it covers the dropped strip of ground
      const oo = k === 0 ? o - 3.6 : k === 5 ? o + 3.6 : o;
      rp.push(p.x - tz * oo, RH[i] + (k === 0 || k === 5 ? -0.45 : 0.04), p.z + tx * oo);
      rc.push(cs[k].r * 1, cs[k].g * 1, cs[k].b * 1);
      ruv.push((p.x - tz * oo) / 1.7, (p.z + tx * oo) / 1.7);
    });
    if (i < RS.length - 1)
      for (const k of [0, 2, 4]) {
        const q = i * 6 + k;
        ri.push(q, q + 1, q + 6, q + 1, q + 7, q + 6);
      }
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  rg.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
  rg.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2));
  rg.setIndex(ri);
  rg.computeVertexNormals();
  const rm = (roadM as THREE.MeshStandardMaterial).clone();
  rm.vertexColors = true;
  rm.side = THREE.DoubleSide;
  const rmesh = new THREE.Mesh(rg, rm);
  rmesh.receiveShadow = true;
  G.add(rmesh);
  // the lookout at the top: a rail on the town side and a bench
  const top = RS[Math.round(RS.length / 2)],
    ty = RH[Math.round(RS.length / 2)],
    wood = new THREE.MeshStandardMaterial({ color: '#8a6a45', roughness: 0.9 }),
    L = new THREE.Group();
  L.position.set(top.x, ty, top.z - ROAD_W / 2 - 1.6);
  for (let i = -3; i <= 3; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 0.14), wood);
    post.position.set(i * 1.5, 0.55, -1.2);
    L.add(post);
  }
  for (const y of [0.55, 1.05]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.1, 0.1), wood);
    rail.position.set(0, y, -1.2);
    L.add(rail);
  }
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 0.5), wood),
    back = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 0.07), wood);
  seat.position.set(0, 0.46, 0.2);
  back.position.set(0, 0.8, 0.46);
  L.add(seat, back);
  for (const x of [-0.85, 0.85]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.46, 0.46), wood);
    leg.position.set(x, 0.23, 0.2);
    L.add(leg);
  }
  L.traverse(o => ((o as THREE.Mesh).castShadow = true));
  G.add(L);
  scene.add(G);
  // physics: the ground and the road together (the cart rides on the road ribbon where there is one)
  const verts = new Float32Array(pos.length + rp.length),
    indices = new Uint32Array(idx.length + ri.length),
    base = pos.length / 3;
  verts.set(pos);
  verts.set(rp, pos.length);
  indices.set(idx);
  for (let i = 0; i < ri.length; i++) indices[idx.length + i] = ri[i] + base;
  return { group: G, verts, indices };
}
