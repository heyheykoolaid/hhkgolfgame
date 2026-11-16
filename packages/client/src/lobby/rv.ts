// The lot's RV: a 7.7 m travel trailer built in code (asset-audit.md: no usable CC0 camper model exists).
// A rounded aluminium body, owner-colour stripes and awning, framed windows with curtains, a door with a step and a
// porch light, tandem wheels in wells, an A-frame hitch with propane bottles, and roof gear (AC, vent, aerial, ladder).
// The door side faces +Z (the lot). Everything is merged by material, so one RV is about ten draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const std = (color: string, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
let shared: {
  body: THREE.Material;
  trim: THREE.Material;
  dark: THREE.Material;
  tyre: THREE.Material;
  chrome: THREE.Material;
  white: THREE.Material;
  win: THREE.Material;
  lamp: THREE.Material;
  red: THREE.Material;
  awnTex: THREE.Texture;
} | null = null;

function windowTex() {
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 112;
  const x = c.getContext('2d')!;
  const rr = (a: number, b: number, w: number, h: number, r: number) => {
    x.beginPath();
    x.roundRect(a, b, w, h, r);
    x.fill();
  };
  x.fillStyle = '#b9bcbd'; // aluminium frame
  rr(0, 0, 160, 112, 18);
  x.fillStyle = '#3a3d40';
  rr(7, 7, 146, 98, 13);
  const g = x.createLinearGradient(0, 10, 0, 102); // glass: the warm sky up top, the dim room below
  g.addColorStop(0, '#e9b676');
  g.addColorStop(0.45, '#7c6a5c');
  g.addColorStop(1, '#2b2c30');
  x.fillStyle = g;
  rr(11, 11, 138, 90, 10);
  x.fillStyle = 'rgba(255,240,210,.22)'; // a streak of glare
  x.beginPath();
  x.moveTo(30, 11);
  x.lineTo(62, 11);
  x.lineTo(28, 101);
  x.lineTo(11, 101);
  x.lineTo(11, 60);
  x.fill();
  for (const s of [0, 1]) {
    // curtains, tied back
    x.fillStyle = '#d8c7a6';
    x.beginPath();
    const e = s ? 149 : 11,
      d = s ? -1 : 1;
    x.moveTo(e, 11);
    x.lineTo(e + d * 40, 11);
    x.quadraticCurveTo(e + d * 34, 52, e + d * 9, 66);
    x.quadraticCurveTo(e + d * 20, 84, e + d * 16, 101);
    x.lineTo(e, 101);
    x.fill();
    x.strokeStyle = 'rgba(120,100,70,.5)';
    x.lineWidth = 1;
    for (let k = 1; k < 4; k++) {
      x.beginPath();
      x.moveTo(e + d * k * 9, 12);
      x.quadraticCurveTo(e + d * k * 8, 44, e + d * 9, 66);
      x.stroke();
    }
  }
  x.fillStyle = '#b9bcbd'; // the sliding sash bar
  x.fillRect(78, 8, 4, 96);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function stripeTex() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 8;
  const x = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    x.fillStyle = i % 2 ? '#ffffff' : '#8f8f8f'; // multiplied by the owner colour: light and deep stripes
    x.fillRect(i * 16, 0, 16, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
function mats() {
  if (shared) return shared;
  const w = windowTex();
  shared = {
    body: std('#ece6d6', 0.55, 0.1),
    trim: std('#c9c3b4', 0.5, 0.3),
    dark: std('#2a2b2d', 0.8),
    tyre: std('#161616', 0.95),
    chrome: std('#c9cdd1', 0.3, 0.7),
    white: std('#f2f0ea', 0.6),
    win: new THREE.MeshStandardMaterial({ map: w, emissiveMap: w, emissive: '#ffffff', emissiveIntensity: 0.12, roughness: 0.25, metalness: 0.1 }),
    lamp: new THREE.MeshStandardMaterial({ color: '#ffe2a8', emissive: '#ffc670', emissiveIntensity: 1.6, roughness: 0.5 }),
    red: new THREE.MeshStandardMaterial({ color: '#b3261e', emissive: '#7a0f0a', emissiveIntensity: 0.5, roughness: 0.4 }),
    awnTex: stripeTex(),
  };
  return shared;
}

/** Collects geometry per material, then merges each pile into one mesh. */
class Pile {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private m4 = new THREE.Matrix4();
  private e = new THREE.Euler();
  private q = new THREE.Quaternion();
  add(mat: THREE.Material, geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    this.m4.compose(new THREE.Vector3(x, y, z), this.q.setFromEuler(this.e.set(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(this.m4);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    let l = this.parts.get(mat);
    if (!l) this.parts.set(mat, (l = []));
    l.push(g);
    return this;
  }
  box(mat: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    return this.add(mat, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
  }
  cyl(mat: THREE.Material, rt: number, rb: number, h: number, seg: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    return this.add(mat, new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z, rx, ry, rz);
  }
  build(into: THREE.Group) {
    for (const [mat, list] of this.parts) {
      const m = new THREE.Mesh(mergeGeometries(list, false), mat);
      m.castShadow = true;
      m.receiveShadow = true;
      into.add(m);
    }
  }
}

/** Rounded side profile (x along the trailer, y up), extruded across the width. */
function shell(len: number, y0: number, y1: number, width: number, rTop: number, rBot: number, bevel: number) {
  const h = len / 2,
    s = new THREE.Shape();
  s.moveTo(-h + rBot, y0);
  s.lineTo(h - rBot, y0);
  s.quadraticCurveTo(h, y0, h, y0 + rBot);
  s.lineTo(h, y1 - rTop);
  s.quadraticCurveTo(h, y1, h - rTop, y1);
  s.lineTo(-h + rTop, y1);
  s.quadraticCurveTo(-h, y1, -h, y1 - rTop);
  s.lineTo(-h, y0 + rBot);
  s.quadraticCurveTo(-h, y0, -h + rBot, y0);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: width - bevel * 2,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 8,
  });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  return g;
}

/** Build one RV. `stripe` is the owner-colour material (the caller recolours it); the awning shares its colour. */
export function buildRV(stripe: THREE.MeshStandardMaterial) {
  const M = mats(),
    g = new THREE.Group(),
    P = new Pile();
  const Z = 1.25; // half width
  // body, belly and frame
  P.add(M.body, shell(7.6, 0.62, 2.86, 2.5, 0.6, 0.22, 0.05));
  P.box(M.dark, 7.0, 0.16, 2.2, 0, 0.52, 0);
  P.box(M.trim, 7.66, 0.07, 2.56, 0, 0.98, 0); // belt rail
  // owner colour: a broad stripe with a pinstripe above, wrapped right round
  P.box(stripe, 7.72, 0.24, 2.53, 0, 1.3, 0);
  P.box(stripe, 7.72, 0.05, 2.53, 0, 1.52, 0);
  // windows (door side): three along the body, a small one in the door; one each end; two on the fence side
  const win = (w: number, h: number, x: number, y: number, z: number, ry: number) => P.add(M.win, new THREE.PlaneGeometry(w, h), x, y, z, 0, ry, 0);
  for (const x of [-2.75, -1.25, 0.55]) win(1.15, 0.8, x, 2.08, Z + 0.006, 0);
  win(1.15, 0.8, -1.9, 2.08, -Z - 0.006, Math.PI);
  win(1.15, 0.8, 1.3, 2.08, -Z - 0.006, Math.PI);
  win(1.5, 0.7, -3.856, 2.02, 0, -Math.PI / 2);
  win(1.5, 0.7, 3.856, 2.02, 0, Math.PI / 2);
  // door: frame, panel, window, handle, grab bar, fold-down step, porch light
  const dx = 2.6;
  P.box(M.trim, 0.86, 1.98, 0.03, dx, 1.72, Z + 0.004);
  P.box(M.white, 0.76, 1.88, 0.03, dx, 1.72, Z + 0.014);
  win(0.46, 0.5, dx, 2.2, Z + 0.032, 0);
  P.box(M.chrome, 0.05, 0.14, 0.04, dx - 0.3, 1.55, Z + 0.04);
  P.cyl(M.chrome, 0.014, 0.014, 0.7, 6, dx + 0.56, 1.75, Z + 0.06);
  P.box(M.chrome, 0.03, 0.03, 0.06, dx + 0.56, 2.08, Z + 0.03).box(M.chrome, 0.03, 0.03, 0.06, dx + 0.56, 1.42, Z + 0.03);
  P.box(M.dark, 0.72, 0.04, 0.3, dx, 0.5, Z + 0.17)
    .box(M.dark, 0.03, 0.22, 0.03, dx - 0.33, 0.6, Z + 0.05)
    .box(M.dark, 0.03, 0.22, 0.03, dx + 0.33, 0.6, Z + 0.05);
  P.box(M.dark, 0.12, 0.05, 0.05, dx - 0.62, 2.5, Z + 0.03);
  P.add(M.lamp, new THREE.SphereGeometry(0.05, 8, 6), dx - 0.62, 2.45, Z + 0.05);
  // wheels: a tandem pair each side, in dark wells with a lip
  for (const s of [-1, 1]) {
    P.box(M.dark, 2.1, 0.62, 0.04, -0.7, 0.86, s * (Z - 0.005));
    P.box(M.trim, 2.2, 0.05, 0.1, -0.7, 1.18, s * (Z + 0.02));
    for (const wx of [-1.2, -0.2]) {
      P.cyl(M.tyre, 0.36, 0.36, 0.24, 16, wx, 0.36, s * (Z - 0.16), Math.PI / 2);
      P.cyl(M.chrome, 0.2, 0.2, 0.25, 12, wx, 0.36, s * (Z - 0.155), Math.PI / 2);
      P.cyl(M.white, 0.07, 0.07, 0.26, 8, wx, 0.36, s * (Z - 0.15), Math.PI / 2);
    }
  }
  // corner stabiliser jacks
  for (const x of [-3.3, 3.2])
    for (const z of [-0.95, 0.95]) P.cyl(M.dark, 0.025, 0.025, 0.46, 6, x, 0.23, z).box(M.dark, 0.16, 0.02, 0.16, x, 0.01, z);
  // hitch end (−X): A-frame, coupler, tongue jack, two propane bottles under a cover strap
  for (const s of [-1, 1]) P.box(M.dark, 1.5, 0.08, 0.08, -4.45, 0.52, s * 0.36, 0, s * 0.42, 0);
  P.box(M.dark, 0.3, 0.1, 0.14, -5.2, 0.54, 0);
  P.cyl(M.chrome, 0.03, 0.03, 0.75, 6, -4.95, 0.42, 0)
    .cyl(M.dark, 0.07, 0.07, 0.03, 8, -4.95, 0.03, 0)
    .box(M.dark, 0.14, 0.03, 0.03, -4.95, 0.8, 0.06);
  for (const z of [-0.2, 0.2]) {
    P.cyl(M.white, 0.16, 0.16, 0.42, 12, -4.3, 0.84, z);
    P.add(M.white, new THREE.SphereGeometry(0.16, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), -4.3, 1.05, z);
    P.cyl(M.chrome, 0.05, 0.07, 0.07, 8, -4.3, 1.22, z);
  }
  P.box(M.dark, 0.5, 0.05, 0.84, -4.3, 0.6, 0);
  // tail end (+X): bumper, tail lights, plate, spare-tyre cover
  P.box(M.chrome, 0.1, 0.12, 2.3, 3.9, 0.55, 0);
  for (const z of [-1.0, 1.0]) P.box(M.red, 0.03, 0.2, 0.12, 3.862, 1.05, z);
  P.box(M.white, 0.02, 0.16, 0.34, 3.862, 0.82, 0);
  P.cyl(M.white, 0.36, 0.36, 0.2, 16, 3.95, 1.5, -0.45, 0, 0, Math.PI / 2);
  // roof: AC unit, a crank vent, a TV aerial, the rear ladder
  P.box(M.white, 0.95, 0.24, 0.75, -0.6, 2.99, 0).box(M.dark, 0.8, 0.05, 0.6, -0.6, 3.0, 0.1);
  P.box(M.white, 0.42, 0.06, 0.42, 1.9, 2.93, 0, 0, 0, 0.35).box(M.dark, 0.36, 0.08, 0.36, 1.9, 2.89, 0);
  P.cyl(M.chrome, 0.012, 0.012, 0.5, 5, -2.6, 3.1, -0.4).box(M.chrome, 0.9, 0.012, 0.012, -2.6, 3.34, -0.4, 0, 0.5, 0);
  P.box(M.chrome, 0.5, 0.012, 0.012, -2.6, 3.26, -0.4, 0, 0.5, 0);
  for (const z of [0.55, 0.9]) P.cyl(M.chrome, 0.014, 0.014, 2.1, 6, 3.9, 1.9, z);
  for (let k = 0; k < 6; k++) P.cyl(M.chrome, 0.011, 0.011, 0.35, 5, 3.9, 1.0 + k * 0.35, 0.725, Math.PI / 2);
  for (const z of [0.55, 0.9]) P.cyl(M.chrome, 0.014, 0.014, 0.16, 6, 3.83, 2.93, z, 0, 0, Math.PI / 2);
  // awning: roller tube at the roof edge, striped fabric out over the door side, two arms back to the wall
  const ax = -0.9,
    aw = 4.4,
    out = 2.3,
    drop = 0.42,
    y0 = 2.78;
  const awnM = new THREE.MeshStandardMaterial({ map: M.awnTex, roughness: 0.85, side: THREE.DoubleSide });
  awnM.color = stripe.color; // share the Color object: the awning follows the owner colour
  const fab = new THREE.PlaneGeometry(aw, Math.hypot(out, drop));
  const uv = fab.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 5.5);
  P.add(awnM, fab, ax, y0 - drop / 2, Z + out / 2, -Math.PI / 2 + Math.atan2(drop, out), 0, 0);
  P.box(awnM, aw, 0.14, 0.02, ax, y0 - drop - 0.07, Z + out); // valance
  P.cyl(M.chrome, 0.04, 0.04, aw + 0.1, 8, ax, y0 - drop, Z + out, 0, 0, Math.PI / 2);
  P.box(M.trim, aw + 0.1, 0.08, 0.08, ax, y0 + 0.02, Z + 0.03);
  for (const s of [-1, 1]) {
    const x = ax + (s * aw) / 2,
      L = Math.hypot(out, y0 - drop - 1.0);
    P.cyl(M.chrome, 0.016, 0.016, L, 6, x, (y0 - drop + 1.0) / 2, Z + out / 2, Math.atan2(out, y0 - drop - 1.0), 0, 0);
    P.cyl(M.chrome, 0.016, 0.016, Math.hypot(out, drop), 6, x, y0 - drop / 2, Z + out / 2, Math.PI / 2 + Math.atan2(drop, out), 0, 0);
  }
  P.build(g);
  return g;
}
