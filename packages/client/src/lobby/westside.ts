// The West Side: the first piece of the bigger town (lobby-design.md), through a gate in the town's west edge.
// One street with a row of buildings on its north side (the clubhouse, the Lucky Lie Lounge, Dealer Alley, the Grow
// Supply store), a water tower at the far end, a car park on the south side, and a delivery van doing its rounds.
// The buildings are built here in code, and so are the cars (world/cars.ts).
import { loadProps } from '../world/propPacks';
import { buildMachines, type VltSpot } from './vlt';
import * as THREE from 'three';
import { buildCar, CAR_PAINT, type CarKind } from '../world/cars';
import { M, box, cyl, textTex, photoM, tile, BOUND, WEST, BJ_AT, type Collider } from './world';

const ST = { z0: 10.5, z1: 17.5 }, // the street (it carries on from the town's south-west street)
  X0 = -44, // the gate: the town's west edge (-BOUND; written out because world.ts imports this file)
  XW = -116; // the turning circle at the far end
/** What's underfoot in the West Side ('' outside it). */
export function westSurface(x: number, z: number): '' | 'asphalt' | 'paved' | 'grass' {
  if (x > -BOUND || x < WEST.x0 || z < WEST.z0 || z > WEST.z1) return '';
  if (z > ST.z0 && z < ST.z1) return 'asphalt';
  if (x > -104 && x < -52 && z > -6 && z <= ST.z0 - 2.4) return 'paved'; // inside the row of buildings and the alley (no grass indoors)
  if (z >= ST.z1 + 2.2 && z < 35 && x < -54 && x > -100) return 'asphalt'; // the car park
  if ((z > ST.z0 - 2.4 && z <= ST.z0) || (z >= ST.z1 && z < ST.z1 + 2.2)) return 'paved';
  return 'grass';
}

function flat(w: number, d: number, m: THREE.Material, x: number, z: number, y: number) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), m);
  p.position.set(x, y, z);
  p.receiveShadow = true;
  return p;
}
function sign(lines: Parameters<typeof textTex>[0], w: number, h: number, bg: string, glow = 0, tw = 1024, th = 256) {
  const t = textTex(lines, tw, th, bg),
    m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 });
  if (glow) {
    m.emissive = new THREE.Color('#ffffff');
    m.emissiveMap = t;
    m.emissiveIntensity = glow;
  }
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

export function buildWestSide(scene: THREE.Scene, colliders: Collider[]) {
  const G = new THREE.Group();
  G.name = 'westside';
  scene.add(G);
  const col = (x0: number, x1: number, z0: number, z1: number, tag = 'shop') => colliders.push({ x0, x1, z0, z1, tag });
  const white = M('#f1eee6', 0.8),
    dark = M('#2a2420', 0.8),
    wood = M('#8a6a45', 0.9),
    glass = new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffb45a', emissiveIntensity: 0.55, roughness: 0.4 }),
    asphalt = photoM('asphalt', '#55524c'),
    pavers = photoM('pavers', '#b9ad98');

  // ---------------- ground: the street, its sidewalks, the turning circle and the car park
  const L = X0 - XW;
  G.add(tile(flat(L + 6, ST.z1 - ST.z0, asphalt, (X0 + XW) / 2 + 3, (ST.z0 + ST.z1) / 2, 0.035), 1.7));
  G.add(tile(flat(L, 2.2, pavers, (X0 + XW) / 2, ST.z0 - 1.1, 0.06), 2.4), tile(flat(L, 2.2, pavers, (X0 + XW) / 2, ST.z1 + 1.1, 0.06), 2.4));
  const circle = new THREE.Mesh(new THREE.CircleGeometry(8.5, 40).rotateX(-Math.PI / 2), asphalt);
  circle.position.set(XW, 0.034, 14);
  circle.receiveShadow = true;
  G.add(circle, cyl(2.6, 2.8, 0.35, 20, M('#6f8a4a', 0.95), XW, 0.17, 14));
  {
    const dashes: THREE.BufferGeometry[] = [];
    for (let x = X0 - 3; x > XW + 9; x -= 5) dashes.push(new THREE.PlaneGeometry(2.2, 0.16).rotateX(-Math.PI / 2).translate(x, 0.045, 14));
    const g = new THREE.BufferGeometry(),
      pos: number[] = [];
    for (const d of dashes) pos.push(...(d.toNonIndexed().attributes.position.array as Float32Array));
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    G.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#e9dfc6' })));
  }
  G.add(tile(flat(46, 15, asphalt, -77, 27.4, 0.03), 1.7));
  {
    const lines: number[] = [];
    for (let i = 0; i <= 12; i++) {
      const x = -98.6 + i * 3.6;
      for (const z of [22.3, 32.5]) {
        const p = new THREE.PlaneGeometry(0.12, 4.6)
          .rotateX(-Math.PI / 2)
          .translate(x, 0.04, z)
          .toNonIndexed();
        lines.push(...(p.attributes.position.array as Float32Array));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    G.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#e9dfc6' })));
  }

  // ---------------- the gate: a plain timber arch over the street, like the one to the course
  {
    const a = new THREE.Group(),
      s = sign(
        [
          { t: 'WEST SIDE', s: 150, c: '#ffe9a8', b: true, y: 118 },
          { t: 'CLUBHOUSE  ·  BLACKJACK  ·  GROW SUPPLY', s: 40, c: '#f1eee6', y: 212 },
        ],
        8.6,
        2.15,
        '#3a2a1a',
      );
    s.rotation.y = Math.PI / 2;
    s.position.set(0.2, 5.9, 0);
    const b = s.clone();
    b.rotation.y = -Math.PI / 2;
    b.position.x = -0.2;
    a.add(box(0.45, 7, 0.45, wood, 0, 3.5, -4.7), box(0.45, 7, 0.45, wood, 0, 3.5, 4.7), box(0.36, 2.4, 9.9, M('#3a2a1a', 0.85), 0, 5.9, 0), s, b);
    a.position.set(X0 - 1.2, 0, WEST.gateZ);
    G.add(a);
    col(X0 - 1.5, X0 - 0.9, WEST.gateZ - 5, WEST.gateZ - 4.4, 'sign');
    col(X0 - 1.5, X0 - 0.9, WEST.gateZ + 4.4, WEST.gateZ + 5, 'sign');
  }

  // ---------------- a building: walls, a flat or pitched roof, a door and lit windows on the street side (+z)
  function building(o: {
    x0: number;
    x1: number;
    z0: number;
    h: number;
    wall: string;
    trim?: string;
    roof?: 'flat' | 'pitch';
    roofC?: string;
    doorX?: number;
    windows?: number[];
    winY?: number;
  }) {
    const z1 = ST.z0 - 2.4,
      w = o.x1 - o.x0,
      d = z1 - o.z0,
      cx = (o.x0 + o.x1) / 2,
      cz = (o.z0 + z1) / 2,
      wall = M(o.wall, 0.85),
      trim = M(o.trim || '#f1eee6', 0.8),
      b = new THREE.Group();
    b.add(box(w, o.h, d, wall, cx, o.h / 2, cz), box(w + 0.3, 0.25, d + 0.3, trim, cx, 0.12, cz));
    if (o.roof === 'pitch') {
      const g = new THREE.BufferGeometry(),
        hw = w / 2 + 0.4,
        hd = d / 2 + 0.5,
        rh = Math.min(2.2, d * 0.28);
      g.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          // two slopes (ridge runs along x) and the two gable ends
          [
            -hw,
            0,
            hd,
            hw,
            0,
            hd,
            hw,
            rh,
            0,
            -hw,
            0,
            hd,
            hw,
            rh,
            0,
            -hw,
            rh,
            0,
            hw,
            0,
            -hd,
            -hw,
            0,
            -hd,
            -hw,
            rh,
            0,
            hw,
            0,
            -hd,
            -hw,
            rh,
            0,
            hw,
            rh,
            0,
            -hw,
            0,
            -hd,
            -hw,
            0,
            hd,
            -hw,
            rh,
            0,
            hw,
            0,
            hd,
            hw,
            0,
            -hd,
            hw,
            rh,
            0,
          ],
          3,
        ),
      );
      g.computeVertexNormals();
      const r = new THREE.Mesh(g, M(o.roofC || '#6a4a3a', 0.9));
      r.position.set(cx, o.h, cz);
      r.castShadow = true;
      b.add(r);
    } else
      b.add(box(w + 0.4, 0.3, d + 0.4, M(o.roofC || '#3a3632', 0.9), cx, o.h + 0.15, cz), box(w + 0.1, 0.5, 0.15, trim, cx, o.h + 0.5, z1 + 0.1));
    if (o.doorX !== undefined)
      b.add(
        box(1.25, 2.25, 0.1, dark, o.doorX, 1.12, z1 + 0.03),
        box(1.5, 0.12, 0.16, trim, o.doorX, 2.3, z1 + 0.05),
        box(0.08, 0.08, 0.1, M('#d8b24a', 0.4, 0.6), o.doorX + 0.42, 1.1, z1 + 0.1),
      );
    for (const wx of o.windows || [])
      b.add(box(1.7, 1.25, 0.08, glass, wx, o.winY ?? 1.75, z1 + 0.02), box(1.9, 0.1, 0.18, trim, wx, (o.winY ?? 1.75) - 0.7, z1 + 0.06));
    G.add(b);
    col(o.x0, o.x1, o.z0, z1);
    return { z1, cx };
  }

  // 1 · the clubhouse: white clapboard, a green pitched roof, a veranda on posts
  {
    const c = building({
      x0: -68,
      x1: -52,
      z0: -5,
      h: 4.2,
      wall: '#ece6d8',
      roof: 'pitch',
      roofC: '#3f6a52',
      doorX: -60,
      windows: [-65.5, -63, -57, -54.5],
    });
    G.add(box(16.6, 0.14, 2.4, M('#3f6a52', 0.9), -60, 3.05, c.z1 + 1.15));
    for (let x = -67.8; x <= -52; x += 3.95) G.add(box(0.16, 3, 0.16, white, x, 1.5, c.z1 + 2.2));
    const s = sign([{ t: 'GOLDEN HILLS CLUBHOUSE', s: 86, c: '#ffe9a8', b: true, y: 150 }], 9.5, 1.2, '#2b4a3a', 0, 1024, 128 * 2);
    s.position.set(-60, 3.75, c.z1 + 2.42);
    G.add(s, box(1.8, 0.45, 0.5, wood, -63.5, 0.3, c.z1 + 1.4), box(1.8, 0.45, 0.5, wood, -56.5, 0.3, c.z1 + 1.4));
  }
  let vltSpots: VltSpot[] = [];
  // 2 · the Lucky Lie Lounge: dark brick, open to the street, with the blackjack table inside under warm lamps
  {
    const z1 = ST.z0 - 2.4,
      x0 = -86,
      x1 = -72,
      z0 = -6,
      h = 4.6,
      brick = M('#5a3a30', 0.85),
      trim = M('#1d1d1f', 0.8),
      cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2,
      d = z1 - z0;
    G.add(
      box(x1 - x0, h, 0.3, brick, cx, h / 2, z0 + 0.15), // back wall
      box(0.3, h, d, brick, x0 + 0.15, h / 2, cz),
      box(0.3, h, d, brick, x1 - 0.15, h / 2, cz),
      box(x1 - x0 + 0.4, 0.3, d + 0.4, M('#2a2420', 0.9), cx, h + 0.15, cz), // roof
      box(x1 - x0, 1.1, 0.3, brick, cx, h - 0.55, z1 - 0.15), // the beam over the open front
      box(0.5, h, 0.5, trim, x0 + 3.6, h / 2, z1 - 0.25),
      box(0.5, h, 0.5, trim, x1 - 3.6, h / 2, z1 - 0.25),
      box(x1 - x0 - 0.6, 0.05, d - 0.3, M('#4a1f2c', 0.95), cx, 0.06, cz + 0.1), // carpet
      box(x1 - x0 - 0.7, 0.9, 0.06, M('#2a1a16', 0.7), cx, 0.5, z0 + 0.33), // wainscot
    );
    // a bar along the west wall and bottles behind it, for the look of the place
    G.add(box(0.7, 1.05, 5, M('#3a2418', 0.6), x0 + 1.5, 0.53, cz - 1.5), box(0.9, 0.06, 5.2, M('#1d1d1f', 0.3, 0.3), x0 + 1.5, 1.08, cz - 1.5));
    for (let i = 0; i < 7; i++)
      G.add(cyl(0.05, 0.06, 0.3, 6, M(['#6a8a4a', '#8a5a2a', '#b5651d', '#4a6a8a'][i % 4], 0.3), x0 + 0.45, 1.7, cz - 3.6 + i * 0.7));
    G.add(box(0.25, 0.05, 5, M('#3a2418', 0.6), x0 + 0.45, 1.52, cz - 1.5));
    // lamps over the table (they glow; one real light keeps the room readable under its roof)
    for (const dx of [-1.2, 0, 1.2]) {
      const shade = new THREE.Mesh(
          new THREE.ConeGeometry(0.34, 0.3, 12, 1, true),
          new THREE.MeshStandardMaterial({ color: '#2f5a4a', roughness: 0.6, side: THREE.DoubleSide }),
        ),
        bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.09, 8, 6),
          new THREE.MeshStandardMaterial({ color: '#fff2c8', emissive: '#ffd27a', emissiveIntensity: 2 }),
        );
      shade.position.set(BJ_AT[0] + dx, 2.75, BJ_AT[1]);
      bulb.position.set(BJ_AT[0] + dx, 2.66, BJ_AT[1]);
      G.add(shade, bulb, box(0.02, h - 2.9, 0.02, trim, BJ_AT[0] + dx, (h + 2.9) / 2, BJ_AT[1]));
    }
    const lamp = new THREE.PointLight('#ffd9a0', 22, 13, 1.6);
    lamp.position.set(BJ_AT[0], 3, BJ_AT[1] + 0.6);
    G.add(lamp);
    const s = sign(
      [
        { t: 'LUCKY LIE', s: 130, c: '#ff5a8a', b: true, y: 112 },
        { t: 'BLACKJACK  ·  SLOTS  ·  VIDEO POKER', s: 38, c: '#ffe9a8', y: 206 },
      ],
      8,
      2,
      '#141016',
      0.9,
    );
    s.position.set(cx, h + 1.35, z1 - 0.05);
    G.add(s, box(8.3, 2.3, 0.2, trim, cx, h + 1.35, z1 - 0.2));
    col(x0, x0 + 0.3, z0, z1);
    col(x1 - 0.3, x1, z0, z1);
    col(x0, x1, z0, z0 + 0.3);
    col(x0 + 3.35, x0 + 3.85, z1 - 0.5, z1, 'sign');
    col(x1 - 3.85, x1 - 3.35, z1 - 0.5, z1, 'sign');
    col(x0 + 1.1, x0 + 1.95, cz - 4.1, cz + 1.1, 'bench');
    // slot machines and video poker along the back wall (lobby/vlt.ts)
    const xs = [-81.3, -80.3, -77.7, -76.7];
    vltSpots = buildMachines(G, xs, z0 + 0.72);
    for (const mx of xs) col(mx - 0.4, mx + 0.4, z0 + 0.3, z0 + 1.15, 'bench');
  }
  // 3 · the alley between the lounge and the store, where the Street Dealer does business (lobby/dealer.ts)
  {
    const z1 = ST.z0 - 2.4;
    G.add(tile(flat(4, 14, asphalt, -88, z1 - 7, 0.03), 1.7));
    // dressed from the PSX Industrial Pack (Tomitos, CC BY 4.0; see docs/credits.md): [prop, x, z, yaw, y, scale]
    const DRESS: [string, number, number, number, number?, number?][] = [
      ['Dumpster', -86.55, 1.5, Math.PI / 2],
      ['DumpsterLid1', -86.55, 1.0, Math.PI / 2, 1.1],
      ['DumpsterLid1', -86.55, 2.0, Math.PI / 2, 1.1],
      ['BarrelOil', -86.55, 3.5, 0.4],
      ['BarrelWater', -86.6, 4.3, 1.9],
      ['Jerrycan', -87.1, 3.95, 0.5],
      ['CrateWood2', -89.35, 3.3, 0.1],
      ['CrateWood', -89.4, 3.25, 0.5, 0.7],
      ['CrateWood', -89.45, 4.2, -0.2],
      ['Pallet', -89.3, 0.9, 0.08],
      ['Pallet', -89.28, 0.92, -0.1, 0.13],
      ['Pallet', -89.32, 0.88, 0.03, 0.26],
      ['TransformerBox', -89.72, -0.9, Math.PI / 2],
      ['Tires', -89.1, -2.7, 0.3],
      ['Tire', -88.2, -3.3, 1.1],
      ['PileTrash', -88.9, -4.9, 0.7],
      ['PileDebris', -87.0, -4.8, 2.2],
      ['TrashCan', -86.5, -0.3, 0],
      ['TrashCanLid', -86.5, -0.3, 0.6, 0.9, 0.7],
      ['TrashCan', -86.5, -1.05, 1.3],
      ['TrashCanTrash', -86.5, -1.05, 0, 0.84],
    ];
    void loadProps('industrial').then(kit => {
      for (const [n, x, z, yaw, y = 0, sc = 1] of DRESS) {
        const o = kit.make(n, sc);
        if (!o) continue;
        o.position.set(x, 0.03 + y, z);
        o.rotation.y = yaw;
        G.add(o);
      }
    });
    col(-90, -88.85, 2.7, 4.7, 'bench');
    col(-87.0, -86.1, 3.1, 4.75, 'bench');
    col(-90, -88.5, -3.4, -2.0, 'bench');
    col(-86.9, -86.1, -1.45, 0.05, 'bench');
    const tag = sign([{ t: 'NO DUMPING', s: 60, c: '#f1eee6', b: true, y: 100 }], 1.4, 0.6, '#8a2f28', 0, 256, 128);
    tag.rotation.y = Math.PI / 2;
    tag.position.set(-85.92, 2.1, 3);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshStandardMaterial({ color: '#fff2c8', emissive: '#ffd27a', emissiveIntensity: 1.6 }),
    );
    lamp.position.set(-86.1, 3.4, 6.2);
    G.add(tag, lamp, box(0.5, 0.06, 0.06, dark, -86.0, 3.5, 6.2));
    col(-87.05, -86.1, 0.45, 2.55, 'bench');
    col(-90.2, -85.8, -6.6, -6, 'fence');
    G.add(box(4.2, 2.2, 0.1, M('#6a655c', 0.8), -88, 1.1, -6.3)); // a chain-link back fence, near enough
  }
  // 4 · Grow Supply: a green shop with a striped awning and sacks out front. The one that's open.
  {
    const c = building({ x0: -104, x1: -90, z0: -4, h: 3.8, wall: '#4f7a4a', roof: 'flat', roofC: '#2f4a2c', doorX: -97, windows: [-101.5, -92.5] });
    const s = sign(
      [
        { t: 'GROW SUPPLY', s: 130, c: '#ffe9a8', b: true, y: 118 },
        { t: 'papers · grinders · everything for the garden', s: 40, c: '#f1eee6', y: 210 },
      ],
      8.4,
      2.1,
      '#2f4a2c',
    );
    s.position.set(-97, 4.9, c.z1 + 0.1);
    G.add(s, box(0.14, 1.1, 0.14, dark, -100.8, 4.3, c.z1 + 0.05), box(0.14, 1.1, 0.14, dark, -93.2, 4.3, c.z1 + 0.05));
    for (let i = 0; i < 8; i++) {
      const a = box(14 / 8, 0.06, 1.6, i % 2 ? white : M('#4f7a4a', 0.8), -104 + (i + 0.5) * (14 / 8), 2.85, c.z1 + 0.75);
      a.rotation.x = 0.3;
      G.add(a);
    }
    for (const [x, z, r] of [
      [-94.6, 0.5, 0.2],
      [-94.1, 0.9, 1.1],
      [-99.6, 0.6, -0.4],
    ]) {
      const sack = box(0.8, 0.28, 0.5, M('#c9b98a', 0.95), x, 0.2, c.z1 + z);
      sack.rotation.y = r;
      G.add(sack);
    }
    G.add(cyl(0.28, 0.22, 0.5, 10, M('#b5651d', 0.9), -99, 0.25, c.z1 + 1.3), cyl(0.42, 0.3, 0.5, 8, M('#3f7a3a', 0.9), -99, 0.72, c.z1 + 1.3));
  }
  // 5 · the water tower: the landmark you steer by
  {
    const t = new THREE.Group(),
      steel = M('#8d9296', 0.5, 0.4);
    for (const [x, z] of [
      [-1.6, -1.6],
      [1.6, -1.6],
      [-1.6, 1.6],
      [1.6, 1.6],
    ])
      t.add(box(0.22, 11, 0.22, steel, x, 5.5, z));
    for (const y of [3.5, 7.5])
      t.add(
        box(3.4, 0.12, 0.12, steel, 0, y, -1.6),
        box(3.4, 0.12, 0.12, steel, 0, y, 1.6),
        box(0.12, 0.12, 3.4, steel, -1.6, y, 0),
        box(0.12, 0.12, 3.4, steel, 1.6, y, 0),
      );
    const tank = cyl(2.6, 2.6, 3.4, 20, M('#d8d2c4', 0.7), 0, 12.7, 0),
      cap = cyl(0.2, 2.8, 1.3, 20, M('#8a2f28', 0.8), 0, 15.05, 0),
      band = sign([{ t: 'GOLDEN HILLS', s: 110, c: '#8a2f28', b: true, y: 160 }], 4.6, 1.3, '#d8d2c4', 0, 512, 256);
    band.position.set(0, 12.8, 2.62);
    t.add(tank, cap, band);
    t.position.set(-112, 0, -1);
    G.add(t);
    col(-114, -110, -3, 1, 'sign');
  }
  // street lights and a bus stop bench
  for (let x = -50; x > -110; x -= 15) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 10, 8),
      new THREE.MeshStandardMaterial({ color: '#fff2c8', emissive: '#ffd27a', emissiveIntensity: 1.2 }),
    );
    lamp.position.set(x, 4.4, ST.z1 + 1.2);
    G.add(box(0.12, 4.4, 0.12, dark, x, 2.2, ST.z1 + 1.9), box(0.1, 0.1, 0.8, dark, x, 4.4, ST.z1 + 1.55), lamp);
  }

  // ---------------- cars: parked in the bays, and one van on its rounds
  const BAYS: [number, number, number, CarKind][] = [
    [-96.8, 22.3, 0, 'sedan'],
    [-89.6, 22.3, 0, 'wagon'],
    [-78.8, 22.3, Math.PI, 'pickup'],
    [-71.6, 22.3, 0, 'sedan'],
    [-60.8, 22.3, 0, 'wagon'],
    [-93.2, 32.5, Math.PI, 'van'],
    [-82.4, 32.5, 0, 'sedan'],
    [-64.4, 32.5, Math.PI, 'pickup'],
  ];
  for (const [x, z] of BAYS) col(x - 0.95, x + 0.95, z - 2.1, z + 2.1, 'fence');
  BAYS.forEach(([x, z, r, kind], i) => {
    const c = buildCar(kind, CAR_PAINT[(i * 4 + 1) % CAR_PAINT.length]).root;
    c.position.set(x, 0.03, z);
    c.rotation.y = r;
    G.add(c);
  });
  const vanCar = buildCar('van', '#d9d4c8'),
    van = vanCar.root,
    wheels = vanCar.wheels;
  van.userData.noBatch = true;
  G.add(van);

  // the van's round: east along one lane, a U-turn short of the gate, west along the other, a U-turn short of the
  // turning circle, and round again
  const LANE = 1.8,
    E0 = X0 - 9,
    W0 = XW + 13,
    seg = [E0 - W0, Math.PI * LANE],
    total = (seg[0] + seg[1]) * 2;
  function vanAt(s: number): [number, number, number] {
    s = ((s % total) + total) % total;
    if (s < seg[0]) return [W0 + s, 14 + LANE, Math.PI / 2]; // heading east (+x)
    s -= seg[0];
    if (s < seg[1]) {
      const a = s / LANE;
      return [E0 + Math.sin(a) * LANE, 14 + Math.cos(a) * LANE, Math.PI / 2 + a];
    }
    s -= seg[1];
    if (s < seg[0]) return [E0 - s, 14 - LANE, -Math.PI / 2]; // heading west
    const a = (s - seg[0]) / LANE;
    return [W0 - Math.sin(a) * LANE, 14 - Math.cos(a) * LANE, -Math.PI / 2 - a];
  }
  let vs = 20,
    vv = 0;
  return {
    /** Things to press E at. */
    spots: [
      { id: 'growshop', x: -97, z: ST.z0 - 1.4, r: 2.2, label: 'Grow Supply' },
      { id: 'club', x: -60, z: ST.z0 - 1.2, r: 2.4, label: 'Clubhouse · tee times and trophies' },
      ...vltSpots,
    ] as { id: string; x: number; z: number; r: number; label: string; say?: string }[],
    /** Per frame. The van slows for anyone in its way (people: x, z). */
    update(dt: number, people: { x: number; z: number }[]) {
      const [x, z, yaw] = vanAt(vs),
        fx = Math.sin(yaw),
        fz = Math.cos(yaw);
      // someone within a few metres ahead: brake; otherwise amble along at about 20 km/h
      let want = 5.5;
      for (const p of people) {
        const dx = p.x - x,
          dz = p.z - z,
          ahead = dx * fx + dz * fz,
          side = Math.abs(dx * fz - dz * fx);
        if (ahead > -1 && ahead < 9 && side < 2) want = Math.min(want, Math.max(0, (ahead - 4) * 1.2));
      }
      vv += Math.max(-9 * dt, Math.min(2.5 * dt, want - vv));
      vs += vv * dt;
      van.position.set(x, 0.03, z);
      van.rotation.y = yaw;
      for (const w of wheels) w.rotation.x += (vv * dt) / 0.32;
    },
    /** Where the van is, for bumping into (x, z, heading, speed). */
    van: () => ({ x: van.position.x, z: van.position.z, yaw: van.rotation.y, v: vv }),
  };
}
