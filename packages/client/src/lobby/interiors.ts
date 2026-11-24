// Rooms you walk into behind two of the West Side's shopfronts (lobby/shops.ts builds the fronts and leaves these two
// hollow): Wrench & Ride Auto, a working garage with your own car up on the lift, and Homestead Furniture, a showroom
// where the catalog's pieces stand on the floor in room sets. Each has a counter with somebody behind it: that is
// where you press E. Everything is laid out in the shopfront's own frame: x across the front, z back from it.
//
// Surfaces: floorboards and wall cladding are the Poly Haven photos the town already ships (public/ground); the
// garage's concrete, blockwork and pegboard are drawn here. Furniture and stock come from the model packs through
// the catalog, so what stands in the showroom is exactly what you take home.
import * as THREE from 'three';
import { M, box, cyl, photoM, tile, textTex } from './world';
import { ITEM } from './catalog';
import { CAR, carModel, cartModel } from '../vehicles/vehicles';
import { progress, onProgress } from '../avatar/progress';
import { loadProps } from '../world/propPacks';

/** A hollow shop: its width, depth and height, and how deep its front wall is. */
export interface Room {
  g: THREE.Group;
  w: number;
  d: number;
  h: number;
  /** a wall in the room's frame (the caller turns it into the district's) */
  col: (x0: number, x1: number, z0: number, z1: number, tag?: string) => void;
}
const FD = 1.0, // the front wall's depth (shops.ts)
  T = 0.25; // the other walls' thickness
const canvasTex = (w: number, h: number, draw: (x: CanvasRenderingContext2D) => void, rx = 1, ry = 1) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 4;
  return t;
};
/** Speckle a canvas so a flat colour reads as a material. */
const grain = (x: CanvasRenderingContext2D, w: number, h: number, n: number, a: number) => {
  for (let i = 0; i < n; i++) {
    x.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * a})`;
    x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
};
/** An indoor surface: lit mostly by the room's own lamp, with a little of its own glow so the texture reads in shade. */
const inner = (map: THREE.Texture, lift = 0.22, rough = 0.9) =>
  new THREE.MeshStandardMaterial({ map, roughness: rough, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: lift });
const lit = (c: string, k = 1.6) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.5 });

/** Line a hollow shop: floor, ceiling and the inside faces of its four walls; its walls made solid (with the doorway
 *  left open); a lamp. Returns the room's inside limits. */
function shell(r: Room, floor: THREE.Material, wall: THREE.Material, ceil: THREE.Material, lamp: string, band: string, floorTile = 1.6, doorW = 1.5) {
  const { g, w, d, h } = r,
    x0 = -w / 2 + T,
    x1 = w / 2 - T,
    z0 = FD,
    z1 = d - T,
    plane = (pw: number, ph: number, m: THREE.Material, x: number, y: number, z: number, ry: number, rx = 0) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), m);
      p.position.set(x, y, z);
      p.rotation.set(rx, ry, 0);
      p.receiveShadow = true;
      g.add(p);
      return p;
    };
  {
    // the floor runs out through the doorway to the step (laid out in metres from its own x and z, so boards don't stretch)
    const f = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1).rotateX(-Math.PI / 2), floor);
    f.position.set(0, 0.02, z1 / 2);
    f.receiveShadow = true;
    g.add(tile(f, floorTile));
  }
  plane(x1 - x0, z1 - z0, ceil, 0, h - 0.02, (z0 + z1) / 2, 0, Math.PI / 2);
  plane(x1 - x0, h, wall, 0, h / 2, z1 - 0.01, Math.PI); // back
  plane(z1 - z0, h, wall, x0 + 0.01, h / 2, (z0 + z1) / 2, Math.PI / 2);
  plane(z1 - z0, h, wall, x1 - 0.01, h / 2, (z0 + z1) / 2, -Math.PI / 2);
  // the inside of the front wall: over the windows and door, and the piers at the corners
  plane(x1 - x0, h - 3, M(band, 0.9), 0, 3 + (h - 3) / 2, z0 + 0.01, 0);
  for (const s of [-1, 1]) plane(0.9, 3, M(band, 0.9), s * ((x1 - x0) / 2 - 0.45), 1.5, z0 + 0.01, 0);
  // the walls themselves (the front's two halves leave the doorway open)
  r.col(-w / 2, -doorW / 2 - 0.15, 0, FD);
  r.col(doorW / 2 + 0.15, w / 2, 0, FD);
  r.col(-w / 2, -w / 2 + T, 0, d);
  r.col(w / 2 - T, w / 2, 0, d);
  r.col(-w / 2, w / 2, d - T, d);
  const l = new THREE.PointLight(lamp, 16, 14, 1.4);
  l.position.set(0, h - 0.9, (z0 + z1) / 2);
  g.add(l);
  // strip lights on the ceiling
  for (const sx of [-w / 4, w / 4]) g.add(box(0.22, 0.06, (z1 - z0) * 0.6, lit('#fff4d6', 1.8), sx, h - 0.06, (z0 + z1) / 2));
  return { x0, x1, z0, z1 };
}
/** A shop counter with a till, running along x. */
function counter(g: THREE.Group, x: number, z: number, len: number, body: THREE.Material, top: THREE.Material) {
  g.add(box(len, 0.98, 0.6, body, x, 0.49, z), box(len + 0.1, 0.06, 0.7, top, x, 1.01, z));
  g.add(
    box(0.42, 0.26, 0.36, M('#2a2a2e', 0.5, 0.3), x + len / 2 - 0.5, 1.17, z),
    box(0.3, 0.2, 0.02, lit('#9be8b0', 0.9), x + len / 2 - 0.5, 1.38, z + 0.12),
  );
}
const indoor = (o: THREE.Object3D) =>
  o.traverse(m => {
    if ((m as THREE.Mesh).isMesh) m.castShadow = false;
  });

// ------------------------------------------------------------------ Wrench & Ride Auto
/** The garage. Returns where its counter is (in the room's frame) and where the mechanic stands. */
export function buildGarage(r: Room) {
  const { g } = r;
  const concrete = inner(
      canvasTex(256, 256, x => {
        x.fillStyle = '#9a9890';
        x.fillRect(0, 0, 256, 256);
        grain(x, 256, 256, 2600, 0.08);
        x.strokeStyle = 'rgba(40,38,34,.45)'; // expansion joints
        x.lineWidth = 2;
        x.strokeRect(1, 1, 254, 254);
        for (let i = 0; i < 5; i++) {
          // old oil
          const gx = 30 + Math.random() * 200,
            gy = 30 + Math.random() * 200,
            gr = x.createRadialGradient(gx, gy, 2, gx, gy, 14 + Math.random() * 22);
          gr.addColorStop(0, 'rgba(20,18,16,.5)');
          gr.addColorStop(1, 'rgba(20,18,16,0)');
          x.fillStyle = gr;
          x.fillRect(0, 0, 256, 256);
        }
      }),
      0.18,
      0.75,
    ),
    block = inner(
      canvasTex(
        256,
        256,
        x => {
          // painted blockwork: pale above, a workshop-blue dado below with a red line
          x.fillStyle = '#c9cdd0';
          x.fillRect(0, 0, 256, 256);
          x.fillStyle = '#2f4a66';
          x.fillRect(0, 150, 256, 106);
          x.fillStyle = '#b8322a';
          x.fillRect(0, 142, 256, 8);
          x.strokeStyle = 'rgba(0,0,0,.16)';
          x.lineWidth = 1.5;
          for (let j = 0; j < 8; j++) {
            x.beginPath();
            x.moveTo(0, j * 32);
            x.lineTo(256, j * 32);
            x.stroke();
            for (let i = 0; i < 5; i++) {
              const bx = i * 64 + (j % 2 ? 32 : 0);
              x.beginPath();
              x.moveTo(bx, j * 32);
              x.lineTo(bx, j * 32 + 32);
              x.stroke();
            }
          }
          grain(x, 256, 256, 1200, 0.05);
        },
        1,
        1,
      ),
      0.2,
    ),
    tin = inner(
      canvasTex(
        64,
        64,
        x => {
          x.fillStyle = '#5c6066';
          x.fillRect(0, 0, 64, 64);
          for (let i = 0; i < 8; i++) {
            x.fillStyle = i % 2 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.12)';
            x.fillRect(i * 8, 0, 8, 64);
          }
        },
        8,
        1,
      ),
      0.1,
    );
  // (one block pattern is 3.2 m of wall: the dado comes to about waist height on a 5 m wall)
  block.map!.repeat.set(3, 1);
  const { x0, x1, z1 } = shell(r, concrete, block, tin, '#eaf2ff', '#c9cdd0', 3.2);
  const steel = M('#8a8f96', 0.4, 0.7),
    dark = M('#1c1c20', 0.7),
    red = M('#b8322a', 0.5, 0.3),
    yellow = M('#e2b23a', 0.6, 0.2),
    rubber = M('#17171a', 0.9),
    wood = photoM('timber', '#8a5f38');

  // ---- the lift: two posts, four arms, and whatever you drive standing on them (the golf cart if you own no car)
  const LX = -2.3,
    LZ = 4.9,
    UP = 1.35;
  for (const s of [-1, 1]) {
    const px = LX + s * 1.42;
    g.add(
      box(0.26, 3.3, 0.34, yellow, px, 1.65, LZ),
      box(0.5, 0.05, 0.6, steel, px, 0.045, LZ),
      box(0.2, 0.3, 0.42, dark, px - s * 0.05, UP - 0.1, LZ),
    );
    for (const e of [-1, 1]) {
      const arm = box(0.08, 0.07, 1.25, steel, px - s * 0.55, UP - 0.12, LZ + e * 0.62);
      arm.rotation.y = e * s * 0.5;
      g.add(arm, cyl(0.09, 0.09, 0.06, 10, rubber, px - s * 0.85, UP - 0.06, LZ + e * 1.15));
    }
    r.col(px - 0.2, px + 0.2, LZ - 0.25, LZ + 0.25, 'sign');
  }
  g.add(box(3.1, 0.12, 0.16, yellow, LX, 3.3, LZ)); // the bar across the top
  {
    // hazard stripes round the bay
    const hz = new THREE.Mesh(
      new THREE.PlaneGeometry(3.9, 5.4),
      new THREE.MeshBasicMaterial({
        map: canvasTex(256, 256, x => {
          x.clearRect(0, 0, 256, 256);
          x.lineWidth = 12;
          x.strokeStyle = '#e2b23a';
          x.strokeRect(8, 8, 240, 240);
          x.setLineDash([14, 14]);
          x.strokeStyle = '#1c1c20';
          x.strokeRect(8, 8, 240, 240);
        }),
        transparent: true,
      }),
    );
    hz.rotation.x = -Math.PI / 2;
    hz.position.set(LX, 0.028, LZ);
    g.add(hz);
  }
  const onLift = new THREE.Group();
  onLift.position.set(LX, UP, LZ);
  onLift.rotation.y = Math.PI / 2; // nose to the door
  g.add(onLift);
  let shown = '?';
  const park = () => {
    const pr = progress(),
      spec = CAR.get(pr.car),
      key = spec ? pr.car + (pr.carLook[pr.car] || '') : '';
    if (key === shown) return;
    shown = key;
    onLift.clear();
    const [paint, rim] = (pr.carLook[pr.car] || ':').split(':'),
      m = spec ? carModel(spec, paint, rim).root : cartModel('#c8452f').root;
    if (spec && spec.size[0] > 5.2) m.scale.setScalar(5.2 / spec.size[0]); // (the long ones are eased in to fit the bay)
    m.userData.noBatch = true;
    indoor(m);
    onLift.add(m);
  };
  park();
  onProgress(park);

  // ---- the back wall: a long bench with a vice and a tool chest, a pegboard of tools over it
  const BZ = z1 - 0.42;
  g.add(tile(box(5.0, 0.08, 0.8, wood, 2.9, 0.92, BZ), 1.2), box(4.9, 0.06, 0.7, steel, 2.9, 0.3, BZ));
  for (const lx of [0.55, 2.9, 5.25]) g.add(box(0.08, 0.9, 0.7, dark, lx, 0.45, BZ));
  g.add(box(1.1, 0.75, 0.55, red, 1.3, 1.34, BZ)); // the tool chest on the bench
  for (let i = 0; i < 5; i++) g.add(box(1.02, 0.02, 0.02, steel, 1.3, 1.06 + i * 0.14, BZ - 0.28));
  g.add(box(0.3, 0.16, 0.22, M('#2f6a8a', 0.5, 0.4), 4.6, 1.04, BZ - 0.15), box(0.08, 0.2, 0.3, steel, 4.6, 1.2, BZ - 0.15)); // a vice
  {
    const peg = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 1.5),
      inner(
        canvasTex(512, 224, x => {
          x.fillStyle = '#b08a58';
          x.fillRect(0, 0, 512, 224);
          x.fillStyle = 'rgba(0,0,0,.28)';
          for (let j = 8; j < 224; j += 14) for (let i = 8; i < 512; i += 14) x.fillRect(i, j, 2, 2);
          // tool shadows painted on the board, with the tools hanging in them
          const tool = (px: number, py: number, w: number, hh: number, c: string) => {
            x.fillStyle = 'rgba(40,24,10,.35)';
            x.fillRect(px + 3, py + 3, w, hh);
            x.fillStyle = c;
            x.fillRect(px, py, w, hh);
          };
          for (let i = 0; i < 7; i++) {
            tool(30 + i * 34, 24, 9, 70 + i * 9, '#c9ccd0'); // spanners, small to large
            tool(26 + i * 34, 18, 17, 12, '#c9ccd0');
          }
          for (let i = 0; i < 5; i++) {
            tool(300 + i * 40, 30, 8, 80, '#8a8f96'); // screwdrivers
            tool(297 + i * 40, 110, 14, 46, ['#b8322a', '#e2b23a', '#2f6a8a', '#3f8a4a', '#b8322a'][i]);
          }
          tool(300, 176, 150, 12, '#c9ccd0'); // a hacksaw's blade
          tool(446, 164, 34, 34, '#b8322a');
        }),
        0.3,
      ),
    );
    peg.position.set(3.3, 2.15, z1 - 0.03);
    peg.rotation.y = Math.PI;
    g.add(peg, box(3.5, 1.6, 0.04, wood, 3.3, 2.15, z1 - 0.015));
  }
  r.col(0.4, 5.4, BZ - 0.45, z1);
  // ---- the left wall: tyres on a rack, drums in the corner
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 5; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.11, 8, 16), rubber);
      t.rotation.y = Math.PI / 2;
      t.position.set(x0 + 0.38, 0.45 + row * 0.75, 1.9 + i * 0.26 + row * 0.03);
      g.add(t);
    }
  for (const y of [0.1, 0.83, 1.58, 2.3]) g.add(box(0.6, 0.04, 1.6, steel, x0 + 0.38, y, 2.45));
  for (const z of [1.7, 3.2]) g.add(box(0.05, 2.35, 0.05, steel, x0 + 0.65, 1.17, z));
  r.col(x0, x0 + 0.75, 1.6, 3.3);
  for (const [dx, dz, c] of [
    [0.45, 0.5, '#2f6a8a'],
    [1.15, 0.45, '#b8322a'],
    [0.5, 1.2, '#3f8a4a'],
  ] as [number, number, string][]) {
    g.add(cyl(0.29, 0.29, 0.88, 14, M(c, 0.5, 0.3), x0 + dx, 0.44, z1 - dz));
    for (const y of [0.25, 0.62]) g.add(cyl(0.3, 0.3, 0.03, 14, steel, x0 + dx, y, z1 - dz));
  }
  r.col(x0, x0 + 1.5, z1 - 1.55, z1);
  // a trolley jack and a creeper by the bay, an oil pan under the car
  g.add(box(0.7, 0.12, 0.26, red, LX + 2.3, 0.1, LZ + 1.2), cyl(0.02, 0.02, 0.8, 6, steel, LX + 2.62, 0.42, LZ + 1.2).rotateZ(0.45));
  g.add(box(1.0, 0.05, 0.42, dark, LX - 0.2, 0.09, LZ - 2.2), cyl(0.3, 0.26, 0.1, 14, dark, LX + 0.3, 0.07, LZ + 0.4));
  // stock shelves along the right wall, from the shelves pack
  void loadProps('shelves', n => n).then(kit => {
    ['Object_8', 'Object_14'].forEach((n, i) => {
      const o = kit.make(n),
        sz = kit.size(n);
      if (!o || !sz) return;
      o.rotation.y = sz.x < sz.z ? 0 : Math.PI / 2; // long side along the wall
      o.position.set(x1 - 0.45, 0.03, 4.6 + i * 2.3);
      o.castShadow = false;
      g.add(o);
    });
  });
  r.col(x1 - 0.85, x1, 3.5, 8.0);
  // ---- the counter by the door, with the price board behind it
  const CX = 3.6,
    CZ = 2.5;
  counter(g, CX, CZ, 2.6, M('#2f4a66', 0.7), steel);
  r.col(CX - 1.35, CX + 1.35, CZ - 0.35, CZ + 0.35, 'bench');
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.1),
    inner(
      textTex(
        [
          { t: 'WRENCH & RIDE', s: 84, c: '#ffd27a', b: true, y: 70 },
          { t: 'CARS  ·  PAINT  ·  RIMS', s: 40, c: '#f1e6d0', y: 150 },
          { t: 'ENGINE  ·  TYRES  ·  BRAKES', s: 40, c: '#9be8b0', y: 208 },
        ],
        768,
        256,
        '#1d2a3a',
      ),
      0.7,
    ),
  );
  board.position.set(x1 - 0.03, 2.9, CZ + 0.6);
  board.rotation.y = -Math.PI / 2;
  g.add(board);
  return { spot: [CX, CZ - 1.0] as [number, number], staff: [CX, CZ + 0.95] as [number, number] };
}

// ------------------------------------------------------------------ Homestead Furniture
/** The showroom. Returns where its counter is (in the room's frame) and where the clerk stands. */
export function buildShowroom(r: Room) {
  const { g } = r;
  const boards = inner(photoM('timber', '#8a5f38').map!, 0.25, 0.7),
    wallT = canvasTex(
      256,
      256,
      x => {
        // warm plaster over a panelled dado
        x.fillStyle = '#eadfc6';
        x.fillRect(0, 0, 256, 256);
        grain(x, 256, 256, 900, 0.035);
        x.fillStyle = '#7a5a3c';
        x.fillRect(0, 176, 256, 80);
        x.fillStyle = '#5a3f28';
        x.fillRect(0, 170, 256, 7);
        x.strokeStyle = 'rgba(30,18,8,.35)';
        x.lineWidth = 2;
        for (let i = 0; i < 4; i++) x.strokeRect(i * 64 + 8, 188, 48, 58);
      },
      1,
      1,
    ),
    wall = inner(wallT, 0.28),
    ceil = inner(
      canvasTex(64, 64, x => {
        x.fillStyle = '#f4efe2';
        x.fillRect(0, 0, 64, 64);
        x.strokeStyle = 'rgba(0,0,0,.08)';
        x.strokeRect(0, 0, 64, 64);
      }),
      0.3,
    );
  wallT.repeat.set(3, 1);
  ceil.map!.repeat.set(8, 7);
  const { x0, x1, z1 } = shell(r, boards, wall, ceil, '#ffe2b0', '#eadfc6', 1.4);
  /** Stand a catalog piece on the floor (quarter turns), solid unless it is a rug, with its price on a little card. */
  const show = (id: string, x: number, z: number, turns = 0, tag = true) => {
    const def = ITEM.get(id);
    if (!def) return;
    const o = def.make('#c8452f');
    o.position.set(x, 0.03, z);
    o.rotation.y = (turns * Math.PI) / 2;
    o.userData.noBatch = true;
    indoor(o);
    g.add(o);
    const w = turns % 2 ? def.d : def.w,
      d = turns % 2 ? def.w : def.d;
    if (!def.floor) r.col(x - w / 2 + 0.1, x + w / 2 - 0.1, z - d / 2 + 0.1, z + d / 2 - 0.1, 'bench');
    if (!tag) return;
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.2),
      inner(textTex([{ t: '$' + def.price.toLocaleString('en-US'), s: 150, c: '#2a1a10', b: true, y: 140 }], 512, 256, '#fff6dc'), 0.6),
    );
    card.position.set(x - w / 2 + 0.2, 0.14, z - d / 2 - 0.12);
    card.rotation.x = -0.5;
    g.add(card, box(0.02, 0.1, 0.02, M('#5a3a26', 0.8), x - w / 2 + 0.2, 0.05, z - d / 2 - 0.08));
  };
  // the living room, back left: a rug with the sofa, armchair and coffee table on it, a lamp and a plant
  show('h_rug', x0 + 2.6, z1 - 2.7, 0, false);
  show('h_sofa', x0 + 2.6, z1 - 0.75, 0);
  show('h_armchair', x0 + 0.85, z1 - 2.9, 1);
  show('h_coffee', x0 + 2.7, z1 - 2.6, 0);
  show('h_lamp', x0 + 0.55, z1 - 0.6, 0, false);
  show('h_plant', x0 + 4.4, z1 - 0.6, 0, false);
  // the bedroom, back right
  show('h_bed', x1 - 1.4, z1 - 1.5, 0);
  show('h_wardrobe', x1 - 0.6, z1 - 4.1, 3);
  // by the windows: a bookcase and a guitar on the left, a picnic table for the lot on the right
  show('h_books', x0 + 0.55, 2.6, 1);
  show('h_guitar', x0 + 0.6, 4.2, 1);
  show('h_plant2', -1.6, 1.7, 0, false);
  // ---- the counter, to the right of the door
  const CX = 3.1,
    CZ = 2.6;
  counter(g, CX, CZ, 2.4, photoM('timber', '#8a5f38'), M('#3a2a1c', 0.5));
  r.col(CX - 1.25, CX + 1.25, CZ - 0.35, CZ + 0.35, 'bench');
  const name = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.9),
    inner(
      textTex(
        [
          { t: 'HOMESTEAD', s: 100, c: '#ffe9a8', b: true, y: 100 },
          { t: 'everything for your lot', s: 44, c: '#f1e6d0', y: 196 },
        ],
        768,
        256,
        '#5a3a26',
      ),
      0.7,
    ),
  );
  name.position.set(x1 - 0.03, 2.75, CZ + 0.4);
  name.rotation.y = -Math.PI / 2;
  g.add(name);
  // a pendant over the living room
  g.add(
    cyl(0.01, 0.01, 0.9, 5, M('#2a2420', 0.6), x0 + 2.6, r.h - 0.45, z1 - 2.6),
    cyl(0.12, 0.3, 0.26, 14, lit('#ffe2a0', 1.5), x0 + 2.6, r.h - 1.0, z1 - 2.6),
  );
  return { spot: [CX, CZ - 1.0] as [number, number], staff: [CX, CZ + 0.95] as [number, number] };
}

// ------------------------------------------------------------------ the West Side's other four shops
// Threads, The Clip Joint and Ink Spot open the wardrobe, whose camera stands 2.9 m in front of you facing back at you;
// so where you press E is well inside each room, with you facing the door and the room's back wall behind you.
type Place = { spot: [number, number]; staff: [number, number]; staffYaw?: number };
/** A checked floor (two colours), `n` squares to a tile of the texture. */
const checker = (a: string, b: string, n = 4) =>
  canvasTex(128, 128, x => {
    const q = 128 / n;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        x.fillStyle = (i + j) % 2 ? a : b;
        x.fillRect(i * q, j * q, q, q);
      }
    grain(x, 128, 128, 500, 0.05);
  });
/** A plain painted wall with a dado of a second colour and a rail between them (`dado` is a share of the height). */
const paintedWall = (top: string, low: string, rail: string, dado = 0.32, brick = false) =>
  canvasTex(256, 256, x => {
    x.fillStyle = top;
    x.fillRect(0, 0, 256, 256);
    grain(x, 256, 256, 800, 0.04);
    const y0 = 256 * (1 - dado);
    x.fillStyle = low;
    x.fillRect(0, y0, 256, 256 - y0);
    if (brick) {
      x.strokeStyle = 'rgba(0,0,0,.28)';
      x.lineWidth = 2;
      for (let j = 0; y0 + j * 16 < 256; j++) {
        const y = y0 + j * 16;
        x.beginPath();
        x.moveTo(0, y);
        x.lineTo(256, y);
        x.stroke();
        for (let i = 0; i < 9; i++) {
          const bx = i * 32 + (j % 2 ? 16 : 0);
          x.beginPath();
          x.moveTo(bx, y);
          x.lineTo(bx, y + 16);
          x.stroke();
        }
      }
    }
    x.fillStyle = rail;
    x.fillRect(0, y0 - 6, 256, 6);
  });
const plainCeil = (c: string) =>
  inner(
    canvasTex(32, 32, x => ((x.fillStyle = c), x.fillRect(0, 0, 32, 32))),
    0.3,
  );
/** A dressmaker's form: the shape the shop windows use, in a shirt colour, on a stand. */
function form(g: THREE.Group, x: number, z: number, shirt: string, base = 0, turn = 0) {
  const f = new THREE.Mesh(
    new THREE.LatheGeometry(
      [0, 0.17, 0.2, 0.15, 0.21, 0.07, 0.06, 0].map((r, i) => new THREE.Vector2(r, [0, 0.02, 0.3, 0.5, 0.66, 0.74, 0.8, 0.8][i])),
      12,
    ),
    M(shirt, 0.8),
  );
  f.scale.z = 0.6;
  f.position.set(x, base + 0.85, z);
  f.rotation.y = turn;
  const metal = M('#3a3a3c', 0.5, 0.5);
  g.add(f, cyl(0.02, 0.02, 0.85, 5, metal, x, base + 0.43, z), cyl(0.16, 0.16, 0.03, 12, metal, x, base + 0.02, z));
}

/** Threads: a clothing shop. Rails of shirts along the left wall, folded stacks on shelves along the right, forms on a
 *  plinth, a fitting room in the back corner, a long mirror on the back wall, a till by the door. */
export function buildBoutique(r: Room): Place {
  const { g } = r,
    floorT = checker('#d9cdb4', '#c9bc9f', 2),
    wallT = paintedWall('#2f4f5a', '#8a4a3a', '#f1e6d0', 0.3, true);
  wallT.repeat.set(3, 1);
  const { x0, x1, z1 } = shell(r, inner(floorT, 0.25, 0.6), inner(wallT, 0.25), plainCeil('#f1ebdc'), '#ffe8c8', '#2f4f5a', 1.2);
  const chrome = M('#c9ccd0', 0.25, 0.8),
    wood = photoM('timber', '#8a5f38'),
    shirts = ['#c8452f', '#2f8a86', '#e2b23a', '#6a4a8a', '#f1e6d0', '#3a5a3a', '#e86aa6', '#2c2f38'];
  // rails: a chrome bar on two stands, shirts on hangers side by side
  for (const [rz, n] of [
    [2.6, 9],
    [5.2, 8],
  ] as [number, number][]) {
    const rx = x0 + 0.75;
    g.add(box(0.04, 0.04, 2.2, chrome, rx, 1.55, rz));
    for (const e of [-1, 1]) g.add(cyl(0.02, 0.02, 1.55, 6, chrome, rx, 0.78, rz + e * 1.1), box(0.5, 0.03, 0.06, chrome, rx, 0.02, rz + e * 1.1));
    for (let i = 0; i < n; i++) {
      const sz = rz - 0.95 + (i * 1.9) / (n - 1),
        c = M(shirts[((i * 3 + rz * 2) % shirts.length) | 0], 0.85);
      g.add(box(0.42, 0.62, 0.05, c, rx, 1.18, sz), box(0.1, 0.18, 0.05, c, rx - 0.25, 1.38, sz), box(0.1, 0.18, 0.05, c, rx + 0.25, 1.38, sz));
    }
    r.col(x0, x0 + 1.1, rz - 1.25, rz + 1.25, 'bench');
  }
  // shelves of folded stacks along the right wall
  {
    const sx = x1 - 0.32;
    for (const y of [0.4, 1.0, 1.6, 2.2]) {
      g.add(tile(box(0.55, 0.05, 3.4, wood, sx, y, 4.3), 1.2));
      for (let i = 0; i < 6; i++)
        for (let k = 0; k < 3; k++)
          g.add(box(0.4, 0.07, 0.42, M(shirts[((i + k * 2 + y * 3) % shirts.length) | 0], 0.9), sx, y + 0.06 + k * 0.075, 2.9 + i * 0.56));
    }
    for (const z of [2.55, 6.05]) g.add(box(0.55, 2.3, 0.05, wood, sx, 1.15, z));
    r.col(x1 - 0.65, x1, 2.5, 6.1, 'bench');
  }
  // three forms on a round plinth, left of centre
  const PX = -1.7,
    PZ = 3.3;
  g.add(cyl(1.0, 1.05, 0.18, 24, M('#f1e6d0', 0.7), PX, 0.09, PZ));
  form(g, PX - 0.45, PZ - 0.2, '#c8452f', 0.18, 0.4);
  form(g, PX + 0.45, PZ - 0.2, '#2f8a86', 0.18, -0.4);
  form(g, PX, PZ + 0.4, '#e2b23a', 0.18);
  r.col(PX - 1.05, PX + 1.05, PZ - 1.05, PZ + 1.05, 'bench');
  // the fitting room: a curtain on a rail in the back-left corner
  {
    const cm = inner(
        canvasTex(64, 64, x => {
          for (let i = 0; i < 8; i++) {
            x.fillStyle = i % 2 ? '#7a2a22' : '#8a3a30';
            x.fillRect(i * 8, 0, 8, 64);
          }
        }),
        0.2,
      ),
      cx = x0 + 1.0;
    g.add(box(1.7, 0.04, 0.04, chrome, cx, 2.45, z1 - 1.6), box(0.04, 0.04, 1.6, chrome, x0 + 1.85, 2.45, z1 - 0.8));
    const cur = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.3), cm);
    cur.position.set(cx, 1.3, z1 - 1.6);
    cur.rotation.y = Math.PI;
    const side = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.3), cm);
    side.position.set(x0 + 1.85, 1.3, z1 - 0.8);
    side.rotation.y = -Math.PI / 2;
    g.add(cur, side);
    r.col(x0, x0 + 1.9, z1 - 1.65, z1, 'bench');
  }
  // the mirror on the back wall (a gold frame round a pale, slightly shiny pane) and a rug in front of it
  g.add(
    box(1.6, 2.3, 0.06, M('#c9a24a', 0.4, 0.6), 1.2, 1.35, z1 - 0.04),
    Object.assign(
      box(1.44, 2.14, 0.02, new THREE.MeshStandardMaterial({ color: '#cfe0e6', roughness: 0.05, metalness: 0.9 }), 1.2, 1.35, z1 - 0.08),
      {},
    ),
  );
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), inner(checker('#27405e', '#f1e6d0', 8), 0.2));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(1.2, 0.026, z1 - 2.6);
  g.add(rug);
  // the till by the door
  counter(g, 3.9, 2.0, 2.0, M('#27405e', 0.7), wood);
  r.col(2.85, 4.95, 1.65, 2.35, 'bench');
  return { spot: [1.2, z1 - 2.7], staff: [3.9, 2.95], staffYaw: Math.PI };
}

/** The Clip Joint: a barber's. Black and white floor, white tile, two chairs facing a long mirror on the left wall, a
 *  bench and a rack of magazines on the right, products on glass shelves, a striped pole inside too. */
export function buildBarber(r: Room): Place {
  const { g } = r,
    tileT = canvasTex(128, 128, x => {
      x.fillStyle = '#eef0ee';
      x.fillRect(0, 0, 128, 128);
      x.strokeStyle = 'rgba(120,140,140,.45)';
      x.lineWidth = 2;
      for (let i = 0; i <= 8; i++) {
        x.beginPath();
        x.moveTo(i * 16, 0);
        x.lineTo(i * 16, 128);
        x.moveTo(0, i * 16);
        x.lineTo(128, i * 16);
        x.stroke();
      }
      x.fillStyle = '#27405e';
      x.fillRect(0, 84, 128, 6);
    });
  tileT.repeat.set(3, 2);
  const { x0, x1, z1 } = shell(
    r,
    inner(checker('#f1eee6', '#1c1c20', 2), 0.22, 0.4),
    inner(tileT, 0.25, 0.4),
    plainCeil('#f4f4f0'),
    '#f4f8ff',
    '#eef0ee',
    0.9,
  );
  const chrome = M('#c9ccd0', 0.25, 0.8),
    leather = M('#7a2a22', 0.5),
    glass = new THREE.MeshStandardMaterial({ color: '#cfe0e6', roughness: 0.05, metalness: 0.9 });
  // the long mirror on the left wall, a counter under it, two chairs facing it
  g.add(box(0.05, 1.3, 4.6, M('#27405e', 0.5), x0 + 0.03, 1.75, 4.1), box(0.03, 1.18, 4.48, glass, x0 + 0.06, 1.75, 4.1));
  g.add(box(0.45, 0.06, 4.6, M('#f1eee6', 0.4), x0 + 0.23, 0.95, 4.1), box(0.4, 0.9, 4.5, M('#27405e', 0.6), x0 + 0.21, 0.47, 4.1));
  for (let i = 0; i < 6; i++)
    g.add(
      cyl(
        0.035,
        0.04,
        0.18 + (i % 3) * 0.04,
        8,
        M(['#7fb0c8', '#e2b23a', '#9ac87a', '#c8452f', '#f1eee6', '#2f8a86'][i], 0.3),
        x0 + 0.25,
        1.06,
        2.2 + i * 0.75,
      ),
    );
  r.col(x0, x0 + 0.5, 1.8, 6.4);
  for (const cz of [3.1, 5.2]) {
    const cx = x0 + 1.25;
    g.add(
      cyl(0.3, 0.34, 0.08, 14, chrome, cx, 0.04, cz),
      cyl(0.06, 0.06, 0.42, 8, chrome, cx, 0.29, cz),
      box(0.58, 0.14, 0.56, leather, cx, 0.55, cz),
      box(0.12, 0.7, 0.56, leather, cx + 0.32, 0.95, cz),
      box(0.12, 0.2, 0.34, leather, cx + 0.4, 1.38, cz),
      box(0.5, 0.06, 0.08, chrome, cx, 0.72, cz - 0.3),
      box(0.5, 0.06, 0.08, chrome, cx, 0.72, cz + 0.3),
      box(0.25, 0.05, 0.4, chrome, cx - 0.42, 0.2, cz),
    );
    r.col(cx - 0.45, cx + 0.45, cz - 0.4, cz + 0.4, 'bench');
  }
  // the waiting bench and a magazine rack on the right wall, a coat stand by the door
  {
    const bx = x1 - 0.35;
    g.add(box(0.5, 0.08, 2.4, leather, bx, 0.46, 3.0), box(0.1, 0.5, 2.4, leather, x1 - 0.08, 0.75, 3.0));
    for (const e of [-1, 1]) g.add(box(0.45, 0.42, 0.06, chrome, bx, 0.21, 3.0 + e * 1.1));
    r.col(x1 - 0.65, x1, 1.75, 4.25, 'bench');
    g.add(box(0.12, 0.9, 0.7, M('#5a3a26', 0.8), x1 - 0.08, 1.6, 5.2));
    for (let i = 0; i < 4; i++)
      g.add(
        box(
          0.03,
          0.26,
          0.2,
          M(['#c8452f', '#2f8a86', '#e2b23a', '#f1e6d0'][i], 0.6),
          x1 - 0.16,
          1.38 + (i % 2) * 0.32,
          5.0 + Math.floor(i / 2) * 0.36,
        ),
      );
  }
  // a pole on the back wall too, and a price board
  g.add(cyl(0.08, 0.08, 0.8, 12, M('#c8452f', 0.5), x0 + 0.3, 2.9, z1 - 0.2), cyl(0.1, 0.1, 0.08, 12, chrome, x0 + 0.3, 3.32, z1 - 0.2));
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 1.0),
    inner(
      textTex(
        [
          { t: 'CUTS  ·  SHAVES', s: 64, c: '#8a2f28', b: true, y: 80 },
          { t: 'Stubble · Face paint · Colour', s: 40, c: '#27405e', y: 160 },
        ],
        768,
        256,
        '#f1eee6',
      ),
      0.5,
    ),
  );
  board.position.set(0.9, 2.4, z1 - 0.03);
  board.rotation.y = Math.PI;
  g.add(board);
  return { spot: [0.7, z1 - 2.6], staff: [x0 + 1.25, 4.15], staffYaw: Math.PI / 2 };
}

/** Ink Spot: a tattoo parlour. Black walls papered with flash (the game's own designs), a red and black floor, a
 *  padded table under an arm lamp, a rolling cart of inks, a neon sign inside. */
export function buildTattoo(r: Room): Place {
  const { g } = r,
    sheet = new THREE.TextureLoader().load(new URL('golfer/tattoos.png', document.baseURI).href);
  sheet.colorSpace = THREE.SRGBColorSpace;
  const wallT = paintedWall('#221d26', '#141016', '#ff5a8a', 0.28);
  wallT.repeat.set(3, 1);
  const { x0, x1, z1 } = shell(
    r,
    inner(checker('#5a1a1e', '#141016', 2), 0.2, 0.5),
    inner(wallT, 0.25),
    plainCeil('#1c1820'),
    '#ffd6e6',
    '#221d26',
    1.0,
  );
  // flash: framed sheets of the game's own designs on the left and back walls
  let fi = 0;
  const flash = (x: number, y: number, z: number, yaw: number) => {
    const t = sheet.clone(),
      i = (fi++ * 7) % 18;
    t.repeat.set(1 / 6, 1 / 3);
    t.offset.set((i % 6) / 6, 1 - (Math.floor(i / 6) + 1) / 3);
    t.needsUpdate = true;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.62), M('#f1e6d0', 0.9)),
      art = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshBasicMaterial({ map: t, transparent: true, color: '#3a2a2a' }));
    for (const [m, o] of [
      [back, 0.005],
      [art, 0.012],
    ] as [THREE.Mesh, number][]) {
      m.position.set(x + Math.sin(yaw) * o, y, z + Math.cos(yaw) * o);
      m.rotation.y = yaw;
      g.add(m);
    }
  };
  for (let row = 0; row < 3; row++) for (let i = 0; i < 7; i++) flash(x0 + 0.01, 1.4 + row * 0.75, 1.7 + i * 0.75, Math.PI / 2);
  for (let row = 0; row < 2; row++) for (let i = 0; i < 5; i++) flash(-2.6 + i * 0.62, 2.4 + row * 0.75, z1 - 0.01, Math.PI);
  // the table: padded, on a chrome column, with a pillow; an arm lamp over it; a stool; the ink cart
  const TX = 2.3,
    TZ = 4.6,
    chrome = M('#c9ccd0', 0.25, 0.8),
    vinyl = M('#141016', 0.45);
  g.add(
    box(0.7, 0.14, 2.0, vinyl, TX, 0.82, TZ),
    box(0.62, 0.08, 0.4, vinyl, TX, 0.93, TZ + 0.72),
    cyl(0.08, 0.08, 0.72, 8, chrome, TX, 0.38, TZ),
    box(0.6, 0.05, 1.2, chrome, TX, 0.03, TZ),
  );
  r.col(TX - 0.4, TX + 0.4, TZ - 1.05, TZ + 1.05, 'bench');
  g.add(cyl(0.025, 0.025, 1.8, 6, chrome, x1 - 0.3, 0.9, TZ - 1.2), box(0.03, 0.03, 1.1, chrome, x1 - 0.75, 1.8, TZ - 0.75));
  g.add(cyl(0.1, 0.18, 0.16, 12, lit('#fff4e0', 2.2), TX + 0.25, 1.72, TZ - 0.3));
  g.add(cyl(0.2, 0.2, 0.06, 12, vinyl, TX - 0.75, 0.6, TZ - 0.6), cyl(0.03, 0.03, 0.58, 6, chrome, TX - 0.75, 0.3, TZ - 0.6));
  {
    const kx = TX - 0.9,
      kz = TZ + 0.9;
    g.add(box(0.55, 0.04, 0.4, chrome, kx, 0.85, kz), box(0.55, 0.04, 0.4, chrome, kx, 0.45, kz));
    for (const [dx, dz] of [
      [-0.25, -0.18],
      [0.25, -0.18],
      [-0.25, 0.18],
      [0.25, 0.18],
    ])
      g.add(cyl(0.012, 0.012, 0.85, 5, chrome, kx + dx, 0.43, kz + dz));
    for (let i = 0; i < 8; i++)
      g.add(
        cyl(
          0.022,
          0.022,
          0.08,
          8,
          M(['#141016', '#c8452f', '#2f6a8a', '#3f8a4a', '#e2b23a', '#7a2f8a', '#ff5a8a', '#f1e6d0'][i], 0.3),
          kx - 0.21 + (i % 4) * 0.14,
          0.91,
          kz - 0.1 + Math.floor(i / 4) * 0.2,
        ),
      );
    r.col(kx - 0.3, kx + 0.3, kz - 0.22, kz + 0.22, 'bench');
  }
  // neon inside: INK on the back wall, and the shop's waiting couch by the door
  g.add(box(1.6, 0.06, 0.04, lit('#5ad8ff', 2.4), 1.9, 3.5, z1 - 0.06), box(1.6, 0.06, 0.04, lit('#ff5a8a', 2.4), 1.9, 3.3, z1 - 0.06));
  const ink = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.55),
    new THREE.MeshStandardMaterial({
      map: textTex([{ t: 'INK SPOT', s: 120, c: '#ff5a8a', b: true, y: 140 }], 768, 256, '#141016'),
      emissive: '#ffffff',
      emissiveIntensity: 0.9,
    }),
  );
  (ink.material as THREE.MeshStandardMaterial).emissiveMap = (ink.material as THREE.MeshStandardMaterial).map;
  ink.position.set(1.9, 2.75, z1 - 0.04);
  ink.rotation.y = Math.PI;
  g.add(ink);
  g.add(box(0.7, 0.42, 1.8, M('#5a1a1e', 0.6), x1 - 0.4, 0.21, 2.2), box(0.14, 0.5, 1.8, M('#5a1a1e', 0.6), x1 - 0.1, 0.65, 2.2));
  r.col(x1 - 0.8, x1, 1.25, 3.15, 'bench');
  return { spot: [-0.6, z1 - 2.6], staff: [TX - 0.75, TZ - 1.25], staffYaw: -Math.PI / 2 };
}

/** The Pro Shop: a wall of clubs, bags on stands, a pyramid of balls, a putting strip with a cup, framed courses,
 *  and the counter where the trails are sold. */
export function buildProShop(r: Room): Place {
  const { g } = r,
    wallT = paintedWall('#e9e1cc', '#2f5038', '#f1e6d0', 0.36);
  wallT.repeat.set(3, 1);
  const { x0, x1, z1 } = shell(
    r,
    inner(photoM('timber', '#8a5f38').map!, 0.25, 0.7),
    inner(wallT, 0.25),
    plainCeil('#f4efe2'),
    '#fff0d6',
    '#e9e1cc',
    1.4,
  );
  const steel = M('#c9ccd0', 0.3, 0.7),
    head = M('#2a2a2c', 0.4, 0.5),
    wood = M('#5a3a26', 0.8);
  // the club wall: three rows of clubs standing in a rack along the left wall
  g.add(box(0.12, 0.05, 6.0, wood, x0 + 0.25, 0.55, 4.6), box(0.12, 0.05, 6.0, wood, x0 + 0.25, 1.55, 4.6));
  for (let i = 0; i < 24; i++) {
    const cz = 1.75 + i * 0.25,
      tall = 0.9 + (i % 4) * 0.06;
    g.add(
      cyl(0.01, 0.01, tall, 5, steel, x0 + 0.25, 0.1 + tall / 2, cz),
      box(0.07, 0.05, 0.1, i % 7 === 0 ? M('#c9a24a', 0.4, 0.6) : head, x0 + 0.27, 0.1, cz + 0.02),
    );
  }
  r.col(x0, x0 + 0.45, 1.6, 7.7);
  // bags on stands down the middle
  const bagC = ['#8a2f28', '#2b4a3a', '#27405e', '#e2b23a'];
  bagC.forEach((c, i) => {
    const bx = -1.6 + i * 1.2,
      bz = 5.6;
    g.add(cyl(0.17, 0.15, 0.92, 12, M(c, 0.7), bx, 0.55, bz), cyl(0.18, 0.18, 0.1, 12, M('#f1e6d0', 0.7), bx, 1.0, bz));
    for (let k = 0; k < 3; k++)
      g.add(cyl(0.01, 0.01, 0.4, 5, steel, bx - 0.06 + k * 0.06, 1.2, bz), box(0.07, 0.05, 0.08, head, bx - 0.06 + k * 0.06, 1.42, bz));
    r.col(bx - 0.22, bx + 0.22, bz - 0.22, bz + 0.22, 'bench');
  });
  // a pyramid of balls on a round table
  {
    const TX = 0.4,
      TZ = 3.4,
      white = new THREE.MeshStandardMaterial({ color: '#f6f3ea', roughness: 0.45 });
    g.add(cyl(0.55, 0.55, 0.05, 20, wood, TX, 0.78, TZ), cyl(0.05, 0.05, 0.76, 8, wood, TX, 0.39, TZ), cyl(0.3, 0.3, 0.03, 14, wood, TX, 0.02, TZ));
    const ball = new THREE.SphereGeometry(0.035, 10, 8);
    for (let lv = 0; lv < 5; lv++)
      for (let i = 0; i < 5 - lv; i++)
        for (let j = 0; j < 5 - lv; j++) {
          const b = new THREE.Mesh(ball, white);
          b.position.set(TX + (i - (4 - lv) / 2) * 0.072, 0.84 + lv * 0.06, TZ + (j - (4 - lv) / 2) * 0.072);
          g.add(b);
        }
    r.col(TX - 0.55, TX + 0.55, TZ - 0.55, TZ + 0.55, 'bench');
  }
  // a putting strip along the back wall: green carpet, a white cup with a little flag
  {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 0.9), inner(checker('#3f7a3a', '#3a7236', 10), 0.15, 0.9));
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0.3, 0.03, z1 - 0.7);
    g.add(strip, cyl(0.06, 0.06, 0.01, 14, M('#111', 0.9), 2.4, 0.036, z1 - 0.7), cyl(0.006, 0.006, 0.5, 5, M('#f1e6d0', 0.5), 2.4, 0.28, z1 - 0.7));
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.12), new THREE.MeshStandardMaterial({ color: '#c8452f', side: THREE.DoubleSide }));
    flag.position.set(2.49, 0.47, z1 - 0.7);
    g.add(flag);
  }
  // framed course pictures over the strip (from the paintings pack when it's in; frames until then)
  for (let i = 0; i < 3; i++)
    g.add(
      box(1.0, 0.7, 0.04, M('#c9a24a', 0.4, 0.6), -1.4 + i * 1.5, 2.6, z1 - 0.03),
      box(0.88, 0.58, 0.02, M(['#5f8a4a', '#7fa860', '#4f7a3a'][i], 0.8), -1.4 + i * 1.5, 2.6, z1 - 0.055),
    );
  // the counter, right of the door, with trails on show behind it
  counter(g, 3.4, 2.4, 2.4, M('#2b4a3a', 0.7), wood);
  r.col(2.15, 4.65, 2.05, 2.75, 'bench');
  ['#e23b2f', '#f2cf3a', '#5fae4a', '#2f8fa8', '#8a4fc0'].forEach((c, i) =>
    g.add(box(0.05, 0.6, 0.12, lit(c, 1.4), x1 - 0.06, 1.5 + (i % 2) * 0.2, 1.9 + i * 0.32)),
  );
  return { spot: [3.4, 1.4], staff: [3.4, 3.35], staffYaw: Math.PI };
}
