// Build Mode catalog: everything you can place on your RV lot. Each item is a small low-poly model built in code
// (art bible: chunky silhouettes, sun-faded colours), with a footprint used for placement and walking collisions.
// Origin = bottom centre, front faces +Z. Prices are in cash (shown now, charged once the cash wallet exists).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { windSway } from '../world/wind';
import { M, box, cyl } from './world';
import { buildTrophy } from '../world/trophy';
import { cartModel } from '../vehicles/vehicles';
import { propInstance, loadProp } from '../world/props';
import { loadProps, type PropPack } from '../world/propPacks';

export type Cat = 'furniture' | 'decor' | 'grow' | 'trophies' | 'garage';
export interface ItemDef {
  id: string;
  name: string;
  cat: Cat;
  price: number;
  w: number;
  d: number; // footprint (m) before rotation
  floor?: boolean; // rugs, decks, paths: lie on the ground, other things can stand on them, nothing blocks walking
  solid?: boolean; // blocks walking (default true unless floor)
  top?: [number, number, number]; // a flat top that small things can stand on: its height, width and depth (m)
  posts?: [number, number][]; // only these local spots are solid (string lights: walk and build under the span)
  max?: number; // most you can place (e.g. one garage)
  model?: string; // a detailed Poly Haven model (world/props.ts) instead of a built one
  pack?: string; // or pieces of a prop pack (world/propPacks.ts; credits in docs/credits.md)
  slots?: [number, number, number][]; // grow gear: where plants sit (local x, soil height, z)
  make(color: string): THREE.Object3D;
}

const g = (...o: THREE.Object3D[]) => {
  const r = new THREE.Group();
  if (o.length) r.add(...o);
  return r;
};
const leg = (x: number, z: number, h: number, m: THREE.Material, r = 0.025) => cyl(r, r, h, 6, m, x, h / 2, z);
const DARKWOOD = () => M('#6a4a2e', 0.8),
  ALU = () => M('#c9ccd0', 0.35, 0.7),
  WHITE = () => M('#f1eee6', 0.6);
function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const stripes = (a: string, b: string, n = 6) =>
  canvasTex(64, 64, x => {
    for (let i = 0; i < n; i++) {
      x.fillStyle = i % 2 ? b : a;
      x.fillRect((i * 64) / n, 0, 64 / n + 1, 64);
    }
  });
function flat(w: number, d: number, mat: THREE.Material, y = 0.012) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.024, d), mat);
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

// detailed models (Poly Haven, CC0): footprints from tools/props/pack.mjs (metres)
const PH: Record<string, [number, number]> = {
  concrete_cat_statue: [0.153, 0.25],
  folding_wooden_stool: [0.528, 0.547],
  garden_gnome: [0.257, 0.21],
  metal_trash_can: [1.778, 0.556],
  old_tyre: [0.6, 0.165],
  outdoor_table_chair_set_01: [0.742, 1.717],
  painted_wooden_bench: [1.165, 0.497],
  painted_wooden_sofa: [2.452, 0.787],
  planter_box_01: [0.913, 0.414],
  planter_pot_clay: [0.266, 0.263],
  plastic_monobloc_chair_01: [0.642, 0.628],
  potted_plant_04: [0.168, 0.185],
  propane_tank: [0.337, 0.337],
  standing_chalkboard_01: [0.92, 0.759],
  stone_fire_pit: [1.448, 1.433],
  watering_can_metal_01: [0.191, 0.452],
  wooden_crate_01: [0.825, 0.409],
  wooden_lantern_01: [0.221, 0.235],
  wooden_picnic_table: [2.241, 3.022],
};
const ph = (id: string, model: string, name: string, cat: Cat, price: number, extra: Partial<ItemDef> = {}): ItemDef => ({
  id,
  name,
  cat,
  price,
  w: Math.max(0.3, PH[model][0] + 0.06),
  d: Math.max(0.3, PH[model][1] + 0.06),
  model,
  make: () => propInstance(model),
  ...extra,
});

// ---- furniture taken from prop packs: a list of the pack's pieces, or everything standing in a rectangle of its scene
const kits = new Map<string, PropPack>();
export const packReady = (pack: string) => kits.has(pack);
export const loadPack = (pack: string) =>
  loadProps(pack, n => n).then(k => {
    kits.set(pack, k);
    return k;
  });
/** names, or [x0, z0, x1, z1, highest base] in the pack's scene */
type Pick = string[] | [number, number, number, number, number];
function packGroup(pack: string, pick: Pick, yaw: number) {
  const G = g(),
    fill = (kit: PropPack) => {
      const r = pick as number[],
        names =
          typeof pick[0] === 'string'
            ? (pick as string[])
            : kit.names.filter(n => {
                const a = kit.at(n)!,
                  z = kit.size(n)!;
                return a.x >= r[0] && a.x <= r[2] && a.z >= r[1] && a.z <= r[3] && a.y <= r[4] && Math.max(z.x, z.z) < 5;
              }),
        inner = g();
      for (const n of names) {
        const o = kit.make(n);
        if (!o) continue;
        o.position.copy(kit.at(n)!);
        inner.add(o);
      }
      const b = new THREE.Box3().setFromObject(inner);
      if (b.isEmpty()) return;
      inner.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
      const turn = g(inner);
      turn.rotation.y = yaw;
      G.add(turn);
    };
  const k = kits.get(pack);
  if (k) fill(k);
  else void loadPack(pack).then(fill);
  return G;
}
const Q = Math.PI / 2;
const pk = (
  id: string,
  pack: string,
  pick: Pick,
  yaw: number,
  name: string,
  cat: Cat,
  price: number,
  w: number,
  d: number,
  extra: Partial<ItemDef> = {},
): ItemDef => ({ id, name, cat, price, w, d, pack, make: () => packGroup(pack, pick, yaw), ...extra });
const H = (...n: string[]) => n.map(x => (/_0$/.test(x) ? x : x + '_atlas_living_0'));
const B = (...n: string[]) => n.map(x => x + '_atlas_mueblesDormitorio1_0');
/** Everything a shop or Build Mode needs loaded before it can draw the catalog's pictures. */
export const loadItemModels = () =>
  Promise.all([
    ...ITEMS.filter(i => i.model).map(i => loadProp(i.model!)),
    ...[...new Set(ITEMS.map(i => i.pack).filter(Boolean))].map(p => loadPack(p!)),
  ]);

const SOIL = () => M('#3b2a1c', 0.95);
export const ITEMS: ItemDef[] = [
  // ---------------- grow gear (design/grow-mechanics.md): plants live in these slots
  {
    id: 'growpot',
    name: 'Grow pot',
    cat: 'grow',
    price: 150,
    w: 0.6,
    d: 0.6,
    slots: [[0, 0.44, 0]],
    make: () =>
      g(
        cyl(0.27, 0.21, 0.42, 14, M('#2a2a2c', 0.7), 0, 0.21, 0),
        cyl(0.285, 0.285, 0.05, 14, M('#333336', 0.6), 0, 0.42, 0),
        cyl(0.25, 0.25, 0.03, 14, SOIL(), 0, 0.43, 0),
      ),
  },
  {
    id: 'sprinkler',
    name: 'Sprinkler (waters plants within 2.6 m)',
    cat: 'grow',
    price: 350,
    w: 0.4,
    d: 0.4,
    solid: false,
    make: () => {
      const r = g(cyl(0.12, 0.15, 0.06, 10, M('#3a3a3c', 0.6), 0, 0.03, 0), cyl(0.025, 0.025, 0.42, 8, M('#9aa0a6', 0.4, 0.6), 0, 0.24, 0));
      const head = g(box(0.22, 0.04, 0.05, M('#2d6fb3', 0.5), 0, 0, 0), cyl(0.04, 0.04, 0.06, 8, M('#2d6fb3', 0.5), 0, 0, 0));
      head.position.y = 0.46;
      head.userData.sprinklerHead = true;
      r.add(head);
      return r;
    },
  },
  {
    id: 'growbed',
    name: 'Raised grow bed',
    cat: 'grow',
    price: 600,
    w: 2.0,
    d: 0.8,
    slots: [
      [-0.62, 0.41, 0],
      [0, 0.41, 0],
      [0.62, 0.41, 0],
    ],
    make: () => {
      const w = M('#8a6a44', 0.85),
        r = g(box(1.95, 0.4, 0.75, w, 0, 0.2, 0), box(1.85, 0.03, 0.65, SOIL(), 0, 0.405, 0));
      for (const x of [-0.98, 0.98]) for (const z of [-0.38, 0.38]) r.add(box(0.08, 0.46, 0.08, M('#6a4a2e', 0.85), x, 0.23, z));
      for (let i = 0; i < 4; i++) r.add(box(1.96, 0.015, 0.012, M('#5a3e26', 0.9), 0, 0.08 + i * 0.1, 0.377));
      return r;
    },
  },

  // ---------------- furniture & comfort
  ph('picnic', 'wooden_picnic_table', 'Wooden picnic table', 'furniture', 600, { top: [0.746, 0.8, 2.9] }),
  ph('bistro', 'outdoor_table_chair_set_01', 'Café table + 2 chairs', 'furniture', 480, { top: [0.72, 0.62, 0.62] }),
  ph('monobloc', 'plastic_monobloc_chair_01', 'Plastic patio chair', 'furniture', 45),
  ph('bench', 'painted_wooden_bench', 'Painted wooden bench', 'furniture', 260),
  ph('porchsofa', 'painted_wooden_sofa', 'Painted porch sofa', 'furniture', 700),
  ph('stool', 'folding_wooden_stool', 'Folding stool', 'furniture', 35, { top: [0.442, 0.42, 0.42] }),
  ph('firepit', 'stone_fire_pit', 'Stone fire pit', 'furniture', 900),
  {
    id: 'lawnchair',
    name: 'Folding lawn chair',
    cat: 'furniture',
    price: 120,
    w: 0.7,
    d: 0.7,
    make: c => {
      const web = new THREE.MeshStandardMaterial({ map: stripes(c, '#f1eee6', 8), roughness: 0.8 });
      const seat = box(0.56, 0.04, 0.5, web, 0, 0.4, 0.02),
        back = box(0.56, 0.6, 0.04, web, 0, 0.72, -0.26);
      back.rotation.x = -0.25;
      return g(
        seat,
        back,
        ...[-0.28, 0.28].flatMap(x => [
          box(0.03, 0.03, 0.62, ALU(), x, 0.42, 0),
          leg(x, 0.24, 0.4, ALU(), 0.015),
          leg(x, -0.24, 0.4, ALU(), 0.015),
          box(0.03, 0.03, 0.36, ALU(), x, 0.62, 0.05),
        ]),
      );
    },
  },
  {
    id: 'adirondack',
    name: 'Adirondack chair',
    cat: 'furniture',
    price: 280,
    w: 0.8,
    d: 0.95,
    make: () => {
      const wd = M('#d8cfc0', 0.8),
        o = g();
      for (let i = 0; i < 5; i++) {
        const s = box(0.12, 0.75, 0.03, wd, -0.26 + i * 0.13, 0.75, -0.32);
        s.rotation.x = -0.45;
        o.add(s);
      }
      o.add(box(0.62, 0.04, 0.55, wd, 0, 0.36, 0.02), box(0.12, 0.03, 0.75, wd, -0.36, 0.6, 0.05), box(0.12, 0.03, 0.75, wd, 0.36, 0.6, 0.05));
      for (const x of [-0.33, 0.33]) o.add(leg(x, 0.32, 0.6, wd, 0.03), leg(x, -0.2, 0.36, wd, 0.03));
      return o;
    },
  },
  {
    id: 'sofa',
    name: 'Outdoor sofa',
    cat: 'furniture',
    price: 1200,
    w: 2.1,
    d: 0.95,
    make: c => {
      const fr = M('#5a4a3a', 0.8),
        cu = M(c, 0.85),
        o = g(
          box(2.0, 0.3, 0.85, fr, 0, 0.25, 0),
          box(2.0, 0.55, 0.15, fr, 0, 0.62, -0.36),
          box(0.15, 0.35, 0.85, fr, -0.93, 0.55, 0),
          box(0.15, 0.35, 0.85, fr, 0.93, 0.55, 0),
        );
      for (const x of [-0.45, 0.45]) o.add(box(0.86, 0.14, 0.66, cu, x, 0.47, 0.05), box(0.82, 0.42, 0.12, cu, x, 0.75, -0.24));
      return o;
    },
  },
  {
    id: 'grill',
    name: 'Kettle grill',
    cat: 'furniture',
    price: 450,
    w: 0.7,
    d: 0.7,
    make: () => {
      const bk = M('#1d1d1f', 0.45, 0.3),
        bowl = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), bk);
      bowl.rotation.x = Math.PI;
      bowl.position.y = 0.78;
      bowl.castShadow = true;
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), bk);
      lid.position.y = 0.8;
      lid.castShadow = true;
      const o = g(bowl, lid, cyl(0.03, 0.03, 0.08, 6, M('#8a6a45'), 0, 1.06, 0));
      for (let i = 0; i < 3; i++) {
        const a = i * 2.09,
          l = cyl(0.015, 0.015, 0.78, 5, ALU(), Math.sin(a) * 0.2, 0.39, Math.cos(a) * 0.2);
        l.rotation.set(Math.cos(a) * 0.2, 0, -Math.sin(a) * 0.2);
        o.add(l);
      }
      return o;
    },
  },
  {
    id: 'cooler',
    name: 'Cooler',
    cat: 'furniture',
    price: 90,
    w: 0.7,
    d: 0.45,
    top: [0.47, 0.6, 0.38],
    make: c =>
      g(
        box(0.62, 0.36, 0.4, M(c, 0.55), 0, 0.2, 0),
        box(0.64, 0.08, 0.42, WHITE(), 0, 0.42, 0),
        box(0.3, 0.03, 0.04, M('#888', 0.5, 0.5), 0, 0.48, 0),
      ),
  },
  {
    id: 'umbrella',
    name: 'Patio umbrella',
    cat: 'furniture',
    price: 300,
    w: 0.8,
    d: 0.8,
    make: c => {
      const can = new THREE.Mesh(
        new THREE.ConeGeometry(1.25, 0.45, 8, 1, true),
        new THREE.MeshStandardMaterial({ map: stripes(c, '#f1eee6', 8), side: THREE.DoubleSide, roughness: 0.8 }),
      );
      can.position.y = 2.25;
      can.castShadow = true;
      return g(can, cyl(0.025, 0.025, 2.4, 6, WHITE(), 0, 1.2, 0), cyl(0.2, 0.24, 0.1, 10, M('#555', 0.6), 0, 0.05, 0));
    },
  },
  {
    id: 'hammock',
    name: 'Hammock',
    cat: 'furniture',
    price: 800,
    w: 3.2,
    d: 0.9,
    make: c => {
      const wd = DARKWOOD(),
        o = g(cyl(0.06, 0.07, 1.6, 6, wd, -1.45, 0.8, 0), cyl(0.06, 0.07, 1.6, 6, wd, 1.45, 0.8, 0));
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        pts.push(new THREE.Vector3(-1.4 + 2.8 * t, 1.3 - Math.sin(t * Math.PI) * 0.65, 0));
      }
      const net = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.04, 4), M('#8a7a62'));
      const bed = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.slice(2, 11)), 16, 0.36, 8),
        new THREE.MeshStandardMaterial({ map: stripes(c, '#e9d8b0', 10), roughness: 0.9 }),
      );
      bed.scale.z = 0.9;
      bed.scale.y = 0.18;
      bed.position.y = 0.86;
      net.castShadow = bed.castShadow = true;
      return (o.add(net, bed), o);
    },
  },
  {
    id: 'pool',
    name: 'Inflatable pool',
    cat: 'furniture',
    price: 250,
    w: 2.0,
    d: 2.0,
    solid: true,
    make: c => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.15, 10, 28), M(c, 0.4));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.16;
      const ring2 = ring.clone();
      ring2.material = WHITE();
      ring2.position.y = 0.44;
      ring2.scale.setScalar(0.98);
      const water = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24).rotateX(-Math.PI / 2), M('#5fb3c9', 0.1, 0.1));
      water.position.y = 0.4;
      return g(ring, ring2, water);
    },
  },
  {
    id: 'rug',
    name: 'Outdoor rug',
    cat: 'furniture',
    price: 140,
    w: 2.4,
    d: 1.6,
    floor: true,
    make: c => g(flat(2.4, 1.6, new THREE.MeshStandardMaterial({ map: stripes(c, '#e9d8b0', 12), roughness: 1 }))),
  },

  // ---------------- lot games (lobby/lotGames.ts): anyone on the lot can press E at them
  {
    id: 'jukebox',
    name: 'Jukebox (plays a radio band to the whole block)',
    cat: 'decor',
    price: 1200,
    w: 0.9,
    d: 0.6,
    make: () => {
      const wood = M('#6a2a22', 0.55),
        chrome = M('#d8dade', 0.25, 0.85),
        glow = (c: string) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.4, roughness: 0.4 });
      const r = g(box(0.8, 1.05, 0.5, wood, 0, 0.525, 0));
      // the arched top, two lit tubes up its sides, a glass window with the record stack, a grille and buttons
      const arch = cyl(0.4, 0.4, 0.5, 20, wood, 0, 1.05, 0);
      arch.rotation.x = Math.PI / 2;
      r.add(arch);
      for (const x of [-0.36, 0.36]) {
        const tube = cyl(0.045, 0.045, 1.0, 8, glow(x < 0 ? '#ff5a8a' : '#ffd24a'), x, 0.62, 0.24);
        r.add(tube);
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.04, 8, 24, Math.PI), glow('#7ad0ff'));
      ring.position.set(0, 1.05, 0.25);
      r.add(ring);
      r.add(
        box(
          0.5,
          0.32,
          0.02,
          new THREE.MeshStandardMaterial({ color: '#2a1e2a', emissive: '#ffb050', emissiveIntensity: 0.35, roughness: 0.2 }),
          0,
          1.05,
          0.255,
        ),
      );
      r.add(box(0.56, 0.3, 0.02, chrome, 0, 0.3, 0.255));
      for (let i = 0; i < 6; i++) r.add(box(0.05, 0.03, 0.02, M(i % 2 ? '#f1eee6' : '#e2574c', 0.4), -0.15 + i * 0.06, 0.72, 0.26));
      return r;
    },
  },
  {
    id: 'cornhole',
    name: 'Cornhole boards (a pair, 5 m apart)',
    cat: 'decor',
    price: 450,
    w: 0.8,
    d: 6.6,
    posts: [
      [0, -2.65],
      [0, 2.65],
    ],
    make: () => {
      const r = g(),
        wood = M('#c8a26a', 0.7),
        paint = M('#f1eee6', 0.6),
        hole = M('#141010', 0.9);
      for (const sz of [-1, 1]) {
        // each board rises toward its far end (away from the other board), with the hole near the top
        const b = g(box(0.6, 0.04, 1.2, paint, 0, 0, 0), box(0.62, 0.02, 0.18, M(sz < 0 ? '#2f6fb0' : '#c8452f', 0.6), 0, 0.025, -0.25));
        const h = cyl(0.076, 0.076, 0.045, 18, hole, 0, 0.005, 0.3);
        b.add(h);
        b.position.set(0, 0.2, sz * 2.65);
        b.rotation.set(-0.165 * sz, sz < 0 ? Math.PI : 0, 0);
        b.userData.board = sz; // (lotGames.ts finds the boards and their holes by these)
        h.userData.hole = sz;
        // the legs at the high end
        r.add(b, box(0.05, 0.3, 0.05, wood, -0.27, 0.15, sz * 3.15), box(0.05, 0.3, 0.05, wood, 0.27, 0.15, sz * 3.15));
      }
      return r;
    },
  },
  {
    id: 'horseshoes',
    name: 'Horseshoe pits (a pair, 6 m apart)',
    cat: 'decor',
    price: 300,
    w: 1.0,
    d: 7.6,
    solid: false,
    make: () => {
      const r = g(),
        sand = M('#d9c08e', 1),
        wood = M('#7a5432', 0.8),
        iron = M('#5a5a5e', 0.5, 0.6);
      for (const sz of [-1, 1]) {
        r.add(box(0.9, 0.04, 1.4, sand, 0, 0.02, sz * 3.1));
        for (const [w, d, x, z] of [
          [1.0, 0.08, 0, 0.74],
          [1.0, 0.08, 0, -0.74],
          [0.08, 1.4, 0.48, 0],
          [0.08, 1.4, -0.48, 0],
        ] as const)
          r.add(box(w, 0.1, d, wood, x, 0.05, sz * 3.1 + z));
        const stake = cyl(0.015, 0.015, 0.38, 6, iron, 0, 0.19, sz * 3.1);
        stake.userData.stake = sz;
        r.add(stake);
      }
      return r;
    },
  },
  // ---------------- decoration & personality
  ph('gnome', 'garden_gnome', 'Garden gnome', 'decor', 60, { solid: false }),
  ph('catstatue', 'concrete_cat_statue', 'Concrete cat statue', 'decor', 150, { solid: false }),
  ph('planterbox', 'planter_box_01', 'Planter box', 'decor', 180),
  ph('claypot', 'planter_pot_clay', 'Clay planter pot', 'decor', 30, { solid: false }),
  ph('succulent', 'potted_plant_04', 'Potted succulent', 'decor', 25, { solid: false }),
  ph('lantern', 'wooden_lantern_01', 'Wooden lantern', 'decor', 70, { solid: false }),
  ph('chalkboard', 'standing_chalkboard_01', 'Chalkboard sign', 'decor', 120),
  ph('wateringcan', 'watering_can_metal_01', 'Watering can', 'decor', 25, { solid: false }),
  ph('propane', 'propane_tank', 'Propane tank', 'decor', 60),
  ph('tyre', 'old_tyre', 'Old tyre', 'decor', 10, { solid: false }),
  ph('trashcans', 'metal_trash_can', 'Metal trash cans', 'decor', 90),
  ph('crate', 'wooden_crate_01', 'Wooden crate', 'decor', 40, { top: [0.35, 0.78, 0.38] }),
  {
    id: 'flamingo',
    name: 'Pink flamingo',
    cat: 'decor',
    price: 40,
    w: 0.4,
    d: 0.4,
    solid: false,
    make: () => {
      const pk = M('#ef7aa0', 0.5),
        body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), pk);
      body.scale.set(1, 0.8, 1.6);
      body.position.y = 0.62;
      const neck = new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, 0.66, 0.15),
            new THREE.Vector3(0, 0.9, 0.12),
            new THREE.Vector3(0, 0.98, 0.02),
            new THREE.Vector3(0, 0.92, 0.12),
          ]),
          10,
          0.025,
          6,
        ),
        pk,
      );
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 6), M('#1d1d1f'));
      beak.position.set(0, 0.89, 0.16);
      beak.rotation.x = 1.9;
      return g(body, neck, beak, leg(0.03, 0, 0.55, M('#ef7aa0'), 0.008), leg(-0.03, 0, 0.55, M('#ef7aa0'), 0.008));
    },
  },
  {
    id: 'pottedpalm',
    name: 'Potted palm',
    cat: 'decor',
    price: 220,
    w: 0.7,
    d: 0.7,
    make: () => {
      const o = g(cyl(0.26, 0.2, 0.45, 10, M('#b5653a', 0.9), 0, 0.22, 0), cyl(0.04, 0.05, 0.9, 6, M('#7a6248'), 0, 0.85, 0)),
        lf = M('#5a7a3a', 0.8);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2,
          f = box(0.12, 0.02, 0.7, lf, Math.sin(a) * 0.3, 1.25, Math.cos(a) * 0.3);
        f.rotation.set(0.5, a, 0);
        o.add(f);
      }
      return o;
    },
  },
  {
    id: 'cactus',
    name: 'Cactus in a pot',
    cat: 'decor',
    price: 120,
    w: 0.5,
    d: 0.5,
    make: () => {
      const gr = M('#5f7d4a', 0.85),
        o = g(cyl(0.2, 0.16, 0.3, 10, M('#c98a5a', 0.9), 0, 0.15, 0), cyl(0.09, 0.09, 0.7, 10, gr, 0, 0.62, 0));
      const arm = cyl(0.06, 0.06, 0.25, 8, gr, 0.14, 0.6, 0);
      arm.rotation.z = Math.PI / 2;
      o.add(arm, cyl(0.06, 0.06, 0.25, 8, gr, 0.25, 0.75, 0));
      return o;
    },
  },
  {
    id: 'agave',
    name: 'Agave',
    cat: 'decor',
    price: 80,
    w: 0.8,
    d: 0.8,
    solid: false,
    make: () => {
      const o = g(),
        m = M('#7d9a7a', 0.7);
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2,
          l = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.6, 4), m);
        l.position.set(Math.sin(a) * 0.12, 0.28, Math.cos(a) * 0.12);
        l.rotation.set(Math.cos(a) * 0.7, 0, -Math.sin(a) * 0.7);
        l.castShadow = true;
        o.add(l);
      }
      return o;
    },
  },
  {
    id: 'lights',
    name: 'String lights',
    cat: 'decor',
    price: 350,
    w: 4.0,
    d: 0.3,
    posts: [
      [-1.9, 0],
      [1.9, 0],
    ],
    make: () => {
      const o = g(cyl(0.04, 0.04, 2.6, 6, DARKWOOD(), -1.9, 1.3, 0), cyl(0.04, 0.04, 2.6, 6, DARKWOOD(), 1.9, 1.3, 0)),
        bulb = windSway(new THREE.MeshStandardMaterial({ color: '#ffe2a0', emissive: '#ffcf70', emissiveIntensity: 1.4 }), 'string');
      const pts: THREE.Vector3[] = [],
        bulbs: THREE.BufferGeometry[] = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        pts.push(new THREE.Vector3(-1.9 + 3.8 * t, 2.55 - Math.sin(t * Math.PI) * 0.35, 0));
      }
      o.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), windSway(new THREE.LineBasicMaterial({ color: '#2a2016' }), 'string')));
      // the bulbs are one mesh, so the wind (world/wind.ts) can swing the whole span together
      for (let i = 1; i < 16; i++) bulbs.push(new THREE.SphereGeometry(0.045, 8, 6).translate(pts[i].x, pts[i].y - 0.06, 0));
      o.add(new THREE.Mesh(mergeGeometries(bulbs), bulb));
      return o;
    },
  },
  {
    id: 'tiki',
    name: 'Tiki torch',
    cat: 'decor',
    price: 90,
    w: 0.3,
    d: 0.3,
    solid: false,
    make: () => {
      const fl = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, 0.2, 7),
        new THREE.MeshStandardMaterial({ color: '#ffb04a', emissive: '#ff8a2a', emissiveIntensity: 1.8 }),
      );
      fl.position.y = 1.72;
      return g(cyl(0.025, 0.03, 1.5, 6, M('#a07a4a'), 0, 0.75, 0), cyl(0.07, 0.05, 0.16, 8, M('#6a4a2e'), 0, 1.56, 0), fl);
    },
  },
  {
    id: 'flag',
    name: 'Flag pole',
    cat: 'decor',
    price: 200,
    w: 0.5,
    d: 0.5,
    make: c => {
      const f = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.55),
        new THREE.MeshStandardMaterial({ map: stripes(c, '#f1eee6', 5), side: THREE.DoubleSide }),
      );
      f.position.set(0.47, 2.95, 0);
      f.castShadow = true;
      return g(cyl(0.025, 0.035, 3.3, 6, ALU(), 0, 1.65, 0), f, cyl(0.15, 0.18, 0.08, 10, M('#777'), 0, 0.04, 0));
    },
  },
  {
    id: 'neon',
    name: 'Neon sign: "19th HOLE"',
    cat: 'decor',
    price: 1500,
    w: 1.4,
    d: 0.3,
    make: () => {
      const t = canvasTex(512, 200, x => {
        x.fillStyle = '#1a1410';
        x.fillRect(0, 0, 512, 200);
        x.font = '900 italic 110px "Barlow Condensed", Impact';
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.shadowColor = '#ff5a8a';
        x.shadowBlur = 24;
        x.fillStyle = '#ff9ab8';
        x.fillText('19th HOLE', 256, 104);
      });
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(1.25, 0.5),
        new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.9 }),
      );
      face.position.set(0, 1.5, 0.04);
      return g(
        box(1.32, 0.56, 0.06, M('#2a2016'), 0, 1.5, 0),
        face,
        leg(-0.5, -0.02, 1.25, M('#333', 0.5, 0.5)),
        leg(0.5, -0.02, 1.25, M('#333', 0.5, 0.5)),
      );
    },
  },
  {
    id: 'windmill',
    name: 'Mini-golf windmill',
    cat: 'decor',
    price: 750,
    w: 1.0,
    d: 1.0,
    make: c => {
      const o = g(box(0.8, 1.1, 0.8, M('#e9dcc0', 0.8), 0, 0.55, 0)),
        roof = new THREE.Mesh(new THREE.ConeGeometry(0.66, 0.6, 4), M(c, 0.7));
      roof.position.y = 1.4;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      o.add(roof);
      const hub = new THREE.Group();
      hub.position.set(0, 1.15, 0.44);
      for (let i = 0; i < 4; i++) {
        const b = box(0.12, 0.7, 0.02, WHITE(), 0, 0.38, 0);
        const p = new THREE.Group();
        p.add(b);
        p.rotation.z = (i * Math.PI) / 2 + 0.3;
        hub.add(p);
      }
      o.add(hub, box(0.3, 0.32, 0.02, M('#1d1d1f'), 0, 0.16, 0.41));
      return o;
    },
  },
  {
    id: 'birdbath',
    name: 'Bird bath',
    cat: 'decor',
    price: 220,
    w: 0.6,
    d: 0.6,
    make: () =>
      g(
        cyl(0.12, 0.18, 0.7, 10, M('#cfc6b4', 0.9), 0, 0.35, 0),
        cyl(0.32, 0.18, 0.12, 16, M('#cfc6b4', 0.9), 0, 0.76, 0),
        (() => {
          const w = new THREE.Mesh(new THREE.CircleGeometry(0.27, 16).rotateX(-Math.PI / 2), M('#6aa8b8', 0.1));
          w.position.y = 0.81;
          return w;
        })(),
      ),
  },
  {
    id: 'fence',
    name: 'Picket fence (2 m)',
    cat: 'decor',
    price: 120,
    w: 2.0,
    d: 0.2,
    make: () => {
      const o = g(box(2.0, 0.06, 0.04, WHITE(), 0, 0.35, 0), box(2.0, 0.06, 0.04, WHITE(), 0, 0.7, 0));
      for (let i = 0; i < 10; i++) {
        const p = box(0.09, 0.9, 0.03, WHITE(), -0.9 + i * 0.2, 0.45, 0.03);
        o.add(p);
      }
      return o;
    },
  },
  {
    id: 'screen',
    name: 'Bamboo privacy screen',
    cat: 'decor',
    price: 260,
    w: 2.0,
    d: 0.2,
    make: () => {
      const o = g(),
        m = M('#c9a86a', 0.8);
      for (let i = 0; i < 16; i++) o.add(cyl(0.05, 0.05, 1.8, 6, m, -0.94 + i * 0.125, 0.9, 0));
      return o;
    },
  },
  {
    id: 'deck',
    name: 'Wood deck (2×2 m)',
    cat: 'decor',
    price: 180,
    w: 2.0,
    d: 2.0,
    floor: true,
    make: () => {
      const o = g();
      for (let i = 0; i < 10; i++) o.add(flat(2.0, 0.19, M(i % 2 ? '#a2774e' : '#9a6f48', 0.85), 0.03));
      o.children.forEach((c, i) => (c.position.z = -0.9 + i * 0.2));
      return o;
    },
  },
  {
    id: 'path',
    name: 'Stepping stones',
    cat: 'decor',
    price: 25,
    w: 1.0,
    d: 1.0,
    floor: true,
    make: () => {
      const o = g(),
        m = M('#b9b2a4', 0.95);
      for (const [x, z, r] of [
        [-0.22, -0.2, 0.22],
        [0.2, 0.22, 0.2],
        [0.25, -0.25, 0.14],
      ]) {
        const s = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.04, 9), m);
        s.position.set(x, 0.02, z);
        s.receiveShadow = true;
        o.add(s);
      }
      return o;
    },
  },
  {
    id: 'gravel',
    name: 'Gravel patch (2×2 m)',
    cat: 'decor',
    price: 40,
    w: 2.0,
    d: 2.0,
    floor: true,
    make: () =>
      g(
        flat(
          2.0,
          2.0,
          new THREE.MeshStandardMaterial({
            map: canvasTex(128, 128, x => {
              x.fillStyle = '#b8ad98';
              x.fillRect(0, 0, 128, 128);
              for (let i = 0; i < 900; i++) {
                x.fillStyle = ['#9a8f7c', '#d2c8b4', '#8a8070'][i % 3];
                x.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
              }
            }),
            roughness: 1,
          }),
        ),
      ),
  },
  {
    id: 'puttmat',
    name: 'Backyard putting green',
    cat: 'decor',
    price: 1400,
    w: 3.0,
    d: 2.0,
    floor: true,
    make: () => {
      const o = g(flat(3.0, 2.0, M('#4f8a3a', 0.9), 0.015)),
        cup = new THREE.Mesh(new THREE.CircleGeometry(0.06, 14).rotateX(-Math.PI / 2), M('#111'));
      cup.position.set(0.9, 0.031, 0.2);
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.16), M('#c8452f'));
      fl.position.set(1.02, 0.9, 0.2);
      return (o.add(cup, cyl(0.008, 0.008, 1.0, 4, WHITE(), 0.9, 0.5, 0.2), fl), o);
    },
  },

  // ---------------- the cart garage
  {
    id: 'garage',
    name: 'Cart garage',
    cat: 'garage',
    price: 6500,
    w: 3.2,
    d: 4.2,
    max: 1,
    top: [2.66, 3.4, 4.2], // the flat roof
    make: c => {
      const wall = M('#d9c6a5', 0.85),
        trim = M('#6d6458', 0.8),
        o = g();
      o.add(box(0.15, 2.5, 4.1, wall, -1.52, 1.25, 0), box(0.15, 2.5, 4.1, wall, 1.52, 1.25, 0), box(3.2, 2.5, 0.15, wall, 0, 1.25, -1.98)); // open front (+Z)
      const roof = box(3.6, 0.14, 4.5, M('#7a5a3a', 0.8), 0, 2.6, 0.1);
      roof.rotation.x = -0.06;
      o.add(roof, box(3.2, 0.35, 0.15, trim, 0, 2.35, 2.0));
      o.add(flat(3.0, 4.0, M('#9a958c', 0.95), 0.02)); // concrete floor
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 0.3),
        new THREE.MeshStandardMaterial({
          map: canvasTex(512, 96, x => {
            x.fillStyle = '#e9b23a';
            x.fillRect(0, 0, 512, 96);
            x.fillStyle = '#2a1c12';
            x.font = '900 64px "Barlow Condensed", Impact';
            x.textAlign = 'center';
            x.textBaseline = 'middle';
            x.fillText('CART GARAGE', 256, 50);
          }),
        }),
      );
      sign.position.set(0, 2.35, 2.08);
      o.add(sign);
      const cart = cartModel(c).root;
      cart.position.set(0, 0.02, -0.1);
      cart.rotation.y = -Math.PI / 2;
      cart.userData.parkedCart = true;
      o.add(cart); // hidden while you're out driving it   // your cart, parked nose-in
      return o;
    },
  },
  // ---------------- from the prop packs (docs/credits.md): "House Interior | PS1 Asset Pack" and "Barranco Bar" by
  // McPato, "PSX Storage Shelves" by teacherap123, all CC BY 4.0
  pk('h_sofa', 'home', ['couch_fabricsofa_0', 'couch_atlas_living_0', 'couch_wood3_0'], -Q, 'Grey three-seater sofa', 'furniture', 950, 1.9, 1.0),
  pk('h_armchair', 'home', ['couch001_fabricsofa_0', 'couch001_atlas_living_0', 'couch001_wood3_0'], Q, 'Grey armchair', 'furniture', 420, 1.1, 1.0),
  pk(
    'h_dining',
    'home',
    ['table_wood2_0', ...[1, 2, 3, 4].flatMap(i => [`chair00${i}_wood2_0`, `chair00${i}_fabric_0`])],
    0,
    'Dining table and four chairs',
    'furniture',
    1400,
    3.5,
    2.4,
  ),
  pk('h_coffee', 'home', H('lilTableXD_wood2_0', 'Circle002', 'Circle005'), Q, 'Dark wood coffee table', 'furniture', 380, 2.1, 1.3),
  pk('h_books', 'home', H('libr'), -Q, 'Bookcase, full', 'furniture', 520, 1.4, 0.8),
  pk('h_fishtank', 'home', H('pecera_wood2_0', 'Cube013_glasss_0', 'Cube013'), Q, 'Fish tank on a cabinet', 'furniture', 1600, 1.4, 0.9),
  pk('h_tv', 'home', H('Cube004'), -Q, 'Television wall unit', 'furniture', 2200, 3.3, 0.8),
  pk('h_bed', 'home', [...B('Bed', 'Cube001', 'Cube002', 'Cube003'), 'Cube_wood_0'], Math.PI, 'Double bed', 'furniture', 1100, 2.1, 2.5),
  pk('h_wardrobe', 'home', B('closet'), 0, 'Wardrobe', 'furniture', 780, 2.1, 0.8),
  pk(
    'h_desk',
    'home',
    [
      ...B('desk', 'Cube010', 'Cube011', 'Cube012'),
      ...['monitor', 'mouse', 'case_pc', 'parlant', 'parlant001', 'keyboard'].map(n => n + '_atlas_dormitorioelectro_0'),
      'chair_fabric_0',
    ],
    0,
    'Computer desk and chair',
    'furniture',
    1500,
    2.3,
    2.0,
  ),
  pk(
    'h_fridge',
    'home',
    ['fridge', 'Cube042', 'Cube043'].map(n => n + '_atlas_kitchen_0'),
    0,
    'Fridge',
    'furniture',
    800,
    0.9,
    0.9,
  ),
  pk(
    'h_stove',
    'home',
    ['oven', 'Cube035'].map(n => n + '_atlas_kitchen_0'),
    0,
    'Stove',
    'furniture',
    650,
    0.8,
    0.8,
  ),
  pk('h_washer', 'home', ['washingmach_atlas_bath_0'], 0, 'Washing machine', 'furniture', 600, 0.9, 0.9),
  pk('h_toilet', 'home', ['Circle010_atlas_bath_0'], 0, 'Kitchen pedal bin', 'decor', 40, 0.7, 0.7),
  pk('h_shoes', 'home', B('shoerack'), 0, 'White cupboard', 'furniture', 120, 0.9, 0.5),
  pk('h_coats', 'home', B('hanger'), 0, 'Coat stand', 'furniture', 90, 0.7, 0.6),
  pk('h_lamp', 'home', H('Cube009'), 0, 'Floor lamp', 'furniture', 160, 0.6, 0.6),
  pk('h_lamp2', 'home', H('Circle004'), 0, 'Standing fan', 'furniture', 140, 0.6, 0.7),
  pk('h_rug', 'home', H('Plane'), 0, 'Big grey rug', 'decor', 450, 4.9, 4.9, { floor: true }),
  pk('h_guitar', 'home', B('guitar'), -Q, 'Guitar on a stand', 'decor', 350, 0.9, 0.5),
  pk('h_plant', 'home', H('Circle001'), 0, 'Tall house plant', 'decor', 160, 0.8, 0.8),
  pk('h_plant2', 'home', H('Circle'), 0, 'House plant', 'decor', 120, 0.7, 0.7),
  pk('h_basket', 'home', B('laundry'), 0, 'Laundry basket', 'decor', 60, 0.9, 0.9),
  pk('b_booth', 'lounge', [-8.05, -24.25, -5.9, -21.35, 2], -Q, 'Leather diner booth', 'furniture', 1800, 3.0, 2.1),
  pk('b_stool', 'lounge', ['Cube019_bar_atlas_0'], 0, 'Bar stool', 'furniture', 140, 0.5, 0.5),
  pk('b_fern', 'lounge', [-5.7, -18.95, -4.5, -17.85, 1], 0, 'Fern in a woven pot', 'decor', 180, 1.0, 1.0),
  pk('s_shelf', 'shelves', ['Object_8'], 0, 'Storage shelves, stocked', 'furniture', 260, 2.2, 0.7),
  pk('s_shelf2', 'shelves', ['Object_14'], 0, 'Storage shelves, half empty', 'furniture', 220, 2.2, 0.7),
  pk('s_box', 'shelves', ['Object_23'], 0, 'Cardboard box', 'decor', 15, 0.6, 0.6, { top: [0.56, 0.5, 0.5] }),
];
export const ITEM = new Map(ITEMS.map(i => [i.id, i]));

// trophies: one placeable per won tournament (id "trophy:<record id>")
export function trophyItem(t: { id: string; seed: number; n: 3 | 9; title: string; who: string; toPar: number }): ItemDef {
  const tp = t.toPar === 0 ? 'E' : t.toPar > 0 ? '+' + t.toPar : '−' + -t.toPar;
  return {
    id: 'trophy:' + t.id,
    name: t.title,
    cat: 'trophies',
    price: 0,
    w: t.n === 9 ? 0.5 : 0.4,
    d: t.n === 9 ? 0.5 : 0.4,
    max: 1,
    make: () => buildTrophy(t.seed, t.n, `${t.who} · ${tp}`),
  };
}
