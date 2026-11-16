// The Birdie Ball machine: a classic coin-op capsule vendor (yellow cabinet, chrome mechanism, glass hopper full of
// two-tone capsules). It runs its own little show when you use it: a Birdie Dollar coin slides into the slot, the
// handle turns, a capsule rattles down the chute into the tray, pops open, and the ball inside floats up for a look.
// Model faces +X. Units: metres. Everything procedural; the branding is our own.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ballMaterial } from '../avatar/balls';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
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
function normalFromHeight(h: HTMLCanvasElement, strength = 2) {
  const w = h.width,
    H = h.height,
    src = h.getContext('2d')!.getImageData(0, 0, w, H).data,
    out = cv(w, H),
    o = out.getContext('2d')!,
    img = o.createImageData(w, H),
    d = img.data;
  const at = (x: number, y: number) => src[(Math.min(H - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4] / 255;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength,
        dy = (at(x, y + 1) - at(x, y - 1)) * strength,
        l = Math.hypot(dx, dy, 1),
        i = (y * w + x) * 4;
      d[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      d[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      d[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  o.putImageData(img, 0, 0);
  return out;
}
const T = (c: HTMLCanvasElement, srgb = true) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
};

// ---------------------------------------------------------------- textures
/** Enamel-painted sheet metal: glossy yellow with orange-peel, a few chips and scuffs near the edges. */
function paintTex() {
  const W = 512,
    r = rng(41),
    a = cv(W),
    h = cv(W),
    ax = a.getContext('2d')!,
    hx = h.getContext('2d')!;
  ax.fillStyle = '#f2c21a';
  ax.fillRect(0, 0, W, W);
  hx.fillStyle = '#808080';
  hx.fillRect(0, 0, W, W);
  for (let i = 0; i < 9000; i++) {
    const x = r() * W,
      y = r() * W,
      v = r() < 0.5 ? 120 : 136;
    hx.fillStyle = `rgba(${v},${v},${v},.35)`;
    hx.fillRect(x, y, 2, 2);
  } // orange peel
  for (let i = 0; i < 1800; i++) {
    ax.fillStyle = `rgba(${r() < 0.5 ? '255,230,120' : '200,140,10'},${0.05 + r() * 0.08})`;
    ax.fillRect(r() * W, r() * W, 2 + r() * 4, 1 + r() * 3);
  }
  for (let i = 0; i < 26; i++) {
    const x = r() < 0.5 ? r() * 30 : W - r() * 30,
      y = r() * W,
      rr = 1 + r() * 4;
    ax.fillStyle = '#6a6a66';
    ax.beginPath();
    ax.arc(x, y, rr, 0, 7);
    ax.fill();
    hx.fillStyle = '#404040';
    hx.beginPath();
    hx.arc(x, y, rr, 0, 7);
    hx.fill();
  } // chips
  ax.strokeStyle = 'rgba(120,80,0,.18)';
  ax.lineWidth = 0.8;
  for (let i = 0; i < 60; i++) {
    const x = r() * W,
      y = r() * W,
      l = 6 + r() * 30,
      t = r() * 6.28;
    ax.beginPath();
    ax.moveTo(x, y);
    ax.lineTo(x + Math.cos(t) * l, y + Math.sin(t) * l);
    ax.stroke();
  }
  return { map: T(a), normalMap: T(normalFromHeight(h, 1.2), false) };
}
/** Brushed chrome: fine horizontal grain. */
function brushedTex() {
  const W = 256,
    r = rng(9),
    h = cv(W),
    hx = h.getContext('2d')!;
  hx.fillStyle = '#808080';
  hx.fillRect(0, 0, W, W);
  for (let i = 0; i < 1400; i++) {
    const y = r() * W,
      v = (100 + r() * 60) | 0;
    hx.strokeStyle = `rgba(${v},${v},${v},.5)`;
    hx.lineWidth = 0.6;
    hx.beginPath();
    hx.moveTo(0, y);
    hx.lineTo(W, y + (r() - 0.5) * 2);
    hx.stroke();
  }
  const t = T(normalFromHeight(h, 0.6), false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
/** Stamped coin-mechanism faceplate: raised rim, a ring, the GH emblem, "1 BIRDIE DOLLAR". Grey height → normal map. */
function plateTex() {
  const W = 256,
    a = cv(W),
    h = cv(W),
    ax = a.getContext('2d')!,
    hx = h.getContext('2d')!;
  ax.fillStyle = '#c9cdd2';
  ax.fillRect(0, 0, W, W);
  hx.fillStyle = '#707070';
  hx.fillRect(0, 0, W, W);
  for (const [c, x] of [
    [hx, '#d0d0d0'],
    [ax, '#e4e7ea'],
  ] as [CanvasRenderingContext2D, string][]) {
    c.strokeStyle = x;
    c.lineWidth = 10;
    c.strokeRect(8, 8, W - 16, W - 16);
    c.lineWidth = 6;
    c.beginPath();
    c.arc(W / 2, W * 0.5, 70, 0, 7);
    c.stroke();
  }
  for (const c of [hx, ax]) {
    c.fillStyle = c === hx ? '#e0e0e0' : '#9aa0a6';
    c.font = '900 54px "Barlow Condensed", Impact, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('GH', W / 2, W * 0.5);
    c.font = '800 20px "Barlow Condensed", Impact, sans-serif';
    c.fillText('1 BIRDIE DOLLAR', W / 2, W * 0.86);
    c.fillText('TURN ⟳', W / 2, W * 0.15);
  }
  return { map: T(a), normalMap: T(normalFromHeight(h, 3), false) };
}
/** Header decal on the lid. */
function headerTex() {
  const c = cv(512, 96),
    x = c.getContext('2d')!;
  x.fillStyle = '#1d1d1f';
  x.fillRect(0, 0, 512, 96);
  x.fillStyle = '#f2c21a';
  x.font = '900 60px "Barlow Condensed", Impact, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('BIRDIE BALLS', 256, 50);
  x.strokeStyle = '#f2c21a';
  x.lineWidth = 3;
  x.strokeRect(6, 6, 500, 84);
  return T(c);
}
/** The Birdie Dollar coin face. */
function coinTex() {
  const W = 256,
    a = cv(W),
    h = cv(W),
    ax = a.getContext('2d')!,
    hx = h.getContext('2d')!;
  const g = ax.createRadialGradient(W * 0.4, W * 0.35, 10, W / 2, W / 2, W / 2);
  g.addColorStop(0, '#fff2a8');
  g.addColorStop(0.6, '#e9b23a');
  g.addColorStop(1, '#a8741a');
  ax.fillStyle = g;
  ax.fillRect(0, 0, W, W);
  hx.fillStyle = '#808080';
  hx.fillRect(0, 0, W, W);
  for (const c of [ax, hx]) {
    c.strokeStyle = c === hx ? '#d8d8d8' : '#fff0b0';
    c.lineWidth = 9;
    c.beginPath();
    c.arc(W / 2, W / 2, W / 2 - 14, 0, 7);
    c.stroke();
    // a little bird in flight (the "birdie")
    c.fillStyle = c === hx ? '#e0e0e0' : '#8a5a10';
    c.beginPath();
    c.moveTo(70, 120);
    c.quadraticCurveTo(100, 80, 128, 112);
    c.quadraticCurveTo(156, 80, 186, 120);
    c.quadraticCurveTo(156, 100, 128, 128);
    c.quadraticCurveTo(100, 100, 70, 120);
    c.fill();
    c.font = '900 34px "Barlow Condensed", Impact, sans-serif';
    c.textAlign = 'center';
    c.fillText('BIRDIE', W / 2, 175);
    c.font = '800 22px "Barlow Condensed", Impact, sans-serif';
    c.fillText('ONE DOLLAR', W / 2, 202);
  }
  return { map: T(a), normalMap: T(normalFromHeight(h, 2.5), false) };
}

// ---------------------------------------------------------------- the machine
const CAP_COLS = ['#e8352e', '#f2c21a', '#2a9a4a', '#2f6fd0', '#ffffff', '#ff7ab0', '#8a4ad0', '#ff8a1a'];
const CAP_R = 0.042;
function capsuleGeos() {
  const top = new THREE.SphereGeometry(CAP_R, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    bot = new THREE.SphereGeometry(CAP_R, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const rim = new THREE.TorusGeometry(CAP_R * 0.995, 0.0035, 6, 24).rotateX(Math.PI / 2);
  return { top, bot, rim };
}
interface Tween {
  t: number;
  dur: number;
  f: (k: number) => void;
  done: () => void;
}
const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

export function createGachaMachine() {
  const g = new THREE.Group(),
    paint = paintTex(),
    brush = brushedTex(),
    plate = plateTex();
  const yellow = new THREE.MeshPhysicalMaterial({
    map: paint.map,
    normalMap: paint.normalMap,
    normalScale: new THREE.Vector2(0.4, 0.4),
    roughness: 0.32,
    clearcoat: 0.7,
    clearcoatRoughness: 0.18,
  });
  const chrome = new THREE.MeshStandardMaterial({
    color: '#e6e8ea',
    metalness: 1,
    roughness: 0.16,
    normalMap: brush,
    normalScale: new THREE.Vector2(0.25, 0.25),
  });
  const silver = new THREE.MeshStandardMaterial({ color: '#c8ccd0', metalness: 0.7, roughness: 0.38 });
  const darkM = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.6 });
  const plateM = new THREE.MeshStandardMaterial({ map: plate.map, normalMap: plate.normalMap, metalness: 0.95, roughness: 0.22 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    metalness: 0,
    roughness: 0.04,
    transmission: 0.92,
    thickness: 0.01,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(d, h, w), m);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    g.add(o);
    return o;
  };
  const cyl = (r: number, h: number, m: THREE.Material, x: number, y: number, z: number, seg = 24) => {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    g.add(o);
    return o;
  };
  // Dimensions: cabinet 0.5 deep (x) × 0.62 wide (z); front face at x = +0.25
  const D = 0.5,
    Wd = 0.62,
    FX = D / 2;
  // stand: base plate + column
  box(0.62, 0.035, 0.56, silver, 0, 0.018, 0);
  cyl(0.045, 0.47, chrome, 0, 0.27, 0, 16);
  box(0.4, 0.03, 0.36, silver, 0, 0.5, 0);
  // cabinet (yellow) with silver edge trims
  box(Wd, 0.55, D, yellow, 0, 0.79, 0);
  for (const [z, y, h] of [
    [Wd / 2, 0.79, 0.57],
    [-Wd / 2, 0.79, 0.57],
  ] as number[][]) {
    box(0.03, h, 0.03, silver, FX, y, z);
    box(0.03, h, 0.03, silver, -FX, y, z);
  }
  box(Wd + 0.03, 0.03, D + 0.03, silver, 0, 0.515, 0);
  box(Wd + 0.03, 0.035, D + 0.03, silver, 0, 1.065, 0);
  // chrome centre panel running down the front (holds the mechanism and the chute)
  box(0.24, 0.53, 0.012, silver, FX + 0.006, 0.79, 0);
  // coin mechanism: stamped faceplate + coin slot + turning handle
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), plateM);
  face.position.set(FX + 0.03, 0.9, 0);
  face.rotation.y = Math.PI / 2;
  g.add(face);
  box(0.21, 0.21, 0.02, chrome, FX + 0.019, 0.9, 0);
  const slot = box(0.006, 0.05, 0.01, darkM, FX + 0.033, 0.975, 0);
  void slot;
  const handle = new THREE.Group();
  handle.position.set(FX + 0.045, 0.89, 0);
  g.add(handle);
  {
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.03, 24), chrome);
    hub.rotation.z = Math.PI / 2;
    hub.castShadow = true;
    handle.add(hub);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.15, 0.022), chrome);
    bar.position.x = 0.02;
    bar.castShadow = true;
    handle.add(bar);
    for (const s of [1, -1]) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 8), chrome);
      knob.position.set(0.03, s * 0.07, 0);
      handle.add(knob);
    }
  }
  // chute door: chrome box with a flap and a dark mouth; the tray where capsules land
  box(0.17, 0.15, 0.05, chrome, FX + 0.03, 0.65, 0);
  const mouth = box(0.13, 0.05, 0.02, darkM, FX + 0.055, 0.6, 0);
  void mouth;
  const flap = new THREE.Group();
  flap.position.set(FX + 0.058, 0.625, 0);
  g.add(flap);
  {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.05, 0.128), chrome);
    f.position.y = -0.025;
    flap.add(f);
  }
  const tray = box(0.16, 0.012, 0.09, chrome, FX + 0.075, 0.565, 0);
  void tray;
  box(0.16, 0.035, 0.008, chrome, FX + 0.118, 0.58, 0);
  box(0.008, 0.035, 0.09, chrome, FX + 0.075, 0.58, 0.08);
  box(0.008, 0.035, 0.09, chrome, FX + 0.075, 0.58, -0.08);
  // keyhole lock (right side of the front)
  const lock = cyl(0.016, 0.02, chrome, FX + 0.008, 0.62, 0.22, 16);
  lock.rotation.z = Math.PI / 2;
  const kh = box(0.004, 0.012, 0.004, darkM, FX + 0.019, 0.62, 0.22);
  void kh;
  // glass hopper: four panes, silver corner posts, chrome funnel floor, yellow lid with the header
  const GY0 = 1.08,
    GH = 0.6,
    gy = GY0 + GH / 2;
  for (const [w, d, x, z] of [
    [Wd - 0.02, 0.004, FX - 0.01, 0],
    [Wd - 0.02, 0.004, -FX + 0.01, 0],
    [0.004, D - 0.02, 0, Wd / 2 - 0.01],
    [0.004, D - 0.02, 0, -Wd / 2 + 0.01],
  ] as number[][]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(d, GH, w), glass);
    p.position.set(x, gy, z);
    p.renderOrder = 3;
    g.add(p);
  }
  for (const [x, z] of [
    [FX, Wd / 2],
    [FX, -Wd / 2],
    [-FX, Wd / 2],
    [-FX, -Wd / 2],
  ])
    box(0.028, GH, 0.028, silver, x, gy, z);
  box(Wd + 0.02, 0.02, D + 0.02, silver, 0, GY0 + 0.005, 0);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.05, 0.1, 20, 1, true), chrome);
  funnel.position.set(0, GY0 + 0.06, 0);
  funnel.material = chrome;
  g.add(funnel);
  box(Wd + 0.04, 0.07, D + 0.04, yellow, 0, GY0 + GH + 0.035, 0);
  box(Wd + 0.05, 0.015, D + 0.05, silver, 0, GY0 + GH + 0.002, 0);
  const hdr = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.065), new THREE.MeshStandardMaterial({ map: headerTex(), roughness: 0.5 }));
  hdr.position.set(FX + 0.021, GY0 + GH + 0.035, 0);
  hdr.rotation.y = Math.PI / 2;
  g.add(hdr);
  // the capsules: a jumbled pile filling the hopper (two-tone: colour bottom, clear top, a little toy ball inside)
  const C = capsuleGeos(),
    N = 150,
    r = rng(7);
  const colM = new THREE.MeshPhysicalMaterial({ roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
  const clearM = new THREE.MeshPhysicalMaterial({
    color: '#ffffff',
    roughness: 0.05,
    transmission: 0.95,
    thickness: 0.01,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const inner = new THREE.InstancedMesh(new THREE.SphereGeometry(CAP_R * 0.42, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.35 }), N);
  const bots = new THREE.InstancedMesh(C.bot, colM, N),
    tops = new THREE.InstancedMesh(C.top, clearM, N),
    rims = new THREE.InstancedMesh(C.rim, colM, N);
  const pile: { p: THREE.Vector3; q: THREE.Quaternion; c: THREE.Color; ph: number }[] = [];
  for (let i = 0, tries = 0; i < N && tries < 6000; tries++) {
    // drop capsules into the box, lowest free spot first
    const p = V((r() - 0.5) * (D - 0.1), 0, (r() - 0.5) * (Wd - 0.1));
    let y = GY0 + 0.07 + CAP_R + Math.max(0, 0.13 - Math.hypot(p.x, p.z) * 0.6);
    for (const o of pile) {
      const d = Math.hypot(o.p.x - p.x, o.p.z - p.z);
      if (d < CAP_R * 2) y = Math.max(y, o.p.y + Math.sqrt(Math.max(0, (CAP_R * 2) ** 2 - d * d)));
    }
    if (y > GY0 + GH - CAP_R - 0.12) continue;
    p.y = y;
    pile.push({
      p,
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6.28, r() * 6.28, r() * 6.28)),
      c: new THREE.Color(CAP_COLS[Math.floor(r() * CAP_COLS.length)]),
      ph: r() * 6.28,
    });
    i++;
  }
  const m4 = new THREE.Matrix4(),
    one = V(1, 1, 1),
    tc = new THREE.Color();
  const placePile = (shake: number, time: number) => {
    pile.forEach((o, i) => {
      const s = shake * Math.sin(time * 40 + o.ph) * 0.006,
        p = o.p.clone().add(V(s, Math.abs(s) * 0.6, s * 0.7)),
        q = o.q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(s * 8, 0, s * 6)));
      m4.compose(p, q, one);
      bots.setMatrixAt(i, m4);
      tops.setMatrixAt(i, m4);
      rims.setMatrixAt(i, m4);
      inner.setMatrixAt(i, m4);
      if (!time) {
        bots.setColorAt(i, o.c);
        rims.setColorAt(i, o.c);
        inner.setColorAt(i, tc.setHSL((i * 0.137) % 1, 0.75, 0.68));
      }
    });
    for (const im of [bots, tops, rims, inner]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  };
  placePile(0, 0);
  for (const im of [bots, rims, inner]) {
    im.castShadow = true;
    g.add(im);
  }
  tops.renderOrder = 2;
  g.add(tops);
  pile.length = Math.min(pile.length, N);
  bots.count = tops.count = rims.count = inner.count = pile.length;

  // ---------------------------------------------------------------- the show
  const coin = new THREE.Group(),
    cT = coinTex();
  {
    const cm = new THREE.MeshStandardMaterial({ map: cT.map, normalMap: cT.normalMap, metalness: 1, roughness: 0.28 }),
      em = new THREE.MeshStandardMaterial({ color: '#c8932a', metalness: 1, roughness: 0.3 });
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.005, 40), [em, cm, cm]);
    c.rotation.z = Math.PI / 2;
    coin.add(c);
  }
  coin.visible = false;
  g.add(coin);
  const cap = new THREE.Group(),
    capTop = new THREE.Group(),
    capC = new THREE.MeshPhysicalMaterial({ color: '#e8352e', roughness: 0.25, clearcoat: 1 });
  {
    const b = new THREE.Mesh(C.bot, capC);
    const rim = new THREE.Mesh(C.rim, capC);
    cap.add(b, rim);
    const t = new THREE.Mesh(C.top, clearM);
    capTop.add(t);
    cap.add(capTop);
  }
  const prize = new THREE.Mesh(new THREE.SphereGeometry(CAP_R * 0.62, 32, 20), ballMaterial('classic'));
  cap.add(prize);
  cap.visible = false;
  g.add(cap);
  const tweens: Tween[] = [];
  let shake = 0,
    time = 0;
  const tween = (dur: number, f: (k: number) => void) => new Promise<void>(res => tweens.push({ t: 0, dur, f, done: res }));
  const wait = (s: number) => tween(s, () => {});
  let env: THREE.Texture | null = null;
  const api = {
    group: g,
    handle,
    flap,
    /** reflections for the chrome and glass (call once with the renderer) */
    setEnv(renderer: THREE.WebGLRenderer) {
      if (env) return;
      const pm = new THREE.PMREMGenerator(renderer);
      env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
      for (const m of [yellow, chrome, silver, plateM, glass, colM, clearM, capC]) {
        (m as any).envMap = env;
        (m as any).envMapIntensity = m === yellow ? 0.6 : 1.1;
        m.needsUpdate = true;
      }
      (coin.children[0] as THREE.Mesh).material = ((coin.children[0] as THREE.Mesh).material as THREE.Material[]).map(m => {
        (m as any).envMap = env;
        m.needsUpdate = true;
        return m;
      });
    },
    /** world-space camera spot and look target for the close-up */
    closeUp(pos: THREE.Vector3, look: THREE.Vector3) {
      g.updateMatrixWorld(true);
      pos.copy(g.localToWorld(V(FX + 1.7, 1.12, -0.03)));
      look.copy(g.localToWorld(V(0, 1.0, -0.02)));
    },
    reset() {
      coin.visible = false;
      cap.visible = false;
      capTop.rotation.set(0, 0, 0);
      capTop.position.set(0, 0, 0);
      handle.rotation.x = 0;
      flap.rotation.z = 0;
    },
    /** a Birdie Dollar slides in from the bottom right and drops into the slot */
    async insertCoin() {
      coin.visible = true;
      const a = V(FX + 0.42, 0.72, -0.3),
        b = V(FX + 0.06, 0.975, 0),
        c = V(FX + 0.01, 0.975, 0);
      await tween(0.7, k => {
        const e = ease(k);
        coin.position.lerpVectors(a, b, e);
        coin.position.y += Math.sin(e * Math.PI) * 0.06;
        coin.rotation.set(0, (e * Math.PI) / 2, (1 - e) * 2.5);
      }); // turns edge-on to fit the slot
      await tween(0.25, k => {
        coin.position.lerpVectors(b, c, k);
      });
      coin.visible = false;
      await wait(0.08);
    },
    /** one full turn of the handle, with a rattle in the hopper */
    async turn() {
      await tween(1.1, k => {
        handle.rotation.x = -ease(k) * Math.PI * 2;
        shake = Math.sin(k * Math.PI);
      });
      shake = 0;
    },
    /** a capsule tumbles out of the chute into the tray, pops open, and the ball floats up to the camera */
    async dispense(ballId: string, capColor: string) {
      capC.color.set(capColor);
      prize.material = ballMaterial(ballId);
      cap.visible = true;
      capTop.rotation.set(0, 0, 0);
      capTop.position.set(0, 0, 0);
      const out = V(FX + 0.02, 0.63, 0),
        land = V(FX + 0.075, 0.565 + CAP_R + 0.006, 0);
      await tween(0.18, k => {
        flap.rotation.z = k * 1.0;
      });
      await tween(0.5, k => {
        cap.position.lerpVectors(out, land, k);
        cap.position.y += Math.sin(k * Math.PI) * 0.03 * (1 - k);
        cap.position.y = Math.max(cap.position.y, land.y);
        cap.rotation.set(k * 5, 0, k * 3);
      });
      await tween(0.35, k => {
        cap.position.y = land.y + Math.abs(Math.sin(k * Math.PI * 2)) * 0.02 * (1 - k);
        flap.rotation.z = 1 - k;
      });
      await wait(0.25);
      // lift, turn upright, pop the lid
      const lifted = V(FX + 0.6, 1.0, 0),
        q0 = cap.quaternion.clone(),
        q1 = new THREE.Quaternion();
      await tween(0.55, k => {
        const e = ease(k);
        cap.position.lerpVectors(land, lifted, e);
        cap.quaternion.slerpQuaternions(q0, q1, e);
      });
      await tween(0.35, k => {
        capTop.position.y = k * 0.06;
        capTop.rotation.z = k * 1.1;
        capTop.position.x = -k * 0.03;
      });
      await tween(0.7, k => {
        prize.position.y = ease(k) * 0.09;
        prize.scale.setScalar(1 + ease(k) * 1.6);
      });
    },
    hideCapsule() {
      cap.visible = false;
      prize.position.set(0, 0, 0);
      prize.scale.setScalar(1);
    },
    update(dt: number) {
      time += dt;
      for (let i = tweens.length - 1; i >= 0; i--) {
        const tw = tweens[i];
        tw.t += dt;
        const k = Math.min(1, tw.t / tw.dur);
        tw.f(k);
        if (k >= 1) {
          tweens.splice(i, 1);
          tw.done();
        }
      }
      if (shake > 0.01) placePile(shake, time);
      if (cap.visible) prize.rotation.y += dt * 1.6;
    },
  };
  return api;
}
export type GachaMachine = ReturnType<typeof createGachaMachine>;
export const CAPSULE_COLORS = CAP_COLS;
