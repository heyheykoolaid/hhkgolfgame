// The plaza fountain: a stone basin you can see into (a tiled floor under clear water, with koi), and a two-tier
// centrepiece that spills from bowl to bowl. Built from turned (lathe) profiles so every edge is rounded stone, on a
// step that sits into the paving. It is meant to grow into the town's fish tank: the fish are a list (FISH) to add to.
import * as THREE from 'three';
import { waterMaterial, fountainSpray } from '../world/water';

const V2 = (x: number, y: number) => new THREE.Vector2(x, y);
function stoneTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#cdc2ab';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 150 + Math.random() * 90;
    x.fillStyle = `rgba(${v},${v * 0.95},${v * 0.84},${0.05 + Math.random() * 0.1})`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  // weathering: darker streaks running down
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(70,60,45,${0.03 + Math.random() * 0.05})`;
    x.fillRect(Math.random() * 256, 0, 2 + Math.random() * 6, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** The basin floor: small pool tiles in rings, with a compass rose in the middle. */
function tileTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d')!;
  x.fillStyle = '#2d7f86';
  x.fillRect(0, 0, 512, 512);
  x.translate(256, 256);
  const cols = ['#2f8a90', '#3b9aa0', '#27737c', '#4aa7a6', '#2a7d8a'];
  for (let ring = 0; ring < 16; ring++) {
    const r0 = ring * 16,
      r1 = r0 + 15,
      n = Math.max(6, Math.round((Math.PI * 2 * (r0 + 8)) / 17));
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + ring * 0.3,
        a1 = a0 + (Math.PI * 2) / n - 0.012;
      x.fillStyle = ring === 11 || ring === 5 ? (i % 2 ? '#e9dfc4' : '#d9a441') : cols[(i * 7 + ring * 3) % cols.length];
      x.beginPath();
      x.arc(0, 0, r1, a0, a1);
      x.arc(0, 0, r0 + 1, a1, a0, true);
      x.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
interface Fish {
  g: THREE.Group;
  tail: THREE.Mesh;
  r: number;
  sp: number;
  ph: number;
  y: number;
}
/** Who lives in the basin: [body colour, patch colour, length m]. */
const FISH: [string, string, number][] = [
  ['#e8632a', '#f6efe2', 0.34],
  ['#f6efe2', '#e8632a', 0.3],
  ['#e9b23a', '#e9b23a', 0.26],
  ['#f6efe2', '#1d1d1f', 0.32],
  ['#e8632a', '#1d1d1f', 0.24],
  ['#d94a2a', '#f6efe2', 0.36],
  ['#f2f0ea', '#e9b23a', 0.22],
];
export function buildFountain(scene: THREE.Scene) {
  const G = new THREE.Group();
  G.name = 'fountain';
  const stone = new THREE.MeshStandardMaterial({ map: stoneTex(), color: '#e2d8c2', roughness: 0.86 }),
    turn = (pts: THREE.Vector2[], seg = 48, m: THREE.Material = stone) => {
      const o = new THREE.Mesh(new THREE.LatheGeometry(pts, seg), m);
      o.castShadow = o.receiveShadow = true;
      G.add(o);
      return o;
    };
  // the step and the basin wall, one turned piece: it starts below the paving, so no light shows under it
  turn([
    V2(0, -0.1),
    V2(3.62, -0.1),
    V2(3.62, 0.2),
    V2(3.56, 0.24),
    V2(3.3, 0.24), // the step's tread
    V2(3.24, 0.3),
    V2(3.2, 0.62),
    V2(3.3, 0.66), // the coping overhangs a little
    V2(3.32, 0.74),
    V2(3.26, 0.8),
    V2(2.9, 0.8),
    V2(2.84, 0.74),
    V2(2.8, 0.66),
    V2(2.8, 0.2), // the inside face, down to the floor
  ]);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(2.81, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: tileTex(), roughness: 0.5 }),
  );
  floor.position.y = 0.22;
  floor.receiveShadow = true;
  G.add(floor);
  // the centrepiece: a footed column, a wide lower bowl, a slimmer shaft, a small top bowl and a finial
  turn(
    [
      V2(0, 0.22),
      V2(0.95, 0.22),
      V2(0.95, 0.34),
      V2(0.8, 0.42),
      V2(0.5, 0.5),
      V2(0.4, 0.62),
      V2(0.36, 0.95),
      V2(0.44, 1.0),
      V2(0.44, 1.06),
      V2(0.36, 1.1),
      V2(0.4, 1.16),
      // the lower bowl: a shallow dish with a rolled rim
      V2(0.9, 1.24),
      V2(1.3, 1.36),
      V2(1.44, 1.46),
      V2(1.46, 1.52),
      V2(1.4, 1.55),
      V2(1.32, 1.5),
      V2(0.9, 1.36),
      V2(0.3, 1.32),
      // the upper shaft
      V2(0.24, 1.42),
      V2(0.2, 1.9),
      V2(0.27, 1.95),
      V2(0.27, 2.0),
      V2(0.2, 2.04),
      // the top bowl
      V2(0.5, 2.1),
      V2(0.74, 2.2),
      V2(0.8, 2.28),
      V2(0.77, 2.31),
      V2(0.7, 2.27),
      V2(0.45, 2.17),
      V2(0.14, 2.15),
      // the finial
      V2(0.1, 2.3),
      V2(0.16, 2.38),
      V2(0.18, 2.48),
      V2(0.1, 2.58),
      V2(0.04, 2.66),
      V2(0, 2.68),
    ],
    40,
  );
  // water: the basin is clear enough to see the tiles and the fish; the bowls are brim-full
  const pool = new THREE.Mesh(new THREE.CircleGeometry(2.8, 48).rotateX(-Math.PI / 2), waterMaterial('#3f9aa0', 2.8, 3.2, 0.42));
  pool.position.y = 0.64;
  pool.renderOrder = 2;
  const mid = new THREE.Mesh(new THREE.CircleGeometry(1.36, 32).rotateX(-Math.PI / 2), waterMaterial('#3f8f96', 0, 5, 0.8));
  mid.position.y = 1.5;
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.73, 24).rotateX(-Math.PI / 2), waterMaterial('#3f8f96', 0, 5, 0.8));
  top.position.y = 2.275;
  G.add(pool, mid, top);
  G.add(fountainSpray(0, 0, 2.3, 1.5, 0.78, 1.15, 200), fountainSpray(0, 0, 1.52, 0.64, 1.45, 2.2, 340));
  // the koi
  const fish: Fish[] = FISH.map(([body, patch, len], i) => {
    const g = new THREE.Group(),
      bm = new THREE.MeshStandardMaterial({ color: body, roughness: 0.45 }),
      b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8).scale(len, len * 0.3, len * 0.26), bm),
      p = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 8, 6).scale(len * 0.42, len * 0.3, len * 0.27),
        new THREE.MeshStandardMaterial({ color: patch, roughness: 0.45 }),
      ),
      tail = new THREE.Mesh(new THREE.ConeGeometry(len * 0.17, len * 0.36, 4).rotateZ(-Math.PI / 2).scale(1, 1, 0.25), bm);
    p.position.set(len * 0.08, len * 0.012, 0);
    tail.position.x = -len * 0.6;
    g.add(b, p, tail);
    g.userData.noBatch = true;
    g.traverse(o => (o.userData.noBatch = true));
    G.add(g);
    return {
      g,
      tail,
      r: 1.25 + ((i * 0.37) % 1) * 1.25,
      sp: (0.22 + ((i * 0.61) % 1) * 0.2) * (i % 2 ? -1 : 1),
      ph: i * 2.1,
      y: 0.36 + ((i * 0.43) % 1) * 0.16,
    };
  });
  scene.add(G);
  return {
    /** Per frame: the koi cruise round the centrepiece, each on its own wandering ring. */
    update(t: number) {
      for (const f of fish) {
        const a = f.ph + t * f.sp + 0.5 * Math.sin(t * 0.13 + f.ph),
          r = f.r + 0.28 * Math.sin(t * 0.31 + f.ph * 1.7),
          dir = Math.sign(f.sp);
        f.g.position.set(Math.cos(a) * r, f.y + 0.03 * Math.sin(t * 0.7 + f.ph), Math.sin(a) * r);
        // heading: the tangent of the ring (nose is +x), with a swimming wiggle
        f.g.rotation.y = -a - (dir * Math.PI) / 2 + 0.16 * Math.sin(t * 5 * Math.abs(f.sp) * 4 + f.ph);
        f.tail.rotation.y = 0.5 * Math.sin(t * 6 + f.ph);
      }
    },
  };
}
