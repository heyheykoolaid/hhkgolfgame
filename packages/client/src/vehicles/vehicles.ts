// Vehicles. A small open framework: every vehicle is a model + (for its owner) a physics body, and a compact network
// state everyone else interpolates. The golf cart is the first; low riders, jetpacks and segways slot in as more kinds.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PhysWorld, rapier, G_STATIC, G_RAG, G_VEH, grp } from '../physics/ragdoll';

/** What goes over the network (presence) for a vehicle. */
export interface VehState {
  k: string;
  p: number[];
  q: number[];
  s: number;
  st?: number;
}
export interface DriveInput {
  throttle: number;
  steer: number;
  brake: boolean;
  boost?: boolean;
  jump?: boolean;
}
export interface Vehicle {
  readonly kind: string;
  readonly name: string;
  root: THREE.Object3D;
  /** where the rider's golfer root goes (vehicle-local), and how they ride */
  seat: THREE.Vector3;
  ride: 'sit' | 'stand';
  riderYaw: number;
  /** what the rider sits on / holds (moves with the body as it sways on the suspension) */
  seatParent: THREE.Object3D;
  /** where hands and feet go, in seatParent space (hands follow the steering) */
  grips?(): { hands: [THREE.Vector3, THREE.Vector3]; feet: [THREE.Vector3, THREE.Vector3] };
  /** where it touches the ground (world space), for treading down grass */
  contacts?(): THREE.Vector3[];
  /** current steering (−1..1) for the rider's pose */
  steering(): number;
  /** owner side: drive with physics */
  drive(dt: number, inp: DriveInput): void;
  /** 0 not drifting · 1–3 sliding, by charge */
  drifting?(): number;
  /** world-space velocity (owner) */ velocity(out: THREE.Vector3): THREE.Vector3;
  speed(): number;
  state(): VehState;
  /** remote side: follow the owner's reported state */
  follow(st: VehState, dt: number): void;
  placeAt(x: number, y: number, z: number, yaw: number): void;
  dispose(): void;
}
export interface VehicleKind {
  kind: string;
  name: string;
  make(pw: PhysWorld | null, scene: THREE.Object3D, color: string, owner: boolean): Vehicle;
}
export const VEHICLES: Record<string, VehicleKind> = {};

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const M = (c: string, r = 0.6, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
function bx(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  return o;
}
function cy(r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 12) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  return o;
}

// ---------------------------------------------------------------- golf cart
// Chassis forward is +X (Rapier's vehicle controller default). The visual model is built facing +X too.
// Textures are painted procedurally: gel-coat fiberglass with road grime, pleated vinyl, canvas roof, rubber mats,
// treaded tyres, a nylon golf bag.
function cv(w: number, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function nrm(h: HTMLCanvasElement, k = 2) {
  const w = h.width,
    H = h.height,
    src = h.getContext('2d')!.getImageData(0, 0, w, H).data,
    o = cv(w, H),
    x = o.getContext('2d')!,
    img = x.createImageData(w, H),
    d = img.data;
  const at = (i: number, j: number) => src[(((j + H) % H) * w + ((i + w) % w)) * 4] / 255;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < w; i++) {
      const dx = (at(i + 1, j) - at(i - 1, j)) * k,
        dy = (at(i, j + 1) - at(i, j - 1)) * k,
        l = Math.hypot(dx, dy, 1),
        q = (j * w + i) * 4;
      d[q] = ((-dx / l) * 0.5 + 0.5) * 255;
      d[q + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      d[q + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      d[q + 3] = 255;
    }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(o);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const tx = (c: HTMLCanvasElement, rep = 1) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, rep);
  t.anisotropy = 8;
  return t;
};
let CT: Record<string, THREE.Texture> | null = null;
function cartTextures() {
  if (CT) return CT;
  const r = rng(23);
  // fiberglass body: warm cream gel-coat, faint swirl marks, grime gathering toward the bottom edge
  const b = cv(512),
    bx = b.getContext('2d')!;
  bx.fillStyle = '#efe6d2';
  bx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 90; i++) {
    bx.strokeStyle = `rgba(255,255,255,${0.04 + r() * 0.05})`;
    bx.lineWidth = 1;
    bx.beginPath();
    bx.arc(r() * 512, r() * 512, 10 + r() * 50, r() * 6, r() * 6 + 2);
    bx.stroke();
  }
  const gr = bx.createLinearGradient(0, 300, 0, 512);
  gr.addColorStop(0, 'rgba(110,90,60,0)');
  gr.addColorStop(1, 'rgba(110,90,60,.45)');
  bx.fillStyle = gr;
  bx.fillRect(0, 300, 512, 212);
  for (let i = 0; i < 700; i++) {
    bx.fillStyle = `rgba(100,80,50,${r() * 0.25})`;
    bx.fillRect(r() * 512, 380 + r() * 132, 1 + r() * 3, 1 + r() * 2);
  }
  for (let i = 0; i < 20; i++) {
    bx.strokeStyle = 'rgba(80,70,60,.25)';
    bx.lineWidth = 0.7;
    const x0 = r() * 512,
      y0 = r() * 512;
    bx.beginPath();
    bx.moveTo(x0, y0);
    bx.lineTo(x0 + (r() - 0.5) * 40, y0 + (r() - 0.5) * 8);
    bx.stroke();
  }
  // pleated vinyl seat
  const v = cv(256),
    vx = v.getContext('2d')!,
    vh = cv(256),
    vhx = vh.getContext('2d')!;
  vx.fillStyle = '#5a3a26';
  vx.fillRect(0, 0, 256, 256);
  vhx.fillStyle = '#808080';
  vhx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 32) {
    const g = vhx.createLinearGradient(i, 0, i + 32, 0);
    g.addColorStop(0, '#404040');
    g.addColorStop(0.5, '#c0c0c0');
    g.addColorStop(1, '#404040');
    vhx.fillStyle = g;
    vhx.fillRect(i, 0, 32, 256);
    vx.fillStyle = 'rgba(0,0,0,.25)';
    vx.fillRect(i, 0, 2, 256);
  }
  for (let i = 0; i < 2500; i++) {
    vx.fillStyle = `rgba(${r() < 0.5 ? '255,220,190' : '0,0,0'},.05)`;
    vx.fillRect(r() * 256, r() * 256, 2, 2);
  }
  // canvas roof
  const c = cv(256),
    cx = c.getContext('2d')!,
    ch = cv(256),
    chx = ch.getContext('2d')!;
  cx.fillStyle = '#ece4d0';
  cx.fillRect(0, 0, 256, 256);
  chx.fillStyle = '#808080';
  chx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 3) {
    chx.fillStyle = i % 6 ? '#909090' : '#707070';
    chx.fillRect(i, 0, 1, 256);
    chx.fillRect(0, i, 256, 1);
    cx.fillStyle = 'rgba(160,140,110,.08)';
    cx.fillRect(0, i, 256, 1);
  }
  // ribbed rubber floor mat
  const m = cv(128),
    mx = m.getContext('2d')!,
    mh = cv(128),
    mhx = mh.getContext('2d')!;
  mx.fillStyle = '#262624';
  mx.fillRect(0, 0, 128, 128);
  mhx.fillStyle = '#606060';
  mhx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 8) {
    mhx.fillStyle = '#c0c0c0';
    mhx.fillRect(0, i, 128, 3);
    mx.fillStyle = '#323230';
    mx.fillRect(0, i, 128, 3);
  }
  // tyre: tread blocks around the circumference (cylinder side uv: u around, v across)
  const t = cv(512, 64),
    tx2 = t.getContext('2d')!,
    th = cv(512, 64),
    thx = th.getContext('2d')!;
  tx2.fillStyle = '#1c1c1c';
  tx2.fillRect(0, 0, 512, 64);
  thx.fillStyle = '#404040';
  thx.fillRect(0, 0, 512, 64);
  for (let i = 0; i < 512; i += 16) {
    thx.fillStyle = '#c8c8c8';
    thx.fillRect(i, 6, 10, 22);
    thx.fillRect(i + 6, 36, 10, 22);
    tx2.fillStyle = '#242424';
    tx2.fillRect(i, 6, 10, 22);
    tx2.fillRect(i + 6, 36, 10, 22);
  }
  // tyre sidewall + hub cap
  const w = cv(256),
    wx = w.getContext('2d')!;
  wx.fillStyle = '#1a1a1a';
  wx.fillRect(0, 0, 256, 256);
  const hg = wx.createRadialGradient(128, 128, 10, 128, 128, 70);
  hg.addColorStop(0, '#f0f0f0');
  hg.addColorStop(0.7, '#a8acb0');
  hg.addColorStop(1, '#6a6e72');
  wx.fillStyle = hg;
  wx.beginPath();
  wx.arc(128, 128, 70, 0, 7);
  wx.fill();
  wx.fillStyle = '#2a2a2a';
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    wx.beginPath();
    wx.arc(128 + Math.cos(a) * 40, 128 + Math.sin(a) * 40, 6, 0, 7);
    wx.fill();
  }
  wx.strokeStyle = '#2c2c2c';
  wx.lineWidth = 3;
  wx.beginPath();
  wx.arc(128, 128, 104, 0, 7);
  wx.stroke();
  wx.fillStyle = '#3a3a3a';
  wx.font = 'bold 16px Inter, sans-serif';
  wx.textAlign = 'center';
  wx.fillText('GOLDEN HILLS · 18x8.50-8', 128, 28);
  // nylon golf bag with a pocket and stitching
  const g = cv(256),
    gx = g.getContext('2d')!;
  gx.fillStyle = '#8a2222';
  gx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 2) {
    gx.fillStyle = `rgba(0,0,0,${i % 4 ? 0.05 : 0.1})`;
    gx.fillRect(0, i, 256, 1);
  }
  gx.fillStyle = '#6a1616';
  gx.fillRect(40, 90, 120, 110);
  gx.strokeStyle = '#f0e0c0';
  gx.setLineDash([5, 4]);
  gx.lineWidth = 2;
  gx.strokeRect(44, 94, 112, 102);
  gx.setLineDash([]);
  gx.fillStyle = '#f0e0c0';
  gx.font = '900 30px "Barlow Condensed", Impact, sans-serif';
  gx.fillText('GH', 70, 150);
  gx.fillStyle = '#1a1a1a';
  gx.fillRect(0, 0, 256, 18);
  gx.fillRect(0, 238, 256, 18);
  CT = {
    body: tx(b),
    vinyl: tx(v),
    vinylN: nrm(vh, 2),
    canvas: tx(c, 2),
    canvasN: nrm(ch, 1),
    mat: tx(m, 3),
    matN: nrm(mh, 2),
    tread: tx(t),
    treadN: nrm(th, 3),
    side: tx(w),
    bag: tx(g),
  };
  return CT;
}
/** The number plate decal on the front cowl. */
function plateTex(color: string, num: string) {
  const c = cv(256, 128),
    x = c.getContext('2d')!;
  x.fillStyle = color;
  x.beginPath();
  x.roundRect(4, 4, 248, 120, 18);
  x.fill();
  x.fillStyle = '#fff';
  x.font = '900 82px "Barlow Condensed", Impact, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(num, 128, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** A real-looking cart bag: shaped body with a moulded base and a padded collar, side pockets, a carry strap, and clubs —
 *  knit head covers on the woods (with pom-poms), bare iron heads, a putter. Bag base at the origin, standing up +Y. */
function golfBag(bagTex: THREE.Texture, chrome: THREE.Material, black: THREE.Material) {
  const g = new THREE.Group(),
    nylon = new THREE.MeshStandardMaterial({ map: bagTex, roughness: 0.75 }),
    trimM = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.6 });
  const prof = [
    [0.0, 0],
    [0.11, 0],
    [0.125, 0.02],
    [0.128, 0.08],
    [0.122, 0.12],
    [0.118, 0.4],
    [0.124, 0.7],
    [0.13, 0.82],
    [0.13, 0.86],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), nylon);
  body.castShadow = true;
  g.add(body);
  const base = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        [0, 0],
        [0.128, 0],
        [0.132, 0.03],
        [0.13, 0.11],
        [0.124, 0.12],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      28,
    ),
    trimM,
  );
  g.add(base);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.028, 12, 32), trimM);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.86;
  g.add(collar);
  const divider = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.012), trimM);
  divider.position.y = 0.87;
  g.add(divider);
  // pockets: a long ball pocket and a smaller valuables pocket, zip lines
  const pk = (h: number, y: number, a: number, d: number) => {
    const p = new THREE.Mesh(new RoundedBoxGeometry(0.12, h, d, 3, 0.03), nylon);
    p.position.set(Math.cos(a) * 0.12, y, Math.sin(a) * 0.12);
    p.rotation.y = -a;
    g.add(p);
    const zip = new THREE.Mesh(new THREE.BoxGeometry(0.008, h * 0.85, 0.008), chrome);
    zip.position.set(Math.cos(a) * (0.12 + d / 2), y, Math.sin(a) * (0.12 + d / 2));
    g.add(zip);
  };
  pk(0.42, 0.42, Math.PI * 0.5, 0.07);
  pk(0.18, 0.66, Math.PI * 0.2, 0.05);
  // carry strap looping down the back
  const strapC = new THREE.CatmullRomCurve3([V(-0.12, 0.78, 0.03), V(-0.2, 0.62, 0.05), V(-0.21, 0.4, 0.04), V(-0.13, 0.25, 0.02)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(strapC, 20, 0.014, 6, false), trimM));
  // clubs: three woods in knit head covers, five irons, a putter
  const knit = (col: string, stripe: string) => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 128;
    const x = c.getContext('2d')!;
    x.fillStyle = col;
    x.fillRect(0, 0, 64, 128);
    x.fillStyle = stripe;
    for (let y = 20; y < 128; y += 34) x.fillRect(0, y, 64, 10);
    for (let i = 0; i < 64; i += 4)
      for (let y = 0; y < 128; y += 4) {
        x.fillStyle = 'rgba(0,0,0,.12)';
        x.fillRect(i, y + (i % 8 ? 0 : 2), 2, 2);
      }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 1 });
  };
  const covers = [knit('#1f3a6a', '#f0e6d0'), knit('#a8261e', '#f0e6d0'), knit('#2a6a3a', '#e9b23a')];
  [
    [-0.05, 0.05],
    [0.05, 0.06],
    [0.0, -0.04],
  ].forEach(([x, z], i) => {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.3, 6), chrome);
    shaft.position.set(x, 0.98, z);
    g.add(shaft);
    const sock = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          [0.012, 0],
          [0.03, 0.04],
          [0.06, 0.12],
          [0.062, 0.18],
          [0.045, 0.23],
          [0.0, 0.25],
        ].map(([r, y]) => new THREE.Vector2(r, y)),
        18,
      ),
      covers[i],
    );
    sock.position.set(x, 1.04, z);
    sock.rotation.z = (i - 1) * 0.12;
    sock.castShadow = true;
    g.add(sock);
    const pom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 1), covers[i]);
    pom.position.set(x + (i - 1) * 0.03, 1.3, z);
    g.add(pom);
  });
  for (let i = 0; i < 5; i++) {
    // irons: grips down in the bag, heads up — bare steel blades
    const a = Math.PI * (0.9 + i * 0.14),
      x = Math.cos(a) * 0.075,
      z = Math.sin(a) * 0.075;
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.22, 6), chrome);
    sh.position.set(x, 0.97, z);
    g.add(sh);
    const head = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.045, 0.016, 2, 0.006), chrome);
    head.position.set(x + 0.02, 1.09, z);
    head.rotation.set(0, a, 0.25);
    g.add(head);
  }
  const ps = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 6), chrome);
  ps.position.set(0.08, 0.99, -0.03);
  g.add(ps);
  const ph = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.03, 0.025, 2, 0.008), black);
  ph.position.set(0.1, 1.12, -0.03);
  g.add(ph);
  g.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = true;
  });
  return g;
}
const RB = (w: number, h: number, d: number, r: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  return o;
};
// steering wheel: centre, column direction (toward the driver), radius
const WHEEL_C = V(0.12, 1.1, 0.27),
  WHEEL_N = V(-0.62, 0.78, 0).normalize(),
  WHEEL_R = 0.165;
export function cartModel(color: string) {
  const T = cartTextures(),
    root = new THREE.Group(),
    body = new THREE.Group();
  root.add(body);
  const gel = new THREE.MeshPhysicalMaterial({ map: T.body, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const vinyl = new THREE.MeshStandardMaterial({ map: T.vinyl, normalMap: T.vinylN, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.55 });
  const canvas = new THREE.MeshStandardMaterial({ map: T.canvas, normalMap: T.canvasN, roughness: 0.95, side: THREE.DoubleSide });
  const rubber = new THREE.MeshStandardMaterial({ map: T.mat, normalMap: T.matN, roughness: 0.9 });
  const black = new THREE.MeshStandardMaterial({ color: '#1e1e1e', roughness: 0.7 }),
    chrome = new THREE.MeshStandardMaterial({ color: '#dfe3e6', roughness: 0.18, metalness: 0.9 });
  // the body is one side profile extruded across the cart: nose, front wheel arch, open foot well, seat pedestal,
  // rear wheel arch, rear deck — so the tyres sit inside real wheel arches instead of poking through panels
  const prof = new THREE.Shape(),
    ARCH = 0.31,
    AY = 0.25;
  prof.moveTo(-1.24, 0.3);
  prof.lineTo(-0.8 - ARCH, 0.3);
  prof.absarc(-0.8, AY, ARCH, Math.PI - 0.16, 0.16, true);
  prof.lineTo(-0.36, 0.3);
  prof.lineTo(0.8 - ARCH - 0.02, 0.3);
  prof.absarc(0.8, AY, ARCH, Math.PI - 0.16, 0.16, true);
  prof.lineTo(1.24, 0.31);
  prof.quadraticCurveTo(1.29, 0.32, 1.29, 0.4);
  prof.lineTo(1.29, 0.68);
  prof.quadraticCurveTo(1.28, 0.8, 1.18, 0.84);
  prof.lineTo(0.66, 0.94);
  prof.quadraticCurveTo(0.58, 0.95, 0.58, 0.88);
  prof.lineTo(0.56, 0.52);
  prof.lineTo(-0.12, 0.52);
  prof.quadraticCurveTo(-0.15, 0.52, -0.15, 0.56);
  prof.lineTo(-0.15, 0.78);
  prof.lineTo(-0.62, 0.78);
  prof.lineTo(-0.62, 0.92);
  prof.lineTo(-1.18, 0.92);
  prof.quadraticCurveTo(-1.25, 0.92, -1.25, 0.84);
  prof.lineTo(-1.25, 0.36);
  prof.quadraticCurveTo(-1.25, 0.3, -1.24, 0.3);
  const shell = new THREE.ExtrudeGeometry(prof, {
    depth: 1.12,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.03,
    bevelSegments: 4,
    curveSegments: 20,
  });
  shell.translate(0, 0, -0.56);
  // UVs by height so road grime always sits along the bottom edge (the default extrude UVs scatter it in strips):
  // v runs from the sill (0, dirtiest) to the top of the body (1); u runs along whichever side the face looks out of
  shell.computeVertexNormals();
  {
    const P = shell.attributes.position,
      N = shell.attributes.normal,
      uv = shell.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i),
        y = P.getY(i),
        z = P.getZ(i),
        nx = Math.abs(N.getX(i)),
        nz = Math.abs(N.getZ(i));
      uv.setXY(i, (nx > nz ? z : x) * 0.42 + 0.5, THREE.MathUtils.clamp((y - 0.28) / 0.68, 0, 1));
    }
    uv.needsUpdate = true;
  }
  body.add(new THREE.Mesh(shell, gel));
  // dark wheel-well liners so you don't see daylight through the arches
  for (const x of [0.8, -0.8]) {
    const lin = new THREE.Mesh(
      new THREE.CylinderGeometry(ARCH - 0.01, ARCH - 0.01, 1.1, 24, 1, true, Math.PI / 2 + 0.17, Math.PI - 0.34),
      new THREE.MeshStandardMaterial({ color: '#1a1714', roughness: 1, side: THREE.DoubleSide }),
    );
    lin.rotation.x = Math.PI / 2;
    lin.position.set(x, AY, 0);
    body.add(lin);
  }
  body.add(RB(0.68, 0.025, 1.04, 0.01, rubber, 0.2, 0.535, 0)); // floor mat in the foot well
  // pinstripe in the player's colour (front and rear sections, above the arches)
  for (const z of [0.6, -0.6]) {
    body.add(
      RB(0.66, 0.05, 0.02, 0.01, paint, 0.92, 0.62, z),
      RB(0.6, 0.05, 0.02, 0.01, paint, -0.94, 0.62, z),
      RB(0.46, 0.05, 0.02, 0.01, paint, -0.38, 0.62, z),
    );
  }
  // rubber bumpers, front and back
  body.add(RB(0.08, 0.1, 1.26, 0.035, black, 1.32, 0.36, 0), RB(0.08, 0.1, 1.26, 0.035, black, -1.3, 0.36, 0));
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.13),
    new THREE.MeshStandardMaterial({ map: plateTex(color, 'GH ' + (1 + Math.floor(Math.random() * 40))), roughness: 0.4 }),
  );
  plate.position.set(1.296, 0.44, 0);
  plate.rotation.set(0, Math.PI / 2, 0);
  body.add(plate);
  // dash with a key and cup holders
  body.add(RB(0.16, 0.1, 1.0, 0.04, black, 0.62, 0.95, 0));
  for (const z of [-0.3, -0.12]) {
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.05, 14, 1, true), black);
    ch.position.set(0.62, 1.0, z);
    body.add(ch);
  }
  // bench seat: cushion + backrest, pleated vinyl
  body.add(RB(0.5, 0.12, 1.08, 0.05, vinyl, -0.38, 0.84, 0));
  const back = RB(0.1, 0.42, 1.08, 0.05, vinyl, -0.66, 1.08, 0);
  back.rotation.z = 0.12;
  body.add(back);
  // canopy: chrome struts + canvas roof
  for (const [x, z] of [
    [0.58, 0.54],
    [0.58, -0.54],
  ]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.14, 10), chrome);
    p.position.set(x + 0.05, 1.42, z);
    p.rotation.z = 0.08;
    p.castShadow = true;
    body.add(p);
  }
  for (const [x, z] of [
    [-0.74, 0.54],
    [-0.74, -0.54],
  ]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.08, 10), chrome);
    p.position.set(x, 1.45, z);
    p.castShadow = true;
    body.add(p);
  }
  body.add(RB(1.7, 0.07, 1.36, 0.03, canvas, -0.05, 2.0, 0));
  // steering column + wheel (spokes) facing the driver
  const colLen = 0.5,
    colStart = WHEEL_C.clone().addScaledVector(WHEEL_N, -colLen);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, colLen, 10), black);
  col.position.copy(WHEEL_C).addScaledVector(WHEEL_N, -colLen / 2);
  col.quaternion.setFromUnitVectors(V(0, 1, 0), WHEEL_N);
  body.add(col);
  void colStart;
  const sw = new THREE.Group();
  sw.position.copy(WHEEL_C);
  sw.quaternion.setFromUnitVectors(V(0, 0, 1), WHEEL_N);
  body.add(sw);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R, 0.018, 8, 28), black);
  sw.add(rim);
  for (let k = 0; k < 3; k++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.02, WHEEL_R, 0.012), black);
    const a = (k * Math.PI * 2) / 3 - Math.PI / 2;
    sp.position.set((Math.cos(a) * WHEEL_R) / 2, (Math.sin(a) * WHEEL_R) / 2, 0);
    sp.rotation.z = a + Math.PI / 2;
    sw.add(sp);
  }
  sw.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 14).rotateX(Math.PI / 2), black));
  // golf bag strapped into the rack behind the seat
  const bagG = golfBag(T.bag, chrome, black);
  bagG.position.set(-0.95, 0.92, 0.27);
  bagG.rotation.z = 0.32;
  body.add(bagG);
  {
    const strap = RB(0.03, 0.05, 0.32, 0.012, black, -0.86, 1.18, 0.27);
    strap.rotation.z = 0.32;
    body.add(strap);
  }
  body.add(RB(0.16, 0.06, 0.5, 0.02, black, -0.98, 0.95, 0.27)); // rack cradle
  // headlights: chrome bezel, a reflector bowl, clear domed lens, warm bulb; tail lights: red lenses in black housings
  for (const z of [0.38, -0.38]) {
    const hl = new THREE.Group();
    hl.position.set(1.295, 0.6, z);
    hl.rotation.z = -Math.PI / 2;
    body.add(hl);
    const bez = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.013, 10, 28), chrome);
    bez.rotation.x = Math.PI / 2;
    hl.add(bez);
    const refl = new THREE.Mesh(
      new THREE.LatheGeometry(
        [V(0.012, -0.045), V(0.03, -0.042), V(0.05, -0.03), V(0.064, -0.006), V(0.066, 0)].map(p => new THREE.Vector2(p.x, p.y)),
        28,
      ),
      new THREE.MeshStandardMaterial({ color: '#e8ecef', metalness: 1, roughness: 0.08, side: THREE.DoubleSide }),
    );
    hl.add(refl);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.014, 12, 8),
      new THREE.MeshStandardMaterial({ color: '#fff6d8', emissive: '#ffe9b0', emissiveIntensity: 1.2 }),
    );
    bulb.position.y = -0.022;
    hl.add(bulb);
    const lens = new THREE.Mesh(
      new THREE.SphereGeometry(0.068, 28, 10, 0, Math.PI * 2, 0, 0.5),
      new THREE.MeshPhysicalMaterial({
        color: '#ffffff',
        roughness: 0.03,
        transmission: 0.85,
        thickness: 0.01,
        transparent: true,
        opacity: 0.35,
        clearcoat: 1,
      }),
    );
    lens.position.y = -0.058;
    lens.scale.y = 0.55;
    hl.add(lens);
    const tl = new THREE.Group();
    tl.position.set(-1.262, 0.75, z * 1.1);
    body.add(tl);
    tl.add(RB(0.03, 0.09, 0.15, 0.015, black, 0, 0, 0));
    const red = RB(
      0.012,
      0.07,
      0.13,
      0.01,
      new THREE.MeshPhysicalMaterial({ color: '#b01818', emissive: '#5a0000', roughness: 0.15, clearcoat: 1 }),
      -0.016,
      0,
      0,
    );
    tl.add(red);
  }
  // wheels (spun, steered and moved by the suspension at runtime)
  const tread = new THREE.MeshStandardMaterial({ map: T.tread, normalMap: T.treadN, roughness: 0.9 }),
    side = new THREE.MeshStandardMaterial({ map: T.side, roughness: 0.6, metalness: 0.3 });
  const wheels: THREE.Object3D[] = [];
  for (const [x, z] of [
    [0.8, 0.58],
    [0.8, -0.58],
    [-0.8, 0.58],
    [-0.8, -0.58],
  ]) {
    const w = new THREE.Group(),
      tire = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.19, 28), [tread, side, side]);
    tire.rotation.x = Math.PI / 2;
    tire.castShadow = true;
    w.add(tire);
    w.position.set(x, 0.22, z);
    root.add(w);
    wheels.push(w);
  }
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return { root, body, wheels, wheel: sw };
}

// ---------------------------------------------------------------- go-kart (Fun Land)
// A chunky arcade kart on the golf cart's running gear: low floor pan, a rounded nose, side pods, a bucket seat you
// sit down into, the engine and twin exhausts behind it, fat tyres (fatter at the back). Forward is +X.
const KART_WC = V(0.2, 0.6, 0),
  KART_WN = V(-0.72, 0.69, 0).normalize(),
  KART_WR = 0.15;
export function kartModel(color: string) {
  const T = cartTextures(),
    root = new THREE.Group(),
    body = new THREE.Group();
  root.add(body);
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
    trim = new THREE.MeshStandardMaterial({ color: '#f1eee6', roughness: 0.5 }),
    black = new THREE.MeshStandardMaterial({ color: '#1e1e1e', roughness: 0.7 }),
    seatM = new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.6 }),
    chrome = new THREE.MeshStandardMaterial({ color: '#dfe3e6', roughness: 0.18, metalness: 0.9 }),
    engine = new THREE.MeshStandardMaterial({ color: '#4a4e55', roughness: 0.5, metalness: 0.5 });
  // floor pan and frame rails
  body.add(RB(1.95, 0.07, 0.86, 0.03, black, 0, 0.19, 0));
  for (const z of [-0.44, 0.44]) body.add(cyRod(1.9, 0.03, chrome, 0, 0.22, z));
  // nose: a low wide front fairing with a raised centre cone, a white stripe, a bumper hoop and the number plate
  const numTex = plateTex('#f1eee6', '7');
  const plateM = new THREE.MeshStandardMaterial({ map: numTex, roughness: 0.5 });
  body.add(
    RB(0.46, 0.15, 1.0, 0.07, paint, 0.98, 0.29, 0),
    RB(0.74, 0.2, 0.36, 0.1, paint, 0.66, 0.36, 0),
    RB(0.76, 0.012, 0.1, 0.005, trim, 0.66, 0.462, 0),
  );
  body.add(
    cyRod(1.06, 0.03, chrome, 1.24, 0.25, 0, true),
    cyRod(0.12, 0.025, chrome, 1.19, 0.25, 0.42),
    cyRod(0.12, 0.025, chrome, 1.19, 0.25, -0.42),
  );
  // the steering fairing: an upright panel ahead of the wheel carrying the number
  const fair = RB(0.05, 0.3, 0.36, 0.025, paint, 0.4, 0.56, 0);
  fair.rotation.z = -0.5;
  const fp = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), plateM);
  fp.position.set(0.43, 0.575, 0);
  fp.rotation.set(0, Math.PI / 2, 0);
  fp.rotateX(-0.5);
  body.add(fair, fp);
  // front axle, tie rod and pedals
  body.add(
    cyRod(1.04, 0.022, black, 0.8, 0.22, 0, true),
    cyRod(0.9, 0.012, chrome, 0.7, 0.27, 0, true),
    bx(0.03, 0.12, 0.08, chrome, 0.66, 0.3, 0.16),
    bx(0.03, 0.12, 0.08, chrome, 0.66, 0.3, -0.16),
  );
  // side pods
  for (const z of [-0.52, 0.52]) {
    body.add(RB(1.02, 0.21, 0.26, 0.1, paint, -0.04, 0.32, z), RB(0.8, 0.02, 0.09, 0.008, trim, -0.04, 0.428, z));
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17), plateM);
    sp.position.set(-0.04, 0.33, z + Math.sign(z) * 0.132);
    if (z < 0) sp.rotation.y = Math.PI;
    body.add(sp);
  }
  // bucket seat: cushion, a raked back with side bolsters, a headrest
  body.add(RB(0.44, 0.1, 0.46, 0.04, seatM, -0.3, 0.3, 0));
  const back = RB(0.1, 0.58, 0.46, 0.04, seatM, -0.58, 0.58, 0);
  back.rotation.z = 0.22;
  const head = RB(0.09, 0.2, 0.26, 0.04, seatM, -0.69, 0.95, 0);
  head.rotation.z = 0.22;
  body.add(back, head);
  for (const z of [-0.25, 0.25]) {
    const bol = RB(0.4, 0.2, 0.06, 0.025, seatM, -0.36, 0.42, z);
    body.add(bol);
  }
  // engine, air filter, fuel tank and twin exhausts behind the seat; a rear bumper
  body.add(
    RB(0.34, 0.3, 0.5, 0.04, engine, -0.92, 0.4, 0),
    cy(0.09, 0.16, trim, -0.92, 0.62, 0.12, 14),
    cy(0.07, 0.1, M('#c8452f', 0.4), -0.92, 0.6, -0.13, 12),
  );
  for (const z of [-0.17, 0.17]) {
    const ex = cyRod(0.5, 0.045, chrome, -1.12, 0.5, z);
    ex.rotation.z = Math.PI / 2 - 0.35; // sweeping up toward the back
    body.add(ex);
  }
  body.add(cyRod(1.0, 0.03, chrome, -1.24, 0.3, 0, true), cyRod(0.2, 0.025, chrome, -1.15, 0.3, 0.4), cyRod(0.2, 0.025, chrome, -1.15, 0.3, -0.4));
  for (let i = 0; i < 4; i++) body.add(bx(0.3, 0.012, 0.42, engine, -0.92, 0.5 + i * 0.03, 0)); // cooling fins
  body.add(RB(0.05, 0.3, 0.12, 0.02, paint, -0.53, 0.62, 0)); // a stripe down the seat back
  // steering column and wheel
  const col = cyRod(0.5, 0.018, black, 0.38, 0.41, 0);
  col.quaternion.setFromUnitVectors(V(0, 1, 0), KART_WN);
  body.add(col);
  const sw = new THREE.Group();
  sw.position.copy(KART_WC);
  sw.quaternion.setFromUnitVectors(V(0, 0, 1), KART_WN);
  body.add(sw);
  sw.add(
    new THREE.Mesh(new THREE.TorusGeometry(KART_WR, 0.02, 8, 24), black),
    new THREE.Mesh(new THREE.BoxGeometry(KART_WR * 2, 0.03, 0.014), chrome),
  );
  // wheels: small at the front, fat at the back (spun, steered and moved by the suspension at runtime)
  const tread = new THREE.MeshStandardMaterial({ map: T.tread, normalMap: T.treadN, roughness: 0.9 }),
    side = new THREE.MeshStandardMaterial({ color: '#17171a', roughness: 0.75 });
  const wheels: THREE.Object3D[] = [];
  for (const [x, z] of [
    [0.8, 0.58],
    [0.8, -0.58],
    [-0.8, 0.58],
    [-0.8, -0.58],
  ]) {
    const w = new THREE.Group(),
      rear = x < 0,
      tire = new THREE.Mesh(new THREE.CylinderGeometry(rear ? 0.25 : 0.21, rear ? 0.25 : 0.21, rear ? 0.3 : 0.2, 24), [tread, side, side]);
    tire.rotation.x = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(rear ? 0.13 : 0.11, rear ? 0.13 : 0.11, (rear ? 0.3 : 0.2) + 0.012, 16), paint),
      cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, (rear ? 0.3 : 0.2) + 0.03, 10), chrome);
    hub.rotation.x = cap.rotation.x = Math.PI / 2;
    w.add(tire, hub, cap);
    w.position.set(x, 0.22, z);
    root.add(w);
    wheels.push(w);
  }
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return { root, body, wheels, wheel: sw };
}
/** A rod along X (or along Z when across is set). */
function cyRod(len: number, r: number, m: THREE.Material, x: number, y: number, z: number, across = false) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), m);
  if (across) o.rotation.x = Math.PI / 2;
  else o.rotation.z = Math.PI / 2;
  o.position.set(x, y, z);
  return o;
}

class Cart implements Vehicle {
  readonly kind: string = 'cart';
  readonly name: string = 'Golf cart';
  root: THREE.Object3D;
  seatParent: THREE.Object3D;
  /** golfer root in body space: hips land on the cushion, slightly to the driver's side */
  seat = V(-0.36, -0.07, 0.27);
  ride: 'sit' = 'sit';
  riderYaw = Math.PI / 2;
  private wheels: THREE.Object3D[];
  private steerWheel: THREE.Object3D;
  private body3: THREE.Object3D;
  private body: import('@dimforge/rapier3d-compat').RigidBody | null = null;
  private vc: import('@dimforge/rapier3d-compat').DynamicRayCastVehicleController | null = null;
  private stepFn: ((dt: number) => void) | null = null;
  private inp: DriveInput = { throttle: 0, steer: 0, brake: true };
  private steer = 0;
  private spin = 0;
  private remoteSpeed = 0;
  private tp = V();
  private tq = new THREE.Quaternion();
  private have = false;
  // body sway on the springs (visual, on top of the physics): pitch under throttle/brake, roll in corners, bob over bumps
  private sway = { roll: 0, pitch: 0, vr: 0, vp: 0, lastV: V(), bob: 0, vb: 0 };
  private susp = [0.25, 0.25, 0.25, 0.25];
  // drifting (arcade, kart-style): hold the brake while steering at speed. The tail steps out, the cart holds a slide,
  // a charge builds (smoke goes white → blue → orange), and letting go fires a short boost.
  private drift = 0; // −1 / +1 while sliding
  private charge = 0;
  private boostT = 0;
  private smoke: { pts: THREE.Points; pos: Float32Array; col: Float32Array; vel: Float32Array; age: Float32Array; i: number; emit: number } | null =
    null;
  constructor(
    private pw: PhysWorld | null,
    scene: THREE.Object3D,
    color: string,
    owner: boolean,
    private kart = false,
  ) {
    const m = kart ? kartModel(color) : cartModel(color);
    if (kart) {
      this.kind = 'kart';
      this.name = 'Go-kart';
      this.seat = V(-0.27, -0.6, 0); // down in the bucket seat, on the centre line
    }
    this.root = m.root;
    this.body3 = m.body;
    this.seatParent = m.body;
    this.wheels = m.wheels;
    this.steerWheel = m.wheel;
    scene.add(m.root);
    const R = rapier();
    if (!pw || !R) return;
    if (owner) {
      const b = pw.world.createRigidBody(
        R.RigidBodyDesc.dynamic().setTranslation(0, 1, 0).setLinearDamping(0.12).setAngularDamping(1.6).setCcdEnabled(true),
      );
      // chassis box (the canopy isn't solid: the cart can roll under branches) + low ballast for a planted centre of mass
      pw.world.createCollider(
        R.ColliderDesc.cuboid(1.18, 0.24, 0.6)
          .setTranslation(0, 0.5, 0)
          .setMass(260)
          .setFriction(0.4)
          .setCollisionGroups(grp(G_VEH, G_STATIC | G_RAG | G_VEH)),
        b,
      );
      pw.world.createCollider(R.ColliderDesc.cuboid(0.6, 0.05, 0.4).setTranslation(0, 0.18, 0).setMass(160).setCollisionGroups(0), b);
      const vc = pw.world.createVehicleController(b);
      for (const [x, z] of [
        [0.8, 0.58],
        [0.8, -0.58],
        [-0.8, 0.58],
        [-0.8, -0.58],
      ])
        vc.addWheel({ x, y: 0.46, z }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, 0.32, 0.22);
      for (let i = 0; i < 4; i++) {
        // soft, long-travel springs; grippy tyres
        vc.setWheelSuspensionStiffness(i, 16);
        vc.setWheelSuspensionCompression(i, 2.3);
        vc.setWheelSuspensionRelaxation(i, 2.6);
        vc.setWheelMaxSuspensionTravel(i, 0.3);
        vc.setWheelMaxSuspensionForce(i, 30000); // big landings
        vc.setWheelFrictionSlip(i, 2.2);
        vc.setWheelSideFrictionStiffness(i, 1.1);
      }
      this.body = b;
      this.vc = vc;
      const groups = grp(0xffff, G_STATIC);
      this.stepFn = (dt: number) => {
        const v = this.vc!,
          sp = v.currentVehicleSpeed(),
          i = this.inp,
          K = 1,
          // a kart is tuned to its little track: quick off the line and through the hairpins, but a modest top speed
          top = this.kart ? (this.drift ? 10.5 : i.boost ? 13.8 : 11.6) : this.boostT > 0 ? 23 : i.boost ? 19 : 14;
        // steering: quick at walking pace, calmer at speed, returns to centre on its own
        // drift: starts when the brake goes down mid-turn at speed, ends when it comes up (boost!) or the cart slows right down
        if (!this.drift && i.brake && Math.abs(i.steer) > 0.3 && sp > (this.kart ? 4.5 : 6.5) && i.throttle >= 0) {
          this.drift = Math.sign(i.steer);
          this.charge = 0;
          if (this.kart && this.body) this.body.applyImpulse({ x: 0, y: this.body.mass() * 1.9, z: 0 }, true); // the little hop into a drift
        } else if (this.drift && (!i.brake || sp < (this.kart ? 2.5 : 3.5))) {
          // the golf cart earns a boost from a held slide; the go-kart doesn't (its track is too small for it)
          if (!this.kart && !i.brake && this.charge > 0.7) this.boostT = this.charge > 1.8 ? 1.5 : 0.8;
          this.drift = 0;
        }
        const D = this.drift;
        this.boostT = Math.max(0, this.boostT - dt);
        if (D && !this.kart) this.charge += dt * (0.7 + 0.5 * Math.max(0, i.steer * D));
        for (const k of [2, 3]) v.setWheelSideFrictionStiffness(k, D ? (this.kart ? 0.46 : 0.38) : this.kart ? 1.5 : 1.1); // the back end lets go
        if (this.kart) for (const k of [0, 1]) v.setWheelSideFrictionStiffness(k, 1.6); // a kart's front end bites
        const want = D
          ? D * (this.kart ? 0.16 : 0.3) + i.steer * (this.kart ? 0.34 : 0.3)
          : i.steer * (this.kart ? 0.7 : 0.62) * (1 - Math.min(this.kart ? 0.35 : 0.55, Math.abs(sp) / (this.kart ? 26 : 22)));
        this.steer += (want - this.steer) * Math.min(1, dt * (i.steer ? (this.kart ? 9 : 6) : 9));
        if (D && this.kart && this.body) {
          // a kart's slide holds its angle instead of curling in: the spin is capped (more when steering in, less out)
          const w = this.body.angvel(),
            cap = 1.2 + 0.45 * i.steer * D;
          if (Math.abs(w.y) > cap)
            this.body.setAngvel({ x: w.x, y: Math.sign(w.y) * (Math.abs(w.y) + (cap - Math.abs(w.y)) * Math.min(1, dt * 10)), z: w.z }, true);
        }
        v.setWheelSteering(0, this.steer);
        v.setWheelSteering(1, this.steer);
        const dir = i.throttle > 0 ? (sp < top ? 1 : 0) : i.throttle < 0 ? (sp > 0.6 ? 0 : sp > -4.5 ? -1 : 0) : 0,
          force =
            this.boostT > 0
              ? 3400 * K
              : (this.drift ? Math.max(dir, 0.6) : dir) *
                (i.boost ? 2100 : 1550) *
                K *
                (this.kart && sp < 8 ? 1.5 : 1) *
                (1 - Math.min(0.65, Math.abs(sp) / (top * 1.5)));
        v.setWheelEngineForce(2, force);
        v.setWheelEngineForce(3, force);
        const braking = (i.brake && !this.drift) || (i.throttle < 0 && sp > 0.6),
          coast = !i.throttle && !i.brake;
        for (let k = 0; k < 4; k++) v.setWheelBrake(k, braking ? (this.kart ? 30 : 22) : coast ? (this.kart ? 5 : 2.2) : 0); // a kart sheds speed when you lift, to set up the corner
        v.updateVehicle(dt, undefined, groups);
        if (D) {
          // hold the slide: turn at a steady rate set by the stick (tighter when steering in, wider when steering out)
          const w = this.body!.angvel(),
            target = D * (1.15 + 0.6 * i.steer * D),
            k = Math.min(1, dt * 5);
          this.body!.setAngvel({ x: w.x, y: w.y + (target - w.y) * k, z: w.z }, true);
        }
        // a little arcade hang time: once all four wheels leave the ground at speed, gravity eases off a touch
        let air = true;
        for (let k = 0; k < 4; k++)
          if (v.wheelIsInContact(k)) {
            air = false;
            break;
          }
        this.body!.setGravityScale(air && Math.abs(sp) > 6 ? 0.72 : 1, false);
        // keep it on its wheels: gentle self-righting when tipped well over
        const r = this.body!.rotation(),
          up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w));
        if (up.y < 0.82 && up.y > -0.2) {
          const ax = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 1, 0)).multiplyScalar(260 * dt * (0.82 - up.y) * 4);
          this.body!.applyTorqueImpulse({ x: ax.x, y: 0, z: ax.z }, true);
        }
      };
      pw.pre.add(this.stepFn);
    } else {
      // someone else's cart: a moving solid so our cart (and ragdolls) bump into it
      const b = pw.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -50, 0));
      pw.world.createCollider(
        R.ColliderDesc.cuboid(1.18, 0.45, 0.6)
          .setTranslation(0, 0.7, 0)
          .setCollisionGroups(grp(G_VEH, G_RAG | G_VEH)),
        b,
      );
      this.body = b;
    }
  }
  steering() {
    return this.steer / 0.62;
  }
  private _ct = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  contacts() {
    this.root.updateMatrixWorld();
    this.wheels.forEach((w, i) => this._ct[i].set(w.position.x, w.position.y - 0.22, w.position.z).applyMatrix4(this.root.matrixWorld));
    return this._ct;
  }
  grips() {
    // hands at ten-to-two on the rim, turned with the wheel; feet on the floor mat
    const [WC, WN, WR] = this.kart ? [KART_WC, KART_WN, KART_WR] : [WHEEL_C, WHEEL_N, WHEEL_R];
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), WN),
      turn = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -this.steer * 2.2),
      hand = (a: number) =>
        V(Math.cos(a) * WR, Math.sin(a) * WR, 0)
          .applyQuaternion(turn)
          .applyQuaternion(q)
          .add(WC);
    return {
      hands: [hand(Math.PI * 0.85), hand(Math.PI * 0.15)] as [THREE.Vector3, THREE.Vector3],
      feet: (this.kart ? [V(0.62, 0.3, 0.15), V(0.62, 0.3, -0.15)] : [V(0.3, 0.58, 0.38), V(0.33, 0.58, 0.17)]) as [THREE.Vector3, THREE.Vector3],
    };
  }
  placeAt(x: number, y: number, z: number, yaw: number) {
    const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw - Math.PI / 2); // yaw: heading like the golfer (0 = +Z); model forward is +X
    this.root.position.set(x, y, z);
    this.root.quaternion.copy(q);
    this.tp.set(x, y, z);
    this.tq.copy(q);
    this.have = true;
    if (this.body) {
      this.body.setTranslation({ x, y: y + 0.2, z }, true);
      this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }
  /** springy body: driven by acceleration in the cart's own frame, plus how hard the wheels are working */
  private swayStep(dt: number, vel: THREE.Vector3) {
    const S = this.sway,
      acc = vel.clone().sub(S.lastV).divideScalar(Math.max(dt, 1e-3));
    S.lastV.copy(vel);
    const inv = this.root.quaternion.clone().invert(),
      la = acc.applyQuaternion(inv); // x: forward accel, z: sideways
    const tRoll = THREE.MathUtils.clamp(la.z * 0.012, -0.07, 0.07) + this.drift * 0.11, // leaning hard into a drift
      tPitch = THREE.MathUtils.clamp(-la.x * 0.01, -0.05, 0.05);
    const k = 90,
      c = 9,
      dtc = Math.min(dt, 0.05);
    S.vr += ((tRoll - S.roll) * k - S.vr * c) * dtc;
    S.roll += S.vr * dtc;
    S.vp += ((tPitch - S.pitch) * k - S.vp * c) * dtc;
    S.pitch += S.vp * dtc;
    const avg = this.susp.reduce((a, b) => a + b, 0) / 4,
      tBob = (0.25 - avg) * 0.35;
    S.vb += ((tBob - S.bob) * 120 - S.vb * 10) * dtc;
    S.bob += S.vb * dtc;
    this.body3.rotation.set(S.roll, 0, S.pitch);
    this.body3.position.y = S.bob;
  }
  drive(dt: number, inp: DriveInput) {
    this.inp = inp;
    if (!this.body || !this.vc) return;
    const t = this.body.translation(),
      r = this.body.rotation();
    this.root.position.set(t.x, t.y, t.z);
    this.root.quaternion.set(r.x, r.y, r.z, r.w);
    const sp = this.vc.currentVehicleSpeed();
    this.spin += (sp * dt) / 0.22;
    this.wheels.forEach((w, i) => {
      const sl = this.vc!.wheelSuspensionLength(i) ?? 0.25;
      this.susp[i] = sl;
      w.position.y = 0.46 - sl;
      w.rotation.set(0, i < 2 ? this.steer : 0, 0);
      w.rotateZ(-this.spin);
    });
    this.steerWheel.rotation.z = 0;
    this.steerWheel.rotateZ(-this.steer * 2.2);
    this.swayStep(dt, this.velocity(V()));
    this.smokeStep(dt);
  }
  /** 0 not drifting · 1 sliding · 2 charged (blue) · 3 fully charged (orange); also true for a moment while boosting */
  drifting() {
    return this.drift ? (this.charge > 1.8 ? 3 : this.charge > 0.7 ? 2 : 1) : 0;
  }
  boosting() {
    return this.boostT > 0;
  }
  /** Tyre smoke from the back wheels while sliding, and a streak of sparks while boosting. */
  private smokeStep(dt: number) {
    const lvl = this.drifting(),
      N = 44;
    if (!this.smoke) {
      // made as soon as the vehicle exists (not on the first drift), so its shader is ready before the first corner
      if (!this.root.parent) return;
      const pos = new Float32Array(N * 3),
        col = new Float32Array(N * 3),
        g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(
        g,
        new THREE.PointsMaterial({ size: 0.36, vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, sizeAttenuation: true }), // small puffs: big ones right in front of the chase camera cost a lot to draw
      );
      pts.frustumCulled = false;
      this.root.parent?.add(pts);
      pos.fill(-99);
      this.smoke = { pts, pos, col, vel: new Float32Array(N * 3), age: new Float32Array(N).fill(9), i: 0, emit: 0 };
    }
    const S = this.smoke;
    if (lvl || this.boostT > 0) {
      S.emit += dt * 30;
      const c = this.boostT > 0 ? [1, 0.75, 0.3] : lvl === 3 ? [1, 0.55, 0.2] : lvl === 2 ? [0.45, 0.7, 1] : [0.92, 0.9, 0.86];
      while (S.emit >= 1) {
        S.emit--;
        const k = (S.i = (S.i + 1) % N),
          w = this.wheels[2 + (k % 2)].getWorldPosition(V());
        S.pos.set([w.x, w.y - 0.2, w.z], k * 3);
        S.vel.set([(Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 0.9, (Math.random() - 0.5) * 1.2], k * 3);
        S.col.set(c, k * 3);
        S.age[k] = 0;
      }
    }
    for (let k = 0; k < N; k++) {
      if ((S.age[k] += dt) > 0.9) {
        S.pos[k * 3 + 1] = -99; // spent: park it out of sight
        continue;
      }
      for (let a = 0; a < 3; a++) S.pos[k * 3 + a] += S.vel[k * 3 + a] * dt;
    }
    S.pts.geometry.attributes.position.needsUpdate = true;
    S.pts.geometry.attributes.color.needsUpdate = true;
  }
  velocity(out: THREE.Vector3) {
    const v = this.body?.linvel();
    return v ? out.set(v.x, v.y, v.z) : out.set(0, 0, 0);
  }
  speed() {
    return this.vc ? this.vc.currentVehicleSpeed() : this.remoteSpeed;
  }
  state(): VehState {
    const p = this.root.position,
      q = this.root.quaternion;
    return {
      k: this.kind,
      p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)],
      q: [q.x, q.y, q.z, q.w].map(v => +v.toFixed(3)),
      s: +this.speed().toFixed(1),
      st: +this.steer.toFixed(2),
    };
  }
  follow(st: VehState, dt: number) {
    if (!st?.p || !st?.q) return;
    this.tp.set(st.p[0], st.p[1], st.p[2]);
    this.tq.set(st.q[0], st.q[1], st.q[2], st.q[3]).normalize();
    if (!this.have) {
      this.root.position.copy(this.tp);
      this.root.quaternion.copy(this.tq);
      this.have = true;
    }
    const prev = this.root.position.clone(),
      k = 1 - Math.exp(-dt * 10);
    this.root.position.lerp(this.tp, k);
    this.root.quaternion.slerp(this.tq, k);
    this.remoteSpeed = st.s || 0;
    this.steer = st.st || 0;
    this.spin += (this.remoteSpeed * dt) / 0.22;
    this.wheels.forEach((w, i) => {
      w.position.y = 0.21;
      w.rotation.set(0, i < 2 ? this.steer : 0, 0);
      w.rotateZ(-this.spin);
    });
    this.steerWheel.rotation.z = 0;
    this.steerWheel.rotateZ(-this.steer * 2.2);
    this.swayStep(dt, this.root.position.clone().sub(prev).divideScalar(Math.max(dt, 1e-3)));
    if (this.body) {
      const p = this.root.position,
        q = this.root.quaternion;
      this.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
      this.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
  }
  dispose() {
    if (this.stepFn) this.pw?.pre.delete(this.stepFn);
    if (this.vc)
      try {
        this.pw?.world.removeVehicleController(this.vc);
      } catch {}
    if (this.body)
      try {
        this.pw?.world.removeRigidBody(this.body);
      } catch {}
    this.smoke?.pts.removeFromParent();
    this.root.removeFromParent();
  }
}
VEHICLES.cart = { kind: 'cart', name: 'Golf cart', make: (pw, scene, color, owner) => new Cart(pw, scene, color, owner) };
VEHICLES.kart = { kind: 'kart', name: 'Go-kart', make: (pw, scene, color, owner) => new Cart(pw, scene, color, owner, true) };
