// Vehicles. A small open framework: every vehicle is a model + (for its owner) a physics body, and a compact network
// state everyone else interpolates. The golf cart is the first; low riders, jetpacks and segways slot in as more kinds.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PhysWorld, rapier, G_STATIC, G_RAG, G_VEH, grp } from '../physics/ragdoll';
import { loadProps, type PropPack } from '../world/propPacks';

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
  /** Half its length and half its width (m), for people walking into it. */
  half?: [number, number];
  /** How rough the ground under it is, set by whoever drives it: 0 road … 1 long grass (more for sand). Cars care; carts don't. */
  terrain?: number;
  /** A car's engine right now (revs, gear with 0 = reverse, load 0–1, how deep or high its voice is); null for electric things. */
  engine?(): { rpm: number; gear: number; load: number; tone: number } | null;
  dispose(): void;
}
export interface VehicleKind {
  kind: string;
  name: string;
  make(pw: PhysWorld | null, scene: THREE.Object3D, color: string, owner: boolean): Vehicle;
}
export const VEHICLES: Record<string, VehicleKind> = {};
const _in = new THREE.Vector3();
/** Is the point (x, z) inside a vehicle's body, grown by r? (Its own length and width, whichever way it is facing.) */
export function insideVehicle(c: Vehicle, x: number, z: number, r = 0) {
  const l = c.root.worldToLocal(_in.set(x, c.root.position.y + 0.5, z)),
    [hx, hz] = c.half || [1.25, 0.7];
  return Math.abs(l.x) < hx + r && Math.abs(l.z) < hz + r && l.y > -1.5 && l.y < 2.6;
}

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

// ---------------------------------------------------------------- cars (the auto shop on the West Side)
// A player's own car replaces the golf cart everywhere: in town and on the course. The bodies are from the
// "54 Vehicle Pack" (PorscheAaron, CC BY 4.0; docs/credits.md), on the golf cart's running gear with each car's own
// wheelbase, track, size, top speed and pull. The pack's wheels are part of each body and can't turn, so each car gets
// turning wheels of its own standing over them. Forward is +X (the pack's noses point along -x; the body is turned round).
export interface CarSpec {
  id: string;
  /** the model's name in the pack */
  obj: string;
  name: string;
  blurb: string;
  price: number;
  /** length, width, height (m) */
  size: [number, number, number];
  /** front and rear axle (x), the tyres' outer and inner faces (|z|), wheel radius */
  axles: [number, number];
  tyre: [number, number];
  r: number;
  /** where the driver sits (x; and the cab's height when it isn't the whole height) */
  seatX: number;
  cabH?: number;
  bike?: boolean;
  /** top speed and pull against the golf cart's */
  speed: number;
  power: number;
  /** how little it minds leaving the road: 0 a low sedan … 1 a 4×4 (default 0.3) */
  offroad?: number;
  /** the engine's voice: 1 a four-cylinder car, lower for trucks, higher for motorcycles */
  tone?: number;
  /** a bigger body on bigger wheels (the monster truck): body scale, and its lift off the ground */
  scale?: number;
  lift?: number;
}
const car = (
  id: string,
  obj: number,
  name: string,
  blurb: string,
  price: number,
  size: [number, number, number],
  axles: [number, number],
  tyre: [number, number],
  r: number,
  seatX: number,
  speed: number,
  power: number,
  extra: Partial<CarSpec> = {},
): CarSpec => ({ id, obj: 'Object_' + obj, name, blurb, price, size, axles, tyre, r, seatX, speed, power, ...extra });
export const CARS: CarSpec[] = [
  car('rusty', 20, 'Rusty pickup', 'Runs. Mostly.', 1500, [4.48, 1.79, 1.8], [1.47, -1.32], [0.82, 0.66], 0.38, 0.05, 1.1, 1.0),
  car('dirt', 23, 'Dirt bike', 'Light, loud and quick off the line.', 1800, [2.22, 0.8, 1.3], [0.75, -0.75], [0.36, 0.28], 0.38, -0.1, 1.45, 1.6, {
    bike: true,
  }),
  car(
    'sedan',
    25,
    'Brougham sedan',
    'Velour seats and a boat for a bonnet.',
    2500,
    [4.72, 2.03, 1.25],
    [1.54, -1.12],
    [0.95, 0.73],
    0.35,
    -0.25,
    1.25,
    1.15,
  ),
  car('town', 49, 'Town sedan', 'Sensible. Teal.', 3500, [4.95, 1.86, 1.41], [1.51, -1.25], [0.87, 0.67], 0.34, -0.15, 1.3, 1.2),
  car(
    'van',
    14,
    'Work van',
    'Room for the whole foursome and their bags.',
    4000,
    [4.54, 2.06, 1.93],
    [1.53, -1.27],
    [0.96, 0.7],
    0.37,
    0.75,
    1.1,
    1.0,
  ),
  car(
    'cruiser',
    17,
    'Cruiser',
    'A motorcycle for arriving slowly on purpose.',
    4500,
    [2.3, 0.9, 1.28],
    [0.84, -0.77],
    [0.36, 0.28],
    0.33,
    -0.25,
    1.6,
    1.5,
    { bike: true },
  ),
  car(
    'classic',
    21,
    'Classic pickup',
    'Red, round and older than the course.',
    6000,
    [4.53, 1.86, 1.73],
    [1.59, -1.25],
    [0.87, 0.61],
    0.36,
    0.1,
    1.2,
    1.15,
  ),
  car(
    'yacht',
    19,
    'Land yacht',
    'Six metres of teal and a white vinyl roof.',
    6500,
    [4.77, 2.09, 1.23],
    [1.54, -1.19],
    [0.98, 0.74],
    0.36,
    -0.2,
    1.35,
    1.2,
  ),
  car('sport', 36, 'Sport sedan', 'The quick one.', 9000, [4.4, 1.83, 1.37], [1.34, -1.39], [0.87, 0.6], 0.36, -0.1, 1.55, 1.5),
  car('fourby', 2, '4×4', 'Short, tall and happy in the rough.', 10000, [3.91, 1.89, 1.75], [1.2, -1.01], [0.93, 0.6], 0.38, 0, 1.25, 1.35),
  car(
    'tow',
    58,
    'Tow truck',
    'For when your friends drive into the pond.',
    12000,
    [5.92, 2.18, 2.3],
    [2.22, -1.16],
    [0.87, 0.56],
    0.37,
    1.2,
    1.15,
    1.3,
    { cabH: 1.7 },
  ),
  car(
    'ambulance',
    4,
    'Ambulance',
    'Retired from service. The lights are for show.',
    18000,
    [6.11, 2.56, 2.42],
    [2.3, -1.65],
    [1.06, 0.78],
    0.43,
    1.5,
    1.3,
    1.4,
    { cabH: 1.9 },
  ),
  car('monster', 2, 'Monster truck', 'The 4×4, after some decisions.', 40000, [5.1, 3.0, 2.7], [1.56, -1.31], [1.5, 0.78], 0.9, 0, 1.2, 1.7, {
    scale: 1.3,
    lift: 0.41,
    cabH: 2.6,
  }),
];
/** Each car's character off the road and in the ear: [how little it minds rough ground, the pitch of its engine]. */
const FEEL: Record<string, [number, number]> = {
  rusty: [0.7, 0.85],
  dirt: [1, 1.9],
  sedan: [0.2, 0.9],
  town: [0.25, 1],
  van: [0.35, 0.8],
  cruiser: [0.15, 1.35],
  classic: [0.7, 0.8],
  yacht: [0.1, 0.75],
  sport: [0, 1.2],
  fourby: [1, 0.8],
  tow: [0.6, 0.7],
  ambulance: [0.4, 0.7],
  monster: [1, 0.55],
};
for (const c of CARS) [c.offroad, c.tone] = FEEL[c.id] || [0.3, 1];
export const CAR = new Map(CARS.map(c => [c.id, c]));

// ---- how a car drives, worked out from its own measurements --------------------------------------------------------
// The handling model below (the per-car profile from geometry, thrust that tapers toward top speed, steering that eases
// off at speed, the off-road surface profile, cosmetic body lean, and the six-speed gearbox that feeds the engine
// sound) is adapted from OpenUG2's arcade driving model (src/physics.c, src/audio.c; MIT, copyright (c) 2026 OpenUG2
// contributors; see docs/third-party/OpenUG2-LICENSE.txt), rewritten for this game's wheel-and-spring physics. The
// normalising figures are our own fleet's medians, not theirs.
const FLEET = { vol: 12.5, h: 1.45, wb: 2.75, track: 1.6, tyre: 0.22 };
const lim = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export interface CarProfile {
  accel: number; // pull: lighter (smaller) bodies get away quicker
  brake: number;
  steer: number; // a short wheelbase turns in harder
  grip: number; // wide tyres on a wide track hold on longer
  roll: number; // how much a tall, narrow body leans
  pitch: number; // how much a tall, short body squats and dives
}
export function carProfile(c: CarSpec): CarProfile {
  const [L, W, H] = c.size,
    wb = c.axles[0] - c.axles[1],
    track = c.bike ? 0.7 : c.tyre[0] + c.tyre[1],
    tyre = c.tyre[0] - c.tyre[1],
    m = Math.sqrt(FLEET.vol / (L * W * H)); // (the square root keeps a van from being three times slower than a bike)
  return {
    accel: lim(m, 0.75, 1.25),
    brake: lim(m, 0.75, 1.25),
    steer: lim(FLEET.wb / wb, 0.8, 1.2),
    grip: c.bike ? 1 : lim(Math.sqrt(tyre / FLEET.tyre) * Math.pow(track / FLEET.track, 0.25), 0.9, 1.1),
    roll: lim(H / track / (FLEET.h / FLEET.track), 0.7, 1.4),
    pitch: lim(H / wb / (FLEET.h / FLEET.wb), 0.7, 1.4),
  };
}
/** Bolt-on parts from the auto shop: three kinds, each fitted in stages 1 to 3 (0 = as it left the factory). A car's
 *  parts are written as three digits, engine · tyres · brakes ('210'), and ride along at the end of its kind. */
export const CAR_PARTS = [
  {
    id: 'engine',
    name: 'Engine',
    stages: ['Stock', 'Intake and exhaust', 'Cam and tune', 'Turbo'],
    price: [0, 900, 2400, 6000],
    what: 'More pull at every speed and a higher top speed.',
  },
  {
    id: 'tyres',
    name: 'Tyres',
    stages: ['Stock', 'Street', 'Sport', 'Semi-slick'],
    price: [0, 500, 1300, 3200],
    what: 'More grip in corners before the back steps out.',
  },
  {
    id: 'brakes',
    name: 'Brakes',
    stages: ['Stock', 'Pads', 'Big discs', 'Race kit'],
    price: [0, 400, 1000, 2500],
    what: 'Stops in a shorter distance.',
  },
] as const;
/** What a set of parts does to a car: multipliers on its pull, top speed, grip and braking. */
export function partsTune(parts: string) {
  const [e, t, b] = /^[0-3]{3}$/.test(parts) ? [...parts].map(Number) : [0, 0, 0];
  return { power: 1 + 0.12 * e, speed: 1 + 0.05 * e, grip: 1 + 0.07 * t, brake: 1 + 0.15 * b };
}
/** What the car you're driving wants from the camera this frame: extra degrees of lens as the speed builds. */
export const DRIVE_FX = { fov: 0 };
const GEAR_RATIO = [0, 130, 82, 56, 41, 32, 25], // revs per unit of speed in each gear; sixth at full speed sits just under the red line
  RATIO_SCALE = 6800 / 25,
  IDLE_RPM = 1000,
  UPSHIFT_RPM = 7000,
  DOWNSHIFT_RPM = 3200,
  REDLINE_RPM = 8000,
  SHIFT_S = 0.15; // the clutch is in: no pull, and the revs sag
/** Paint and rim colours the auto shop offers ('' = as it left the factory). */
export const CAR_PAINTS = ['', 'e23b2f', 'f08a1c', 'f2cf3a', '5fae4a', '2f8fa8', '3a57c8', '8a4fc0', 'e86aa6', '4a4a50', 'f4f1ea'];
export const CAR_RIMS = ['c9ccd0', '1d1d1f', 'e2b23a', 'c8452f', 'f4f1ea', '2f8fa8'];
let carKit: PropPack | null = null;
export const loadCarKit = () =>
  loadProps('vehicles', n => n).then(k => {
    carKit = k;
    return k;
  });
/** How far forward of a car's `seatX` the driver's hips go (the front seat). */
const SEAT_FWD = 0.26;
const bare = new Map<string, THREE.BufferGeometry>();
/** A car body without the wheels that are modelled into it: every triangle lying wholly inside one of the four wheels'
 *  cylinders is left out. The pack's wheels can't turn (they are part of the body's mesh), so ours replace them. The
 *  result shares the body's vertices and is kept per car. `o` must already be turned, scaled and lifted into place. */
function withoutWheels(o: THREE.Mesh, spec: CarSpec) {
  const hit = bare.get(spec.id);
  if (hit) return hit;
  const g = o.geometry,
    pos = g.attributes.position,
    idx = g.index ? (g.index.array as ArrayLike<number>) : null,
    n = idx ? idx.length : pos.count,
    // where the model's own wheels are: this car's, or (a scaled-up body) the wheels of the car it was made from
    base = spec.scale ? (CARS.find(c => c.obj === spec.obj && !c.scale) ?? spec) : spec,
    k = spec.scale ?? 1,
    yc = base.r * k + (spec.lift ?? 0),
    rad = base.r * k * 1.1,
    zin = base.tyre[1] * k - 0.07,
    v = new THREE.Vector3(),
    inWheel = new Int8Array(pos.count); // 0 not looked at, 1 outside, 2+axle inside that axle's wheel
  o.updateMatrix();
  const where = (i: number) => {
    if (!inWheel[i]) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrix);
      inWheel[i] = 1;
      if (Math.abs(v.z) > zin) base.axles.forEach((ax, a) => Math.hypot(v.x - ax * k, v.y - yc) < rad && (inWheel[i] = 2 + a));
    }
    return inWheel[i];
  };
  const keep: number[] = [];
  for (let t = 0; t < n; t += 3) {
    const a = idx ? idx[t] : t,
      b = idx ? idx[t + 1] : t + 1,
      c = idx ? idx[t + 2] : t + 2,
      w = where(a);
    if (w > 1 && where(b) === w && where(c) === w) continue;
    keep.push(a, b, c);
  }
  const out = new THREE.BufferGeometry();
  for (const name in g.attributes) out.setAttribute(name, g.attributes[name]);
  out.setIndex(keep);
  out.boundingBox = g.boundingBox;
  out.boundingSphere = g.boundingSphere;
  bare.set(spec.id, out);
  return out;
}
export function carModel(spec: CarSpec, paint = '', rim = '') {
  const root = new THREE.Group(),
    body = new THREE.Group(),
    k = spec.scale ?? 1;
  root.add(body);
  const fill = (kit: PropPack) => {
    const o = kit.make(spec.obj, 25 * k);
    if (!o) return;
    o.rotation.y = Math.PI;
    o.position.y = spec.lift ?? 0;
    if (!spec.bike) o.geometry = withoutWheels(o, spec); // (our own turning wheels stand where the model's painted-on ones were)
    const m = (o.material as THREE.MeshStandardMaterial).clone();
    if (paint) m.color.set('#' + paint); // (a tint over the body's own texture)
    o.material = m;
    body.add(o);
  };
  if (carKit) fill(carKit);
  else void loadCarKit().then(fill);
  const rubber = M('#17171a', 0.9),
    hub = M('#' + (rim || 'c9ccd0'), 0.35, 0.7),
    dark = M('#0c0c0e', 0.8),
    wheels: THREE.Object3D[] = [],
    w = spec.tyre[0] - spec.tyre[1] + 0.07,
    zc = (spec.tyre[0] + spec.tyre[1]) / 2 + 0.015,
    R = spec.r * 1.04;
  for (const x of spec.axles)
    for (const z of [zc, -zc]) {
      const g = new THREE.Group();
      g.position.set(x, spec.r, z);
      if (!spec.bike) {
        const tyre = new THREE.Mesh(new THREE.CylinderGeometry(R, R, w, 20), rubber),
          face = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.62, R * 0.62, w + 0.02, 16), hub),
          cap = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.2, R * 0.2, w + 0.05, 10), dark);
        for (const p of [tyre, face, cap]) p.rotation.x = Math.PI / 2;
        g.add(tyre, face, cap);
        for (let i = 0; i < 5; i++) {
          // five slots in the rim, so you can see it turning
          const slot = new THREE.Mesh(new THREE.BoxGeometry(R * 0.2, R * 0.12, w + 0.03), dark),
            a = (i / 5) * Math.PI * 2;
          slot.position.set(Math.cos(a) * R * 0.42, Math.sin(a) * R * 0.42, 0);
          slot.rotation.z = a;
          g.add(slot);
        }
      }
      body.add(g);
      wheels.push(g);
    }
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = m.receiveShadow = true;
  });
  return { root, body, wheels, wheel: new THREE.Object3D() as THREE.Object3D };
}

const _mk = new THREE.Vector3(),
  _mk2 = new THREE.Vector3(),
  _mq = new THREE.Quaternion();
class Cart implements Vehicle {
  kind: string = 'cart';
  name: string = 'Golf cart';
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
  // running gear: front and rear axle (x), half the track, the wheels' attachment height and radius, the chassis' half size
  private ax: [number, number] = [0.8, -0.8];
  private tz = 0.58;
  private wy = 0.46;
  private wr = 0.22;
  private hx = 1.18;
  private hz = 0.6;
  private fixedW = false; // a car's wheels ride with its body (they stand over the wheels modelled into it)
  private prof: CarProfile = { accel: 1, brake: 1, steer: 1, grip: 1, roll: 1, pitch: 1 };
  terrain = 0;
  half: [number, number] = [1.25, 0.7];
  private gear = 1;
  private rpm = IDLE_RPM;
  private shiftT = 0;
  private load = 0;
  private marks: { mesh: THREE.Mesh; pos: Float32Array; col: Float32Array; age: Float32Array; i: number; last: (THREE.Vector3 | null)[] } | null =
    null;
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
  /** what its bolt-on parts do (cars only; see partsTune) */
  private tune = partsTune('');
  constructor(
    private pw: PhysWorld | null,
    scene: THREE.Object3D,
    color: string,
    owner: boolean,
    private kart = false,
    private spec: CarSpec | null = null,
    paint = '',
    rim = '',
    parts = '',
  ) {
    const m = spec ? carModel(spec, paint, rim) : kart ? kartModel(color) : cartModel(color);
    if (spec) {
      this.kind = `car:${spec.id}:${paint}:${rim}${parts ? ':' + parts : ''}`;
      this.tune = partsTune(parts);
      this.name = spec.name;
      const top = (spec.cabH ?? spec.size[2]) * 0.96;
      this.seat = spec.bike ? V(spec.seatX, 0.12, 0) : V(spec.seatX + SEAT_FWD, top - 1.93, -0.36); // (the front left seat, low: the head sits under the roof, behind the screen)
      this.ax = spec.axles;
      this.tz = spec.bike ? 0.34 : (spec.tyre[0] + spec.tyre[1]) / 2;
      this.wr = spec.r;
      this.wy = spec.r + 0.25;
      this.hx = (spec.size[0] / 2) * 0.95;
      this.hz = spec.bike ? 0.36 : (spec.size[1] / 2) * 0.9;
      this.fixedW = true;
      this.prof = carProfile(spec);
      this.half = [spec.size[0] / 2, spec.bike ? 0.4 : spec.size[1] / 2 - 0.08];
    }
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
        R.ColliderDesc.cuboid(this.hx, 0.24, this.hz)
          .setTranslation(0, 0.5, 0)
          .setMass(260)
          .setFriction(0.4)
          .setCollisionGroups(grp(G_VEH, G_STATIC | G_RAG | G_VEH)),
        b,
      );
      pw.world.createCollider(R.ColliderDesc.cuboid(0.6, 0.05, 0.4).setTranslation(0, 0.18, 0).setMass(160).setCollisionGroups(0), b);
      const vc = pw.world.createVehicleController(b);
      for (const [x, z] of [
        [this.ax[0], this.tz],
        [this.ax[0], -this.tz],
        [this.ax[1], this.tz],
        [this.ax[1], -this.tz],
      ])
        vc.addWheel({ x, y: this.wy, z }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, 0.32, this.wr);
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
          K = (this.spec?.power ?? 1) * this.tune.power,
          S = (this.spec?.speed ?? 1) * this.tune.speed,
          car = this.spec,
          PF = this.prof,
          rough = car ? Math.max(0, this.terrain) * (1 - (car.offroad ?? 0.3)) : 0, // how much this ground costs this car
          vmax = 19 * S, // flat out with the pedal buried: the top of sixth gear
          grip = car ? PF.grip * this.tune.grip * (1 - 0.3 * Math.min(1, rough)) : 1,
          // a kart is tuned to its little track: quick off the line and through the hairpins, but a modest top speed
          top = this.kart
            ? this.drift
              ? 10.5
              : i.boost
                ? 13.8
                : 11.6
            : (this.boostT > 0 ? 23 : i.boost ? 19 : 14) * S * (1 - 0.5 * Math.min(1, rough));
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
        for (const k of [2, 3]) v.setWheelSideFrictionStiffness(k, D ? (this.kart ? 0.46 : 0.38) : (this.kart ? 1.5 : 1.1) * grip); // the back end lets go
        if (car) for (const k of [0, 1]) v.setWheelSideFrictionStiffness(k, 1.15 * grip);
        if (this.kart) for (const k of [0, 1]) v.setWheelSideFrictionStiffness(k, 1.6); // a kart's front end bites
        const want = D
          ? D * (this.kart ? 0.16 : 0.3) + i.steer * (this.kart ? 0.34 : 0.3)
          : car
            ? i.steer * 0.62 * PF.steer * (1 - 0.7 * Math.min(1, Math.abs(sp) / vmax)) * (1 - 0.25 * Math.min(1, rough)) // tight in town, wide flat out
            : i.steer * (this.kart ? 0.7 : 0.62) * (1 - Math.min(this.kart ? 0.35 : 0.55, Math.abs(sp) / (this.kart ? 26 : 22)));
        this.steer += (want - this.steer) * Math.min(1, dt * (i.steer ? (this.kart ? 9 : car ? 8.5 : 6) : car ? 11 : 9)); // (it centres quicker than it turns in)
        if (D && this.kart && this.body) {
          // a kart's slide holds its angle instead of curling in: the spin is capped (more when steering in, less out)
          const w = this.body.angvel(),
            cap = 1.2 + 0.45 * i.steer * D;
          if (Math.abs(w.y) > cap)
            this.body.setAngvel({ x: w.x, y: Math.sign(w.y) * (Math.abs(w.y) + (cap - Math.abs(w.y)) * Math.min(1, dt * 10)), z: w.z }, true);
        }
        v.setWheelSteering(0, this.steer);
        v.setWheelSteering(1, this.steer);
        if (car) this.gearbox(dt, sp, vmax, i.throttle);
        const dir = i.throttle > 0 ? (sp < top ? 1 : 0) : i.throttle < 0 ? (sp > 0.6 ? 0 : sp > (car ? -0.2 * vmax : -4.5) ? -1 : 0) : 0,
          force =
            this.boostT > 0
              ? 3400 * K
              : (this.drift ? Math.max(dir, 0.6) : dir) *
                (i.boost ? 2100 : 1550) *
                K *
                (this.kart && sp < 8 ? 1.5 : 1) *
                (car
                  ? // punchy off the line, easing toward top speed; lighter cars pull harder; soft ground and a gear change both cost pull
                    (1.15 - 0.55 * Math.min(1, Math.abs(sp) / top)) *
                    PF.accel *
                    (1 - 0.45 * Math.min(1, rough)) *
                    (dir < 0 ? 0.7 : 1) *
                    (this.shiftT > 0 ? 0.2 : 1)
                  : 1 - Math.min(0.65, Math.abs(sp) / (top * 1.5)));
        v.setWheelEngineForce(2, force);
        v.setWheelEngineForce(3, force);
        const braking = (i.brake && !this.drift) || (i.throttle < 0 && sp > 0.6),
          coast = !i.throttle && !i.brake;
        const over = car && sp > top * 1.04; // faster than this ground allows: it scrubs off at about braking pace
        for (let k = 0; k < 4; k++)
          v.setWheelBrake(
            k,
            braking ? (this.kart ? 30 : car ? 30 * PF.brake * this.tune.brake : 22) : over ? 14 : coast ? (this.kart ? 5 : car ? 3.2 : 2.2) : 0,
          ); // a kart sheds speed when you lift, to set up the corner
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
        R.ColliderDesc.cuboid(this.hx, 0.45, this.hz)
          .setTranslation(0, 0.7, 0)
          .setCollisionGroups(grp(G_VEH, G_RAG | G_VEH)),
        b,
      );
      this.body = b;
    }
  }
  /** A six-speed automatic: revs follow the speed in the current gear; it changes up near the red line and down when
   *  the revs fall away, and each change up is a short moment with the clutch in. */
  private gearbox(dt: number, sp: number, vmax: number, throttle: number) {
    if (this.shiftT > 0) {
      this.shiftT -= dt;
      this.load = 0;
      this.rpm += (IDLE_RPM - this.rpm) * Math.min(1, dt * 11);
      return;
    }
    const frac = Math.min(1, Math.abs(sp) / vmax),
      at = (g: number) => IDLE_RPM + frac * GEAR_RATIO[g] * RATIO_SCALE;
    let target = at(this.gear);
    if (target > UPSHIFT_RPM && this.gear < 6) {
      this.gear++;
      this.shiftT = SHIFT_S;
      return;
    }
    if (target < DOWNSHIFT_RPM && this.gear > 1) {
      this.gear--;
      target = at(this.gear);
    }
    this.load = throttle > 0 ? 1 : throttle < 0 && sp < 0.5 ? 0.6 : 0;
    this.rpm += (Math.min(REDLINE_RPM, target + (this.load && frac < 0.03 ? 1400 : 0)) - this.rpm) * Math.min(1, dt * 9); // (a blip when you floor it from rest)
  }
  engine() {
    return this.spec ? { rpm: this.rpm, gear: this.speed() < -0.4 ? 0 : this.gear, load: this.load, tone: this.spec.tone ?? 1 } : null;
  }
  /** Tyre marks: dark strips laid under the back wheels while the car slides, fading over a quarter of a minute. */
  private marksStep(dt: number, sliding: boolean) {
    const N = 220;
    if (!this.marks) {
      if (!this.root.parent) return;
      const pos = new Float32Array(N * 18),
        col = new Float32Array(N * 24),
        g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 4));
      const mesh = new THREE.Mesh(
        g,
        new THREE.MeshBasicMaterial({
          color: '#141210',
          vertexColors: true,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
      );
      mesh.frustumCulled = false;
      mesh.userData.noBatch = true;
      this.root.parent.add(mesh);
      this.marks = { mesh, pos, col, age: new Float32Array(N).fill(99), i: 0, last: [null, null] };
    }
    const M = this.marks,
      ct = this.contacts(),
      hw = this.spec ? (this.spec.tyre[0] - this.spec.tyre[1]) / 2 + 0.02 : 0.09,
      side = _mk.set(0, 0, 1).applyQuaternion(this.root.quaternion).multiplyScalar(hw);
    for (let w = 0; w < 2; w++) {
      const p = ct[2 + w],
        on = sliding && !!this.vc?.wheelIsInContact(2 + w),
        last = M.last[w];
      if (!on) {
        M.last[w] = null;
        continue;
      }
      if (!last) {
        M.last[w] = p.clone();
        continue;
      }
      if (last.distanceToSquared(p) < 0.09) continue; // a new piece every 30 cm
      const k = (M.i = (M.i + 1) % N),
        y0 = last.y + 0.03,
        y1 = p.y + 0.03,
        q = [
          [last.x - side.x, y0, last.z - side.z],
          [last.x + side.x, y0, last.z + side.z],
          [p.x + side.x, y1, p.z + side.z],
          [last.x - side.x, y0, last.z - side.z],
          [p.x + side.x, y1, p.z + side.z],
          [p.x - side.x, y1, p.z - side.z],
        ];
      q.forEach((v, j) => M.pos.set(v, k * 18 + j * 3));
      M.age[k] = 0;
      last.copy(p);
    }
    for (let k = 0; k < N; k++) {
      if (M.age[k] > 16) continue;
      M.age[k] += dt;
      const a = M.age[k] > 16 ? 0 : 0.55 * Math.min(1, (16 - M.age[k]) / 6);
      for (let j = 0; j < 6; j++) M.col.set([1, 1, 1, a], k * 24 + j * 4);
    }
    M.mesh.geometry.attributes.position.needsUpdate = true;
    M.mesh.geometry.attributes.color.needsUpdate = true;
  }
  steering() {
    return this.steer / 0.62;
  }
  private _ct = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  contacts() {
    this.root.updateMatrixWorld();
    this.wheels.forEach((w, i) => this._ct[i].set(w.position.x, w.position.y - this.wr, w.position.z).applyMatrix4(this.root.matrixWorld));
    return this._ct;
  }
  grips() {
    // hands at ten-to-two on the rim, turned with the wheel; feet on the floor mat
    const sp = this.spec,
      st = this.seat;
    const [WC, WN, WR] = sp
      ? sp.bike
        ? [V(st.x + 0.62, 1.02, 0), V(-1, 0.15, 0).normalize(), 0.3] // handlebars
        : [V(st.x + 0.48, st.y + 1.17, st.z), WHEEL_N, WHEEL_R]
      : this.kart
        ? [KART_WC, KART_WN, KART_WR]
        : [WHEEL_C, WHEEL_N, WHEEL_R];
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), WN),
      turn = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -this.steer * 2.2),
      hand = (a: number) =>
        V(Math.cos(a) * WR, Math.sin(a) * WR, 0)
          .applyQuaternion(turn)
          .applyQuaternion(q)
          .add(WC);
    return {
      hands: [hand(Math.PI * 0.85), hand(Math.PI * 0.15)] as [THREE.Vector3, THREE.Vector3],
      feet: (sp
        ? sp.bike
          ? [V(st.x + 0.25, 0.42, 0.22), V(st.x + 0.25, 0.42, -0.22)]
          : [V(st.x + 0.66, st.y + 0.65, st.z + 0.11), V(st.x + 0.69, st.y + 0.65, st.z - 0.1)]
        : this.kart
          ? [V(0.62, 0.3, 0.15), V(0.62, 0.3, -0.15)]
          : [V(0.3, 0.58, 0.38), V(0.33, 0.58, 0.17)]) as [THREE.Vector3, THREE.Vector3],
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
    // a car's lean is set by its own shape (a tall narrow van rolls, a low wide sedan stays flat); it is for show only
    const car = !!this.spec,
      kr = car ? (0.085 * this.prof.roll) / 9.81 : 0.012,
      kp = car ? (0.06 * this.prof.pitch) / 9.81 : 0.01;
    const tRoll = THREE.MathUtils.clamp(la.z * kr, -0.09, 0.09) + this.drift * (car ? 0.05 : 0.11), // leaning hard into a drift
      tPitch = THREE.MathUtils.clamp(-la.x * kp, -0.06, 0.06);
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
    const soft = 1;
    this.body3.rotation.set(S.roll * soft, 0, S.pitch * soft);
    this.body3.position.y = S.bob * soft;
  }
  drive(dt: number, inp: DriveInput) {
    this.inp = inp;
    if (!this.body || !this.vc) return;
    const t = this.body.translation(),
      r = this.body.rotation();
    this.root.position.set(t.x, t.y, t.z);
    this.root.quaternion.set(r.x, r.y, r.z, r.w);
    const sp = this.vc.currentVehicleSpeed();
    if (Math.abs(sp) > 0.2) this.spin += (sp * dt) / this.wr; // (a parked car's wheels stay still: the solver's speed never quite reads zero)
    this.wheels.forEach((w, i) => {
      const sl = this.vc!.wheelSuspensionLength(i) ?? 0.25;
      this.susp[i] = sl;
      if (!this.fixedW) w.position.y = this.wy - sl;
      w.rotation.set(0, i < 2 ? this.steer : 0, 0);
      w.rotateZ(-this.spin);
    });
    this.steerWheel.rotation.z = 0;
    this.steerWheel.rotateZ(-this.steer * 2.2);
    const vel = this.velocity(V());
    this.swayStep(dt, vel);
    this.smokeStep(dt);
    // sliding: a held drift, or the tail simply stepping out (sideways speed in the car's own frame)
    const side = Math.abs(_mk2.copy(vel).applyQuaternion(_mq.copy(this.root.quaternion).invert()).z);
    this.marksStep(dt, !this.kart && (this.drift !== 0 || (side > 2.4 && Math.abs(sp) > 3)));
    // the lens opens as the speed builds, and a little more on a boost
    const want = Math.min(9, Math.max(0, Math.abs(sp) - 7) * 0.5) + (this.boostT > 0 ? 3 : 0);
    DRIVE_FX.fov += (want - DRIVE_FX.fov) * Math.min(1, dt * 2.5);
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
    this.spin += (this.remoteSpeed * dt) / this.wr;
    this.wheels.forEach((w, i) => {
      if (!this.fixedW) w.position.y = 0.21;
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
    this.marks?.mesh.removeFromParent();
    this.root.removeFromParent();
  }
}
VEHICLES.cart = { kind: 'cart', name: 'Golf cart', make: (pw, scene, color, owner) => new Cart(pw, scene, color, owner) };
VEHICLES.kart = { kind: 'kart', name: 'Go-kart', make: (pw, scene, color, owner) => new Cart(pw, scene, color, owner, true) };
/** The kind a published state names: 'cart', 'kart', or a car as 'car:<id>:<paint>:<rims>' (hex colours, either may be empty). */
export function vehicleKind(k: string): VehicleKind {
  const m = /^car:([a-z]{2,10}):([0-9a-f]{6})?:([0-9a-f]{6})?(?::([0-3]{3}))?$/.exec(k || ''),
    spec = m && CAR.get(m[1]);
  if (!spec) return VEHICLES[k] || VEHICLES.cart;
  return {
    kind: k,
    name: spec.name,
    make: (pw, scene, color, owner) => new Cart(pw, scene, color, owner, false, spec, m![2] || '', m![3] || '', m![4] || ''),
  };
}
export const cleanKind = (k: any) =>
  k === 'kart'
    ? 'kart'
    : typeof k === 'string' && /^car:[a-z]{2,10}:([0-9a-f]{6})?:([0-9a-f]{6})?(:[0-3]{3})?$/.test(k) && CAR.has(k.split(':')[1])
      ? k
      : 'cart';
/** What the player drives: their chosen car in its paint, or the golf cart. */
export const myVehicleKind = (pr: { car: string; carLook: Record<string, string>; carParts?: Record<string, string> }) =>
  CAR.has(pr.car)
    ? vehicleKind(`car:${pr.car}:${pr.carLook[pr.car] || ':'}${pr.carParts?.[pr.car] ? ':' + pr.carParts[pr.car] : ''}`)
    : VEHICLES.cart;
