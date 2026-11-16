// Asset manifest + loader. Every commissioned asset has a slot here with a greybox fallback, so the game
// runs today and swaps in real art the moment a .glb lands in /public/assets (no code changes needed).
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export interface AssetSlot {
  id: string;
  file: string; // /assets/<file>
  kind: 'character' | 'prop' | 'vehicle' | 'building';
  clips?: string[]; // animation clip names the game expects (characters)
  fallback: () => THREE.Object3D;
}

const mat = (c: string, r = 0.85, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, flatShading: true });
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  return o;
};
const cyl = (rt: number, rb: number, h: number, s: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  return o;
};

/** Greybox golfer — same proportions and pivot as the commissioned character (feet at origin, faces +Z). */
export function greyboxGolfer(shirt = '#2b2b2b', pants = '#5d5a3c') {
  const g = new THREE.Group();
  g.name = 'greybox_golfer';
  const skin = mat('#c98f62'),
    sh = mat(shirt),
    pa = mat(pants),
    cap = mat('#3a3a32'),
    shoe = mat('#e6e1d6');
  for (const s of [1, -1]) {
    g.add(box(0.2, 0.86, 0.24, pa, 0.13 * s, 0.47, 0));
    g.add(box(0.22, 0.1, 0.32, shoe, 0.13 * s, 0.05, 0.04));
  }
  g.add(box(0.56, 0.66, 0.32, sh, 0, 1.24, 0));
  for (const s of [1, -1]) g.add(box(0.15, 0.62, 0.17, sh, 0.36 * s, 1.22, 0));
  g.add(box(0.26, 0.3, 0.28, skin, 0, 1.73, 0));
  g.add(box(0.3, 0.1, 0.32, cap, 0, 1.9, -0.01), box(0.26, 0.03, 0.18, cap, 0, 1.87, -0.2)); // backwards cap
  return g;
}

export const MANIFEST: AssetSlot[] = [
  {
    id: 'char_golfer',
    file: 'characters/golfer_base.glb',
    kind: 'character',
    clips: [
      'idle',
      'walk',
      'jog',
      'address',
      'swing_full',
      'swing_chip',
      'putt',
      'celebrate',
      'frustrated',
      'cart_enter',
      'cart_exit',
      'cart_sit',
      'wave',
    ],
    fallback: () => greyboxGolfer(),
  },
  {
    id: 'veh_cart_rusty',
    file: 'vehicles/cart_rusty.glb',
    kind: 'vehicle',
    fallback: () => {
      const g = new THREE.Group(),
        rust = mat('#9a6a45'),
        cream = mat('#d8cdb4'),
        dark = mat('#222');
      g.add(box(1.25, 0.45, 2.35, cream, 0, 0.55, 0), box(1.3, 0.06, 1.75, rust, 0, 2.05, 0.05), box(1.15, 0.5, 0.1, rust, 0, 1.25, -0.62));
      for (const [x, z] of [
        [0.6, 0.78],
        [-0.6, 0.78],
        [0.6, -0.78],
        [-0.6, -0.78],
      ]) {
        const w = cyl(0.25, 0.25, 0.2, 10, dark, x, 0.25, z);
        w.rotation.z = Math.PI / 2;
        g.add(w);
      }
      for (const [x, z] of [
        [0.58, 0.8],
        [-0.58, 0.8],
        [0.58, -0.62],
        [-0.58, -0.62],
      ])
        g.add(cyl(0.025, 0.025, 1.25, 5, dark, x, 1.42, z));
      return g;
    },
  },
  {
    id: 'bld_clubhouse',
    file: 'buildings/clubhouse_golden_hills.glb',
    kind: 'building',
    fallback: () => {
      const g = new THREE.Group(),
        stucco = mat('#d9c6a5'),
        roof = mat('#6d6458'),
        trim = mat('#8a8f86'),
        dark = mat('#2a2622');
      g.add(box(14, 4, 8, stucco, 0, 2, 0), box(15, 0.4, 9, roof, 0, 4.2, 0));
      const r = box(15, 0.3, 5.2, roof, 0, 4.9, 1.9);
      r.rotation.x = 0.35;
      g.add(r);
      for (const x of [-4.5, -1.5, 3.5]) g.add(box(1.6, 1.2, 0.1, dark, x, 2.2, 4.03));
      g.add(box(1.3, 2.4, 0.1, trim, 1, 1.2, 4.03), box(2.4, 0.4, 1.4, mat('#7a6a55'), 1, 0.2, 4.6));
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(4.2, 1),
        new THREE.MeshStandardMaterial({ map: signTexture('GOLDEN HILLS', 'GOLF'), roughness: 0.9 }),
      );
      sign.position.set(-1, 3.4, 4.08);
      g.add(sign);
      g.add(box(1.2, 0.8, 0.6, trim, 5.5, 2.8, 4.3)); // AC unit
      return g;
    },
  },
  { id: 'veh_sedan', file: 'vehicles/sedan_90s.glb', kind: 'vehicle', fallback: () => carGreybox('#7a4a42') },
  { id: 'veh_wagon', file: 'vehicles/wagon_90s.glb', kind: 'vehicle', fallback: () => carGreybox('#8a8f6a', true) },
  { id: 'prop_palm', file: 'props/palm_washingtonia.glb', kind: 'prop', fallback: () => palmGreybox() },
  {
    id: 'prop_power_pole',
    file: 'props/power_pole.glb',
    kind: 'prop',
    fallback: () => {
      const g = new THREE.Group(),
        wood = mat('#5a4430');
      g.add(cyl(0.12, 0.16, 9, 6, wood, 0, 4.5, 0), box(2.2, 0.14, 0.14, wood, 0, 8.4, 0));
      return g;
    },
  },
  { id: 'prop_crate', file: 'props/crate_wood.glb', kind: 'prop', fallback: () => box(0.9, 0.7, 0.9, mat('#8a6a45'), 0, 0.35, 0) },
];

function carGreybox(color: string, wagon = false) {
  const g = new THREE.Group(),
    body = mat(color, 0.6, 0.1),
    glass = mat('#2a3038', 0.3),
    tire = mat('#141414');
  g.add(box(1.8, 0.65, 4.6, body, 0, 0.62, 0), box(1.65, 0.55, wagon ? 2.9 : 2.1, glass, 0, 1.2, wagon ? -0.4 : -0.1));
  for (const [x, z] of [
    [0.82, 1.4],
    [-0.82, 1.4],
    [0.82, -1.4],
    [-0.82, -1.4],
  ]) {
    const w = cyl(0.33, 0.33, 0.24, 10, tire, x, 0.33, z);
    w.rotation.z = Math.PI / 2;
    g.add(w);
  }
  return g;
}
export function palmGreybox(h = 9) {
  const g = new THREE.Group(),
    tr = mat('#7a634a'),
    lf = mat('#5d7a35');
  for (let i = 0; i < 8; i++) g.add(cyl(0.2 - i * 0.012, 0.23 - i * 0.012, h / 8, 6, tr, i * 0.06, h / 16 + (i * h) / 8, 0));
  for (let i = 0; i < 9; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.05, 0.45).translate(1.3, 0, 0), lf);
    f.castShadow = true;
    f.position.set(0.48, h, 0);
    f.rotation.set(0, (i / 9) * Math.PI * 2, -0.55);
    g.add(f);
  }
  return g;
}
export function signTexture(a: string, b: string) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#e8e1cf';
  x.fillRect(0, 0, 512, 128);
  x.strokeStyle = '#4b5a3c';
  x.lineWidth = 8;
  x.strokeRect(4, 4, 504, 120);
  x.fillStyle = '#3f5232';
  x.textAlign = 'center';
  x.font = '800 56px Impact, sans-serif';
  x.fillText(a, 256, 66);
  x.font = '700 34px Impact, sans-serif';
  x.fillText(b, 256, 108);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- loading ----------
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<{ scene: THREE.Object3D; gltf: GLTF | null }>>();
export const ASSET_STATUS: Record<string, 'commissioned' | 'greybox'> = {};

/** Load an asset by id; resolves with the real model if present, otherwise its greybox. */
export function loadAsset(id: string) {
  if (!cache.has(id)) {
    const slot = MANIFEST.find(s => s.id === id);
    if (!slot) throw new Error('Unknown asset ' + id);
    cache.set(
      id,
      loader
        .loadAsync('assets/' + slot.file)
        .then(gltf => {
          ASSET_STATUS[id] = 'commissioned';
          gltf.scene.traverse(o => {
            if ((o as THREE.Mesh).isMesh) {
              o.castShadow = o.receiveShadow = true;
            }
          });
          return { scene: gltf.scene, gltf };
        })
        .catch(() => {
          ASSET_STATUS[id] = 'greybox';
          return { scene: slot.fallback(), gltf: null };
        }),
    );
  }
  return cache.get(id)!.then(r => ({ scene: r.gltf ? r.scene.clone(true) : MANIFEST.find(s => s.id === id)!.fallback(), gltf: r.gltf }));
}
