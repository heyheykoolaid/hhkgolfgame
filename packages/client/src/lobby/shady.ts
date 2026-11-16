// Shady Lane's four buildings: the Lucky Lie Lounge, the dealer's alley, Grow Supply and Lucky Pawn, on the lane's
// north side facing the gate (the lane itself is part of the town's street plan, lobby/roads.ts). They were first
// built on the West Side and moved here whole, so they are still laid out in the West Side's frame of coordinates:
// world = that frame + SHADY_OFF (world.ts). `G` is the group standing at that offset; `col` adds a wall in the frame.
// Split out of lobby/westside.ts, which lends it its building helpers.
import * as THREE from 'three';
import { M, box, cyl, tile, SHADY_OFF, BJ_AT } from './world';
import { flat, sign, ST } from './westside';
import { buildMachines, type VltSpot } from './vlt';
import { buildTrophy } from '../world/trophy';
import { loadPiece, loadProps } from '../world/propPacks';

/** What the West Side's builder lends: its helpers and materials (see buildWestSide). */
export interface ShadyCtx {
  /** Shady Lane's group, standing at SHADY_OFF */
  G: THREE.Group;
  asphalt: THREE.Material;
  dark: THREE.Material;
  white: THREE.Material;
  /** a plain building in the frame: walls, roof, door and lit windows on the street side */
  building: (o: {
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
  }) => { z1: number; cx: number };
  /** a wall for people and cars, in the frame (the caller sets which district's offset applies) */
  col: (x0: number, x1: number, z0: number, z1: number, tag?: string) => unknown;
}
export function buildShady(ctx: ShadyCtx): VltSpot[] {
  const { G, asphalt, dark, white, building, col } = ctx,
    WEST_OFF = SHADY_OFF;
  let vltSpots: VltSpot[] = [];

  // (Shady Lane's roads and pavements are part of the town's street plan: lobby/roads.ts.) A street sign at the junction:
  {
    const post = cyl(0.05, 0.05, 3.1, 8, M('#3a3835', 0.6, 0.5), -105.4, 1.55, 19.6),
      plate = sign([{ t: 'SHADY LANE', s: 120, c: '#f4f1ea', b: true, y: 150 }], 1.9, 0.42, '#1f5a3a', 0.25);
    plate.position.set(-105.4, 2.95, 19.6);
    const back = plate.clone();
    back.rotation.y = Math.PI;
    G.add(post, plate, back);
  }
  // 2 · the Lucky Lie Lounge: a brick shell, open to the street, and inside it the front two-thirds of a real bar room
  // ("Barranco Bar | PS1 Environment", McPato, CC BY 4.0; see docs/credits.md): the long counter and its back bar on the
  // east side, leather booths in alcoves down the west wall, parquet, beams and lamps. Blackjack is played in the open
  // front of the room; the machines stand along the back wall at the end of the aisle.
  {
    const z1 = ST.z0 - 2.4,
      x0 = -86,
      x1 = -73.78, // (the shell's east wall stands right behind the bar's own back wall: no dead space between them)
      z0 = z1 - 16,
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
      box(x1 - x0 - 0.6, 0.05, d - 0.3, M('#2b2420', 0.9), cx, 0.06, cz + 0.1), // the stone threshold (the parquet lies on it)
      box(x1 - x0 - 0.6, 0.04, 0.5, M('#b08a3e', 0.4, 0.6), cx, 0.09, z1 - 2.5), // a brass strip where the parquet begins
      box(x1 - x0 - 0.6, 0.12, 2.5, M('#1a1614', 0.9), cx, 4.15, z1 - 1.4), // the ceiling over the threshold
    );
    // the room: scene (x, z) stands at (x + BAR.x, z + BAR.z) here; it is cut off at the back and east walls
    const BAR = { x: -77.1, y: 0.1, z: z1 - 2.5 + 12 };
    void loadPiece('lounge').then(p => {
      if (!p) return;
      const o = p.make(),
        cut = [
          new THREE.Plane(new THREE.Vector3(0, 0, 1), -(z0 + 0.31 + (WEST_OFF.z || 0))),
          new THREE.Plane(new THREE.Vector3(-1, 0, 0), x1 - 0.31 + WEST_OFF.x),
        ];
      o.position.set(p.origin.x + BAR.x, p.origin.y + BAR.y, p.origin.z + BAR.z);
      o.traverse(c => {
        const mesh = c as THREE.Mesh,
          m = mesh.material as THREE.MeshStandardMaterial;
        if (!mesh.isMesh) return;
        mesh.castShadow = false;
        mesh.receiveShadow = true; // (the shell's roof keeps the evening sun off the room)
        m.clippingPlanes = cut;
        if (m.map && !m.emissiveMap) {
          // dim by itself: a faint glow so nothing goes black, bright only where the lamps' own glass is; the light in the
          // room comes from the lamps below
          m.emissiveMap = m.map;
          m.emissive = new THREE.Color('#ffffff');
          m.emissiveIntensity = /EMIT/i.test(m.name) ? 1.6 : 0.09;
          if (!/EMIT/i.test(m.name)) m.color.multiplyScalar(0.62);
        }
      });
      G.add(o);
    });
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
    const lamp = new THREE.PointLight('#ffd9a0', 11, 8, 1.5);
    lamp.position.set(BJ_AT[0], 2.6, BJ_AT[1] + 0.3);
    G.add(lamp);
    // the bar's own lamps light the room: the copper pendants over the counter, the sconces over the booths
    // (scene x, height, scene z, strength, colour)
    for (const [bx, y, bz, k, c] of [
      [-0.6, 2.2, -18.6, 9, '#ffb869'],
      [-0.6, 2.2, -22.6, 9, '#ffb869'],
      [-7.0, 2.7, -15.3, 6, '#ff9d5c'],
      [-6.6, 2.7, -23.6, 6, '#ff9d5c'],
    ] as [number, number, number, number, string][]) {
      const l = new THREE.PointLight(c, k, 7.5, 1.5);
      l.position.set(bx + BAR.x, y + BAR.y, bz + BAR.z);
      G.add(l);
    }
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
    // the room's furniture, piece by piece (scene coordinates, moved by BAR), so you can walk right up to a booth
    const bcol = (bx0: number, bx1: number, bz0: number, bz1: number) =>
      col(bx0 + BAR.x, bx1 + BAR.x, Math.max(z0, bz0 + BAR.z), bz1 + BAR.z, 'bench');
    bcol(-1.05, 5.3, -27, -15.6); // the counter and everything behind it
    bcol(3, 5.3, -15.6, -12); // the wall at the bar's end
    bcol(1.4, 3, -14.4, -12.6); // crates
    for (const bz of [-12.8, -14.8, -15.8, -17.8, -21.8, -23.8, -24.8]) bcol(-7.8, -6.2, bz - 0.4, bz + 0.4); // benches
    for (const bz of [-13.8, -16.8, -22.8, -25.8]) bcol(-8, -6.05, bz - 0.45, bz + 0.45); // their tables
    for (const bz of [-12.3, -15.3, -18.3, -21.3, -24.3]) bcol(-8.3, -6, bz - 0.08, bz + 0.08); // the partitions between booths
    bcol(-8.3, -5.3, -21.3, -18.3); // the shrine in its alcove
    // pictures on the walls ("Paintings and Posters Collection", Melon Polygons, CC BY 4.0; see docs/credits.md).
    // The pack is one welded mesh: the loader cuts it into separate frames (Art00, Art01… biggest first).
    void loadProps('paintings', n => n, 'Art').then(kit => {
      const arts = kit.names
        .map(n => ({ n, s: kit.size(n)! }))
        .filter(a => Math.min(a.s.x, a.s.z) < 0.25 && a.s.y > 0.4 && Math.max(a.s.x, a.s.z) > 0.4 && Math.max(a.s.x, a.s.z) < 3);
      if (!arts.length) return;
      // [x, bottom y, z, the way it faces (yaw), widest it may be]
      const WALLS: [number, number, number, number, number][] = [
        [-80.6, 2.7, z0 + 0.33, 0, 1.9],
        [x1 - 0.33, 1.6, z1 - 1.2, -Math.PI / 2, 1.3],
        [x0 + 0.33, 2.3, z1 - 1.2, Math.PI / 2, 1.3],
      ];
      WALLS.forEach(([wx, wy, wz, face, maxW], i) => {
        const a = arts[(i * 5 + 2) % arts.length],
          thinX = a.s.x < a.s.z,
          w = thinX ? a.s.z : a.s.x,
          k = Math.min(maxW / w, 1.25 / a.s.y, 1),
          o = kit.make(a.n, k)!;
        o.position.set(wx, wy, wz);
        o.rotation.y = face - (thinX ? Math.PI / 2 : 0);
        o.castShadow = false;
        G.add(o);
      });
    });
    // slot machines and video poker along the back wall (lobby/vlt.ts)
    const xs = [-82.0, -81.05, -80.1, -79.15];
    const floor = new THREE.Group(); // (the machines and their stools stand on the parquet, not under it)
    floor.position.y = BAR.y - 0.02;
    G.add(floor);
    vltSpots = buildMachines(floor, xs, z0 + 0.72, { x: WEST_OFF.x, y: WEST_OFF.y + BAR.y - 0.02, z: WEST_OFF.z });
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
    const c = building({
      x0: -104,
      x1: -90,
      z0: -4,
      h: 3.8,
      wall: '#4f7a4a',
      roof: 'flat',
      roofC: '#2f4a2c',
      doorX: -97,
      windows: [-101.5, -92.5],
    });
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
  // 4b · Lucky Pawn: an open-fronted shop west of the water tower. A glass counter of watches and rings with the
  // pawnbroker behind it (lobby/attendants.ts), other people's trophies on a shelf, guitars, a television and stock
  // shelves round the walls. E at the counter sells your trophies (lobby.ts openPawn).
  {
    const x0 = -125.6,
      x1 = -116,
      z0 = -4,
      z1 = ST.z0 - 2.4,
      h = 4.2,
      cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2,
      d = z1 - z0,
      wall = M('#6d5a3c', 0.9),
      inner = M('#8a7a55', 0.9),
      trim = M('#1d1d1f', 0.8),
      wood = M('#5a3b22', 0.7),
      gold = new THREE.MeshStandardMaterial({ color: '#e2b23a', roughness: 0.3, metalness: 0.8, emissive: '#6a4a10', emissiveIntensity: 0.5 }),
      lit = (c: string, k = 1.4) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.5 });
    // a chequered lino floor
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g2 = cv.getContext('2d')!;
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        g2.fillStyle = (i + j) % 2 ? '#3a342c' : '#b9ad92';
        g2.fillRect(i * 32, j * 32, 32, 32);
      }
    const lino = new THREE.CanvasTexture(cv);
    lino.colorSpace = THREE.SRGBColorSpace;
    lino.wrapS = lino.wrapT = THREE.RepeatWrapping;
    lino.repeat.set((x1 - x0) / 2.4, d / 2.4);
    G.add(
      box(x1 - x0, h, 0.3, wall, cx, h / 2, z0 + 0.15),
      box(0.3, h, d, wall, x0 + 0.15, h / 2, cz),
      box(0.3, h, d, wall, x1 - 0.15, h / 2, cz),
      box(x1 - x0 - 0.6, h - 0.1, 0.04, inner, cx, h / 2, z0 + 0.32), // lighter paint inside
      box(0.04, h - 0.1, d - 0.4, inner, x0 + 0.32, h / 2, cz),
      box(0.04, h - 0.1, d - 0.4, inner, x1 - 0.32, h / 2, cz),
      box(x1 - x0 + 0.4, 0.3, d + 0.4, M('#2a2420', 0.9), cx, h + 0.15, cz), // roof
      box(x1 - x0 - 0.6, 0.06, d - 0.3, M('#e9e2cf', 0.9), cx, h - 0.03, cz), // ceiling
      box(x1 - x0, 0.9, 0.3, wall, cx, h - 0.45, z1 - 0.15), // the beam over the open front
      box(0.4, h, 0.4, trim, x0 + 0.2, h / 2, z1 - 0.2),
      box(0.4, h, 0.4, trim, x1 - 0.2, h / 2, z1 - 0.2),
      box(x1 - x0 - 0.6, 0.05, d - 0.3, new THREE.MeshStandardMaterial({ map: lino, roughness: 0.6 }), cx, 0.06, cz + 0.1),
    );
    // the counter: a timber base, a glass case of small gold things on top, a till at one end; a flap at the east end
    const kz = z0 + 3.1,
      k0 = x0 + 0.5,
      k1 = x1 - 1.7,
      km = (k0 + k1) / 2,
      glass = new THREE.MeshStandardMaterial({ color: '#cfe6ea', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.22 });
    G.add(
      box(k1 - k0, 0.9, 0.75, wood, km, 0.53, kz),
      box(k1 - k0 + 0.1, 0.05, 0.85, M('#2a1c12', 0.5), km, 1.0, kz),
      box(k1 - k0 - 0.2, 0.3, 0.6, glass, km, 1.18, kz),
      box(k1 - k0 - 0.2, 0.02, 0.6, M('#5a1f2a', 0.9), km, 1.04, kz), // velvet
      box(k1 - k0 - 0.1, 0.03, 0.7, M('#2a1c12', 0.5), km, 1.345, kz),
      box(0.45, 0.32, 0.4, M('#2c2a30', 0.5, 0.4), k1 - 0.5, 1.52, kz), // the till
      box(0.4, 0.12, 0.3, M('#3a3840', 0.5, 0.4), k1 - 0.5, 1.74, kz - 0.05),
      box(0.3, 0.1, 0.02, lit('#58e08a', 1.2), k1 - 0.5, 1.74, kz + 0.11),
    );
    for (let i = 0; i < 9; i++) {
      // watches, rings and chains under the glass
      const px = k0 + 0.5 + i * ((k1 - k0 - 1.6) / 8),
        o =
          i % 3 === 0
            ? cyl(0.06, 0.06, 0.02, 12, gold, px, 1.07, kz)
            : i % 3 === 1
              ? box(0.16, 0.03, 0.05, gold, px, 1.07, kz + 0.1)
              : cyl(0.035, 0.035, 0.05, 10, gold, px, 1.08, kz - 0.1);
      G.add(o);
    }
    // a plank shelf of other people's trophies on the back wall, under a strip light
    G.add(box(5.2, 0.06, 0.4, wood, cx - 0.6, 2.25, z0 + 0.55), box(5, 0.05, 0.1, lit('#fff2c8', 1.6), cx - 0.6, 3.75, z0 + 0.5));
    [7, 41, 1203, 88, 560].forEach((seed, i) => {
      const t = buildTrophy(seed, i % 2 ? 9 : 3);
      t.position.set(cx - 2.8 + i * 1.1, 2.28, z0 + 0.55);
      t.traverse(o => (o.castShadow = false));
      G.add(t);
    });
    // signs: neon on the back wall, the name over the front, three gold balls on a bracket
    const buy = sign(
      [
        { t: 'WE BUY TROPHIES', s: 96, c: '#ffe9a8', b: true, y: 108 },
        { t: 'CASH PAID  ·  NO QUESTIONS  ·  NO REFUNDS', s: 34, c: '#ff9a8a', y: 204 },
      ],
      4.6,
      1.15,
      '#141016',
      0.9,
    );
    buy.position.set(cx - 0.6, 3.1, z0 + 0.36);
    const name = sign(
      [
        { t: 'LUCKY PAWN', s: 130, c: '#ffd27a', b: true, y: 112 },
        { t: 'GOLD  ·  GUITARS  ·  TROPHIES', s: 40, c: '#f1e6d0', y: 206 },
      ],
      6.4,
      1.6,
      '#1a140e',
      0.9,
    );
    name.position.set(cx, h + 1.1, z1 - 0.05);
    G.add(buy, name, box(6.7, 1.9, 0.2, trim, cx, h + 1.1, z1 - 0.2));
    G.add(box(0.06, 0.06, 1.1, trim, x1 - 0.2, h - 0.2, z1 + 0.5), box(0.7, 0.04, 0.04, trim, x1 - 0.2, h - 0.5, z1 + 0.95));
    for (const [dx, dy] of [
      [-0.3, -0.75],
      [0, -0.95],
      [0.3, -0.75],
    ]) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), gold);
      ball.position.set(x1 - 0.2 + dx, h - 0.5 + dy, z1 + 0.95);
      G.add(ball, box(0.015, -dy - 0.15, 0.015, trim, x1 - 0.2 + dx, h - 0.5 + (dy + 0.15) / 2, z1 + 0.95));
    }
    const lamp = new THREE.PointLight('#ffe2b0', 14, 11, 1.5);
    lamp.position.set(cx, 3.2, cz);
    G.add(lamp);
    // stock from the packs (docs/credits.md): house pieces round the walls, stock shelves behind the counter
    const up = new THREE.Vector3(0, 1, 0),
      stock = (kit: Awaited<ReturnType<typeof loadProps>>, names: string[], x: number, z: number, yaw: number) => {
        const a0 = kit.at(names[0]);
        if (!a0) return;
        for (const n of names) {
          const o = kit.make(n),
            a = kit.at(n);
          if (!o || !a) continue;
          o.position.set(x, 0.09, z).add(a.sub(a0).applyAxisAngle(up, yaw));
          o.rotation.y = yaw;
          o.castShadow = false;
          G.add(o);
        }
      };
    void loadProps('home', n => n).then(kit => {
      stock(kit, ['Cube004_atlas_living_0'], x0 + 0.72, cz + 2.6, 0); // the television wall unit, west wall
      stock(kit, ['libr_atlas_living_0'], x0 + 0.72, cz - 0.1, 0);
      stock(kit, ['guitar_atlas_mueblesDormitorio1_0'], x1 - 0.6, cz + 0.4, Math.PI);
      stock(kit, ['guitar_atlas_mueblesDormitorio1_0'], x1 - 0.6, cz + 1.5, Math.PI);
      stock(kit, ['couch001_fabricsofa_0', 'couch001_atlas_living_0', 'couch001_wood3_0'], x1 - 0.95, cz + 3.4, 0);
      stock(kit, ['Circle004_atlas_living_0'], x1 - 0.7, cz + 4.8, 0);
      stock(kit, ['Cube009_atlas_living_0'], x0 + 0.7, cz + 4.9, 0);
    });
    void loadProps('shelves', n => n).then(kit => {
      for (const [n, sx] of [
        ['Object_8', x1 - 1.6],
        ['Object_14', x1 - 3.9],
      ] as [string, number][]) {
        const o = kit.make(n),
          sz = kit.size(n);
        if (!o || !sz) continue;
        o.rotation.y = sz.x < sz.z ? Math.PI / 2 : 0; // long side along the back wall
        o.position.set(sx, 0.09, z0 + 0.75);
        o.castShadow = false;
        G.add(o);
      }
    });
    col(x0, x0 + 0.3, z0, z1);
    col(x1 - 0.3, x1, z0, z1);
    col(x0, x1, z0, z0 + 0.3);
    col(k0, k1, kz - 0.45, kz + 0.45, 'bench');
    col(x0 + 0.3, x0 + 1.15, cz - 0.9, cz + 4.3, 'bench'); // the television and the bookcase
    col(x1 - 1.5, x1 - 0.3, cz + 2.8, cz + 4.0, 'bench'); // the armchair
  }
  return vltSpots;
}
