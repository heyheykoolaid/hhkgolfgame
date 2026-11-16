// The plaza's wooden buildings, rebuilt to the RV's standard (asset-audit.md): the pro shop hut, the tee-time board
// and the park benches. Built in code with two CC0 wood photos (public/ground/siding.jpg and timber.jpg, Poly Haven).
// Each builder returns a Group standing on the ground at its own origin, in the same footprint as the box it
// replaces, so the colliders, prompts and the wardrobe's camera in world.ts / lobby.ts are unchanged.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { groundPhoto } from '../world/nature';

const mats = new Map<string, THREE.MeshStandardMaterial>();
/** A wood material: one of the two photos, tinted. `rep` = how many metres one tile of the photo covers. */
function wood(photo: 'siding' | 'timber', tint: string, rough = 0.85) {
  const k = photo + tint;
  let m = mats.get(k);
  if (!m)
    mats.set(
      k,
      (m = new THREE.MeshStandardMaterial({ map: groundPhoto(photo, photo === 'siding' ? '#d6d0c4' : '#b08c62'), color: tint, roughness: rough })),
    );
  return m;
}
const flat = (color: string, rough = 0.8, metal = 0) => {
  const k = `f${color}${rough}${metal}`;
  let m = mats.get(k);
  if (!m) mats.set(k, (m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })));
  return m;
};

/** Collects boxes and cylinders per material and merges each pile into one mesh. UVs are laid out in metres. */
class Kit {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  add(mat: THREE.Material, geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(this.m4.compose(new THREE.Vector3(x, y, z), this.q.setFromEuler(this.e.set(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    let l = this.parts.get(mat);
    if (!l) this.parts.set(mat, (l = []));
    l.push(g);
    return this;
  }
  /** A box whose texture runs at `tile` metres per repeat; `grain` 'x' lays the photo's rows along the box's length. */
  box(mat: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, tile = 1.6) {
    const g = new THREE.BoxGeometry(w, h, d),
      uv = g.attributes.uv,
      size = [
        [d, h],
        [d, h],
        [w, d],
        [w, d],
        [w, h],
        [w, h],
      ];
    for (let f = 0; f < 6; f++)
      for (let i = 0; i < 4; i++) uv.setXY(f * 4 + i, (uv.getX(f * 4 + i) * size[f][0]) / tile, (uv.getY(f * 4 + i) * size[f][1]) / tile);
    return this.add(mat, g, x, y, z, rx, ry, rz);
  }
  cyl(mat: THREE.Material, rt: number, rb: number, h: number, seg: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    return this.add(mat, new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z, rx, ry, rz);
  }
  build(into: THREE.Group) {
    for (const [mat, list] of this.parts) {
      const m = new THREE.Mesh(mergeGeometries(list, false), mat);
      m.castShadow = m.receiveShadow = true;
      into.add(m);
    }
    return into;
  }
}
function stripes(a: string, b: string) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 8;
  const x = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    x.fillStyle = i % 2 ? a : b;
    x.fillRect(i * 16, 0, 16, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** The pro shop (the wardrobe): a clapboard hut, 3.2 m wide and 1.4 deep, front facing +Z.
 *  `sign` is the painted sign's texture; the mirror stays at (−0.8, 1.15, 0.71) for the wardrobe's camera. */
export function buildProShop(sign: THREE.Texture) {
  const g = new THREE.Group(),
    K = new Kit();
  const cream = wood('siding', '#f1e3c2'),
    trim = wood('timber', '#f7f1e3'),
    dark = wood('timber', '#6a4a30'),
    deck = wood('timber', '#9a7450'),
    tin = flat('#5f7f78', 0.55, 0.4),
    iron = flat('#2a2b2d', 0.6, 0.5);
  // a low deck, the clapboard walls, white corner boards and a skirting
  K.box(deck, 3.7, 0.12, 2.3, 0, 0.06, 0.25, 0, 0, 0, 1.2);
  K.box(cream, 3.2, 2.34, 1.4, 0, 1.29, 0, 0, 0, 0, 1.3);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(trim, 0.11, 2.36, 0.11, sx * 1.6, 1.29, sz * 0.7, 0, 0, 0, 1.2);
  K.box(dark, 3.26, 0.16, 1.46, 0, 0.2, 0, 0, 0, 0, 1.2);
  K.box(trim, 3.3, 0.1, 1.5, 0, 2.47, 0, 0, 0, 0, 1.2);
  // a pitched tin roof with a deep front overhang, ridge cap, fascia boards and exposed rafter tails
  const rise = 0.55,
    back = 0.95,
    front = 1.55,
    ang = Math.atan2(rise, front),
    angB = Math.atan2(rise, back);
  K.box(tin, 3.9, 0.05, Math.hypot(rise, front) + 0.1, 0, 2.52 + rise / 2, front / 2 - 0.05, ang, 0, 0);
  K.box(tin, 3.9, 0.05, Math.hypot(rise, back) + 0.1, 0, 2.52 + rise / 2, -back / 2 - 0.02, -angB, 0, 0);
  K.cyl(tin, 0.05, 0.05, 3.94, 8, 0, 2.52 + rise + 0.03, -0.03, 0, 0, Math.PI / 2);
  for (let i = 0; i < 12; i++)
    K.box(flat('#4f6c66', 0.55, 0.4), 0.03, 0.03, Math.hypot(rise, front), -1.8 + i * 0.327, 2.56 + rise / 2, front / 2 - 0.05, ang, 0, 0); // standing seams
  K.box(trim, 3.92, 0.14, 0.04, 0, 2.5, front - 0.02, 0, 0, 0, 1.2);
  K.box(trim, 3.92, 0.14, 0.04, 0, 2.5, -back - 0.02, 0, 0, 0, 1.2);
  for (const sx of [-1.95, 1.95]) {
    // gable ends: a triangle of siding and barge boards
    const tri = new THREE.Shape();
    tri.moveTo(-back, 0);
    tri.lineTo(front, 0);
    tri.lineTo(0, rise);
    tri.closePath();
    const tg = new THREE.ShapeGeometry(tri);
    const uv = tg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.3, uv.getY(i) / 1.3);
    K.add(cream, tg, sx * 0.83, 2.52, 0, 0, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
  }
  for (const sx of [-1.4, -0.47, 0.47, 1.4]) K.box(dark, 0.08, 0.12, 0.7, sx, 2.6, 1.1, ang, 0, 0, 1.2); // rafter tails
  // the sign on the roof's front, lit by two gooseneck lamps
  K.box(dark, 2.9, 1.0, 0.08, 0, 3.12, 0.72, 0, 0, 0, 1.2);
  for (const sx of [-1.25, 1.25]) K.box(dark, 0.1, 0.9, 0.1, sx, 2.9, 0.64, 0, 0, 0, 1.2);
  for (const sx of [-0.9, 0.9]) {
    K.cyl(iron, 0.015, 0.015, 0.34, 6, sx, 3.72, 0.84, 0.9, 0, 0);
    K.cyl(iron, 0.09, 0.03, 0.1, 10, sx, 3.66, 1.02, 1.1, 0, 0);
    K.add(
      new THREE.MeshStandardMaterial({ color: '#ffe2a8', emissive: '#ffc670', emissiveIntensity: 1.6 }),
      new THREE.SphereGeometry(0.035, 8, 6),
      sx,
      3.63,
      1.05,
    );
  }
  // the serving hatch (right of the mirror): a framed opening, a counter on brackets, a striped awning, a bell
  K.box(flat('#3a2c22', 0.9), 1.5, 0.95, 0.04, 0.72, 1.6, 0.705);
  K.box(trim, 1.66, 0.09, 0.08, 0.72, 2.11, 0.73, 0, 0, 0, 1.2);
  for (const sx of [-0.04, 1.48]) K.box(trim, 0.09, 1.04, 0.08, sx, 1.6, 0.73, 0, 0, 0, 1.2);
  K.box(deck, 1.8, 0.06, 0.42, 0.72, 1.1, 0.9, 0, 0, 0, 1.2);
  for (const sx of [0.0, 1.44]) K.box(dark, 0.06, 0.3, 0.06, sx, 0.96, 0.8, 0.7, 0, 0, 1.2);
  K.cyl(flat('#d8b24a', 0.3, 0.8), 0.05, 0.07, 0.06, 10, 1.4, 1.17, 0.95);
  // a striped awning sloping down and out over the hatch: a flat panel on a rail at the wall, two stays back to the frame
  const aw = 1.9,
    out = 0.72,
    drop = 0.34,
    wallY = 2.3,
    wallZ = 0.72,
    slope = Math.atan2(drop, out),
    awn = new THREE.PlaneGeometry(aw, Math.hypot(out, drop)),
    auv = awn.attributes.uv;
  for (let i = 0; i < auv.count; i++) auv.setX(i, auv.getX(i) * 3);
  awn.rotateX(-Math.PI / 2 + slope); // lying flat, then tipped so the far edge (+Z) is lower
  const awnM = new THREE.MeshStandardMaterial({ map: stripes('#f7f1e3', '#c8452f'), roughness: 0.85, side: THREE.DoubleSide });
  K.add(awnM, awn, 0.72, wallY - drop / 2, wallZ + out / 2);
  K.box(awnM, aw, 0.12, 0.015, 0.72, wallY - drop - 0.06, wallZ + out); // the valance along the front edge
  K.cyl(iron, 0.015, 0.015, aw + 0.04, 6, 0.72, wallY, wallZ + 0.01, 0, 0, Math.PI / 2);
  for (const sx of [-0.2, 1.64]) {
    // a stay from the awning's front edge back down to the hatch frame
    const y0 = wallY - drop,
      y1 = 2.05,
      L = Math.hypot(out, y0 - y1);
    K.cyl(iron, 0.011, 0.011, L, 6, sx, (y0 + y1) / 2, wallZ + out / 2, Math.atan2(out, y0 - y1), 0, 0);
  }
  // shirts on hangers along a rail inside the hatch, caps on the shelf above
  K.cyl(iron, 0.012, 0.012, 1.4, 6, 0.72, 1.98, 0.69, 0, 0, Math.PI / 2);
  ['#c8452f', '#3f6fa8', '#e9b23a', '#2f7a4b', '#7a5bd0'].forEach((c, i) => {
    const sx = 0.16 + i * 0.28,
      m = flat(c, 0.9);
    K.box(m, 0.24, 0.34, 0.03, sx, 1.72, 0.69);
    K.box(m, 0.09, 0.1, 0.03, sx - 0.15, 1.83, 0.69, 0, 0, 0.5);
    K.box(m, 0.09, 0.1, 0.03, sx + 0.15, 1.83, 0.69, 0, 0, -0.5);
  });
  // the mirror in a white frame, with a small step mat in front of it
  K.box(trim, 1.06, 1.86, 0.06, -0.8, 1.15, 0.7, 0, 0, 0, 1.2);
  K.box(flat('#7a2626', 0.95), 1.0, 0.02, 0.6, -0.8, 0.13, 1.05);
  // a side door (left end) with a porthole, a potted palm and a crate of range balls by the corner
  K.box(dark, 0.04, 1.9, 0.8, -1.62, 1.2, -0.05, 0, 0, 0, 1.2);
  K.cyl(flat('#cfd8dc', 0.2, 0.6), 0.14, 0.14, 0.03, 14, -1.645, 1.7, -0.05, 0, 0, Math.PI / 2);
  K.cyl(flat('#b0633c', 0.9), 0.2, 0.15, 0.34, 12, 1.42, 0.29, 0.95);
  for (let i = 0; i < 7; i++)
    K.box(
      flat('#3f8f4a', 0.9),
      0.5,
      0.01,
      0.1,
      1.42 + Math.cos(i * 0.9) * 0.2,
      0.7 + (i % 3) * 0.08,
      0.95 + Math.sin(i * 0.9) * 0.2,
      0.5,
      i * 0.9,
      0.5,
    );
  K.box(deck, 0.5, 0.3, 0.36, -1.35, 0.27, 1.0, 0, 0.3, 0, 0.8);
  for (let i = 0; i < 9; i++)
    K.add(flat('#f4f1e8', 0.5), new THREE.SphereGeometry(0.045, 8, 6), -1.48 + (i % 3) * 0.12, 0.45, 0.92 + Math.floor(i / 3) * 0.1);
  K.build(g);
  const sg = new THREE.Mesh(
    new THREE.PlaneGeometry(2.7, 0.86),
    new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: '#ffffff', emissiveIntensity: 0.18 }),
  );
  sg.position.set(0, 3.12, 0.765);
  const mirror = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 1.7),
    new THREE.MeshStandardMaterial({ color: '#cfd8dc', metalness: 0.9, roughness: 0.08 }),
  );
  mirror.position.set(-0.8, 1.15, 0.735);
  g.add(sg, mirror);
  return g;
}

/** The tee-time board: a timber notice board under its own little shingled roof, a planter at its feet, a golf bag
 *  leaning on the post. `face` is the board's text texture (3.2 × 1.5 m, centred at y = 1.95, facing +Z). */
export function buildTeeBoard(face: THREE.Texture) {
  const g = new THREE.Group(),
    K = new Kit();
  const post = wood('timber', '#7a5636'),
    frame = wood('timber', '#5f4128'),
    roof = wood('siding', '#5d6f5a'),
    stone = flat('#b9ad98', 0.95),
    iron = flat('#2a2b2d', 0.6, 0.5);
  for (const sx of [-1.62, 1.62]) {
    K.box(stone, 0.34, 0.26, 0.34, sx, 0.13, 0);
    K.box(post, 0.17, 3.0, 0.17, sx, 1.6, 0, 0, 0, 0, 1.2);
    K.box(post, 0.1, 0.7, 0.1, sx - Math.sign(sx) * 0.22, 2.72, 0, 0, 0, Math.sign(sx) * 0.72, 1.2); // braces up to the roof
  }
  // the board: a backing of planks, a mitred frame round the face, a shelf for scorecards and pencils
  K.box(frame, 3.42, 1.72, 0.1, 0, 1.95, -0.02, 0, 0, 0, 1.2);
  K.box(post, 3.5, 0.1, 0.14, 0, 2.82, 0.02, 0, 0, 0, 1.2);
  K.box(post, 3.5, 0.1, 0.14, 0, 1.08, 0.02, 0, 0, 0, 1.2);
  for (const sx of [-1.7, 1.7]) K.box(post, 0.1, 1.84, 0.14, sx, 1.95, 0.02, 0, 0, 0, 1.2);
  K.box(post, 1.2, 0.04, 0.2, -0.9, 1.0, 0.12, 0, 0, 0, 1.2);
  for (let i = 0; i < 5; i++) K.cyl(flat('#e9c23a', 0.6), 0.008, 0.008, 0.16, 5, -1.3 + i * 0.05, 1.04, 0.16, 0, 0, Math.PI / 2 + 0.2 * i);
  K.box(flat('#f4f1e8', 0.8), 0.22, 0.02, 0.14, -0.6, 1.03, 0.13, 0, 0.2, 0);
  // the roof: two shingled slopes, a ridge, fascia; a lamp under the eave lighting the board
  const half = 0.62,
    rise = 0.36,
    ang = Math.atan2(rise, half),
    len = Math.hypot(rise, half) + 0.08;
  K.box(roof, 3.9, 0.06, len, 0, 3.12 + rise / 2, half / 2, ang, 0, 0, 0.5);
  K.box(roof, 3.9, 0.06, len, 0, 3.12 + rise / 2, -half / 2, -ang, 0, 0, 0.5);
  K.box(frame, 3.94, 0.08, 0.1, 0, 3.12 + rise + 0.03, 0, 0, 0, 0, 1.2);
  K.box(post, 3.6, 0.14, 0.14, 0, 3.08, 0, 0, 0, 0, 1.2);
  K.cyl(iron, 0.012, 0.012, 0.26, 6, 0, 3.0, 0.2, 1.2, 0, 0);
  K.cyl(iron, 0.12, 0.04, 0.1, 12, 0, 2.95, 0.34, 0.5, 0, 0);
  K.add(
    new THREE.MeshStandardMaterial({ color: '#ffe2a8', emissive: '#ffc670', emissiveIntensity: 1.6 }),
    new THREE.SphereGeometry(0.04, 8, 6),
    0,
    2.91,
    0.37,
  );
  // a planter box along the foot, with a row of grasses
  K.box(frame, 2.5, 0.34, 0.4, -0.2, 0.3, 0.02, 0, 0, 0, 0.9);
  K.box(flat('#3d2c1c', 1), 2.4, 0.04, 0.3, -0.2, 0.47, 0.02);
  for (let i = 0; i < 22; i++) {
    const px = -1.3 + (i * 0.107 + ((i * 37) % 7) * 0.006),
      h = 0.22 + ((i * 53) % 9) * 0.03;
    K.box(flat(i % 3 ? '#6f9a45' : '#8aa84e', 0.95), 0.03, h, 0.012, px, 0.48 + h / 2, 0.02 + ((i % 3) - 1) * 0.07, 0, i * 0.7, ((i % 5) - 2) * 0.09);
  }
  // the golf bag: a stand bag with a pocket, a strap and club heads poking out of the top
  const bx = 2.2,
    lean = 0.16,
    bag = flat('#7a2626', 0.8),
    bagD = flat('#571a1a', 0.8);
  K.cyl(bag, 0.17, 0.15, 0.92, 12, bx, 0.56, 0.3, 0, 0, lean);
  K.cyl(bagD, 0.185, 0.185, 0.07, 12, bx - 0.07, 1.0, 0.3, 0, 0, lean);
  K.cyl(bagD, 0.16, 0.16, 0.06, 12, bx + 0.07, 0.12, 0.3, 0, 0, lean);
  K.box(bagD, 0.2, 0.34, 0.07, bx + 0.02, 0.5, 0.47, 0, 0, lean);
  K.box(flat('#e9c23a', 0.7), 0.035, 0.7, 0.02, bx - 0.19, 0.62, 0.3, 0, 0, lean + 0.1);
  for (let i = 0; i < 4; i++) {
    const cx = bx - 0.16 + (i - 1.5) * 0.06,
      cz = 0.3 + ((i % 2) - 0.5) * 0.12;
    K.cyl(flat('#c3c7cc', 0.3, 0.6), 0.008, 0.008, 0.34, 5, cx - 0.03, 1.2, cz, 0, 0, lean + (i - 1.5) * 0.05);
    K.box(
      i === 0 ? flat('#2c3138', 0.3, 0.3) : flat('#c3c7cc', 0.3, 0.6),
      i === 0 ? 0.1 : 0.07,
      i === 0 ? 0.07 : 0.05,
      0.03,
      cx - 0.06,
      1.38,
      cz,
      0,
      0.3,
      lean,
    );
  }
  K.build(g);
  const f = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 1.5),
    new THREE.MeshStandardMaterial({ map: face, emissiveMap: face, emissive: '#ffffff', emissiveIntensity: 0.2 }),
  );
  f.position.set(0, 1.95, 0.085);
  g.add(f);
  return g;
}

/** A park bench, 1.8 m wide: slatted seat and back on cast-iron ends with scrolled arms. Sits facing +Z. */
export function buildBench() {
  const g = new THREE.Group(),
    K = new Kit();
  const slat = wood('timber', '#a8703f', 0.7),
    iron = flat('#26282b', 0.55, 0.6);
  for (let i = 0; i < 5; i++) K.box(slat, 1.8, 0.035, 0.085, 0, 0.45 - (i === 4 ? 0.015 : 0), -0.2 + i * 0.105, i === 4 ? 0.25 : 0, 0, 0, 1.4);
  for (let i = 0; i < 4; i++) K.box(slat, 1.8, 0.085, 0.035, 0, 0.56 + i * 0.105, -0.27 - i * 0.03, -0.28, 0, 0, 1.4);
  for (const sx of [-0.84, 0.84]) {
    // an end frame: two legs, a seat rail, the back upright and an arm that curls over at the front
    K.box(iron, 0.05, 0.45, 0.05, sx, 0.225, 0.2);
    K.box(iron, 0.05, 0.95, 0.05, sx, 0.47, -0.3, -0.16, 0, 0);
    K.box(iron, 0.05, 0.05, 0.6, sx, 0.41, -0.03);
    K.box(iron, 0.06, 0.04, 0.5, sx, 0.68, -0.02);
    K.add(iron, new THREE.TorusGeometry(0.06, 0.02, 6, 12, Math.PI * 1.3), sx, 0.62, 0.23, 0, Math.PI / 2, 0);
    K.box(iron, 0.09, 0.02, 0.12, sx, 0.01, 0.2);
    K.box(iron, 0.09, 0.02, 0.12, sx, 0.01, -0.24);
  }
  K.box(iron, 1.66, 0.03, 0.03, 0, 0.2, 0.2);
  return K.build(g);
}
