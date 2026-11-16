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
