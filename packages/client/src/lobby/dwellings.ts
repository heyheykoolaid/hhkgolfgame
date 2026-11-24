// Trailer upgrades (a money sink for the rich, Nov 24): what stands at the back of your lot instead of the travel
// trailer. Each is built in code on the RV's own footprint (lobby/rv.ts: x along the lot, ±3.9 m; door side +Z;
// about 2.6 m deep), so the lot's layout, its collider and Build Mode are unchanged. Bought in the RV menu; the one
// you live in is kept in your lot's record (plots/{uid}.dw), so everyone sees it.
//   double   — a double-wide with a pitched roof, siding, shutters and a porch across the front ($15,000)
//   airstream — a polished aluminium Airstream with a striped awning and a tiki bar out front ($50,000)
//   mansion  — a two-storey McMansion facade crammed onto the same footprint: columns, a pediment, an arched window,
//              two stone lions and a fountain the size of a birdbath ($150,000)
import * as THREE from 'three';
import { buildRV, mats, Pile, shell, windowTex } from './rv';

export const DWELLINGS = [
  { id: '', name: 'Travel trailer', price: 0, desc: 'Where everyone starts. It has wheels, in case.' },
  {
    id: 'double',
    name: 'Double-wide',
    price: 15000,
    desc: 'Vinyl siding, a pitched roof, shutters in your colour and a porch with a rail. Practically a house.',
  },
  {
    id: 'airstream',
    name: 'Retro Airstream',
    price: 50000,
    desc: 'Polished aluminium, a striped awning and a little tiki bar out front. Glints all evening.',
  },
  {
    id: 'mansion',
    name: 'The McMansion',
    price: 150000,
    desc: 'Two storeys of stucco, columns, an arched window and two stone lions, squeezed onto the same patch of gravel.',
  },
];
export const dwellingItem = (id: string) => 'dw' + id;
const std = (color: string, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const Z = 1.25;

let sidingTex: THREE.Texture | null = null;
function siding() {
  if (sidingTex) return sidingTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e8e4d8';
  g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 8) {
    g.fillStyle = 'rgba(0,0,0,0.16)';
    g.fillRect(0, y + 6, 64, 2);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(0, y, 64, 1);
  }
  sidingTex = new THREE.CanvasTexture(c);
  sidingTex.wrapS = sidingTex.wrapT = THREE.RepeatWrapping;
  sidingTex.repeat.set(6, 5);
  sidingTex.colorSpace = THREE.SRGBColorSpace;
  return sidingTex;
}
let ribTex: THREE.Texture | null = null;
function ribs() {
  if (ribTex) return ribTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 16);
  gr.addColorStop(0, '#f4f6f8');
  gr.addColorStop(0.5, '#a9b0b8');
  gr.addColorStop(1, '#eef1f4');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 16);
  g.fillStyle = 'rgba(60,64,70,0.35)';
  for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 1, 16);
  for (let x = 4; x < 128; x += 8) {
    g.beginPath();
    g.arc(x, 2, 0.8, 0, 7);
    g.fill();
  }
  ribTex = new THREE.CanvasTexture(c);
  ribTex.wrapS = ribTex.wrapT = THREE.RepeatWrapping;
  ribTex.repeat.set(5, 10);
  ribTex.colorSpace = THREE.SRGBColorSpace;
  return ribTex;
}

/** A gable roof prism along x: width (z) w, length L, ridge h above y0. */
function gable(L: number, w: number, h: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false });
  g.translate(0, 0, -L / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

function doubleWide(stripe: THREE.MeshStandardMaterial) {
  const M = mats(),
    g = new THREE.Group(),
    P = new Pile(),
    side = new THREE.MeshStandardMaterial({ map: siding(), roughness: 0.75 }),
    roof = std('#4a4440', 0.9),
    deck = std('#8a6a48', 0.85),
    lattice = std('#d8d2c2', 0.8);
  const L = 7.7,
    W = 2.5,
    y0 = 0.55,
    y1 = 3.0;
  P.box(side, L, y1 - y0, W, 0, (y0 + y1) / 2, 0);
  P.box(lattice, L - 0.1, y0, W - 0.1, 0, y0 / 2, 0); // skirting
  P.add(roof, gable(L + 0.5, W + 0.6, 1.0), 0, y1, 0);
  P.box(M.white, L + 0.5, 0.08, W + 0.62, 0, y1 + 0.02, 0); // fascia
  // windows with shutters in the owner's colour
  const win = (x: number, z: number, ry: number) => {
    P.add(M.win, new THREE.PlaneGeometry(1.0, 0.95), x, 1.95, z, 0, ry, 0);
    P.box(M.white, 1.1, 0.08, 0.05, x, 1.44, z);
    for (const s of [-1, 1]) P.box(stripe, 0.32, 1.0, 0.04, x + s * 0.7, 1.95, z + (ry ? -0.01 : 0.01));
  };
  for (const x of [-2.8, -1.2, 0.6]) win(x, Z + 0.01, 0);
  for (const x of [-2, 1.6]) win(x, -Z - 0.01, Math.PI);
  // door, light
  P.box(stripe, 0.9, 2.0, 0.05, 2.4, 0.55 + 1.0, Z + 0.02);
  P.add(M.win, new THREE.PlaneGeometry(0.4, 0.5), 2.4, 2.05, Z + 0.05);
  P.box(M.chrome, 0.05, 0.12, 0.05, 2.1, 1.5, Z + 0.06);
  P.add(M.lamp, new THREE.SphereGeometry(0.06, 8, 6), 1.8, 2.45, Z + 0.08);
  // the porch: a deck across the front, a rail with spindles, steps down at the door, posts holding a little roof
  const pd = 0.85;
  P.box(deck, L, 0.08, pd, 0, 0.55, Z + pd / 2);
  for (const x of [-3.8, -1.3, 1.3, 3.8]) P.box(deck, 0.1, 0.55, 0.1, x, 0.27, Z + pd - 0.06);
  for (let x = -3.8; x <= 1.6; x += 0.18) P.box(M.white, 0.035, 0.6, 0.035, x, 0.9, Z + pd - 0.05);
  P.box(M.white, 5.5, 0.06, 0.08, -1.1, 1.22, Z + pd - 0.05);
  P.box(M.white, 0.06, 0.06, pd, 3.8, 1.22, Z + pd / 2);
  for (let k = 0; k < 3; k++) P.box(deck, 1.0, 0.07, 0.3, 2.4, 0.42 - k * 0.15, Z + pd + 0.15 + k * 0.28);
  for (const x of [-3.8, -0.6, 3.8]) P.box(M.white, 0.1, 2.3, 0.1, x, 1.7, Z + pd - 0.05);
  P.box(roof, L, 0.06, pd + 0.2, 0, 2.86, Z + pd / 2, -0.12, 0, 0);
  // a satellite dish, a window air conditioner, a flamingo
  P.cyl(M.white, 0.3, 0.05, 0.12, 14, -3.2, y1 + 0.6, -0.4, 0.9, 0, 0).cyl(M.dark, 0.02, 0.02, 0.5, 5, -3.2, y1 + 0.35, -0.5);
  P.box(M.white, 0.6, 0.4, 0.4, 0.6, 1.3, -Z - 0.2);
  const pink = std('#ff6fa8', 0.6);
  P.add(pink, new THREE.SphereGeometry(0.12, 10, 8), -3.3, 0.85, Z + pd + 0.6)
    .cyl(pink, 0.02, 0.03, 0.4, 6, -3.25, 1.05, Z + pd + 0.6, 0, 0, 0.5)
    .add(pink, new THREE.SphereGeometry(0.05, 8, 6), -3.15, 1.25, Z + pd + 0.6)
    .cyl(M.dark, 0.008, 0.008, 0.75, 4, -3.3, 0.37, Z + pd + 0.6);
  P.build(g);
  return g;
}

function airstream(stripe: THREE.MeshStandardMaterial) {
  const M = mats(),
    g = new THREE.Group(),
    P = new Pile(),
    alu = new THREE.MeshStandardMaterial({
      map: ribs(),
      color: '#ffffff',
      metalness: 0.35,
      roughness: 0.28,
      emissive: '#5a6068',
      emissiveIntensity: 0.35,
    }); // (no environment to reflect: kept part-diffuse so it reads as polished, not black)
  // the capsule: a rounded loaf
  P.add(alu, shell(7.6, 0.58, 3.0, 2.5, 1.15, 0.5, 0.18));
  P.box(M.dark, 6.6, 0.18, 2.1, 0, 0.5, 0);
  // wraparound front windows and a band of portholes
  P.add(M.win, new THREE.CylinderGeometry(1.05, 1.05, 0.7, 20, 1, true, -Math.PI / 2 - 0.9, 1.8), -3.0, 2.2, 0, 0, 0, Math.PI / 2);
  for (const x of [-1.6, 0, 1.6]) P.add(M.win, new THREE.CircleGeometry(0.36, 18), x, 2.0, Z + 0.02);
  for (const x of [-1, 1.2]) P.add(M.win, new THREE.CircleGeometry(0.36, 18), x, 2.0, -Z - 0.02, 0, Math.PI, 0);
  // door with a round-cornered window
  P.box(M.chrome, 0.8, 1.9, 0.03, 2.4, 1.55, Z + 0.02).add(M.win, new THREE.CircleGeometry(0.2, 14), 2.4, 2.05, Z + 0.04);
  P.box(M.dark, 0.7, 0.05, 0.35, 2.4, 0.45, Z + 0.2);
  // wheels skirts
  for (const s of [-1, 1]) P.box(M.dark, 1.6, 0.4, 0.05, -0.5, 0.75, s * (Z + 0.03));
  // a striped awning on two poles, and a tiki bar under it
  const awn = new THREE.MeshStandardMaterial({ map: mats().awnTex, roughness: 0.85, side: THREE.DoubleSide });
  awn.color = stripe.color;
  P.add(awn, new THREE.PlaneGeometry(4.2, 2.2), -0.6, 2.55, Z + 1.05, -Math.PI / 2 + 0.2, 0, 0);
  for (const x of [-2.6, 1.4]) P.cyl(M.chrome, 0.025, 0.025, 2.35, 6, x, 1.18, Z + 2.1);
  const bamboo = std('#c9a46a', 0.8),
    thatch = std('#b08a4a', 0.95);
  P.box(bamboo, 1.6, 1.0, 0.5, -1.4, 0.5, Z + 1.3);
  P.box(thatch, 1.8, 0.08, 0.7, -1.4, 1.04, Z + 1.3);
  for (const x of [-2.0, -1.4, -0.8]) P.cyl(std('#ffd24a', 0.4), 0.05, 0.04, 0.16, 8, x, 1.16, Z + 1.3);
  // string of bulbs along the awning's edge
  for (let k = 0; k < 10; k++)
    P.add(M.lamp, new THREE.SphereGeometry(0.045, 6, 5), -2.6 + k * 0.44, 2.18 - Math.sin((k / 9) * Math.PI) * 0.12, Z + 2.12);
  P.build(g);
  return g;
}

function mansion(stripe: THREE.MeshStandardMaterial) {
  const M = mats(),
    g = new THREE.Group(),
    P = new Pile(),
    stucco = std('#efe1c6', 0.9),
    stone = std('#d9d2c2', 0.75),
    roof = std('#6a4436', 0.85),
    gold = new THREE.MeshStandardMaterial({ color: '#d9a93a', metalness: 0.8, roughness: 0.3 });
  const L = 7.7,
    W = 2.4,
    H = 6.0;
  // the box, two storeys, with a band between them
  P.box(stucco, L, H, W, 0, H / 2, -0.05);
  P.box(stone, L + 0.1, 0.2, W + 0.1, 0, 3.0, -0.05);
  P.box(stone, L + 0.1, 0.4, W + 0.1, 0, 0.2, -0.05);
  // three gables along the roof (because one is never enough), and a centre turret
  for (const [x, w] of [
    [-2.6, 2.6],
    [2.6, 2.6],
  ] as const)
    P.add(roof, gable(w, W + 0.6, 1.3).rotateY(Math.PI / 2), x, H, -0.05);
  P.add(roof, gable(L + 0.4, W + 0.6, 1.0), 0, H, -0.05);
  P.cyl(stucco, 0.75, 0.75, 1.6, 12, 0, H + 0.6, 0.3).add(roof, new THREE.ConeGeometry(0.95, 1.4, 12), 0, H + 2.1, 0.3);
  // the portico: four columns, a pediment, a big double door in the owner's colour
  for (const x of [-1.45, -0.5, 0.5, 1.45]) {
    P.cyl(M.white, 0.14, 0.17, 3.0, 14, x, 1.55, Z + 0.85);
    P.box(M.white, 0.42, 0.14, 0.42, x, 0.07, Z + 0.85).box(M.white, 0.42, 0.14, 0.42, x, 3.07, Z + 0.85);
  }
  P.box(M.white, 3.5, 0.3, 1.2, 0, 3.25, Z + 0.45);
  const ped = gable(1.2, 3.6, 0.9);
  ped.rotateY(Math.PI / 2);
  P.add(M.white, ped, 0, 3.4, Z + 0.45);
  P.box(stripe, 1.4, 2.4, 0.06, 0, 1.6, Z + 0.02);
  P.box(gold, 0.05, 0.3, 0.06, -0.12, 1.6, Z + 0.07).box(gold, 0.05, 0.3, 0.06, 0.12, 1.6, Z + 0.07);
  // a big arched window over the door, and windows either side on both floors
  P.add(M.win, new THREE.CircleGeometry(0.75, 18, 0, Math.PI), 0, 4.3, Z + 0.06).add(M.win, new THREE.PlaneGeometry(1.5, 0.7), 0, 3.95, Z + 0.06);
  for (const x of [-2.9, -2.0, 2.0, 2.9])
    for (const y of [1.6, 4.4]) {
      P.add(M.win, new THREE.PlaneGeometry(0.7, 1.2), x, y, Z + 0.06);
      P.box(M.white, 0.86, 0.1, 0.1, x, y - 0.65, Z + 0.08).box(M.white, 0.86, 0.14, 0.1, x, y + 0.67, Z + 0.08);
    }
  // two stone lions on plinths, and a fountain the size of a birdbath
  for (const x of [-2.4, 2.4]) {
    P.box(stone, 0.6, 0.7, 0.6, x, 0.35, Z + 1.4);
    P.add(stone, new THREE.SphereGeometry(0.22, 10, 8), x, 0.95, Z + 1.4)
      .add(stone, new THREE.SphereGeometry(0.17, 10, 8), x, 1.2, Z + 1.55)
      .add(gold, new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, 1.2), x, 1.18, Z + 1.5);
  }
  P.cyl(stone, 0.45, 0.5, 0.3, 16, -3.3, 0.15, Z + 0.55)
    .cyl(stone, 0.06, 0.08, 0.5, 8, -3.3, 0.5, Z + 0.55)
    .cyl(stone, 0.2, 0.1, 0.1, 12, -3.3, 0.78, Z + 0.55);
  P.add(
    new THREE.MeshStandardMaterial({ color: '#7fc8e8', roughness: 0.1, metalness: 0.2 }),
    new THREE.CircleGeometry(0.42, 16).rotateX(-Math.PI / 2),
    -3.3,
    0.29,
    Z + 0.55,
  );
  P.build(g);
  void windowTex;
  return g;
}

/** The dwelling for `id` ('' = the travel trailer), in the owner's colour. */
export function buildDwelling(id: string, stripe: THREE.MeshStandardMaterial) {
  if (id === 'double') return doubleWide(stripe);
  if (id === 'airstream') return airstream(stripe);
  if (id === 'mansion') return mansion(stripe);
  return buildRV(stripe);
}
